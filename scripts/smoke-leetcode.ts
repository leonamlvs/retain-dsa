// Manual only: metadata requests to the real provider. Never imported by automated tests.
import { defaultConfig } from '../apps/api/src/config/default-config.js';
import { SystemClock, SystemSleeper } from '../apps/api/src/infrastructure/system-clock.js';
import { NodeHttpTransport } from '../apps/api/src/infrastructure/providers/leetcode/node-http-transport.js';
import { LeetCodeProvider } from '../apps/api/src/infrastructure/providers/leetcode/leetcode.provider.js';
import { createLogger } from '../apps/api/src/infrastructure/pino-logger.js';
const clock = new SystemClock();
const provider = new LeetCodeProvider(
  new NodeHttpTransport(),
  clock,
  new SystemSleeper(),
  defaultConfig,
  createLogger(),
);
const deadline = new Date(clock.now().getTime() + defaultConfig.discovery.totalBudgetMs);
const curriculum = await provider.curriculum(deadline);
if (process.argv.includes('--diagnose-filters')) {
  const transport = new NodeHttpTransport();
  for (const tags of [
    ['binary-tree', 'depth-first-search'],
    ['binary-tree', 'breadth-first-search'],
    ['graph', 'depth-first-search'],
  ]) {
    const query = `query RetainFilterDiagnostic { problemsetQuestionListV2(limit:5,skip:0,filters:{filterCombineType:ALL,difficultyFilter:{difficulties:[EASY],operator:IS},topicFilter:{topicSlugs:${JSON.stringify(tags)},operator:IS}}) { totalLength questions { id difficulty topicTags { slug } } } }`;
    const result = await transport.post(
      'https://leetcode.com/graphql/',
      { query, variables: {} },
      5000,
    );
    console.log(JSON.stringify({ requestedTags: tags, metadata: result.body }));
  }
  process.exit(0);
}
const skill = curriculum.skills.find((entry) => entry.name === 'Binary Search');
if (!skill) throw new Error('Official Binary Search category missing.');
const first = await provider.discover(
  { skill, difficulty: 'Medium', offset: 0, limit: 2, freeOnly: true },
  deadline,
);
const second = await provider.discover(
  { skill, difficulty: 'Medium', offset: first.nextOffset, limit: 2, freeOnly: true },
  deadline,
);
if (second.problems.some((p) => first.problems.some((q) => p.providerId === q.providerId)))
  throw new Error('Pagination did not advance.');
const unsupportedAnchorMappings = curriculum.skills
  .filter((entry) => {
    const ids = new Set(
      curriculum.items
        .filter((item) => item.skillSlug === entry.slug)
        .map((item) => item.providerId),
    );
    return !curriculum.problems.some(
      (problem) =>
        ids.has(problem.providerId) && problem.tags.some((tag) => entry.tags.includes(tag)),
    );
  })
  .map((entry) => entry.name);
const unsupportedAnchors = curriculum.items
  .filter((item) =>
    curriculum.skills.some(
      (entry) => entry.slug === item.skillSlug && unsupportedAnchorMappings.includes(entry.name),
    ),
  )
  .map((item) => {
    const problem = curriculum.problems.find((entry) => entry.providerId === item.providerId)!;
    return { providerId: problem.providerId, slug: problem.slug, tags: problem.tags };
  });
console.log(
  JSON.stringify(
    {
      curriculum: curriculum.slug,
      anchors: curriculum.items.length,
      stableIds: new Set(curriculum.problems.map((p) => p.providerId)).size,
      categories: curriculum.skills.length,
      unsupportedAnchorMappings,
      unsupportedAnchors,
      unknownMappings: curriculum.skills.filter((s) => !s.tags.length).map((s) => s.name),
      firstIds: first.problems.map((p) => p.providerId),
      secondIds: second.problems.map((p) => p.providerId),
      total: first.total,
    },
    null,
    2,
  ),
);
if (unsupportedAnchorMappings.some((name) => name !== 'Intervals'))
  throw new Error(
    'Discovery mappings do not match any official anchor in the listed categories. The mapping acceptance gate is not satisfied.',
  );
