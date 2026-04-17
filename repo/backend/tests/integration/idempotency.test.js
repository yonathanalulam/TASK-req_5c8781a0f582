const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');
const UserRoleAssignment = require('../../src/models/UserRoleAssignment');
const SecurityQuestion = require('../../src/models/SecurityQuestion');
const { hashPassword } = require('../../src/utils/password');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function setup() {
  const q = await SecurityQuestion.create({ text: 'Q?' });
  const owner = await User.create({ username: 'own1', passwordHash: await hashPassword('SuperSecure12345!'), roles: ['student'], securityQuestionId: q._id, securityAnswerHash: await hashPassword('rover') });
  await UserRoleAssignment.create({ userId: owner._id, roleCode: 'student' });
  const ops = await User.create({ username: 'ops1', passwordHash: await hashPassword('SuperSecure12345!'), roles: ['operations_staff'], securityQuestionId: q._id, securityAnswerHash: await hashPassword('rover') });
  await UserRoleAssignment.create({ userId: ops._id, roleCode: 'operations_staff' });
  const t = await request(app).post('/api/v1/auth/login').send({ username: 'ops1', password: 'SuperSecure12345!' });
  return { owner, token: t.body.data.token };
}

describe('idempotency', () => {
  test('same key + same body => cached response, not duplicate records', async () => {
    const { owner, token } = await setup();
    const body = { ownerUserId: String(owner._id), brand: 'Acme', size: '10' };
    const key = 'test-key-abc-123';
    const r1 = await request(app).post('/api/v1/shoes/intake').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body);
    expect(r1.status).toBe(201);
    const r2 = await request(app).post('/api/v1/shoes/intake').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send(body);
    expect(r2.status).toBe(201);
    expect(r2.body.data._id).toBe(r1.body.data._id);
  });
  test('same key + different payload => 409', async () => {
    const { owner, token } = await setup();
    const key = 'test-key-xyz-789';
    await request(app).post('/api/v1/shoes/intake').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send({ ownerUserId: String(owner._id), brand: 'A', size: '9' });
    const r = await request(app).post('/api/v1/shoes/intake').set('Authorization', `Bearer ${token}`).set('Idempotency-Key', key).send({ ownerUserId: String(owner._id), brand: 'B', size: '11' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
  });
});
