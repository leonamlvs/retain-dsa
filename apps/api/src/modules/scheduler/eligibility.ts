import type { Difficulty } from '../../domain/catalog.schema.js';
import { difficulties } from '../../domain/catalog.schema.js';

export interface EligibilityAttempt {
  difficulty: Difficulty;
  problemId: string;
  rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
  completedAt: string;
  sourceSequence: bigint;
}

export interface SupplyFact {
  certificateId: string;
  difficulty: Difficulty;
  complete: boolean;
  candidateCount: number;
  fingerprint: string;
  catalogRevision: string;
  observedAt: string;
  validUntil: string;
}

export type SupplyEvidence = Omit<SupplyFact, 'complete'>;

export interface EligibilityResult {
  difficulty: Difficulty;
  admission:
    | { kind: 'INITIAL_OFFICIAL_ANCHOR'; skippedLowerDifficulties: Difficulty[] }
    | {
        kind: 'EVIDENCE';
        positiveProblems: string[];
        supplyException: boolean;
        skippedEmptyDifficulties: Difficulty[];
        supplyEvidence: SupplyEvidence[];
      }
    | { kind: 'BASE_DIFFICULTY' };
}

const order = (difficulty: Difficulty) => difficulties.indexOf(difficulty);
const textCompare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const evidenceFromSupply = (fact: SupplyFact): SupplyEvidence => ({
  certificateId: fact.certificateId,
  difficulty: fact.difficulty,
  candidateCount: fact.candidateCount,
  fingerprint: fact.fingerprint,
  catalogRevision: fact.catalogRevision,
  observedAt: fact.observedAt,
  validUntil: fact.validUntil,
});

export function currentEligibility(
  officialDifficulties: readonly Difficulty[],
  attempts: readonly EligibilityAttempt[],
  supply: readonly SupplyFact[],
  evaluationTime: Date,
  positiveRequired = 2,
  historicalAdmissions: readonly EligibilityResult[] = [],
  legacyInitialAdmission = false,
): EligibilityResult | null {
  const official = [...new Set(officialDifficulties)].sort((a, b) => order(a) - order(b));
  if (!official.length) return null;
  let current: Difficulty = attempts.length && !legacyInitialAdmission ? 'Easy' : official[0]!;
  let admission: EligibilityResult['admission'] =
    order(current) === 0
      ? { kind: 'BASE_DIFFICULTY' }
      : {
          kind: 'INITIAL_OFFICIAL_ANCHOR',
          skippedLowerDifficulties: difficulties.slice(0, order(current)),
        };
  // Issuance is immutable evidence of admission; certificate expiry only prevents
  // new exceptions. Current practice/regression is resolved separately.
  for (const prior of historicalAdmissions) {
    if (order(prior.difficulty) >= order(current)) {
      current = prior.difficulty;
      admission = prior.admission;
    }
  }
  for (const attempt of attempts) {
    if (order(attempt.difficulty) > order(current)) {
      current = attempt.difficulty;
      admission = {
        kind: 'EVIDENCE',
        positiveProblems: [],
        supplyException: false,
        skippedEmptyDifficulties: [],
        supplyEvidence: [],
      };
    }
  }
  for (;;) {
    const history = attempts
      .filter((attempt) => attempt.difficulty === current)
      .sort((a, b) =>
        a.sourceSequence < b.sourceSequence ? -1 : a.sourceSequence > b.sourceSequence ? 1 : 0,
      );
    const lastAgain = history.findLastIndex((attempt) => attempt.rating === 'AGAIN');
    const positive = new Set(
      history
        .slice(lastAgain + 1)
        .filter((attempt) => ['GOOD', 'EASY'].includes(attempt.rating))
        .map((attempt) => attempt.problemId),
    );
    const currentSupply = supply.find(
      (item) =>
        item.difficulty === current &&
        item.complete &&
        Date.parse(item.validUntil) > evaluationTime.getTime(),
    );
    const required = currentSupply?.candidateCount === 1 ? 1 : positiveRequired;
    if (positive.size < required) break;

    let nextIndex = order(current) + 1;
    const skippedEmptyDifficulties: Difficulty[] = [];
    const supplyEvidence: SupplyEvidence[] = [];
    if (required === 1 && currentSupply) {
      supplyEvidence.push(evidenceFromSupply(currentSupply));
    }
    while (nextIndex < difficulties.length) {
      const candidate = difficulties[nextIndex]!;
      const hasOfficial = official.includes(candidate);
      const proof = supply.find(
        (item) =>
          item.difficulty === candidate &&
          item.complete &&
          Date.parse(item.validUntil) > evaluationTime.getTime(),
      );
      if (hasOfficial || (proof && proof.candidateCount > 0)) {
        current = candidate;
        admission = {
          kind: 'EVIDENCE',
          positiveProblems: [...positive].sort(),
          supplyException: required === 1,
          skippedEmptyDifficulties,
          supplyEvidence,
        };
        break;
      }
      if (!proof || proof.candidateCount !== 0) return { difficulty: current, admission };
      skippedEmptyDifficulties.push(candidate);
      supplyEvidence.push(evidenceFromSupply(proof));
      nextIndex++;
    }
    if (nextIndex >= difficulties.length) break;
  }
  return { difficulty: current, admission };
}

