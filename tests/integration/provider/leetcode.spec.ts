import nock from 'nock';
import { LeetCodeProvider } from '../../../apps/api/src/infrastructure/providers/leetcode/leetcode.provider.js';
import { NodeHttpTransport } from '../../../apps/api/src/infrastructure/providers/leetcode/node-http-transport.js';
import { NoOpLogger } from '../../../apps/api/src/shared/observability/logger.interface.js';
import { defaultConfig } from '../../../apps/api/src/config/default-config.js';
import type { DiscoveryCriteria } from '../../../apps/api/src/modules/discovery/problem-provider.interface.js';
import { discoveryTags } from '../../../apps/api/src/infrastructure/providers/leetcode/skill-mapping.js';
const criteria: DiscoveryCriteria = {
  skill: {
    slug: 'binary-search',
    name: 'Binary Search',
    tags: ['binary-search'],
    mappingVersion: 'leetcode75-tags-v1',
    active: true,
  },
  difficulty: 'Medium',
  offset: 0,
  limit: 2,
  freeOnly: true,
};
const item = {
  id: 33,
  questionFrontendId: '33',
  title: 'Search',
  titleSlug: 'search',
  difficulty: 'MEDIUM',
  paidOnly: false,
  topicTags: [{ name: 'Binary Search', slug: 'binary-search' }],
};
let time: number;
beforeEach(() => {
  time = Date.parse('2026-01-01T00:00:00Z');
});
function provider() {
  return new LeetCodeProvider(
    new NodeHttpTransport(),
    { now: () => new Date(time) },
    {
      sleep: async (ms) => {
        time += ms;
      },
    },
    defaultConfig,
    new NoOpLogger(),
  );
}
const deadline = () => new Date(time + 15000);
const reply = (questions: unknown[], totalLength = questions.length) => ({
  data: { problemsetQuestionListV2: { totalLength, questions } },
});
test('unverified Intervals mapping cannot produce a false empty-supply result', async () => {
  await expect(
    provider().discover(
      { ...criteria, skill: { ...criteria.skill, tags: discoveryTags('Intervals') } },
      deadline(),
    ),
  ).rejects.toMatchObject({ code: 'UNKNOWN_SKILL_MAPPING' });
});
test('hydrates curriculum stable identity separately from the display ID', async () => {
  nock('https://leetcode.com')
    .post('/graphql/')
    .reply(200, {
      data: {
        studyPlanV2Detail: {
          slug: 'leetcode-75',
          name: 'LeetCode 75',
          planSubGroups: [
            {
              slug: 'binary-search',
              name: 'Binary Search',
              questions: [
                {
                  questionFrontendId: '1768',
                  title: 'Search',
                  titleSlug: 'search',
                  difficulty: 'Medium',
                  paidOnly: false,
                },
              ],
            },
          ],
        },
      },
    });
  nock('https://leetcode.com')
    .post('/graphql/', (body) => body.variables.s0 === 'search')
    .reply(200, {
      data: {
        q0: {
          questionId: '1894',
          questionFrontendId: '1768',
          title: 'Search',
          titleSlug: 'search',
          difficulty: 'Medium',
          isPaidOnly: true,
          topicTags: item.topicTags,
        },
      },
    });
  const result = await provider().curriculum(deadline());
  expect(result.problems[0]).toMatchObject({
    providerId: '1894',
    frontendId: '1768',
    paidOnly: true,
  });
  expect(result.items[0]).toMatchObject({ providerId: '1894', skillSlug: 'binary-search' });
});
test('rejects a partial curriculum when metadata hydration fails', async () => {
  nock('https://leetcode.com')
    .post('/graphql/')
    .reply(200, {
      data: {
        studyPlanV2Detail: {
          slug: 'leetcode-75',
          name: 'LeetCode 75',
          planSubGroups: [
            {
              slug: 'binary-search',
              name: 'Binary Search',
              questions: [
                {
                  questionFrontendId: '33',
                  title: 'Search',
                  titleSlug: 'search',
                  difficulty: 'Medium',
                  paidOnly: false,
                },
              ],
            },
          ],
        },
      },
    });
  nock('https://leetcode.com')
    .post('/graphql/')
    .reply(200, { data: { q0: null } });
  await expect(provider().curriculum(deadline())).rejects.toMatchObject({
    code: 'PROVIDER_SCHEMA_ERROR',
  });
});
test('normalizes stable IDs and retains paid metadata for catalog acceptance', async () => {
  nock('https://leetcode.com')
    .post(
      '/graphql/',
      (body) => body.query.includes('problemsetQuestionListV2') && body.query.includes('MEDIUM'),
    )
    .reply(200, reply([item, { ...item, id: 34, paidOnly: true }]));
  const page = await provider().discover(criteria, deadline());
  expect(page.exhausted).toBe(true);
  expect(page.problems.map((p) => [p.providerId, p.paidOnly])).toEqual([
    ['33', false],
    ['34', true],
  ]);
});
test('empty supply is complete only with a zero total', async () => {
  nock('https://leetcode.com').post('/graphql/').reply(200, reply([]));
  expect(await provider().discover(criteria, deadline())).toMatchObject({
    exhausted: true,
    total: 0,
  });
  nock('https://leetcode.com').post('/graphql/').reply(200, reply([], 10));
  await expect(provider().discover(criteria, deadline())).rejects.toMatchObject({
    code: 'PROVIDER_SCHEMA_ERROR',
  });
});

