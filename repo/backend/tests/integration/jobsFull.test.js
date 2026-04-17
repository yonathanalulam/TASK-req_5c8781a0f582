const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');
const JobRun = require('../../src/models/JobRun');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

describe('GET /api/v1/jobs/runs', () => {
  test('security_admin lists runs with filter', async () => {
    await JobRun.create({ jobName: 'tag_recompute', state: 'succeeded', attempt: 1 });
    await JobRun.create({ jobName: 'idempotency_cleanup', state: 'succeeded', attempt: 1 });
    await makeUser('sec1', ['security_admin']);
    const tok = await loginAs(app, 'sec1');
    const r = await auth(request(app).get('/api/v1/jobs/runs?jobName=tag_recompute'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.every(j => j.jobName === 'tag_recompute')).toBe(true);
    expect(r.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test('student cannot list job runs (403)', async () => {
    await makeUser('stuJ', ['student']);
    const tok = await loginAs(app, 'stuJ');
    const r = await auth(request(app).get('/api/v1/jobs/runs'), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/jobs/run/:name', () => {
  test('admin runs a registered job and gets a summary', async () => {
    await makeUser('admJ', ['department_admin']);
    const tok = await loginAs(app, 'admJ');
    const r = await auth(request(app).post('/api/v1/jobs/run/tag_recompute').send({}), tok);
    expect(r.status).toBe(200);
    expect(r.body.data).toBeTruthy();
    // verify a JobRun was persisted
    const runs = await JobRun.find({ jobName: 'tag_recompute' });
    expect(runs.length).toBeGreaterThanOrEqual(1);
  });

  test('unknown job returns 404', async () => {
    await makeUser('admJ2', ['department_admin']);
    const tok = await loginAs(app, 'admJ2');
    const r = await auth(request(app).post('/api/v1/jobs/run/not_a_real_job').send({}), tok);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });

  test('student cannot run job (403)', async () => {
    await makeUser('stuJ2', ['student']);
    const tok = await loginAs(app, 'stuJ2');
    const r = await auth(request(app).post('/api/v1/jobs/run/tag_recompute').send({}), tok);
    expect(r.status).toBe(403);
  });
});
