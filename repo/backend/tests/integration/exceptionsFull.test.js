const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');
const Exception = require('../../src/models/Exception');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

describe('GET /api/v1/exceptions', () => {
  test('admin sees all exceptions with filter support', async () => {
    const subj = await makeUser('ex1', ['student']);
    const ops = await makeUser('opsX', ['operations_staff']);
    await Exception.create({ exceptionType: 'missed_check_in', summary: 'a', subjectUserId: subj._id, openedBy: ops._id });
    await Exception.create({ exceptionType: 'other', summary: 'b', subjectUserId: subj._id, openedBy: ops._id });
    await makeUser('admX', ['department_admin']);
    const tok = await loginAs(app, 'admX');
    const all = await auth(request(app).get('/api/v1/exceptions'), tok);
    expect(all.status).toBe(200);
    expect(all.body.data.total).toBe(2);
    const filtered = await auth(request(app).get('/api/v1/exceptions?type=other'), tok);
    expect(filtered.body.data.total).toBe(1);
    expect(filtered.body.data.items[0].exceptionType).toBe('other');
  });

  test('student sees only their own exceptions', async () => {
    const subj = await makeUser('ex2', ['student']);
    const other = await makeUser('ex3', ['student']);
    const ops = await makeUser('opsX2', ['operations_staff']);
    await Exception.create({ exceptionType: 'other', summary: 'mine', subjectUserId: subj._id, openedBy: ops._id });
    await Exception.create({ exceptionType: 'other', summary: 'not mine', subjectUserId: other._id, openedBy: ops._id });
    const tok = await loginAs(app, 'ex2');
    const r = await auth(request(app).get('/api/v1/exceptions'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.items.every(e => e.summary === 'mine')).toBe(true);
  });
});

describe('GET /api/v1/exceptions/:id', () => {
  test('admin fetches exception detail', async () => {
    const subj = await makeUser('ex4', ['student']);
    const ops = await makeUser('opsX3', ['operations_staff']);
    const ex = await Exception.create({ exceptionType: 'other', summary: 's', subjectUserId: subj._id, openedBy: ops._id });
    await makeUser('admX2', ['department_admin']);
    const tok = await loginAs(app, 'admX2');
    const r = await auth(request(app).get(`/api/v1/exceptions/${ex._id}`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data._id).toBe(String(ex._id));
    expect(r.body.data.summary).toBe('s');
  });

  test('unknown id returns 404', async () => {
    await makeUser('admX3', ['department_admin']);
    const tok = await loginAs(app, 'admX3');
    const r = await auth(request(app).get('/api/v1/exceptions/000000000000000000000000'), tok);
    expect(r.status).toBe(404);
  });

  test('unrelated student cannot view (403)', async () => {
    const subj = await makeUser('ex5', ['student']);
    const ops = await makeUser('opsX4', ['operations_staff']);
    const ex = await Exception.create({ exceptionType: 'other', summary: 's', subjectUserId: subj._id, openedBy: ops._id });
    await makeUser('ex6', ['student']);
    const tok = await loginAs(app, 'ex6');
    const r = await auth(request(app).get(`/api/v1/exceptions/${ex._id}`), tok);
    expect(r.status).toBe(403);
  });
});
