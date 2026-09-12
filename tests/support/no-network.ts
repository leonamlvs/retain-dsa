import nock from 'nock';
beforeAll(() => {
  nock.disableNetConnect();
  nock.enableNetConnect((host) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host));
});
afterEach(() => {
  const pending = nock.pendingMocks();
  nock.cleanAll();
  expect(pending).toEqual([]);
});
afterAll(() => nock.enableNetConnect());
