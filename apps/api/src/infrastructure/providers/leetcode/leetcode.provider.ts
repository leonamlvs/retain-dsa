import { z } from 'zod';
import type { StudyConfig } from '../../../config/study-config.schema.js';
import type { Clock, Sleeper } from '../../../domain/clock.interface.js';
import { DomainError } from '../../../domain/domain-error.js';
import type { CurriculumSnapshot, Problem } from '../../../domain/catalog.schema.js';
import type {
  DiscoveryCriteria,
  DiscoveryPage,
  ProblemProvider,
} from '../../../modules/discovery/problem-provider.interface.js';
import type { HttpTransport } from '../../../modules/discovery/http-transport.interface.js';
import type { Logger } from '../../../shared/observability/logger.interface.js';
import { errorDetails } from '../../../shared/observability/error-details.js';
import { discoveryTags } from './skill-mapping.js';
export const LEETCODE_ENDPOINT = 'https://leetcode.com/graphql/';
export const CURRICULUM_QUERY =
  'query RetainCurriculum { studyPlanV2Detail(planSlug: "leetcode-75") { slug name planSubGroups { slug name questions { questionFrontendId title titleSlug difficulty paidOnly } } } }';
const detailFields =
  'questionId questionFrontendId title titleSlug difficulty isPaidOnly topicTags { name slug }';
const listFields =
  'id questionFrontendId title titleSlug difficulty paidOnly topicTags { name slug }';
