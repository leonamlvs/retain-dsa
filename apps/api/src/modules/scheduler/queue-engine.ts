import { queueInputSchema, type QueueInput } from './queue-input.schema.js';
import {
  rankCandidates,
  selectQueueCandidates,
  type EligibilityResult,
  type RankedCandidate,
} from './eligibility.js';
import { resolvePracticeNeed, type PracticeNeed } from './practice-need.js';
import { discoveryFingerprint } from '../discovery/discovery-fingerprint.js';
import { scoreFeedback } from '../feedback/feedback-scorer.js';
import { cooldownUntil } from '../memory/cooldown.js';
import type { MemoryEngine, MemoryState } from '../memory/memory-engine.interface.js';
import { DomainError } from '../../domain/domain-error.js';
import type { Difficulty } from '../../domain/catalog.schema.js';

const order = (difficulty: string) => ['Easy', 'Medium', 'Hard'].indexOf(difficulty);
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function evaluateQueue(raw: unknown, memory: MemoryEngine) {
  const input = queueInputSchema.parse(raw);
  const { config, evaluatedAt: now, configurations } = input;
  const attempts = [...input.attempts].sort((a, b) =>
    a.sourceSequence < b.sourceSequence ? -1 : a.sourceSequence > b.sourceSequence ? 1 : 0,
  );
  const configs = new Map(configurations.map((item) => [item.config.version, item.config]));
  const memories = new Map<
    string,
    { skillId: string; difficulty: Difficulty; state: MemoryState }
  >();
  const cooldowns = new Map<string, string>();
  const history = attempts.map((attempt) => {
    const historicalConfig = configs.get(attempt.configVersion);
    if (!historicalConfig)
      throw new DomainError(
        'MISSING_CONFIG_VERSION',
        'Historical attempt configuration is unavailable.',
      );
    const evidence = scoreFeedback(attempt.feedback, historicalConfig);
    const key = attempt.skillId + ':' + attempt.difficulty;
    const state = memory.review(
      memories.get(key)?.state,
      evidence.rating,
      attempt.completedAt,
      historicalConfig,
    );
    memories.set(key, { skillId: attempt.skillId, difficulty: attempt.difficulty, state });
    cooldowns.set(attempt.problemId, cooldownUntil(state, attempt.completedAt, historicalConfig));
    return {
      difficulty: attempt.difficulty,
      problemId: attempt.problemId,
      skillId: attempt.skillId,
      rating: evidence.rating,
      sourceSequence: attempt.sourceSequence,
      completedAt: attempt.completedAt.toISOString(),
    };
  });
  const completed = new Set(attempts.map((attempt) => attempt.problemId));
  const skills = [...new Map(input.items.map((item) => [item.skillId, item.skill])).values()];
  const eligible = new Map<string, PracticeNeed | null>();
  for (const skill of skills) {
    const supply = input.certificates
      .filter(
        (proof) =>
          proof.skillId === skill.id &&
          proof.fingerprint === discoveryFingerprint(skill, proof.difficulty, config),
      )
      .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
      .map((proof) => ({
        certificateId: proof.id,
        difficulty: proof.difficulty,
        complete: true,
        candidateCount: new Set(proof.providerIds).size,
        fingerprint: proof.fingerprint,
        catalogRevision: proof.catalogRevision.toString(),
        observedAt: proof.observedAt.toISOString(),
        validUntil: proof.validUntil.toISOString(),
      }));
    const admissions = input.issuances
      .filter((row) => row.skillId === skill.id)
      .flatMap((row) => {
        const basis = row.admissionBasis as { eligibility?: EligibilityResult['admission'] };
        return basis.eligibility
          ? [{ difficulty: row.difficulty, admission: basis.eligibility }]
          : [];
      });
    eligible.set(
      skill.id,
      resolvePracticeNeed({
        historicalAdmissions: admissions,
        officialDifficulties: input.items
          .filter((item) => item.skillId === skill.id)
          .map((item) => item.problem.difficulty),
        attempts: history.filter((attempt) => attempt.skillId === skill.id),
        supply,
        memories: [...memories.values()].filter((item) => item.skillId === skill.id),
        configurations,
        evaluationTime: now,
        memory,
        positiveRequired: config.scheduler.positiveEvidenceRequired,
      }),
    );
  }
  const active = input.issuances.filter((row) => row.status === 'ACTIVE');
  const invalid = active.filter((row) => {
    const need = eligible.get(row.skillId);
    const problem = input.problems.find((problem) => problem.id === row.problemId);
    return (
      !need ||
      !problem ||
      problem.paidOnly ||
      !problem.available ||
      problem.difficulty !== row.difficulty ||
      order(row.difficulty) > order(need.difficulty) ||
      Boolean(
        cooldowns.get(row.problemId) && Date.parse(cooldowns.get(row.problemId)!) > now.getTime(),
      )
    );
  });
  const invalidIds = new Set(invalid.map((row) => row.id));
  const urgency = (skillId: string) => {
    const need = eligible.get(skillId);
    return need?.urgencyRetention == null
      ? config.scheduler.needWeights.unseen
      : config.scheduler.needWeights.retention *
          Math.max(
            0,
            (config.scheduler.reviewThreshold - need.urgencyRetention) /
              config.scheduler.reviewThreshold,
          );
  };
  const survivingAll = active
    .filter((row) => !invalidIds.has(row.id))
    .sort(
      (a, b) =>
        urgency(b.skillId) - urgency(a.skillId) || a.position - b.position || compare(a.id, b.id),
    );
  const surviving = survivingAll.slice(0, config.scheduler.queueSize);
  const replaced = survivingAll.slice(config.scheduler.queueSize);
  const activeIds = new Set(surviving.map((row) => row.problemId));
  const needed = config.scheduler.queueSize - surviving.length;
  const records = input.items.map((item) => ({
    key: item.problemId + ':' + item.skillId,
    problemId: item.problemId,
    skillId: item.skillId,
    curriculumItemId: item.id as string | null,
    position: item.position,
    problem: item.problem,
    skill: item.skill,
  }));
  const recordKeys = new Set(records.map((record) => record.key));
  for (const skill of skills) {
    const need = eligible.get(skill.id);
    if (!need || !skill.tags.length) continue;
    const initial =
      need.admission.kind === 'INITIAL_OFFICIAL_ANCHOR' &&
      !attempts.some((attempt) => attempt.skillId === skill.id);
    if (initial) continue;
    for (const problem of input.problems) {
      if (!skill.tags.every((tag) => problem.tags.some((candidate) => candidate.tag === tag)))
        continue;
      const key = problem.id + ':' + skill.id;
      if (recordKeys.has(key)) continue;
      records.push({
        key,
        problemId: problem.id,
        skillId: skill.id,
        curriculumItemId: null,
        position: null,
        problem,
        skill,
      });
      recordKeys.add(key);
    }
  }
  const safe = (problem: QueueInput['problems'][number]) =>
    !problem.paidOnly &&
    problem.available &&
    !activeIds.has(problem.id) &&
    (!cooldowns.get(problem.id) || Date.parse(cooldowns.get(problem.id)!) <= now.getTime());
  const selectedDifficulty = new Map<string, Difficulty>();
  for (const skill of skills) {
    const need = eligible.get(skill.id);
    if (!need) continue;
    const exact = records.some(
      (record) =>
        record.skillId === skill.id &&
        record.problem.difficulty === need.difficulty &&
        safe(record.problem),
    );
    if (exact) selectedDifficulty.set(skill.id, need.difficulty);
    else {
      const lower = (['Easy', 'Medium', 'Hard'] as const)[order(need.difficulty) - 1];
      if (
        lower &&
        records.some(
          (record) =>
            record.skillId === skill.id &&
            record.problem.difficulty === lower &&
            safe(record.problem),
        )
      )
        selectedDifficulty.set(skill.id, lower);
    }
  }
  const activeTags = surviving.map(
    (row) =>
      input.problems.find((problem) => problem.id === row.problemId)?.tags.map((tag) => tag.tag) ??
      [],
  );
  const rankingInput: RankedCandidate[] = records
    .filter((record) => selectedDifficulty.get(record.skillId) === record.problem.difficulty)
    .map((record) => {
      const need = eligible.get(record.skillId)!;
      const recent = attempts
        .filter((attempt) => attempt.skillId === record.skillId)
        .slice(-config.scheduler.recentLookback);
      const tags = record.problem.tags.map((tag) => tag.tag);
      const context = [...recent.map((attempt) => attempt.historicalSnapshot.tags), ...activeTags];
      const overlap = context.length
        ? Math.max(
            ...context.map((other) =>
              !tags.length || !other.length
                ? 1
                : tags.filter((tag) => other.includes(tag)).length /
                  new Set([...tags, ...other]).size,
            ),
          )
        : 0;
      const unfinished = record.curriculumItemId !== null && !completed.has(record.problemId);
      return {
        problemId: record.key,
        catalogProblemId: record.problemId,
        skillSlug: record.skill.slug,
        difficulty: record.problem.difficulty,
        paidOnly: record.problem.paidOnly,
        available: record.problem.available,
        active: activeIds.has(record.problemId),
        seen: completed.has(record.problemId),
        ...(cooldowns.has(record.problemId)
          ? { cooldownUntil: cooldowns.get(record.problemId)! }
          : {}),
        officialPosition: record.position,
        needReason: unfinished && need.reason !== 'REVALIDATION' ? 'PROGRESSION' : need.reason,
        needScore:
          urgency(record.skillId) +
          Number(unfinished) * config.scheduler.needWeights.anchor -
          surviving.filter((row) => row.skillId === record.skillId).length *
            config.scheduler.needWeights.activePenalty,
        tagDiversity: 1 - overlap,
        repetition: Number(completed.has(record.problemId)),
        provider: record.problem.provider,
        providerProblemId: record.problem.providerProblemId,
      };
    });
  const ranked = rankCandidates(rankingInput, now, config.scheduler.candidateWeights);
  const priorReason = attempts.at(-1)?.recommendation.admissionBasis as
    { reason?: string } | undefined;
  const preferProgression = priorReason?.reason !== 'PROGRESSION';
  const progressionInQueue = surviving.filter(
    (row) => (row.admissionBasis as { reason?: string }).reason === 'PROGRESSION',
  ).length;
  const reserve = Math.max(
    0,
    Math.min(
      needed,
      Math.max(1, Math.floor(config.scheduler.queueSize * config.scheduler.progressionFraction)) -
        progressionInQueue,
    ),
  );
  // Classify per candidate: one skill may need both review and unfinished anchors.
  const reasons = new Map(ranked.map((candidate) => [candidate.problemId, candidate.needReason]));
  const uniqueProblems = new Set<string>();
  const selectionInput = ranked
    .filter((candidate) => {
      if (uniqueProblems.has(candidate.catalogProblemId)) return false;
      uniqueProblems.add(candidate.catalogProblemId);
      return true;
    })
    .map((candidate) => ({ ...candidate, skillSlug: candidate.problemId }));
  const selected =
    needed === 1 && config.scheduler.queueSize === 1
      ? selectQueueCandidates(
          selectionInput,
          reasons,
          needed,
          config.scheduler.progressionFraction,
          preferProgression,
        )
      : [
          ...selectionInput
            .filter((candidate) => candidate.needReason === 'PROGRESSION')
            .slice(0, reserve),
          ...selectionInput.filter((candidate) => candidate.needReason !== 'PROGRESSION'),
          ...selectionInput,
        ];
  const selectedIds = new Set<string>();
  const selectedRanked = selected
    .filter((candidate) => {
      if (selectedIds.size >= needed || selectedIds.has(candidate.catalogProblemId)) return false;
      selectedIds.add(candidate.catalogProblemId);
      return true;
    })
    .map((candidate) => ranked.find((original) => original.problemId === candidate.problemId)!);
  const byKey = new Map(records.map((record) => [record.key, record]));
  return {
    input,
    eligible,
    invalid,
    replaced,
    surviving,
    needed,
    records,
    rankingInput,
    ranked,
    selectedRanked,
    candidates: selectedRanked.map((candidate) => byKey.get(candidate.problemId)!),
    preferProgression,
    reasonBySkill: Object.fromEntries(
      skills.flatMap((skill) => {
        const need = eligible.get(skill.id);
        return need ? [[skill.slug, need.reason]] : [];
      }),
    ),
    memories,
    cooldowns,
  };
}
