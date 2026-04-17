const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');
const MemberTag = require('../../src/models/MemberTag');
const TagRuleVersion = require('../../src/models/TagRuleVersion');
const TagChangeHistory = require('../../src/models/TagChangeHistory');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

describe('POST /api/v1/tags/assign', () => {
  test('validation: missing userId/tagCode returns 422', async () => {
    await makeUser('adm1', ['department_admin']);
    const tok = await loginAs(app, 'adm1');
    const r = await auth(request(app).post('/api/v1/tags/assign').send({ tagCode: 'premium' }), tok);
    expect(r.status).toBe(422);
  });

  test('admin assigns tag and creates MemberTag row', async () => {
    const target = await makeUser('tgt1', ['student']);
    await makeUser('adm2', ['department_admin']);
    const tok = await loginAs(app, 'adm2');
    const r = await auth(request(app).post('/api/v1/tags/assign').send({ userId: String(target._id), tagCode: 'premium', reason: 'manual' }), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.changed).toBe(true);
    const rows = await MemberTag.find({ userId: target._id, tagCode: 'premium' });
    expect(rows.length).toBe(1);
  });

  test('student cannot assign tags (403)', async () => {
    const target = await makeUser('tgt2', ['student']);
    await makeUser('stu2', ['student']);
    const tok = await loginAs(app, 'stu2');
    const r = await auth(request(app).post('/api/v1/tags/assign').send({ userId: String(target._id), tagCode: 'premium' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/tags/remove', () => {
  test('admin removes tag; MemberTag marked inactive', async () => {
    const target = await makeUser('tgt3', ['student']);
    await makeUser('adm3', ['department_admin']);
    const tok = await loginAs(app, 'adm3');
    await auth(request(app).post('/api/v1/tags/assign').send({ userId: String(target._id), tagCode: 'premium' }), tok);
    const r = await auth(request(app).post('/api/v1/tags/remove').send({ userId: String(target._id), tagCode: 'premium', reason: 'cleanup' }), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.changed).toBe(true);
    const active = await MemberTag.find({ userId: target._id, tagCode: 'premium', active: true });
    expect(active.length).toBe(0);
  });

  test('validation: missing userId returns 422', async () => {
    await makeUser('adm4', ['department_admin']);
    const tok = await loginAs(app, 'adm4');
    const r = await auth(request(app).post('/api/v1/tags/remove').send({ tagCode: 'x' }), tok);
    expect(r.status).toBe(422);
  });

  test('student cannot remove (403)', async () => {
    const target = await makeUser('tgt4', ['student']);
    await makeUser('stu4', ['student']);
    const tok = await loginAs(app, 'stu4');
    const r = await auth(request(app).post('/api/v1/tags/remove').send({ userId: String(target._id), tagCode: 'premium' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/tags/rules', () => {
  test('admin creates rule version; previous version becomes immutable', async () => {
    await makeUser('adm5', ['department_admin']);
    const tok = await loginAs(app, 'adm5');
    const first = await auth(request(app).post('/api/v1/tags/rules').send({ tagCode: 'newrule', ruleType: 'static', params: {} }), tok);
    expect(first.status).toBe(201);
    expect(first.body.data.versionNumber).toBe(1);
    const second = await auth(request(app).post('/api/v1/tags/rules').send({ tagCode: 'newrule', ruleType: 'static', params: { foo: 1 } }), tok);
    expect(second.status).toBe(201);
    expect(second.body.data.versionNumber).toBe(2);
    const v1 = await TagRuleVersion.findOne({ tagCode: 'newrule', versionNumber: 1 });
    expect(v1.immutable).toBe(true);
  });

  test('validation: missing fields returns 422', async () => {
    await makeUser('adm6', ['department_admin']);
    const tok = await loginAs(app, 'adm6');
    const r = await auth(request(app).post('/api/v1/tags/rules').send({ tagCode: 'x' }), tok);
    expect(r.status).toBe(422);
  });

  test('student cannot create rule (403)', async () => {
    await makeUser('stu6', ['student']);
    const tok = await loginAs(app, 'stu6');
    const r = await auth(request(app).post('/api/v1/tags/rules').send({ tagCode: 'x', ruleType: 'static' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('GET /api/v1/tags/rules', () => {
  test('authenticated user lists all rule versions', async () => {
    await TagRuleVersion.create({ tagCode: 'a', ruleType: 'static', versionNumber: 1, active: true });
    await TagRuleVersion.create({ tagCode: 'b', ruleType: 'static', versionNumber: 1, active: true });
    await makeUser('uuu1', ['student']);
    const tok = await loginAs(app, 'uuu1');
    const r = await auth(request(app).get('/api/v1/tags/rules'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.map(rr => rr.tagCode)).toEqual(expect.arrayContaining(['a', 'b']));
  });
});

describe('GET /api/v1/tags/history', () => {
  test('admin queries history with filters', async () => {
    const u = await makeUser('hist1', ['student']);
    await TagChangeHistory.create({ userId: u._id, tagCode: 'premium', action: 'add', source: 'static' });
    await TagChangeHistory.create({ userId: u._id, tagCode: 'basic', action: 'add', source: 'static' });
    await makeUser('adm7', ['department_admin']);
    const tok = await loginAs(app, 'adm7');
    const r = await auth(request(app).get(`/api/v1/tags/history?userId=${u._id}&tagCode=premium`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.every(h => h.tagCode === 'premium')).toBe(true);
  });

  test('student cannot view history (403)', async () => {
    await makeUser('stu7', ['student']);
    const tok = await loginAs(app, 'stu7');
    const r = await auth(request(app).get('/api/v1/tags/history'), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/tags/recompute', () => {
  test('admin triggers recompute and gets runId + results', async () => {
    await makeUser('adm8', ['department_admin']);
    const tok = await loginAs(app, 'adm8');
    const r = await auth(request(app).post('/api/v1/tags/recompute').send({}), tok);
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveProperty('jobRunId');
    expect(Array.isArray(r.body.data.results)).toBe(true);
  });

  test('student cannot trigger recompute (403)', async () => {
    await makeUser('stu8', ['student']);
    const tok = await loginAs(app, 'stu8');
    const r = await auth(request(app).post('/api/v1/tags/recompute').send({}), tok);
    expect(r.status).toBe(403);
  });
});
