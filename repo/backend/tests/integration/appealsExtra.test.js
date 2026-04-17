const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');
const Exception = require('../../src/models/Exception');
const Appeal = require('../../src/models/Appeal');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

describe('GET /api/v1/appeals', () => {
  test('admin sees all appeals', async () => {
    const subj = await makeUser('ap1', ['student']);
    const ops = await makeUser('ops1', ['operations_staff']);
    const ex = await Exception.create({ exceptionType: 'other', summary: 'x', subjectUserId: subj._id, openedBy: ops._id });
    await Appeal.create({ exceptionId: ex._id, appellantUserId: subj._id, rationale: 'r', status: 'submitted' });
    await makeUser('adm', ['department_admin']);
    const tok = await loginAs(app, 'adm');
    const r = await auth(request(app).get('/api/v1/appeals'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.items.length).toBe(1);
    expect(r.body.data.total).toBe(1);
  });

  test('appellant sees their own appeal', async () => {
    const subj = await makeUser('ap2', ['student']);
    const ops = await makeUser('ops2', ['operations_staff']);
    const ex = await Exception.create({ exceptionType: 'other', summary: 'x', subjectUserId: subj._id, openedBy: ops._id });
    await Appeal.create({ exceptionId: ex._id, appellantUserId: subj._id, rationale: 'r', status: 'submitted' });
    const tok = await loginAs(app, 'ap2');
    const r = await auth(request(app).get('/api/v1/appeals'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.items.length).toBe(1);
  });

  test('unrelated student sees no appeals', async () => {
    const subj = await makeUser('ap3', ['student']);
    const ops = await makeUser('ops3', ['operations_staff']);
    const ex = await Exception.create({ exceptionType: 'other', summary: 'x', subjectUserId: subj._id, openedBy: ops._id });
    await Appeal.create({ exceptionId: ex._id, appellantUserId: subj._id, rationale: 'r', status: 'submitted' });
    await makeUser('ap4', ['student']);
    const tok = await loginAs(app, 'ap4');
    const r = await auth(request(app).get('/api/v1/appeals'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.items.length).toBe(0);
  });

  test('filter by status is applied', async () => {
    const subj = await makeUser('ap5', ['student']);
    const ops = await makeUser('ops4', ['operations_staff']);
    const ex = await Exception.create({ exceptionType: 'other', summary: 'x', subjectUserId: subj._id, openedBy: ops._id });
    await Appeal.create({ exceptionId: ex._id, appellantUserId: subj._id, rationale: 'r', status: 'submitted' });
    await Appeal.create({ exceptionId: ex._id, appellantUserId: subj._id, rationale: 'r2', status: 'withdrawn' });
    await makeUser('adm2', ['department_admin']);
    const tok = await loginAs(app, 'adm2');
    const r = await auth(request(app).get('/api/v1/appeals?status=submitted'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.items.every(a => a.status === 'submitted')).toBe(true);
  });
});

describe('POST /api/v1/appeals/:id/withdraw', () => {
  test('appellant can withdraw their own submitted appeal', async () => {
    const subj = await makeUser('ap6', ['student']);
    const ops = await makeUser('ops5', ['operations_staff']);
    const ex = await Exception.create({ exceptionType: 'other', summary: 'x', subjectUserId: subj._id, openedBy: ops._id });
    const appeal = await Appeal.create({ exceptionId: ex._id, appellantUserId: subj._id, rationale: 'r', status: 'submitted' });
    const tok = await loginAs(app, 'ap6');
    const r = await auth(request(app).post(`/api/v1/appeals/${appeal._id}/withdraw`).send({}), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('withdrawn');
    expect(r.body.data.closedAt).toBeTruthy();
  });

  test('unrelated student cannot withdraw (403)', async () => {
    const subj = await makeUser('ap7', ['student']);
    const ops = await makeUser('ops6', ['operations_staff']);
    const ex = await Exception.create({ exceptionType: 'other', summary: 'x', subjectUserId: subj._id, openedBy: ops._id });
    const appeal = await Appeal.create({ exceptionId: ex._id, appellantUserId: subj._id, rationale: 'r', status: 'submitted' });
    await makeUser('stranger', ['student']);
    const tok = await loginAs(app, 'stranger');
    const r = await auth(request(app).post(`/api/v1/appeals/${appeal._id}/withdraw`).send({}), tok);
    expect(r.status).toBe(403);
  });

  test('unknown appeal returns 404', async () => {
    await makeUser('ap8', ['student']);
    const tok = await loginAs(app, 'ap8');
    const r = await auth(request(app).post('/api/v1/appeals/000000000000000000000000/withdraw').send({}), tok);
    expect(r.status).toBe(404);
  });

  test('withdrawing already-closed appeal returns 409 ILLEGAL_TRANSITION', async () => {
    const subj = await makeUser('ap9', ['student']);
    const ops = await makeUser('ops7', ['operations_staff']);
    const ex = await Exception.create({ exceptionType: 'other', summary: 'x', subjectUserId: subj._id, openedBy: ops._id });
    const appeal = await Appeal.create({ exceptionId: ex._id, appellantUserId: subj._id, rationale: 'r', status: 'approved', closedAt: new Date() });
    const tok = await loginAs(app, 'ap9');
    const r = await auth(request(app).post(`/api/v1/appeals/${appeal._id}/withdraw`).send({}), tok);
    expect(r.status).toBe(409);
  });
});
