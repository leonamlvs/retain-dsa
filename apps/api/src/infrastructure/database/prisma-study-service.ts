import { evaluateQueue } from '../../modules/scheduler/queue-engine.js';
import { discoveryFingerprint } from '../../modules/discovery/discovery-fingerprint.js';
import { randomUUID } from 'node:crypto';
import { canonical, hash } from '../../domain/canonical.js';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { studyConfigSchema } from '../../config/study-config.schema.js';
import {
  reconstructLearningState,
  reconstructionRequestSchema,
  type ReconstructionRequest,
} from '../../modules/study/reconstruction.js';
import { localDateAt } from '../../domain/calendar.js';
import { computeAnalytics } from '../../modules/study/analytics.js';
import type { Clock } from '../../domain/clock.interface.js';
import { DomainError } from '../../domain/domain-error.js';
import {
  problemSchema,
  curriculumSnapshotSchema,
  type CurriculumSnapshot,
  type Difficulty,
  type Skill,
} from '../../domain/catalog.schema.js';
import type { CreateAttempt, RecommendationResponse } from '../../modules/study/study.schema.js';
import { scoreFeedback } from '../../modules/feedback/feedback-scorer.js';
import { feedbackSchema } from '../../modules/feedback/feedback.schema.js';
import {
  type EligibilityAttempt,
  type EligibilityResult,
} from '../../modules/scheduler/eligibility.js';
import { resolvePracticeNeed } from '../../modules/scheduler/practice-need.js';
import type { MemoryState } from '../../modules/memory/memory-engine.interface.js';
import type { MemoryEngine } from '../../modules/memory/memory-engine.interface.js';
import { cooldownUntil } from '../../modules/memory/cooldown.js';
import type { AttemptResult, StudyService } from '../../modules/study/study-service.interface.js';
import type { Logger } from '../../shared/observability/logger.interface.js';
import type { DiscoveryPage } from '../../modules/discovery/problem-provider.interface.js';
import type { DiscoveryNeed } from '../../modules/discovery/discovery-need.interface.js';
import type { PrismaTransactions } from './prisma-transactions.js';

const snapshotType = (value: Prisma.JsonValue): RecommendationResponse =>
  value as unknown as RecommendationResponse;
function historicalAdmissions(
  rows: { difficulty: string; admissionBasis: Prisma.JsonValue }[],
): EligibilityResult[] {
  return rows.flatMap((row) => {
    const basis = row.admissionBasis as { eligibility?: EligibilityResult['admission'] };
    return basis.eligibility
      ? [{ difficulty: row.difficulty as Difficulty, admission: basis.eligibility }]
      : [];
  });
}

async function loadConfiguration(db: Prisma.TransactionClient, version: string) {
  const row = await db.configuration.findUnique({ where: { version } });
  if (!row)
    throw new DomainError(
      'MISSING_CONFIG_VERSION',
      `Configuration ${version} is unavailable for deterministic evaluation.`,
    );
  return studyConfigSchema.parse(row.parameters);
}

const progressScope = (user: { generation: string }) => ({ generation: user.generation });

export class PrismaStudyService implements StudyService {
  constructor(
    private readonly client: PrismaClient,
    private readonly transactions: PrismaTransactions,
    private readonly clock: Clock,
    private readonly memory: MemoryEngine,
    private readonly logger: Logger,
  ) {}

  async session() {
    return this.transactions.read(async ({ db }) => {
      const user = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      return progressScope(user);
    });
  }