test('multi-tag discovery scans one topic and preserves raw offsets for local conjunction', async () => {
  const tags = [{ name: 'Binary Tree', slug: 'binary-tree' }];
  nock('https://leetcode.com')
    .post('/graphql/', (body) => body.query.includes('topicSlugs:["binary-tree"]'))
    .reply(
      200,
      reply(
        [
          { ...item, id: 108, topicTags: tags },
          { ...item, id: 100, topicTags: [...tags, { name: 'DFS', slug: 'depth-first-search' }] },
        ],
        3,
      ),
    );
  const page = await provider().discover(
    { ...criteria, skill: { ...criteria.skill, tags: ['binary-tree', 'depth-first-search'] } },
    deadline(),
  );
  expect(page.nextOffset).toBe(2);
  expect(page.exhausted).toBe(false);
  expect(page.problems.map((problem) => problem.providerId)).toEqual(['108', '100']);
});
test('retries HTML rate-limit responses respecting retry-after', async () => {
  nock('https://leetcode.com')
    .post('/graphql/')
    .reply(429, '<html>Busy</html>', { 'retry-after': '2' })
    .post('/graphql/')
    .reply(200, reply([item]));
  const start = time;
  await provider().discover(criteria, deadline());
  expect(time - start).toBe(2000);
});
test.each([
  [{ errors: [{ message: 'Unknown field' }] }, 'PROVIDER_GRAPHQL_ERROR'],
  [reply([{ ...item, id: 'unstable' }]), 'PROVIDER_SCHEMA_ERROR'],
  [reply([{ ...item, difficulty: 'EASY' }]), 'PROVIDER_SCHEMA_ERROR'],
  ['not json', 'PROVIDER_SCHEMA_ERROR'],
])('rejects contract changes without retrying', async (body, code) => {
  nock('https://leetcode.com').post('/graphql/').reply(200, body);
  await expect(provider().discover(criteria, deadline())).rejects.toMatchObject({ code });
});
test('does not start a retry that exceeds the operation budget', async () => {
  nock('https://leetcode.com').post('/graphql/').reply(503, {}, { 'retry-after': '30' });
  await expect(provider().discover(criteria, deadline())).rejects.toMatchObject({
    code: 'PROVIDER_BUDGET_EXHAUSTED',
  });
});
