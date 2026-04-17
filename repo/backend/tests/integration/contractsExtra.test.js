const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function createAndActivate(tok, contractNumber, facilityUnit = 'FU-X') {
  const c = await auth(request(app).post('/api/v1/contracts').send({
    contractNumber, facilityUnit, lessorName: 'L', lesseeName: 'M',
    startDate: '2026-01-01', endDate: '2027-01-01',
  }), tok);
  const id = c.body.data._id;
  await auth(request(app).post(`/api/v1/billing/contracts/${id}/rules`).send({ ruleType: 'fixed', fixedAmountCents: 100000 }), tok);
  await auth(request(app).post(`/api/v1/contracts/${id}/activate`).send({}), tok);
  return id;
}

describe('GET /api/v1/contracts', () => {
  test('admin lists contracts with pagination', async () => {
    await makeUser('adm1', ['department_admin']);
    const tok = await loginAs(app, 'adm1');
    await createAndActivate(tok, 'C-A', 'FU-A');
    await createAndActivate(tok, 'C-B', 'FU-B');
    const r = await auth(request(app).get('/api/v1/contracts?limit=50&skip=0'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.total).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(r.body.data.items)).toBe(true);
    expect(r.body.data.items.every(i => i.contractNumber && i.facilityUnit)).toBe(true);
  });

  test('filter by status is applied', async () => {
    await makeUser('adm2', ['department_admin']);
    const tok = await loginAs(app, 'adm2');
    await createAndActivate(tok, 'C-C', 'FU-C');
    const r = await auth(request(app).get('/api/v1/contracts?status=active'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.items.every(i => i.status === 'active')).toBe(true);
  });

  test('student cannot list contracts (403)', async () => {
    await makeUser('stu', ['student']);
    const tok = await loginAs(app, 'stu');
    const r = await auth(request(app).get('/api/v1/contracts'), tok);
    expect(r.status).toBe(403);
  });
});

describe('GET /api/v1/contracts/:id', () => {
  test('admin gets contract with versions array', async () => {
    await makeUser('adm3', ['department_admin']);
    const tok = await loginAs(app, 'adm3');
    const id = await createAndActivate(tok, 'C-D');
    const r = await auth(request(app).get(`/api/v1/contracts/${id}`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.contract._id).toBe(String(id));
    expect(Array.isArray(r.body.data.versions)).toBe(true);
    expect(r.body.data.versions.length).toBeGreaterThan(0);
  });

  test('unknown id returns 404', async () => {
    await makeUser('adm4', ['department_admin']);
    const tok = await loginAs(app, 'adm4');
    const r = await auth(request(app).get('/api/v1/contracts/000000000000000000000000'), tok);
    expect(r.status).toBe(404);
  });

  test('student cannot fetch contract detail (403)', async () => {
    await makeUser('adm5', ['department_admin']);
    const atok = await loginAs(app, 'adm5');
    const id = await createAndActivate(atok, 'C-E');
    await makeUser('stu2', ['student']);
    const tok = await loginAs(app, 'stu2');
    const r = await auth(request(app).get(`/api/v1/contracts/${id}`), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/contracts/:id/amend', () => {
  test('admin amends contract with required reason', async () => {
    await makeUser('adm6', ['department_admin']);
    const tok = await loginAs(app, 'adm6');
    const id = await createAndActivate(tok, 'C-F');
    const r = await auth(request(app).post(`/api/v1/contracts/${id}/amend`).send({
      endDate: '2028-01-01', reason: 'extending lease',
    }), tok);
    expect(r.status).toBe(200);
    expect(new Date(r.body.data.endDate).toISOString().startsWith('2028-01-01')).toBe(true);
  });

  test('missing reason returns 422', async () => {
    await makeUser('adm7', ['department_admin']);
    const tok = await loginAs(app, 'adm7');
    const id = await createAndActivate(tok, 'C-G');
    const r = await auth(request(app).post(`/api/v1/contracts/${id}/amend`).send({ endDate: '2029-01-01' }), tok);
    expect(r.status).toBe(422);
  });

  test('cannot amend a draft contract (illegal transition)', async () => {
    await makeUser('adm8', ['department_admin']);
    const tok = await loginAs(app, 'adm8');
    const c = await auth(request(app).post('/api/v1/contracts').send({
      contractNumber: 'C-H', facilityUnit: 'FU-H', lessorName: 'L', lesseeName: 'M',
      startDate: '2026-01-01', endDate: '2027-01-01',
    }), tok);
    const r = await auth(request(app).post(`/api/v1/contracts/${c.body.data._id}/amend`).send({ reason: 'try', endDate: '2028-01-01' }), tok);
    expect(r.status).toBe(409);
  });

  test('student cannot amend (403)', async () => {
    await makeUser('adm9', ['department_admin']);
    const atok = await loginAs(app, 'adm9');
    const id = await createAndActivate(atok, 'C-I');
    await makeUser('stu3', ['student']);
    const tok = await loginAs(app, 'stu3');
    const r = await auth(request(app).post(`/api/v1/contracts/${id}/amend`).send({ reason: 'x' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/contracts/:id/renew', () => {
  test('admin renews to new end date', async () => {
    await makeUser('adm10', ['department_admin']);
    const tok = await loginAs(app, 'adm10');
    const id = await createAndActivate(tok, 'C-J');
    const r = await auth(request(app).post(`/api/v1/contracts/${id}/renew`).send({ newEndDate: '2030-01-01', reason: 'renewing' }), tok);
    expect(r.status).toBe(200);
    expect(new Date(r.body.data.endDate).toISOString().startsWith('2030-01-01')).toBe(true);
  });

  test('newEndDate missing returns 422', async () => {
    await makeUser('adm11', ['department_admin']);
    const tok = await loginAs(app, 'adm11');
    const id = await createAndActivate(tok, 'C-K');
    const r = await auth(request(app).post(`/api/v1/contracts/${id}/renew`).send({ reason: 'x' }), tok);
    expect(r.status).toBe(422);
  });

  test('newEndDate not after current end returns 422', async () => {
    await makeUser('adm12', ['department_admin']);
    const tok = await loginAs(app, 'adm12');
    const id = await createAndActivate(tok, 'C-L');
    const r = await auth(request(app).post(`/api/v1/contracts/${id}/renew`).send({ newEndDate: '2026-06-01', reason: 'bad' }), tok);
    expect(r.status).toBe(422);
  });

  test('student cannot renew (403)', async () => {
    await makeUser('adm13', ['department_admin']);
    const atok = await loginAs(app, 'adm13');
    const id = await createAndActivate(atok, 'C-M');
    await makeUser('stu4', ['student']);
    const tok = await loginAs(app, 'stu4');
    const r = await auth(request(app).post(`/api/v1/contracts/${id}/renew`).send({ newEndDate: '2030-01-01' }), tok);
    expect(r.status).toBe(403);
  });
});
