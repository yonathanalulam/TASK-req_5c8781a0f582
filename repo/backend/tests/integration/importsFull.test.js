const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');
const ImportJob = require('../../src/models/ImportJob');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function makeTagImport(adminTok) {
  const csv = 'username,tagCode,action,reason\nimp_u1,premium,add,seed\n';
  const r = await auth(request(app).post('/api/v1/imports/tags').attach('file', Buffer.from(csv), 'tags.csv'), adminTok);
  return r;
}

describe('GET /api/v1/imports', () => {
  test('admin lists prior import jobs', async () => {
    await makeUser('imp_u1', ['student']);
    await makeUser('admI1', ['department_admin']);
    const tok = await loginAs(app, 'admI1');
    const up = await makeTagImport(tok);
    expect(up.status).toBe(201);
    const r = await auth(request(app).get('/api/v1/imports'), tok);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
    expect(r.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test('student cannot list imports (403)', async () => {
    await makeUser('stuI', ['student']);
    const tok = await loginAs(app, 'stuI');
    const r = await auth(request(app).get('/api/v1/imports'), tok);
    expect(r.status).toBe(403);
  });
});

describe('GET /api/v1/imports/:id', () => {
  test('admin fetches import detail', async () => {
    await makeUser('imp_u1', ['student']);
    await makeUser('admI2', ['department_admin']);
    const tok = await loginAs(app, 'admI2');
    const up = await makeTagImport(tok);
    const id = up.body.data._id;
    const r = await auth(request(app).get(`/api/v1/imports/${id}`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data._id).toBe(String(id));
    expect(r.body.data.jobType).toBe('tags');
    expect(typeof r.body.data.successCount).toBe('number');
  });

  test('unknown id returns 404', async () => {
    await makeUser('admI3', ['department_admin']);
    const tok = await loginAs(app, 'admI3');
    const r = await auth(request(app).get('/api/v1/imports/000000000000000000000000'), tok);
    expect(r.status).toBe(404);
  });

  test('student cannot view import detail (403)', async () => {
    const j = await ImportJob.create({ jobType: 'tags', status: 'completed', filename: 'x.csv', totalRows: 0, successCount: 0, failureCount: 0 });
    await makeUser('stuI2', ['student']);
    const tok = await loginAs(app, 'stuI2');
    const r = await auth(request(app).get(`/api/v1/imports/${j._id}`), tok);
    expect(r.status).toBe(403);
  });
});
