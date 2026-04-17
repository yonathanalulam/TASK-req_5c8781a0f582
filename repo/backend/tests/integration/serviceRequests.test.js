const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');
const UserRoleAssignment = require('../../src/models/UserRoleAssignment');
const SecurityQuestion = require('../../src/models/SecurityQuestion');
const ServiceCatalogEntry = require('../../src/models/ServiceCatalogEntry');
const { hashPassword } = require('../../src/utils/password');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function make(username, roles = []) {
  const q = await SecurityQuestion.findOne() || await SecurityQuestion.create({ text: 'Q?' });
  const u = await User.create({
    username, passwordHash: await hashPassword('SuperSecure12345!'),
    roles, securityQuestionId: q._id, securityAnswerHash: await hashPassword('r'),
  });
  for (const r of roles) await UserRoleAssignment.create({ userId: u._id, roleCode: r });
  return u;
}
async function login(username) {
  const r = await request(app).post('/api/v1/auth/login').send({ username, password: 'SuperSecure12345!' });
  return r.body.data.token;
}

async function seedCatalog() {
  await ServiceCatalogEntry.create({ code: 'basic-clean', name: 'Basic Clean', active: true });
  await ServiceCatalogEntry.create({ code: 'polish', name: 'Polish', active: true });
  await ServiceCatalogEntry.create({ code: 'disabled-one', name: 'Old', active: false });
}

describe('service requests flow', () => {
  test('student creates own service request and sees only own list', async () => {
    await seedCatalog();
    const alice = await make('alice', ['student']);
    const bob = await make('bob', ['student']);
    const tokA = await login('alice');
    const tokB = await login('bob');
    const c1 = await request(app).post('/api/v1/service-requests').set('Authorization', `Bearer ${tokA}`).send({ serviceCodes: ['basic-clean'], notes: 'hi' });
    expect(c1.status).toBe(201);
    const c2 = await request(app).post('/api/v1/service-requests').set('Authorization', `Bearer ${tokB}`).send({ serviceCodes: ['polish'] });
    expect(c2.status).toBe(201);

    const listA = await request(app).get('/api/v1/service-requests').set('Authorization', `Bearer ${tokA}`);
    const ids = listA.body.data.items.map(i => String(i._id));
    expect(ids).toContain(String(c1.body.data._id));
    expect(ids).not.toContain(String(c2.body.data._id));
  });

  test('inactive service codes rejected', async () => {
    await seedCatalog();
    await make('cus1', ['student']);
    const tok = await login('cus1');
    const r = await request(app).post('/api/v1/service-requests').set('Authorization', `Bearer ${tok}`).send({ serviceCodes: ['disabled-one'] });
    expect(r.status).toBe(422);
  });

  test('other student cannot view my service request detail', async () => {
    await seedCatalog();
    await make('cus2', ['student']);
    const other = await make('cus3', ['student']);
    const tok = await login('cus2');
    const tok2 = await login('cus3');
    const c = await request(app).post('/api/v1/service-requests').set('Authorization', `Bearer ${tok}`).send({ serviceCodes: ['basic-clean'] });
    const peek = await request(app).get(`/api/v1/service-requests/${c.body.data._id}`).set('Authorization', `Bearer ${tok2}`);
    expect(peek.status).toBe(403);
  });

  test('student can cancel own submitted request; cannot cancel after cancel', async () => {
    await seedCatalog();
    await make('cus4', ['student']);
    const tok = await login('cus4');
    const c = await request(app).post('/api/v1/service-requests').set('Authorization', `Bearer ${tok}`).send({ serviceCodes: ['basic-clean'] });
    const cancel = await request(app).post(`/api/v1/service-requests/${c.body.data._id}/cancel`).set('Authorization', `Bearer ${tok}`).send({});
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('cancelled');
    const again = await request(app).post(`/api/v1/service-requests/${c.body.data._id}/cancel`).set('Authorization', `Bearer ${tok}`).send({});
    expect(again.status).toBe(409);
  });

  test('ops staff can create on-behalf of student', async () => {
    await seedCatalog();
    const stu = await make('cus5', ['student']);
    await make('opsS', ['operations_staff']);
    const opsTok = await login('opsS');
    const r = await request(app).post('/api/v1/service-requests').set('Authorization', `Bearer ${opsTok}`).send({
      serviceCodes: ['basic-clean'], onBehalfOfUserId: String(stu._id),
    });
    expect(r.status).toBe(201);
    expect(String(r.body.data.onBehalfOfUserId)).toBe(String(stu._id));
  });
});
