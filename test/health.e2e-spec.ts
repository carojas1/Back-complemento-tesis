// Health check of the constitution (§3): public, checks the database and is exempt from the strict request limits.
import { createTestApp, TestApp } from './app';

let t: TestApp;

beforeAll(async () => (t = await createTestApp()));
afterAll(() => t.app.close());
afterEach(() => jest.restoreAllMocks());

describe('GET /health', () => {
  it('responds 200 without a session when the database responds', async () => {
    const res = await t.http().get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('responds 503 without details when the database does not respond', async () => {
    jest.spyOn(t.prisma, '$queryRaw').mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.1:5432'));
    const res = await t.http().get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', database: 'down' });
    // And it recovers on the next call.
    expect((await t.http().get('/health')).status).toBe(200);
  });

  it('the per-second limit does not throttle it (10 requests per second per IP)', async () => {
    const ip = t.newIp();
    const results = await Promise.all(Array.from({ length: 15 }, () => t.http().get('/health').set('X-Forwarded-For', ip)));
    expect(results.map((r) => r.status)).toEqual(Array(15).fill(200));
  });
});
