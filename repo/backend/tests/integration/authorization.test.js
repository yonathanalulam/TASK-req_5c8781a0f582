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

async function makeUser(username, roleCodes = ['student']) {
  const q = await SecurityQuestion.create({ text: 'Q?' });
  const user = await User.create({
    username, passwordHash: await hashPassword('SuperSecure12345!'),
    roles: roleCodes, securityQuestionId: q._id, securityAnswerHash: await hashPassword('rover'),
  });
  for (const r of roleCodes) await UserRoleAssignment.create({ userId: user._id, roleCode: r });
  return user;
}

async function loginAs(username) {
  const r = await request(app).post('/api/v1/auth/login').send({ username, password: 'SuperSecure12345!' });
  return r.body.data.token;
}

describe('authorization', () => {
  test('student cannot manage catalog', async () => {
    await makeUser('stud1', ['student']);
    const tok = await loginAs('stud1');
    const r = await request(app).post('/api/v1/catalog/services').set('Authorization', `Bearer ${tok}`).send({ code: 'x', name: 'X' });
    expect(r.status).toBe(403);
  });
  test('department_admin can manage catalog', async () => {
    await makeUser('admin1', ['department_admin']);
    const tok = await loginAs('admin1');
    const r = await request(app).post('/api/v1/catalog/services').set('Authorization', `Bearer ${tok}`).send({ code: 'x1', name: 'X1' });
    expect(r.status).toBe(201);
  });
  test('ops staff can create intake; student cannot', async () => {
    const owner = await makeUser('owner1', ['student']);
    const ops = await makeUser('ops1', ['operations_staff']);
    const tok = await loginAs('ops1');
    const r = await request(app).post('/api/v1/shoes/intake').set('Authorization', `Bearer ${tok}`).send({
      ownerUserId: String(owner._id), brand: 'Acme', size: '10',
    });
    expect(r.status).toBe(201);
    const tok2 = await loginAs('owner1');
    const r2 = await request(app).post('/api/v1/shoes/intake').set('Authorization', `Bearer ${tok2}`).send({
      ownerUserId: String(owner._id), brand: 'Acme', size: '10',
    });
    expect(r2.status).toBe(403);
  });
});
