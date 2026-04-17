const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const SecurityQuestion = require('../../src/models/SecurityQuestion');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function seedQuestion() {
  return SecurityQuestion.create({ text: 'Pet name?' });
}

async function signupUser(app, overrides = {}) {
  const q = await seedQuestion();
  const body = {
    username: 'alice.s',
    password: 'SuperSecure12345!',
    displayName: 'Alice',
    securityQuestionId: String(q._id),
    securityAnswer: 'rover',
    ...overrides,
  };
  return request(app).post('/api/v1/auth/signup').send(body);
}

describe('auth', () => {
  test('health endpoint works', async () => {
    const r = await request(app).get('/api/v1/health');
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
  });

  test('signup rejects short password', async () => {
    const q = await seedQuestion();
    const r = await request(app).post('/api/v1/auth/signup').send({
      username: 'bob', password: 'short', securityQuestionId: String(q._id), securityAnswer: 'rover',
    });
    expect(r.status).toBe(422);
  });

  test('signup + login + me + logout', async () => {
    const s = await signupUser(app);
    expect(s.status).toBe(201);
    const login = await request(app).post('/api/v1/auth/login').send({ username: 'alice.s', password: 'SuperSecure12345!' });
    expect(login.status).toBe(200);
    const token = login.body.data.token;
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.username).toBe('alice.s');
    const lo = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(lo.status).toBe(200);
    // After logout, session is invalid
    const me2 = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me2.status).toBe(401);
  });

  test('account lockout after 5 failures', async () => {
    await signupUser(app);
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/auth/login').send({ username: 'alice.s', password: 'WrongPass!12345' });
    }
    const r = await request(app).post('/api/v1/auth/login').send({ username: 'alice.s', password: 'SuperSecure12345!' });
    expect(r.status).toBe(423);
  });

  test('password reset via security question (no account-existence leakage at start)', async () => {
    await signupUser(app);
    const start = await request(app).post('/api/v1/auth/reset/start').send({ username: 'alice.s' });
    expect(start.status).toBe(200);
    // Hardened response: question text must NOT be exposed at the start step.
    expect(start.body.data.questionText).toBeNull();
    expect(start.body.data.masked).toBe(true);
    const done = await request(app).post('/api/v1/auth/reset/complete').send({
      username: 'alice.s', securityAnswer: 'rover', newPassword: 'BrandNewPass!2026X',
    });
    expect(done.status).toBe(200);
    const login = await request(app).post('/api/v1/auth/login').send({ username: 'alice.s', password: 'BrandNewPass!2026X' });
    expect(login.status).toBe(200);
  });

  test('unauthenticated access to protected route denied', async () => {
    const r = await request(app).get('/api/v1/catalog/services');
    expect(r.status).toBe(401);
  });
});
