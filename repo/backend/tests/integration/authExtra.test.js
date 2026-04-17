const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');
const SecurityQuestion = require('../../src/models/SecurityQuestion');
const User = require('../../src/models/User');
const { verifyPassword } = require('../../src/utils/password');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

describe('GET /api/v1/auth/security-questions', () => {
  test('returns active question list without auth (public endpoint)', async () => {
    await SecurityQuestion.create({ text: 'Pet?' });
    await SecurityQuestion.create({ text: 'City?' });
    await SecurityQuestion.create({ text: 'Inactive?', active: false });
    const r = await request(app).get('/api/v1/auth/security-questions');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
    const texts = r.body.data.map(q => q.text);
    expect(texts).toEqual(expect.arrayContaining(['Pet?', 'City?']));
    expect(texts).not.toContain('Inactive?');
    for (const q of r.body.data) {
      expect(q).toHaveProperty('id');
      expect(typeof q.id).toBe('string');
    }
  });

  test('empty collection returns empty array, not 404', async () => {
    const r = await request(app).get('/api/v1/auth/security-questions');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([]);
  });
});

describe('POST /api/v1/auth/change-password', () => {
  test('rejects short new password (422)', async () => {
    await makeUser('cp1', ['student']);
    const tok = await loginAs(app, 'cp1');
    const r = await auth(request(app).post('/api/v1/auth/change-password').send({
      currentPassword: 'SuperSecure12345!', newPassword: 'short',
    }), tok);
    expect(r.status).toBe(422);
    expect(r.body.error.details[0].field).toBe('newPassword');
  });

  test('rejects wrong current password (401)', async () => {
    await makeUser('cp2', ['student']);
    const tok = await loginAs(app, 'cp2');
    const r = await auth(request(app).post('/api/v1/auth/change-password').send({
      currentPassword: 'WrongWrongWrong!', newPassword: 'BrandNewPass!2026X',
    }), tok);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('happy path persists new password hash and clears mustChangePassword', async () => {
    const u = await makeUser('cp3', ['student']);
    u.mustChangePassword = true; await u.save();
    const tok = await loginAs(app, 'cp3');
    const r = await auth(request(app).post('/api/v1/auth/change-password').send({
      currentPassword: 'SuperSecure12345!', newPassword: 'BrandNewPass!2026X',
    }), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.changed).toBe(true);
    const after = await User.findById(u._id);
    expect(after.mustChangePassword).toBe(false);
    expect(await verifyPassword(after.passwordHash, 'BrandNewPass!2026X')).toBe(true);
    // Old password must not validate anymore
    const oldLogin = await request(app).post('/api/v1/auth/login').send({ username: 'cp3', password: 'SuperSecure12345!' });
    expect(oldLogin.status).toBe(401);
  });

  test('unauthenticated request is rejected (401)', async () => {
    const r = await request(app).post('/api/v1/auth/change-password').send({
      currentPassword: 'x', newPassword: 'BrandNewPass!2026X',
    });
    expect(r.status).toBe(401);
  });
});
