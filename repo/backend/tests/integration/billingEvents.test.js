const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');
const LeaseContract = require('../../src/models/LeaseContract');
const BillingRuleVersion = require('../../src/models/BillingRuleVersion');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function activeContractWithRule(adminTok) {
  const create = await auth(request(app).post('/api/v1/contracts').send({
    contractNumber: 'B-1', facilityUnit: 'FU-1', lessorName: 'L', lesseeName: 'M',
    startDate: '2026-01-01', endDate: '2027-01-01',
  }), adminTok);
  const id = create.body.data._id;
  const rule = await auth(request(app).post(`/api/v1/billing/contracts/${id}/rules`).send({
    ruleType: 'fixed', fixedAmountCents: 100000, dueDayOfMonth: 5,
  }), adminTok);
  return { contractId: id, ruleId: rule.body.data._id };
}

describe('POST /api/v1/billing/contracts/:contractId/events', () => {
  test('validation: unknown contract returns 404', async () => {
    await makeUser('adm1', ['department_admin']);
    const tok = await loginAs(app, 'adm1');
    const r = await auth(request(app).post('/api/v1/billing/contracts/000000000000000000000000/events').send({ eventType: 'monthly_bill' }), tok);
    expect(r.status).toBe(404);
  });

  test('validation: missing rule + no active rule → 422', async () => {
    await makeUser('adm2', ['department_admin']);
    const tok = await loginAs(app, 'adm2');
    const c = await LeaseContract.create({ contractNumber: 'B-0', facilityUnit: 'FU-0', lessorName: 'L', lesseeName: 'M', startDate: new Date(), endDate: new Date(Date.now() + 3600000) });
    const r = await auth(request(app).post(`/api/v1/billing/contracts/${c._id}/events`).send({ eventType: 'monthly_bill' }), tok);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('admin posts a billing event; response contains computed amount and persisted event', async () => {
    await makeUser('adm3', ['department_admin']);
    const tok = await loginAs(app, 'adm3');
    const { contractId } = await activeContractWithRule(tok);
    const r = await auth(request(app).post(`/api/v1/billing/contracts/${contractId}/events`).send({
      eventType: 'monthly_bill', basisCents: 0,
    }), tok);
    expect(r.status).toBe(201);
    expect(r.body.data.event).toBeTruthy();
    expect(r.body.data.computed.amountCents).toBe(100000);
    expect(r.body.data.event.contractId).toBe(String(contractId));
  });

  test('non-admin without billing.rule.manage is denied (403)', async () => {
    await makeUser('stu', ['student']);
    const tok = await loginAs(app, 'stu');
    const c = await LeaseContract.create({ contractNumber: 'B-9', facilityUnit: 'FU-9', lessorName: 'L', lesseeName: 'M', startDate: new Date(), endDate: new Date(Date.now() + 3600000) });
    const r = await auth(request(app).post(`/api/v1/billing/contracts/${c._id}/events`).send({ eventType: 'monthly_bill' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/billing/contracts/:contractId/events/:eventId/correct', () => {
  test('validation: missing amountCents or reason returns 422', async () => {
    await makeUser('adm4', ['department_admin']);
    const tok = await loginAs(app, 'adm4');
    const { contractId } = await activeContractWithRule(tok);
    const evt = await auth(request(app).post(`/api/v1/billing/contracts/${contractId}/events`).send({ eventType: 'monthly_bill', basisCents: 0 }), tok);
    const r = await auth(request(app).post(`/api/v1/billing/contracts/${contractId}/events/${evt.body.data.event._id}/correct`).send({ amountCents: 500 }), tok);
    expect(r.status).toBe(422);
  });

  test('unknown event returns 404', async () => {
    await makeUser('adm5', ['department_admin']);
    const tok = await loginAs(app, 'adm5');
    const { contractId } = await activeContractWithRule(tok);
    const r = await auth(request(app).post(`/api/v1/billing/contracts/${contractId}/events/000000000000000000000000/correct`).send({ amountCents: 100, reason: 'fix' }), tok);
    expect(r.status).toBe(404);
  });

  test('admin issues a correction event linked to original', async () => {
    await makeUser('adm6', ['department_admin']);
    const tok = await loginAs(app, 'adm6');
    const { contractId } = await activeContractWithRule(tok);
    const evt = await auth(request(app).post(`/api/v1/billing/contracts/${contractId}/events`).send({ eventType: 'monthly_bill', basisCents: 0 }), tok);
    const origId = evt.body.data.event._id;
    const r = await auth(request(app).post(`/api/v1/billing/contracts/${contractId}/events/${origId}/correct`).send({ amountCents: -5000, reason: 'credit for overbill' }), tok);
    expect(r.status).toBe(201);
    expect(r.body.data.eventType).toBe('correction');
    expect(r.body.data.amountCents).toBe(-5000);
    expect(r.body.data.correctsEventId).toBe(origId);
  });

  test('role without billing.override is denied (403)', async () => {
    await makeUser('ops', ['operations_staff']);
    const tok = await loginAs(app, 'ops');
    // seed an event via admin
    await makeUser('adm7', ['department_admin']);
    const atok = await loginAs(app, 'adm7');
    const { contractId } = await activeContractWithRule(atok);
    const evt = await auth(request(app).post(`/api/v1/billing/contracts/${contractId}/events`).send({ eventType: 'monthly_bill', basisCents: 0 }), atok);
    const r = await auth(request(app).post(`/api/v1/billing/contracts/${contractId}/events/${evt.body.data.event._id}/correct`).send({ amountCents: 1, reason: 'x' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('GET /api/v1/billing/contracts/:contractId/events', () => {
  test('admin (view_financial_sensitive) can list events', async () => {
    await makeUser('adm8', ['department_admin']);
    const tok = await loginAs(app, 'adm8');
    const { contractId } = await activeContractWithRule(tok);
    await auth(request(app).post(`/api/v1/billing/contracts/${contractId}/events`).send({ eventType: 'monthly_bill', basisCents: 0 }), tok);
    const r = await auth(request(app).get(`/api/v1/billing/contracts/${contractId}/events`), tok);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
    expect(r.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test('student cannot list (403)', async () => {
    await makeUser('stu2', ['student']);
    const tok = await loginAs(app, 'stu2');
    const r = await auth(request(app).get('/api/v1/billing/contracts/000000000000000000000000/events'), tok);
    expect(r.status).toBe(403);
  });
});

describe('GET /api/v1/billing/contracts/:contractId/rules', () => {
  test('admin lists rules sorted by versionNumber', async () => {
    await makeUser('adm9', ['department_admin']);
    const tok = await loginAs(app, 'adm9');
    const { contractId } = await activeContractWithRule(tok);
    await auth(request(app).post(`/api/v1/billing/contracts/${contractId}/rules`).send({ ruleType: 'fixed', fixedAmountCents: 200000 }), tok);
    const r = await auth(request(app).get(`/api/v1/billing/contracts/${contractId}/rules`), tok);
    expect(r.status).toBe(200);
    const versions = r.body.data.map(r => r.versionNumber);
    expect(versions).toEqual([...versions].sort((a,b) => a - b));
    expect(versions.length).toBeGreaterThanOrEqual(2);
  });

  test('student cannot list rules (403)', async () => {
    await makeUser('stu3', ['student']);
    const tok = await loginAs(app, 'stu3');
    const r = await auth(request(app).get('/api/v1/billing/contracts/000000000000000000000000/rules'), tok);
    expect(r.status).toBe(403);
  });
});