const tagsSchema = z.array(z.object({ name: z.string(), slug: z.string() }));
const lightSchema = z.object({
  titleSlug: z.string().min(1),
  questionFrontendId: z.string(),
  title: z.string(),
  difficulty: z.string(),
  paidOnly: z.boolean(),
});
const planSchema = z.object({
  slug: z.literal('leetcode-75'),
  name: z.string(),
  planSubGroups: z
    .array(z.object({ slug: z.string(), name: z.string(), questions: z.array(lightSchema).min(1) }))
    .min(1),
});
const detailSchema = z.object({
  questionId: z.string().min(1),
  questionFrontendId: z.string(),
  title: z.string(),
  titleSlug: z.string(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  isPaidOnly: z.boolean(),
  topicTags: tagsSchema,
});
const listProblemSchema = z.object({
  id: z.number().int().positive(),
  questionFrontendId: z.string(),
  title: z.string(),
  titleSlug: z.string(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  paidOnly: z.boolean(),
  topicTags: tagsSchema,
});
const listSchema = z.object({
  totalLength: z.number().int().nonnegative(),
  questions: z.array(listProblemSchema),
});
const envelope = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  errors: z.array(z.unknown()).optional(),
});
function schemaError(error?: z.ZodError, context?: Record<string, unknown>): DomainError {
  return new DomainError(
    'PROVIDER_SCHEMA_ERROR',
    'LeetCode metadata no longer matches the verified contract.',
    { ...context, issues: error?.issues },
  );
}
function normalizeDetail(input: z.infer<typeof detailSchema>): Problem {
  return {
    provider: 'leetcode',
    providerId: input.questionId,
    frontendId: input.questionFrontendId,
    title: input.title,
    slug: input.titleSlug,
    url: `https://leetcode.com/problems/${encodeURIComponent(input.titleSlug)}/`,
    difficulty: input.difficulty,
    paidOnly: input.isPaidOnly,
    available: true,
    tags: [...new Set(input.topicTags.map((tag) => tag.slug))].sort(),
  };
}
export class LeetCodeProvider implements ProblemProvider {
  constructor(
    private readonly http: HttpTransport,
    private readonly clock: Clock,
    private readonly sleeper: Sleeper,
    private readonly config: StudyConfig,
    private readonly logger: Logger,
  ) {}
  private async graphql(
    query: string,
    variables: Record<string, unknown>,
    deadline: Date,
  ): Promise<Record<string, unknown>> {
    for (let attempt = 0; ; attempt++) {
      const remaining = deadline.getTime() - this.clock.now().getTime();
      if (remaining <= 0)
        throw new DomainError('PROVIDER_BUDGET_EXHAUSTED', 'Provider operation budget exhausted.');
      let retryDelay = this.config.discovery.retryDelayMs;
      try {
        const response = await this.http.post(
          LEETCODE_ENDPOINT,
          { query, variables },
          Math.min(remaining, this.config.discovery.requestTimeoutMs),
        );
        if (response.status === 429 || response.status >= 500) {
          if (response.retryAfter) {
            const seconds = Number(response.retryAfter);
            retryDelay = Math.max(
              retryDelay,
              Number.isFinite(seconds)
                ? seconds * 1000
                : Date.parse(response.retryAfter) - this.clock.now().getTime(),
            );
          }
          throw new DomainError('PROVIDER_TRANSIENT', 'Temporary provider failure.');
        }
        if (response.status !== 200)
          throw new DomainError('PROVIDER_REJECTED', 'Provider rejected metadata request.');
        const parsed = envelope.safeParse(response.body);
        if (!parsed.success) throw schemaError(parsed.error, { operation: 'envelope' });
        if (parsed.data.errors?.length)
          throw new DomainError('PROVIDER_GRAPHQL_ERROR', 'LeetCode reported a GraphQL error.');
        if (!parsed.data.data) throw schemaError(undefined, { operation: 'envelope.data' });
        return parsed.data.data;
      } catch (error) {
        const code = error instanceof DomainError ? error.code : 'PROVIDER_NETWORK_ERROR';
        this.logger.error('discovery.provider_failed', {
          error: errorDetails(error),
          code,
          attempt,
        });
        if (
          !['PROVIDER_TRANSIENT', 'PROVIDER_TIMEOUT', 'PROVIDER_NETWORK_ERROR'].includes(code) ||
          attempt >= this.config.discovery.retries
        )
          throw error;
        if (
          !Number.isFinite(retryDelay) ||
          this.clock.now().getTime() + retryDelay >= deadline.getTime()
        )
          throw new DomainError('PROVIDER_BUDGET_EXHAUSTED', 'Retry exceeds operation budget.');
        await this.sleeper.sleep(retryDelay);
      }
    }
  }
  async curriculum(deadline: Date): Promise<CurriculumSnapshot> {
    const response = await this.graphql(CURRICULUM_QUERY, {}, deadline);
    const parsed = planSchema.safeParse(response.studyPlanV2Detail);
    if (!parsed.success) throw schemaError(parsed.error, { operation: 'curriculum.plan' });
    const plan = parsed.data;
    const slugs = [
      ...new Set(
        plan.planSubGroups.flatMap((group) => group.questions.map((problem) => problem.titleSlug)),
      ),
    ];
    if (slugs.length > 150)
      throw schemaError(undefined, { operation: 'curriculum.plan', slugCount: slugs.length });
    const details = new Map<string, Problem>();
    for (let offset = 0; offset < slugs.length; offset += 25) {
      const batch = slugs.slice(offset, offset + 25);
      const query = `query RetainMetadata(${batch.map((_, i) => `$s${i}:String!`).join(',')}) { ${batch.map((_, i) => `q${i}:question(titleSlug:$s${i}) { ${detailFields} }`).join(' ')} }`;
      const body = await this.graphql(
        query,
        Object.fromEntries(batch.map((slug, i) => [`s${i}`, slug])),
        deadline,
      );
      for (const [index, slug] of batch.entries()) {
        const detail = detailSchema.safeParse(body[`q${index}`]);
        if (!detail.success)
          throw schemaError(detail.error, { operation: 'curriculum.detail', slug });
        if (detail.data.titleSlug !== slug)
          throw schemaError(undefined, {
            operation: 'curriculum.detail',
            slug,
            returnedSlug: detail.data.titleSlug,
          });
        details.set(slug, normalizeDetail(detail.data));
      }
    }
    let position = 0;
    return {
      slug: plan.slug,
      name: plan.name,
      skills: plan.planSubGroups.map((group) => ({
        slug: group.slug,
        name: group.name,
        tags: discoveryTags(group.name),
        mappingVersion: this.config.discovery.mappingVersion,
        active: true,
      })),
      problems: [...details.values()],
      items: plan.planSubGroups.flatMap((group) =>
        group.questions.map((question) => ({
          skillSlug: group.slug,
          providerId: details.get(question.titleSlug)!.providerId,
          position: position++,
        })),
      ),
    };
  }
  async discover(criteria: DiscoveryCriteria, deadline: Date): Promise<DiscoveryPage> {
    if (!criteria.skill.tags.length)
      throw new DomainError(
        'UNKNOWN_SKILL_MAPPING',
        'Category has no verified topic filter mapping.',
      );
    if (
      !Number.isSafeInteger(criteria.offset) ||
      criteria.offset < 0 ||
      !Number.isSafeInteger(criteria.limit) ||
      criteria.limit < 1 ||
      criteria.limit > this.config.discovery.pageSize
    )
      throw new DomainError('INVALID_DISCOVERY_CRITERIA', 'Invalid pagination criteria.');
    // Enum literals are generated only from validated domain difficulty; strings use JSON quoting.
    // LeetCode combines multiple topic values as a union. Scan one required topic,
    // retaining raw metadata/pagination; the catalog applies the full conjunction.
    const query = `query RetainDiscovery { problemsetQuestionListV2(limit:${criteria.limit},skip:${criteria.offset},filters:{filterCombineType:ALL,difficultyFilter:{difficulties:[${criteria.difficulty.toUpperCase()}],operator:IS},topicFilter:{topicSlugs:${JSON.stringify(criteria.skill.tags.slice(0, 1))},operator:IS}}) { totalLength questions { ${listFields} } } }`;
    const body = await this.graphql(query, {}, deadline);
    const parsed = listSchema.safeParse(body.problemsetQuestionListV2);
    if (!parsed.success) throw schemaError(parsed.error, { operation: 'discovery.list' });
    const { questions, totalLength } = parsed.data;
    if (
      questions.length > criteria.limit ||
      (questions.length === 0 && criteria.offset < totalLength)
    )
      throw schemaError(undefined, {
        operation: 'discovery.page',
        offset: criteria.offset,
        limit: criteria.limit,
        total: totalLength,
        returned: questions.length,
      });
    const problems = questions.map((item): Problem =>
      normalizeDetail({
        questionId: String(item.id),
        questionFrontendId: item.questionFrontendId,
        title: item.title,
        titleSlug: item.titleSlug,
        difficulty: ({ EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' } as const)[item.difficulty],
        isPaidOnly: item.paidOnly,
        topicTags: item.topicTags,
      }),
    );
    if (
      problems.some(
        (problem) =>
          problem.difficulty !== criteria.difficulty ||
          !problem.tags.includes(criteria.skill.tags[0]!),
      )
    )
      throw schemaError(undefined, {
        operation: 'discovery.problem',
        skill: criteria.skill.slug,
        difficulty: criteria.difficulty,
        offset: criteria.offset,
        mismatches: problems
          .filter(
            (problem) =>
              problem.difficulty !== criteria.difficulty ||
              !criteria.skill.tags.every((tag) => problem.tags.includes(tag)),
          )
          .slice(0, 5)
          .map((problem) => ({
            providerId: problem.providerId,
            expectedDifficulty: criteria.difficulty,
            actualDifficulty: problem.difficulty,
            missingTags: criteria.skill.tags.filter((tag) => !problem.tags.includes(tag)),
          })),
      });
    return {
      problems,
      offset: criteria.offset,
      nextOffset: criteria.offset + questions.length,
      total: totalLength,
      exhausted: criteria.offset + questions.length >= totalLength,
    };
  }
}
