const request = require('supertest');
const mongoose = require('mongoose');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');
const UserRoleAssignment = require('../../src/models/UserRoleAssignment');
const SecurityQuestion = require('../../src/models/SecurityQuestion');
const LeaseContract = require('../../src/models/LeaseContract');
const DepositLedgerEntry = require('../../src/models/DepositLedgerEntry');
const { hashPassword } = require('../../src/utils/password');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function adminToken() {
  const q = await SecurityQuestion.create({ text: 'Q?' });
  const u = await User.create({
    username: 'adm', passwordHash: await hashPassword('SuperSecure12345!'),
    roles: ['department_admin'], securityQuestionId: q._id,
    securityAnswerHash: await hashPassword('rover'),
  });
  await UserRoleAssignment.create({ userId: u._id, roleCode: 'department_admin' });
  const r = await request(app).post('/api/v1/auth/login').send({ username: 'adm', password: 'SuperSecure12345!' });
  return r.body.data.token;
}

async function makeOps() {
  const q = await SecurityQuestion.findOne() || await SecurityQuestion.create({ text: 'Q?' });
  const u = await User.create({
    username: 'ops', passwordHash: await hashPassword('SuperSecure12345!'),
    roles: ['operations_staff'], securityQuestionId: q._id,
    securityAnswerHash: await hashPassword('rover'),
  });
  await UserRoleAssignment.create({ userId: u._id, roleCode: 'operations_staff' });
  const r = await request(app).post('/api/v1/auth/login').send({ username: 'ops', password: 'SuperSecure12345!' });
  return r.body.data.token;
}

describe('deposit ledger — encryption & masking', () => {
  test('no plaintext amount fields are persisted', async () => {
    const token = await adminToken();
    const c = await LeaseContract.create({
      contractNumber: 'C-ENC', facilityUnit: 'U1',
      lessorName: 'L', lesseeName: 'M',
      startDate: new Date(), endDate: new Date(Date.now() + 30*24*3600*1000), status: 'active',
    });
    const r = await request(app).post(`/api/v1/deposits/contracts/${c._id}/ledger`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entryType: 'deposit', amountCents: 500000 });
    expect(r.status).toBe(201);

    // Persistence-level assertion: look at raw document.
    const raw = await mongoose.connection.db.collection('depositledgerentries').findOne({ contractId: c._id });
    // No plaintext amount columns must exist.
    expect(raw).not.toHaveProperty('amountCentsSigned');
    expect(raw).not.toHaveProperty('runningBalanceCents');
    // Only encrypted blobs carry the value.
    expect(raw.amountCentsEnc).toBeDefined();
    expect(raw.amountCentsEnc.ct).toMatch(/.+/);
    expect(raw.runningBalanceCentsEnc.ct).toMatch(/.+/);
    // Ciphertext must not be the stringified amount.
    expect(raw.amountCentsEnc.ct).not.toContain('500000');
  });

  test('authorized admin read decrypts amounts', async () => {
    const token = await adminToken();
    const c = await LeaseContract.create({ contractNumber: 'C-2', facilityUnit: 'U2', lessorName: 'L', lesseeName: 'M', startDate: new Date(), endDate: new Date(Date.now()+86400000), status: 'active' });
    await request(app).post(`/api/v1/deposits/contracts/${c._id}/ledger`).set('Authorization', `Bearer ${token}`).send({ entryType: 'deposit', amountCents: 250000 });
    await request(app).post(`/api/v1/deposits/contracts/${c._id}/ledger`).set('Authorization', `Bearer ${token}`).send({ entryType: 'partial_refund', amountCents: 50000 });
    const list = await request(app).get(`/api/v1/deposits/contracts/${c._id}/ledger`).set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    const entries = list.body.data;
    expect(entries[0].amountCents).toBe(250000);
    expect(entries[0].runningBalanceCents).toBe(250000);
    expect(entries[1].amountCents).toBe(-50000);
    expect(entries[1].runningBalanceCents).toBe(200000);
  });

  test('negative balance without correction is rejected', async () => {
    const token = await adminToken();
    const c = await LeaseContract.create({ contractNumber: 'C-3', facilityUnit: 'U3', lessorName: 'L', lesseeName: 'M', startDate: new Date(), endDate: new Date(Date.now()+86400000), status: 'active' });
    await request(app).post(`/api/v1/deposits/contracts/${c._id}/ledger`).set('Authorization', `Bearer ${token}`).send({ entryType: 'deposit', amountCents: 10000 });
    const bad = await request(app).post(`/api/v1/deposits/contracts/${c._id}/ledger`).set('Authorization', `Bearer ${token}`).send({ entryType: 'partial_refund', amountCents: 999999 });
    expect(bad.status).toBe(422);
  });

  test('ops (without deposit.manage) cannot view deposit ledger', async () => {
    const adminTok = await adminToken();
    const opsTok = await makeOps();
    const c = await LeaseContract.create({ contractNumber: 'C-4', facilityUnit: 'U4', lessorName: 'L', lesseeName: 'M', startDate: new Date(), endDate: new Date(Date.now()+86400000), status: 'active' });
    await request(app).post(`/api/v1/deposits/contracts/${c._id}/ledger`).set('Authorization', `Bearer ${adminTok}`).send({ entryType: 'deposit', amountCents: 10000 });
    const r = await request(app).get(`/api/v1/deposits/contracts/${c._id}/ledger`).set('Authorization', `Bearer ${opsTok}`);
    expect(r.status).toBe(403);
  });
});