  async health(): Promise<'up' | 'down'> {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  async curriculum() {
    return this.transactions.read(async ({ db }) => {
      const [user, curriculum] = [
        await db.localUser.findFirstOrThrow({ where: { singleton: 1 } }),
        await db.curriculum.findFirst({ orderBy: { lastSyncedAt: 'desc' } }),
      ];
      const [anchors, completedAnchors] = [
        await db.curriculumItem.findMany({
          where: { active: true, problem: { paidOnly: false, available: true } },
          select: { problemId: true },
          distinct: ['problemId'],
        }),
        await db.curriculumItem.findMany({
          where: {
            active: true,
            problem: {
              paidOnly: false,
              available: true,
              attempts: {
                some: {
                  userId: user.id,
                  generation: user.generation,
                },
              },
            },
          },
          select: { problemId: true },
          distinct: ['problemId'],
        }),
      ];
      const total = anchors.length;
      const completed = completedAnchors.length;
      return {
        ...progressScope(user),
        name: curriculum?.name ?? 'LeetCode 75',
        progressPercentage: total === 0 ? null : Math.round((completed / total) * 100),
        completedAnchors: completed,
        totalAnchors: total,
      };
    });
  }

  async recommendations() {
    return this.transactions.read(async ({ db }) => {
      const [user, state] = [
        await db.localUser.findFirstOrThrow({ where: { singleton: 1 } }),
        await db.applicationState.findUniqueOrThrow({ where: { id: 1 } }),
      ];
      const config = await loadConfiguration(db, state.activeConfig);
      const rows = await db.recommendation.findMany({
        where: { userId: user.id, generation: user.generation, status: 'ACTIVE' },
        orderBy: [{ position: 'asc' }, { issuedAt: 'asc' }],
      });
      const pending = await db.workRequest.count({
        where: {
          userId: user.id,
          generation: user.generation,
          OR: [
            { kind: 'MAINTENANCE', status: 'RUNNING' },
            { kind: 'REFILL', status: 'RUNNING' },
            { kind: 'REFILL', status: 'PENDING', nextRunAt: { lte: this.clock.now() } },
          ],
        },
      });
      return {
        ...progressScope(user),
        items: rows.map((row) => ({
          ...snapshotType(row.issuanceSnapshot),
          status: 'ACTIVE' as const,
          recordable: true,
        })),
        refill: {
          targetSize: config.scheduler.queueSize,
          status:
            rows.length >= config.scheduler.queueSize
              ? ('READY' as const)
              : pending
                ? ('REFILLING' as const)
                : ('SHORTAGE' as const),
          reason:
            rows.length >= config.scheduler.queueSize || pending ? null : 'NO_ELIGIBLE_CANDIDATE',
        },
      };
    });
  }

  async recommendation(id: string) {
    return this.transactions.read(async ({ db }) => {
      const user = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      const row = await db.recommendation.findUnique({ where: { id }, include: { attempt: true } });
      if (!row || row.userId !== user.id || row.generation !== user.generation)
        throw new DomainError('RECOMMENDATION_NOT_FOUND', 'Recommendation not found.');
      return {
        ...snapshotType(row.issuanceSnapshot),
        ...progressScope(user),
        status: row.status as RecommendationResponse['status'],
        recordable: !row.attempt,
      };
    });
  }

  async complete(input: CreateAttempt, idempotencyKey: string): Promise<AttemptResult> {
    const canonicalPayload = canonical(input);
    const result = await this.transactions.write(async ({ db }) => {
      const user = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      if (user.generation !== input.generation)
        throw new DomainError('STALE_GENERATION', 'Progress generation is no longer current.');
      const prior = await db.attempt.findUnique({
        where: {
          userId_generation_idempotencyKey: {
            userId: user.id,
            generation: user.generation,
            idempotencyKey,
          },
        },
        include: { feedback: true },
      });
      if (prior) {
        if (canonical(prior.canonicalPayload) !== canonicalPayload)
          throw new DomainError('IDEMPOTENCY_PAYLOAD_CHANGED', 'Idempotency key payload changed.');
        const state = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
        return { status: 200 as const, attempt: prior, feedback: prior.feedback!, state, user };
      }
      const recommendation = await db.recommendation.findUnique({
        where: { id: input.recommendationId },
        include: { attempt: true },
      });
      if (
        !recommendation ||
        recommendation.userId !== user.id ||
        recommendation.generation !== user.generation
      )
        throw new DomainError('RECOMMENDATION_NOT_RECORDABLE', 'Recommendation is not recordable.');
      if (recommendation.attempt)
        throw new DomainError(
          'RECOMMENDATION_ALREADY_RECORDED',
          'Recommendation already has an attempt.',
        );

      const completedAt = this.clock.now();
      const state = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
      const config = await loadConfiguration(db, state.activeConfig);
      if (input.feedbackSchemaVersion !== config.feedbackSchemaVersion)
        throw new DomainError(
          'UNSUPPORTED_FEEDBACK_SCHEMA',
          'The feedback schema version is not active.',
        );
      if (state.lastBusinessAt && completedAt < state.lastBusinessAt)
        throw new DomainError(
          'CLOCK_REGRESSION',
          'Server clock moved behind accepted business time.',
        );
      const sequence = user.sourceSequence + 1n;
      const evidence = scoreFeedback(input.answers, config);
      const previous = await db.skillMemoryState.findUnique({
        where: {
          userId_skillId_difficulty: {
            userId: user.id,
            skillId: recommendation.skillId,
            difficulty: recommendation.difficulty,
          },
        },
      });
      const memoryState = this.memory.review(
        previous?.state as unknown as MemoryState | undefined,
        evidence.rating,
        completedAt,
        config,
      );
      const localDate = localDateAt(completedAt, input.timezone);
      const attempt = await db.attempt.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          generation: user.generation,
          sourceSequence: sequence,
          recommendationId: recommendation.id,
          problemId: recommendation.problemId,
          skillId: recommendation.skillId,
          difficulty: recommendation.difficulty,
          historicalSnapshot: recommendation.issuanceSnapshot as Prisma.InputJsonValue,
          completedAt,
          completedLocalDate: new Date(`${localDate}T00:00:00.000Z`),
          timezone: input.timezone,
          durationSeconds: input.durationSeconds ?? null,
          idempotencyKey,
          canonicalPayload: JSON.parse(canonicalPayload) as Prisma.InputJsonValue,
          configVersion: config.version,
          feedback: {
            create: {
              independence: input.answers.independence,
              recognition: input.answers.recognition,
              implementation: input.answers.implementation,
              complexity: input.answers.complexity,
              scoreUnits: evidence.scoreUnits,
              appliedCap: evidence.cap,
              rating: evidence.rating,
              feedbackVersion: input.feedbackSchemaVersion,
              scorerVersion: evidence.scorerVersion,
              memoryTransition: memoryState as unknown as Prisma.InputJsonValue,
            },
          },
        },
        include: { feedback: true },
      });
      await db.skillMemoryState.upsert({
        where: {
          userId_skillId_difficulty: {
            userId: user.id,
            skillId: recommendation.skillId,
            difficulty: recommendation.difficulty,
          },
        },
        create: {
          userId: user.id,
          skillId: recommendation.skillId,
          difficulty: recommendation.difficulty,
          state: memoryState as unknown as Prisma.InputJsonValue,
        },
        update: { state: memoryState as unknown as Prisma.InputJsonValue },
      });
      const until = new Date(cooldownUntil(memoryState, completedAt, config));
      await db.userProblemState.upsert({
        where: { userId_problemId: { userId: user.id, problemId: recommendation.problemId } },
        create: {
          userId: user.id,
          problemId: recommendation.problemId,
          firstCompletedAt: completedAt,
          lastCompletedAt: completedAt,
          completionCount: 1,
          cooldownUntil: until,
        },
        update: {
          lastCompletedAt: completedAt,
          completionCount: { increment: 1 },
          cooldownUntil: until,
        },
      });
      await db.recommendation.update({
        where: { id: recommendation.id },
        data: { status: 'COMPLETED' },
      });
      await db.recommendationEvent.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          generation: user.generation,
          sourceSequence: sequence + 1n,
          recommendationId: recommendation.id,
          kind: 'COMPLETED',
          at: completedAt,
          details: { attemptId: attempt.id },
        },
      });
      let lifecycleSequence = sequence + 1n;
      const competing = await db.recommendation.findMany({
        where: {
          userId: user.id,
          generation: user.generation,
          problemId: recommendation.problemId,
          status: 'ACTIVE',
          id: { not: recommendation.id },
        },
        orderBy: { id: 'asc' },
      });
      for (const issuance of competing) {
        await db.recommendation.update({
          where: { id: issuance.id },
          data: { status: 'INVALIDATED' },
        });
        await db.recommendationEvent.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            generation: user.generation,
            sourceSequence: ++lifecycleSequence,
            recommendationId: issuance.id,
            kind: 'INVALIDATED',
            at: completedAt,
            details: { reason: 'PROBLEM_COMPLETED', attemptId: attempt.id },
          },
        });
      }
      await db.workRequest.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          generation: user.generation,
          kind: 'REFILL',
          requestedAt: completedAt,
          nextRunAt: completedAt,
          status: 'PENDING',
          details: {},
        },
      });
      const updatedUser = await db.localUser.update({
        where: { id: user.id },
        data: { sourceSequence: lifecycleSequence },
      });
      const updatedState = await db.applicationState.update({
        where: { id: 1 },
        data: { stateRevision: { increment: 1n }, lastBusinessAt: completedAt },
      });
      return {
        status: 201 as const,
        attempt,
        feedback: attempt.feedback!,
        state: updatedState,
        user: updatedUser,
      };
    });
    const feedback = result.feedback;
    this.logger.event(result.status === 200 ? 'attempt.replayed' : 'attempt.saved', {
      attemptId: result.attempt.id,
      rating: feedback.rating,
    });
    return {
      status: result.status,
      body: {
        ...progressScope(result.user),
        attempt: {
          id: result.attempt.id,
          recommendationId: result.attempt.recommendationId,
          completedAt: result.attempt.completedAt.toISOString(),
          completedLocalDate: result.attempt.completedLocalDate.toISOString().slice(0, 10),
          durationSeconds: result.attempt.durationSeconds,
          score: feedback.scoreUnits / 100_000_000,
          rating: feedback.rating as 'AGAIN' | 'HARD' | 'GOOD' | 'EASY',
        },
      },
    };
  }

  async analytics(query: { timezone: string; from?: string; to?: string }) {
    return this.transactions.read(async ({ db }) => {
      const user = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      const attempts = await db.attempt.findMany({
        where: { userId: user.id, generation: user.generation },
        include: { feedback: true, skill: true },
        orderBy: [{ completedAt: 'asc' }, { sourceSequence: 'asc' }],
      });
      return {
        ...progressScope(user),
        ...computeAnalytics(
          attempts.map((attempt) => ({
            ...attempt,
            feedback: feedbackSchema.strip().parse(attempt.feedback),
          })),
          query,
          this.clock.now(),
        ),
      };
    });
  }

  async reset(generation: string) {
    const result = await this.transactions.write(async ({ db }) => {
      const user = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      if (user.generation !== generation)
        throw new DomainError('STALE_GENERATION', 'Progress generation is no longer current.');
      const state = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
      const now = this.clock.now();
      if (state.lastBusinessAt && now < state.lastBusinessAt)
        throw new DomainError(
          'CLOCK_REGRESSION',
          'Server clock moved behind accepted business time.',
        );
      await db.attemptFeedback.deleteMany({ where: { attempt: { userId: user.id } } });
      await db.attempt.deleteMany({ where: { userId: user.id } });
      await db.recommendationEvent.deleteMany({ where: { userId: user.id } });
      await db.recommendation.deleteMany({ where: { userId: user.id } });
      await db.decision.deleteMany({ where: { userId: user.id } });
      await db.skillMemoryState.deleteMany({ where: { userId: user.id } });
      await db.userProblemState.deleteMany({ where: { userId: user.id } });
      await db.workRequest.deleteMany({ where: { userId: user.id } });
      const updatedUser = await db.localUser.update({
        where: { id: user.id },
        data: { generation: randomUUID(), sourceSequence: 0n, lastResetAt: now },
      });
      await db.applicationState.update({
        where: { id: 1 },
        data: { stateRevision: { increment: 1n }, lastBusinessAt: now },
      });
      await db.workRequest.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          generation: updatedUser.generation,
          kind: 'REFILL',
          requestedAt: now,
          nextRunAt: now,
          status: 'PENDING',
          details: {},
        },
      });
      return progressScope(updatedUser);
    });
    this.logger.event('progress.reset', { generation: result.generation });
    return result;
  }

  async acceptCurriculum(snapshot: CurriculumSnapshot, expectedRevision: bigint): Promise<void> {
    snapshot = curriculumSnapshotSchema.parse(snapshot);
    await this.transactions.write(async ({ db }) => {
      const state = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
      const config = await loadConfiguration(db, state.activeConfig);
      if (state.catalogRevision !== expectedRevision)
        throw new DomainError('STALE_CATALOG_REVISION', 'Catalog changed during provider request.');
      const contentHash = hash(snapshot);
      const now = this.clock.now();
      const nextRevision = state.catalogRevision + 1n;
      const sourceSequence = state.sourceSequence + 1n;
      await db.catalogRevision.create({
        data: {
          revision: nextRevision,
          observedAt: now,
          acceptedAt: now,
          sourceSequence,
          queryVersion: config.discovery.queryVersion,
          mappingVersion: config.discovery.mappingVersion,
          contentHash,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      const skillIds = new Map<string, string>();
      for (const skill of snapshot.skills) {
        const row = await db.skill.upsert({
          where: { slug: skill.slug },
          create: { id: randomUUID(), ...skill },
          update: skill,
        });
        skillIds.set(skill.slug, row.id);
      }
      const problemIds = new Map<string, string>();
      for (const problem of snapshot.problems) {
        const row = await db.problem.upsert({
          where: {
            provider_providerProblemId: {
              provider: problem.provider,
              providerProblemId: problem.providerId,
            },
          },
          create: {
            id: randomUUID(),
            provider: problem.provider,
            providerProblemId: problem.providerId,
            frontendId: problem.frontendId,
            title: problem.title,
            slug: problem.slug,
            url: problem.url,
            difficulty: problem.difficulty,
            paidOnly: problem.paidOnly,
            available: problem.available,
            metadataHash: hash(problem),
            lastSyncedAt: now,
          },
          update: {
            frontendId: problem.frontendId,
            title: problem.title,
            slug: problem.slug,
            url: problem.url,
            difficulty: problem.difficulty,
            paidOnly: problem.paidOnly,
            available: problem.available,
            metadataHash: hash(problem),
            lastSyncedAt: now,
          },
        });
        await db.problemTag.deleteMany({ where: { problemId: row.id } });
        if (problem.tags.length)
          await db.problemTag.createMany({
            data: problem.tags.map((tag) => ({ problemId: row.id, tag })),
            skipDuplicates: true,
          });
        problemIds.set(problem.providerId, row.id);
      }
      const curriculum = await db.curriculum.upsert({
        where: { provider_slug: { provider: 'leetcode', slug: snapshot.slug } },
        create: {
          id: randomUUID(),
          provider: 'leetcode',
          slug: snapshot.slug,
          name: snapshot.name,
          contentHash: hash(snapshot.items),
          lastSyncedAt: now,
        },
        update: { name: snapshot.name, contentHash: hash(snapshot.items), lastSyncedAt: now },
      });
      await db.curriculumItem.updateMany({
        where: { curriculumId: curriculum.id, active: true },
        data: { active: false, removedAt: now },
      });
      for (const item of snapshot.items) {
        const problemId = problemIds.get(item.providerId)!;
        const skillId = skillIds.get(item.skillSlug)!;
        await db.curriculumItem.upsert({
          where: {
            curriculumId_problemId_skillId: { curriculumId: curriculum.id, problemId, skillId },
          },
          create: {
            id: randomUUID(),
            curriculumId: curriculum.id,
            problemId,
            skillId,
            active: true,
            position: item.position,
            addedAt: now,
          },
          update: { active: true, position: item.position, removedAt: null },
        });
      }
      const [user, activeRecommendations, activeItemIds] = [
        await db.localUser.findFirstOrThrow({ where: { singleton: 1 } }),
        await db.recommendation.findMany({
          where: { status: 'ACTIVE' },
          include: { problem: true },
        }),
        await db.curriculumItem
          .findMany({ where: { active: true }, select: { id: true } })
          .then((rows) => new Set(rows.map((row) => row.id))),
      ];
      const invalid = activeRecommendations.filter((recommendation) => {
        const admission = recommendation.admissionBasis as Record<string, unknown>;
        return (
          recommendation.problem.paidOnly ||
          !recommendation.problem.available ||
          recommendation.problem.difficulty !== recommendation.difficulty ||
          (admission.kind === 'OFFICIAL_ANCHOR' &&
            typeof admission.curriculumItemId === 'string' &&
            !activeItemIds.has(admission.curriculumItemId))
        );
      });
      let userSequence = user.sourceSequence;
      for (const recommendation of invalid) {
        userSequence += 1n;
        await db.recommendation.update({
          where: { id: recommendation.id },
          data: { status: 'INVALIDATED' },
        });
        await db.recommendationEvent.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            generation: user.generation,
            sourceSequence: userSequence,
            recommendationId: recommendation.id,
            kind: 'INVALIDATED',
            at: now,
            details: { reason: 'CATALOG_CHANGED', catalogRevision: nextRevision.toString() },
          },
        });
      }
      if (invalid.length) {
        await db.localUser.update({
          where: { id: user.id },
          data: { sourceSequence: userSequence },
        });
        await db.workRequest.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            generation: user.generation,
            kind: 'REFILL',
            requestedAt: now,
            nextRunAt: now,
            status: 'PENDING',
            details: { reason: 'CATALOG_CHANGED' },
          },
        });
      }
      await db.applicationState.update({
        where: { id: 1 },
        data: { catalogRevision: nextRevision, sourceSequence, stateRevision: { increment: 1n } },
      });
    });
    this.logger.event('curriculum.sync.completed', { items: snapshot.items.length });
  }

  async currentCatalogRevision(): Promise<bigint> {
    return (await this.client.applicationState.findUniqueOrThrow({ where: { id: 1 } }))
      .catalogRevision;
  }

  async activeConfiguration() {
    return this.transactions.read(async ({ db }) => {
      const state = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
      return loadConfiguration(db, state.activeConfig);
    });
  }

  async discoveryNeeds(configVersion?: string): Promise<DiscoveryNeed[]> {
    return this.transactions.read(async ({ db }) => {
      const state = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
      const config = await loadConfiguration(db, state.activeConfig);
      if (configVersion && config.version !== configVersion)
        throw new DomainError(
          'STALE_CONFIGURATION',
          'Configuration changed before discovery planning.',
        );
      const user = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      const now = this.clock.now();
      const [items, attempts, certificates, problems, discoveryStates, memoryStates, activations] =
        [
          await db.curriculumItem.findMany({
            where: { active: true, problem: { paidOnly: false, available: true } },
            include: { problem: true, skill: true },
          }),
          await db.attempt.findMany({
            where: { userId: user.id, generation: user.generation },
            include: { feedback: true },
          }),
          await db.supplyCertificate.findMany(),
          await db.problem.findMany({
            where: { paidOnly: false, available: true },
            include: { tags: true },
          }),
          await db.discoveryState.findMany(),
          await db.skillMemoryState.findMany({ where: { userId: user.id } }),
          await db.configurationActivation.findMany({
            include: { configuration: true },
            orderBy: { activatedAt: 'asc' },
          }),
        ];
      const configurations = activations.map((activation) => ({
        activatedAt: activation.activatedAt.toISOString(),
        config: studyConfigSchema.parse(activation.configuration.parameters),
      }));
      const issuances = await db.recommendation.findMany({
        where: { userId: user.id, generation: user.generation },
      });
      const personal = await db.userProblemState.findMany({ where: { userId: user.id } });
      const excluded = new Set([
        ...issuances.filter((row) => row.status === 'ACTIVE').map((row) => row.problemId),
        ...personal.filter((row) => row.cooldownUntil > now).map((row) => row.problemId),
      ]);
      const results: DiscoveryNeed[] = [];
      for (const skill of [...new Map(items.map((item) => [item.skillId, item.skill])).values()]) {
        if (!skill.tags.length) continue;
        const eligibility = resolvePracticeNeed({
          historicalAdmissions: historicalAdmissions(
            issuances.filter((row) => row.skillId === skill.id),
          ),
          officialDifficulties: items
            .filter((item) => item.skillId === skill.id)
            .map((item) => item.problem.difficulty as Difficulty),
          attempts: attempts
            .filter((attempt) => attempt.skillId === skill.id)
            .map((attempt) => ({
              difficulty: attempt.difficulty as Difficulty,
              problemId: attempt.problemId,
              rating: attempt.feedback!.rating as EligibilityAttempt['rating'],
              completedAt: attempt.completedAt.toISOString(),
              sourceSequence: attempt.sourceSequence,
            })),
          supply: certificates
            .filter(
              (proof) =>
                proof.skillId === skill.id &&
                proof.fingerprint ===
                  discoveryFingerprint(skill, proof.difficulty as Difficulty, config),
            )
            .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
            .map((proof) => ({
              certificateId: proof.id,
              difficulty: proof.difficulty as Difficulty,
              complete: true,
              candidateCount: proof.providerIds.length,
              fingerprint: proof.fingerprint,
              catalogRevision: proof.catalogRevision.toString(),
              observedAt: proof.observedAt.toISOString(),
              validUntil: proof.validUntil.toISOString(),
            })),
          memories: memoryStates
            .filter((state) => state.skillId === skill.id)
            .map((state) => ({
              difficulty: state.difficulty as Difficulty,
              state: state.state as unknown as MemoryState,
            })),
          configurations,
          evaluationTime: now,
          memory: this.memory,
          positiveRequired: config.scheduler.positiveEvidenceRequired,
        });
        const normalizedSkill: Skill = {
          slug: skill.slug,
          name: skill.name,
          tags: skill.tags,
          mappingVersion: skill.mappingVersion,
          active: skill.active,
        };
        const tiers = [
          ...new Set<Difficulty>([eligibility?.difficulty ?? 'Easy', 'Easy', 'Medium', 'Hard']),
        ];
        for (const difficulty of tiers) {
          const fingerprint = discoveryFingerprint(normalizedSkill, difficulty, config);
          const matching = problems.filter(
            (problem) =>
              problem.difficulty === difficulty &&
              skill.tags.every((tag) => problem.tags.some((candidate) => candidate.tag === tag)),
          );
          const staleBefore = now.getTime() - config.discovery.metadataTtlMs;
          const stale = matching.some((problem) => problem.lastSyncedAt.getTime() < staleBefore);
          if (
            matching.filter((problem) => !excluded.has(problem.id)).length >=
              config.discovery.minimumPool &&
            !stale
          )
            continue;
          const prior = discoveryStates.find((candidate) => candidate.fingerprint === fingerprint);
          if (
            prior?.exhausted &&
            !stale &&
            certificates.some(
              (proof) => proof.fingerprint === fingerprint && proof.validUntil > now,
            )
          )
            continue;
          const restart = !prior || prior.exhausted || stale;
          results.push({
            skill: normalizedSkill,
            skillId: skill.id,
            difficulty,
            fingerprint,
            scanId: restart ? randomUUID() : prior.scanId,
            offset: restart ? 0 : prior.offset,
            catalogRevision: state.catalogRevision,
            configVersion: config.version,
            generation: user.generation,
            userSourceSequence: user.sourceSequence,
          });
        }
      }
      return results;
    });
  }

  async cachedSupply(need: DiscoveryNeed): Promise<number> {
    return this.transactions.read(async ({ db }) => {
      const problems = await db.problem.findMany({
        where: { difficulty: need.difficulty, paidOnly: false, available: true },
        include: { tags: true },
      });
      const user = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      const now = this.clock.now();
      const active = await db.recommendation.findMany({
        where: { userId: user.id, status: 'ACTIVE' },
      });
      const cooldowns = await db.userProblemState.findMany({
        where: { userId: user.id, cooldownUntil: { gt: now } },
      });
      const excluded = new Set([...active, ...cooldowns].map((row) => row.problemId));
      return problems.filter(
        (problem) =>
          !excluded.has(problem.id) &&
          need.skill.tags.every((tag) => problem.tags.some((candidate) => candidate.tag === tag)),
      ).length;
    });
  }

  async acceptDiscoveryPage(need: DiscoveryNeed, page: DiscoveryPage): Promise<DiscoveryNeed> {
    return this.transactions.write(async ({ db }) => {
      const state = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
      const config = await loadConfiguration(db, state.activeConfig);
      const problemIds = page.problems.map((problem) => problem.providerId);
      const validProblems = page.problems.every(
        (problem) => problemSchema.safeParse(problem).success,
      );
      if (
        !validProblems ||
        !Number.isSafeInteger(page.total) ||
        page.total < 0 ||
        page.offset < 0 ||
        page.nextOffset !== page.offset + page.problems.length ||
        page.offset > page.total ||
        page.nextOffset > page.total ||
        new Set(problemIds).size !== problemIds.length ||
        (page.exhausted ? page.nextOffset !== page.total : page.nextOffset >= page.total)
      )
        throw new DomainError(
          'INVALID_DISCOVERY_PAGE',
          'Provider returned an invalid discovery page.',
        );
      if (state.catalogRevision !== need.catalogRevision)
        throw new DomainError('STALE_CATALOG_REVISION', 'Catalog changed during discovery.');
      const capturedUser = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      const currentSkill = await db.skill.findUniqueOrThrow({ where: { id: need.skillId } });
      if (
        config.version !== need.configVersion ||
        discoveryFingerprint(currentSkill, need.difficulty, config) !== need.fingerprint ||
        canonical({
          slug: currentSkill.slug,
          name: currentSkill.name,
          tags: currentSkill.tags,
          mappingVersion: currentSkill.mappingVersion,
          active: currentSkill.active,
        }) !== canonical(need.skill)
      )
        throw new DomainError(
          'STALE_DISCOVERY_CONTEXT',
          'Discovery configuration or mapping changed.',
        );
      if (
        capturedUser.generation !== need.generation ||
        capturedUser.sourceSequence !== need.userSourceSequence
      )
        throw new DomainError('STALE_DISCOVERY_CONTEXT', 'User state changed during discovery.');
      if (
        page.offset !== need.offset ||
        page.nextOffset !== page.offset + page.problems.length ||
        (!page.exhausted && page.nextOffset <= page.offset)
      )
        throw new DomainError('STALE_DISCOVERY_CURSOR', 'Provider returned an invalid cursor.');
      const previous = await db.discoveryState.findUnique({
        where: { fingerprint: need.fingerprint },
      });
      if (
        previous?.scanId === need.scanId &&
        previous.previousTotal !== null &&
        previous.previousTotal !== page.total
      )
        return { ...need, scanId: randomUUID(), offset: 0, restartRequired: true };
      const now = this.clock.now();
      const nextRevision = state.catalogRevision + 1n;
      const sourceSequence = state.sourceSequence + 1n;
      const touchedProblemIds: string[] = [];
      for (const problem of page.problems) {
        const row = await db.problem.upsert({
          where: {
            provider_providerProblemId: {
              provider: problem.provider,
              providerProblemId: problem.providerId,
            },
          },
          create: {
            id: randomUUID(),
            provider: problem.provider,
            providerProblemId: problem.providerId,
            frontendId: problem.frontendId,
            title: problem.title,
            slug: problem.slug,
            url: problem.url,
            difficulty: problem.difficulty,
            paidOnly: problem.paidOnly,
            available: problem.available,
            metadataHash: hash(problem),
            lastSyncedAt: now,
          },
          update: {
            frontendId: problem.frontendId,
            title: problem.title,
            slug: problem.slug,
            url: problem.url,
            difficulty: problem.difficulty,
            paidOnly: problem.paidOnly,
            available: problem.available,
            metadataHash: hash(problem),
            lastSyncedAt: now,
          },
        });
        await db.problemTag.deleteMany({ where: { problemId: row.id } });
        if (problem.tags.length)
          await db.problemTag.createMany({
            data: problem.tags.map((tag) => ({ problemId: row.id, tag })),
            skipDuplicates: true,
          });
        touchedProblemIds.push(row.id);
      }
      if (previous?.scanId === need.scanId && previous.offset !== need.offset)
        throw new DomainError(
          'STALE_DISCOVERY_CURSOR',
          'Discovery cursor changed before acceptance.',
        );
      if (
        previous?.scanId === need.scanId &&
        page.problems.some((problem) => previous.observedIds.includes(problem.providerId))
      )
        throw new DomainError(
          'INVALID_DISCOVERY_PAGE',
          'Provider repeated an identity across pages.',
        );
      const observedIds = [
        ...new Set([
          ...(previous?.scanId === need.scanId ? previous.observedIds : []),
          ...page.problems.map((problem) => problem.providerId),
        ]),
      ];
      await db.catalogRevision.create({
        data: {
          revision: nextRevision,
          observedAt: now,
          acceptedAt: now,
          sourceSequence,
          queryVersion: config.discovery.queryVersion,
          mappingVersion: need.skill.mappingVersion,
          contentHash: hash({ fingerprint: need.fingerprint, scanId: need.scanId, page }),
          snapshot: {
            kind: 'DISCOVERY_PAGE',
            fingerprint: need.fingerprint,
            scanId: need.scanId,
            offset: page.offset,
            nextOffset: page.nextOffset,
            exhausted: page.exhausted,
            problems: page.problems,
          } as Prisma.InputJsonValue,
        },
      });
      await db.discoveryState.upsert({
        where: { fingerprint: need.fingerprint },
        create: {
          fingerprint: need.fingerprint,
          skillId: need.skillId,
          difficulty: need.difficulty,
          criteria: {
            provider: 'leetcode',
            queryVersion: config.discovery.queryVersion,
            mappingVersion: need.skill.mappingVersion,
            skill: need.skill,
            difficulty: need.difficulty,
            freeOnly: true,
            ordering: 'provider-default-v1',
            pageSize: config.discovery.pageSize,
            maximumPages: config.discovery.maximumPages,
          } as Prisma.InputJsonValue,
          scanId: need.scanId,
          offset: page.nextOffset,
          observedIds,
          previousTotal: page.total,
          startedAt: now,
          updatedAt: now,
          exhausted: page.exhausted,
        },
        update: {
          scanId: need.scanId,
          offset: page.nextOffset,
          observedIds,
          previousTotal: page.total,
          startedAt: previous?.scanId === need.scanId ? previous.startedAt : now,
          updatedAt: now,
          exhausted: page.exhausted,
        },
      });
      if (page.exhausted) {
        const structural = await db.problem.findMany({
          where: {
            providerProblemId: { in: observedIds },
            difficulty: need.difficulty,
            paidOnly: false,
            available: true,
          },
          include: { tags: true },
        });
        const providerIds = structural
          .filter((problem) =>
            need.skill.tags.every((tag) => problem.tags.some((candidate) => candidate.tag === tag)),
          )
          .map((problem) => problem.providerProblemId)
          .sort();
        await db.supplyCertificate.create({
          data: {
            id: randomUUID(),
            skillId: need.skillId,
            difficulty: need.difficulty,
            fingerprint: need.fingerprint,
            scanId: need.scanId,
            catalogRevision: nextRevision,
            observedAt: now,
            validUntil: new Date(now.getTime() + config.discovery.certificateTtlMs),
            providerIds,
            evidence: { complete: true, total: page.total, observedIds } as Prisma.InputJsonValue,
          },
        });
      }
      const user = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      const touchedActive = await db.recommendation.findMany({
        where: { userId: user.id, status: 'ACTIVE', problemId: { in: touchedProblemIds } },
        include: { problem: { include: { tags: true } }, skill: true },
      });
      const invalid = touchedActive.filter(
        (recommendation) =>
          recommendation.problem.paidOnly ||
          !recommendation.problem.available ||
          recommendation.problem.difficulty !== recommendation.difficulty ||
          !recommendation.skill.tags.every((tag) =>
            recommendation.problem.tags.some((candidate) => candidate.tag === tag),
          ),
      );
      let userSequence = user.sourceSequence;
      for (const recommendation of invalid) {
        userSequence += 1n;
        await db.recommendation.update({
          where: { id: recommendation.id },
          data: { status: 'INVALIDATED' },
        });
        await db.recommendationEvent.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            generation: user.generation,
            sourceSequence: userSequence,
            recommendationId: recommendation.id,
            kind: 'INVALIDATED',
            at: now,
            details: {
              reason: 'DISCOVERY_METADATA_CHANGED',
              catalogRevision: nextRevision.toString(),
            },
          },
        });
      }
      if (invalid.length) {
        await db.localUser.update({
          where: { id: user.id },
          data: { sourceSequence: userSequence },
        });
        await db.workRequest.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            generation: user.generation,
            kind: 'REFILL',
            requestedAt: now,
            nextRunAt: now,
            status: 'PENDING',
            details: { reason: 'DISCOVERY_METADATA_CHANGED' },
          },
        });
      }
      await db.applicationState.update({
        where: { id: 1 },
        data: { catalogRevision: nextRevision, sourceSequence, stateRevision: { increment: 1n } },
      });
      return {
        ...need,
        offset: page.nextOffset,
        catalogRevision: nextRevision,
        userSourceSequence: userSequence,
      };
    });
  }

  async rebuildProjections(request?: ReconstructionRequest): Promise<void> {
    const captured = await this.transactions.read(async ({ db }) => {
      const user = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      const state = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
      const input = reconstructionRequestSchema.parse(
        request ?? {
          userId: user.id,
          evaluationTime: this.clock.now(),
          cutoffSequence: user.sourceSequence,
        },
      );
      if (
        input.userId !== user.id ||
        input.cutoffSequence !== user.sourceSequence ||
        (state.lastBusinessAt && input.evaluationTime < state.lastBusinessAt)
      )
        throw new DomainError(
          'RECONSTRUCTION_PUBLICATION_CONFLICT',
          'Only the current source cutoff can replace live projections.',
        );
      const where = {
        userId: user.id,
        generation: user.generation,
        sourceSequence: { lte: input.cutoffSequence },
      };
      const attempts = await db.attempt.findMany({
        where,
        include: { feedback: true },
        orderBy: { sourceSequence: 'asc' },
      });
      if (attempts.some((row) => row.completedAt > input.evaluationTime))
        throw new DomainError(
          'RECONSTRUCTION_PUBLICATION_CONFLICT',
          'Evaluation time precedes retained source facts.',
        );
      const configurations = await db.configuration.findMany();
      return {
        user,
        state,
        input,
        sources: { attempts, configurations },
      };
    });
    const rebuilt = reconstructLearningState(captured.sources, this.memory);
    await this.transactions.write(async ({ db }) => {
      const user = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      const state = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
      if (
        user.id !== captured.user.id ||
        user.generation !== captured.user.generation ||
        user.sourceSequence !== captured.user.sourceSequence ||
        state.stateRevision !== captured.state.stateRevision ||
        state.catalogRevision !== captured.state.catalogRevision ||
        state.sourceSequence !== captured.state.sourceSequence ||
        state.activeConfig !== captured.state.activeConfig
      )
        throw new DomainError(
          'RECONSTRUCTION_PUBLICATION_CONFLICT',
          'Source state changed during reconstruction.',
        );
      await db.skillMemoryState.deleteMany({ where: { userId: user.id } });
      await db.userProblemState.deleteMany({ where: { userId: user.id } });
      for (const [key, memoryState] of rebuilt.memoryStates) {
        const separator = key.lastIndexOf(':');
        await db.skillMemoryState.create({
          data: {
            userId: user.id,
            skillId: key.slice(0, separator),
            difficulty: key.slice(separator + 1),
            state: memoryState as unknown as Prisma.InputJsonValue,
          },
        });
      }
      for (const [problemId, projection] of rebuilt.problemStates)
        await db.userProblemState.create({ data: { userId: user.id, problemId, ...projection } });
      await db.applicationState.update({
        where: { id: 1 },
        data: { stateRevision: { increment: 1n } },
      });
    });
    this.logger.event('rebuild.verified', {
      userId: captured.user.id,
      cutoffSequence: captured.input.cutoffSequence.toString(),
      evaluationTime: captured.input.evaluationTime.toISOString(),
      learningProjectionsReplaced: true,
    });
    await this.replenish();
  }

  async claimMaintenance(operationId: string, configVersion: string): Promise<boolean> {
    return this.transactions.write(async ({ db }) => {
      const user = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      const state = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
      const config = await loadConfiguration(db, state.activeConfig);
      if (config.version !== configVersion) return false;
      const now = this.clock.now();
      const scope = { userId: user.id, generation: user.generation };
      const lease = await db.workRequest.findFirst({ where: { ...scope, kind: 'MAINTENANCE' } });
      if (lease?.status === 'RUNNING' && lease.nextRunAt > now) return false;
      const due = await db.workRequest.count({
        where: {
          ...scope,
          kind: 'REFILL',
          status: { in: ['PENDING', 'RUNNING'] },
          nextRunAt: { lte: now },
        },
      });
      if (lease && lease.nextRunAt > now && !due) return false;
      const nextRunAt = new Date(
        now.getTime() + config.discovery.totalBudgetMs + config.discovery.workerRetryMs,
      );
      if (lease) await db.workRequest.delete({ where: { id: lease.id } });
      await db.workRequest.create({
        data: {
          ...scope,
          id: operationId,
          kind: 'MAINTENANCE',
          requestedAt: now,
          nextRunAt,
          status: 'RUNNING',
          details: { configVersion },
        },
      });
      await db.workRequest.updateMany({
        where: {
          ...scope,
          kind: 'REFILL',
          status: { in: ['PENDING', 'RUNNING'] },
          nextRunAt: { lte: now },
        },
        data: { status: 'RUNNING', nextRunAt, details: { operationId } },
      });
      return true;
    });
  }

  async releaseMaintenance(operationId: string): Promise<void> {
    await this.transactions.write(async ({ db }) => {
      const lease = await db.workRequest.findUnique({ where: { id: operationId } });
      if (!lease) return;
      const state = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
      const config = await loadConfiguration(db, state.activeConfig);
      const nextRunAt = new Date(this.clock.now().getTime() + config.discovery.workerRetryMs);
      await db.workRequest.update({
        where: { id: operationId },
        data: { status: 'COMPLETED', nextRunAt },
      });
      await db.workRequest.updateMany({
        where: {
          userId: lease.userId,
          generation: lease.generation,
          kind: 'REFILL',
          status: 'RUNNING',
          details: { path: ['operationId'], equals: operationId },
        },
        data: { status: 'PENDING', nextRunAt },
      });
    });
  }

  async replenish(configVersion?: string, operationId?: string): Promise<void> {
    const result = await this.transactions.maintenance(async ({ db }) => {
      const diagnosticStart = Date.now();
      const user = await db.localUser.findFirstOrThrow({ where: { singleton: 1 } });
      const now = this.clock.now();
      if (operationId) {
        const lease = await db.workRequest.findUnique({ where: { id: operationId } });
        if (
          !lease ||
          lease.generation !== user.generation ||
          lease.status !== 'RUNNING' ||
          lease.nextRunAt <= now
        )
          throw new DomainError('STALE_MAINTENANCE', 'Maintenance lease is no longer current.');
      }
      const appState = await db.applicationState.findUniqueOrThrow({ where: { id: 1 } });
      const config = await loadConfiguration(db, appState.activeConfig);
      if (configVersion && config.version !== configVersion)
        throw new DomainError('STALE_CONFIGURATION', 'Configuration changed before replenishment.');
      const [attempts, items, certificates, catalogProblems, activations] = [
        await db.attempt.findMany({
          where: { userId: user.id, generation: user.generation },
          include: { feedback: true, problem: { include: { tags: true } }, recommendation: true },
        }),
        await db.curriculumItem.findMany({
          where: { active: true, problem: { paidOnly: false, available: true } },
          include: { problem: { include: { tags: true } }, skill: true },
        }),
        await db.supplyCertificate.findMany({ where: { validUntil: { gt: now } } }),
        await db.problem.findMany({
          where: { paidOnly: false, available: true },
          include: { tags: true },
        }),
        await db.configurationActivation.findMany({
          include: { configuration: true },
          orderBy: { activatedAt: 'asc' },
        }),
      ];
      const issuances = await db.recommendation.findMany({
        where: { userId: user.id, generation: user.generation },
      });
      if (appState.lastBusinessAt && now < appState.lastBusinessAt)
        throw new DomainError(
          'CLOCK_REGRESSION',
          'Server clock moved behind accepted business time.',
        );
      const queue = evaluateQueue(
        {
          version: 'queue-input-v1',
          evaluatedAt: now,
          config,
          configurations: activations.map((activation) => ({
            activatedAt: activation.activatedAt.toISOString(),
            config: activation.configuration.parameters,
          })),
          items,
          problems: catalogProblems,
          attempts: attempts.map((attempt) => ({
            problemId: attempt.problemId,
            skillId: attempt.skillId,
            difficulty: attempt.difficulty,
            completedAt: attempt.completedAt,
            sourceSequence: attempt.sourceSequence,
            configVersion: attempt.configVersion,
            historicalSnapshot: attempt.historicalSnapshot,
            recommendation: { admissionBasis: attempt.recommendation.admissionBasis },
            feedback: feedbackSchema.parse({
              independence: attempt.feedback?.independence,
              recognition: attempt.feedback?.recognition,
              implementation: attempt.feedback?.implementation,
              complexity: attempt.feedback?.complexity,
            }),
          })),
          issuances,
          certificates,
        },
        this.memory,
      );
      const { eligible, invalid, replaced, surviving, ranked, selectedRanked, candidates } = queue;
      const lifecycle: { event: string; recommendationId: string; reason: string }[] = [];
      let sequence = user.sourceSequence;
      for (const recommendation of invalid) {
        lifecycle.push({
          event: 'recommendation.replaced',
          recommendationId: recommendation.id,
          reason: 'CURRENT_ELIGIBILITY_CHANGED',
        });
        sequence += 1n;
        await db.recommendation.update({
          where: { id: recommendation.id },
          data: { status: 'INVALIDATED' },
        });
        await db.recommendationEvent.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            generation: user.generation,
            sourceSequence: sequence,
            recommendationId: recommendation.id,
            kind: 'INVALIDATED',
            at: now,
            details: { reason: 'CURRENT_ELIGIBILITY_CHANGED' },
          },
        });
      }
      for (const recommendation of replaced) {
        lifecycle.push({
          event: 'recommendation.replaced',
          recommendationId: recommendation.id,
          reason: 'QUEUE_SIZE_REDUCED',
        });
        sequence += 1n;
        await db.recommendation.update({
          where: { id: recommendation.id },
          data: { status: 'REPLACED' },
        });
        await db.recommendationEvent.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            generation: user.generation,
            sourceSequence: sequence,
            recommendationId: recommendation.id,
            kind: 'REPLACED',
            at: now,
            details: { reason: 'QUEUE_SIZE_REDUCED', queueSize: config.scheduler.queueSize },
          },
        });
      }
      let reordered = 0;
      for (const [position, recommendation] of surviving.entries()) {
        lifecycle.push({
          event: 'recommendation.kept',
          recommendationId: recommendation.id,
          reason: 'STILL_ELIGIBLE',
        });
        if (recommendation.position === position) continue;
        sequence += 1n;
        await db.recommendation.update({
          where: { id: recommendation.id },
          data: { position },
        });
        await db.recommendationEvent.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            generation: user.generation,
            sourceSequence: sequence,
            recommendationId: recommendation.id,
            kind: 'REORDERED',
            at: now,
            details: { from: recommendation.position, to: position },
          },
        });
        recommendation.position = position;
        reordered += 1;
      }
      for (const [index, candidate] of candidates.entries()) {
        sequence += 1n;
        const decisionId = randomUUID();
        const recommendationId = randomUUID();
        lifecycle.push({
          event: 'recommendation.created',
          recommendationId,
          reason: selectedRanked[index]!.needReason,
        });
        const eligibility = eligible.get(candidate.skillId)!;
        const admissionBasis = {
          kind: candidate.curriculumItemId ? 'OFFICIAL_ANCHOR' : 'SUPPLEMENTAL',
          eligibility: eligibility!.admission,
          reason: selectedRanked[index]!.needReason,
          regressionBoundary: eligibility!.regressionBoundary,
          curriculumItemId: candidate.curriculumItemId,
          catalogRevision: appState.catalogRevision.toString(),
          configVersion: config.version,
          ranking: {
            policyVersion: 'queue-engine-v4',
            candidateCount: ranked.length,
          },
        };
        await db.decision.create({
          data: {
            id: decisionId,
            userId: user.id,
            generation: user.generation,
            sourceSequence: sequence,
            sourceCutoff: user.sourceSequence,
            evaluatedAt: now,
            catalogRevision: appState.catalogRevision,
            configVersion: config.version,
            inputs: admissionBasis,
            auditOutputs: {
              selectedProblemKey: candidate.key,
              selectedProblemId: candidate.problem.providerProblemId,
            },
          },
        });
        const snapshot: RecommendationResponse = {
          id: recommendationId,
          provider: 'leetcode',
          providerProblemId: candidate.problem.providerProblemId,
          frontendId: candidate.problem.frontendId,
          title: candidate.problem.title,
          slug: candidate.problem.slug,
          url: candidate.problem.url,
          difficulty: candidate.problem.difficulty as RecommendationResponse['difficulty'],
          primarySkill: { slug: candidate.skill.slug, name: candidate.skill.name },
          tags: candidate.problem.tags.map((tag) => tag.tag),
          reason: selectedRanked[index]!.needReason,
          issuedAt: now.toISOString(),
          status: 'ACTIVE',
          recordable: true,
        };
        await db.recommendation.create({
          data: {
            id: recommendationId,
            userId: user.id,
            generation: user.generation,
            problemId: candidate.problem.id,
            skillId: candidate.skill.id,
            difficulty: candidate.problem.difficulty,
            issuedAt: now,
            issuanceSnapshot: snapshot as unknown as Prisma.InputJsonValue,
            admissionBasis,
            decisionId,
            status: 'ACTIVE',
            position: surviving.length + index,
          },
        });
        sequence += 1n;
        await db.recommendationEvent.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            generation: user.generation,
            sourceSequence: sequence,
            recommendationId,
            kind: 'ISSUED',
            at: now,
            details: admissionBasis,
          },
        });
      }
      const filled = surviving.length + candidates.length >= config.scheduler.queueSize;
      await db.workRequest.updateMany({
        where: {
          userId: user.id,
          generation: user.generation,
          kind: 'REFILL',
          status: { in: ['PENDING', 'RUNNING'] },
          ...(operationId
            ? { details: { path: ['operationId'], equals: operationId } }
            : { nextRunAt: { lte: now } }),
        },
        data: {
          status: filled ? 'COMPLETED' : 'PENDING',
          attempts: { increment: 1 },
          nextRunAt: filled ? now : new Date(now.getTime() + config.discovery.workerRetryMs),
          details: filled ? { filled: true } : { shortage: 'NO_ELIGIBLE_CANDIDATE' },
        },
      });
      if (invalid.length || replaced.length || candidates.length || reordered) {
        await db.localUser.update({ where: { id: user.id }, data: { sourceSequence: sequence } });
        await db.applicationState.update({
          where: { id: 1 },
          data: { stateRevision: { increment: 1n }, lastBusinessAt: now },
        });
      }
      return {
        lifecycle,
        generation: user.generation,
        issued: candidates.length,
        invalidated: invalid.length,
        replaced: replaced.length,
        reordered,
        filled,
        eligibleCandidates: ranked.length,
        elapsedMs: Date.now() - diagnosticStart,
      };
    });
    const { lifecycle, ...summary } = result;
    for (const { event, ...details } of lifecycle)
      this.logger.event(event, { ...details, generation: result.generation, operationId });
    this.logger.event('recommendation.replenish.completed', { ...summary, operationId });
  }
}