export interface RankedCandidate {
  problemId: string;
  catalogProblemId: string;
  skillSlug: string;
  difficulty: Difficulty;
  paidOnly: boolean;
  available: boolean;
  cooldownUntil?: string;
  active: boolean;
  seen: boolean;
  officialPosition: number | null;
  needReason: 'PROGRESSION' | 'REVIEW' | 'REVALIDATION';
  needScore: number;
  tagDiversity: number;
  repetition: number;
  provider: string;
  providerProblemId: string;
}

export function rankCandidates(
  candidates: readonly RankedCandidate[],
  at: Date,
  weights: { unseen: number; diversity: number; repetitionPenalty: number } = {
    unseen: 1,
    diversity: 1,
    repetitionPenalty: 1,
  },
  algorithmVersion: 'candidate-ranking-v1' | 'candidate-ranking-v2' = 'candidate-ranking-v2',
): RankedCandidate[] {
  const tier = (item: RankedCandidate) => {
    if (item.needReason === 'PROGRESSION' && item.officialPosition !== null && !item.seen) return 0;
    if (item.needReason !== 'PROGRESSION' && item.officialPosition === null && !item.seen) return 0;
    if (!item.seen) return 1;
    return 2;
  };
  return candidates
    .filter((item) => !item.paidOnly && item.available && !item.active)
    .filter((item) => !item.cooldownUntil || Date.parse(item.cooldownUntil) <= at.getTime())
    .sort(
      (a, b) =>
        tier(a) - tier(b) ||
        b.needScore - a.needScore ||
        (algorithmVersion === 'candidate-ranking-v1'
          ? (a.officialPosition ?? Number.MAX_SAFE_INTEGER) -
            (b.officialPosition ?? Number.MAX_SAFE_INTEGER)
          : 0) ||
        Number(b.seen === false) * weights.unseen +
          b.tagDiversity * weights.diversity -
          b.repetition * weights.repetitionPenalty -
          (Number(a.seen === false) * weights.unseen +
            a.tagDiversity * weights.diversity -
            a.repetition * weights.repetitionPenalty) ||
        (a.officialPosition ?? Number.MAX_SAFE_INTEGER) -
          (b.officialPosition ?? Number.MAX_SAFE_INTEGER) ||
        textCompare(a.skillSlug, b.skillSlug) ||
        order(a.difficulty) - order(b.difficulty) ||
        textCompare(a.provider, b.provider) ||
        textCompare(a.providerProblemId, b.providerProblemId),
    );
}

export function selectQueueCandidates(
  ranked: readonly RankedCandidate[],
  reasonBySkill: ReadonlyMap<string, 'PROGRESSION' | 'REVIEW' | 'REVALIDATION'>,
  count: number,
  progressionFraction: number,
  preferProgression = true,
): RankedCandidate[] {
  if (count <= 0) return [];
  const unique = ranked.filter(
    (candidate, index, all) =>
      all.findIndex((item) => item.catalogProblemId === candidate.catalogProblemId) === index,
  );
  const progression = unique.filter(
    (candidate) => reasonBySkill.get(candidate.skillSlug) === 'PROGRESSION',
  );
  const other = unique.filter(
    (candidate) => reasonBySkill.get(candidate.skillSlug) !== 'PROGRESSION',
  );
  if (count === 1 && progression.length && other.length)
    return [preferProgression ? progression[0]! : other[0]!];

  const reserve = progression.length
    ? Math.min(count, Math.max(1, Math.floor(count * progressionFraction)))
    : 0;
  const selected: RankedCandidate[] = [];
  const selectedIds = new Set<string>();
  const add = (candidate: RankedCandidate) => {
    if (selected.length >= count || selectedIds.has(candidate.catalogProblemId)) return;
    selected.push(candidate);
    selectedIds.add(candidate.catalogProblemId);
  };
  const addAcrossSkills = (pool: readonly RankedCandidate[], limit: number) => {
    const usedSkills = new Set<string>();
    for (const candidate of pool) {
      if (selected.length >= limit) break;
      if (usedSkills.has(candidate.skillSlug)) continue;
      add(candidate);
      usedSkills.add(candidate.skillSlug);
    }
    for (const candidate of pool) {
      if (selected.length >= limit) break;
      add(candidate);
    }
  };
  addAcrossSkills(progression, reserve);
  addAcrossSkills(other, count);
  for (const candidate of unique) add(candidate);
  return selected;
}
