const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');
const UserRoleAssignment = require('../../src/models/UserRoleAssignment');
const ScopeAssignment = require('../../src/models/ScopeAssignment');
const SecurityQuestion = require('../../src/models/SecurityQuestion');
const ShoeProfile = require('../../src/models/ShoeProfile');
const ShippingOrder = require('../../src/models/ShippingOrder');
const Exception = require('../../src/models/Exception');
const Appeal = require('../../src/models/Appeal');
const MemberTag = require('../../src/models/MemberTag');
const SavedAddress = require('../../src/models/SavedAddress');
const { encryptField } = require('../../src/utils/crypto');
const { hashPassword } = require('../../src/utils/password');
const barcode = require('../../src/services/barcodeService');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function make(username, roles = [], scopes = []) {
  const q = await SecurityQuestion.findOne() || await SecurityQuestion.create({ text: 'Q?' });
  const u = await User.create({
    username, passwordHash: await hashPassword('SuperSecure12345!'),
    roles, securityQuestionId: q._id, securityAnswerHash: await hashPassword('rover'),
  });
  for (const r of roles) await UserRoleAssignment.create({ userId: u._id, roleCode: r });
  for (const s of scopes) await ScopeAssignment.create({ userId: u._id, dimension: s.dimension, value: s.value });
  return u;
}
async function login(username) {
  const r = await request(app).post('/api/v1/auth/login').send({ username, password: 'SuperSecure12345!' });
  return r.body.data.token;
}
async function bearer(fn, tok) { return fn.set('Authorization', `Bearer ${tok}`); }

async function makeShoe(owner, opts = {}) {
  const serial = 'S-' + Math.random().toString(36).slice(2);
  const bc = await barcode.generateUniqueBarcode(ShoeProfile, serial);
  return ShoeProfile.create({
    serial, barcode: bc, ownerUserId: owner._id, brand: 'Acme', size: '10',
    status: 'ready_for_delivery',
    scopes: opts.scopes || [],
  });
}

describe('Workstream A — object-level authorization', () => {
  test('custody lookup rejects unrelated student', async () => {
    const owner = await make('own1', ['student']);
    const other = await make('stu2', ['student']);
    const shoe = await makeShoe(owner);
    const tok = await login('stu2');
    const r = await bearer(request(app).get(`/api/v1/custody/lookup?barcode=${shoe.barcode}`), tok);
    expect(r.status).toBe(403);
  });
  test('custody lookup allows owner', async () => {
    const owner = await make('own2', ['student']);
    const shoe = await makeShoe(owner);
    const tok = await login('own2');
    const r = await bearer(request(app).get(`/api/v1/custody/lookup?barcode=${shoe.barcode}`), tok);
    expect(r.status).toBe(200);
  });

  test('shipping list/detail scoped to visible shoes', async () => {
    const ownerA = await make('oa1', ['student']);
    const ownerB = await make('ob1', ['student']);
    const shoeA = await makeShoe(ownerA);
    const shoeB = await makeShoe(ownerB);
    const ops = await make('ops', ['operations_staff']);
    const opsTok = await login('ops');
    // Create two shipping orders (requires addresses — shortcut: insert directly)
    const oA = await ShippingOrder.create({ shoeProfileId: shoeA._id, addressId: ownerA._id, fulfillmentOperator: 'ops1', method: 'standard', status: 'ready_to_ship', createdBy: ops._id });
    const oB = await ShippingOrder.create({ shoeProfileId: shoeB._id, addressId: ownerB._id, fulfillmentOperator: 'ops1', method: 'standard', status: 'ready_to_ship', createdBy: ops._id });
    const tokA = await login('oa1');
    const list = await bearer(request(app).get('/api/v1/shipping'), tokA);
    expect(list.status).toBe(200);
    const ids = list.body.data.items.map(i => String(i._id));
    expect(ids).toContain(String(oA._id));
    expect(ids).not.toContain(String(oB._id));
    const denied = await bearer(request(app).get(`/api/v1/shipping/${oB._id}`), tokA);
    expect(denied.status).toBe(403);
  });

  test('reports KPIs rejected for pure student', async () => {
    await make('stu', ['student']);
    const tok = await login('stu');
    const r = await bearer(request(app).get('/api/v1/reports/kpis'), tok);
    expect(r.status).toBe(403);
  });
  test('reports KPIs allowed for ops/admin', async () => {
    await make('ops', ['operations_staff']);
    const tok = await login('ops');
    const r = await bearer(request(app).get('/api/v1/reports/kpis'), tok);
    expect(r.status).toBe(200);
  });

  test('tag lookup rejects unrelated student', async () => {
    const target = await make('tgt', ['student']);
    await make('stu', ['student']);
    const tok = await login('stu');
    const r = await bearer(request(app).get(`/api/v1/tags/user/${target._id}`), tok);
    expect(r.status).toBe(403);
  });
  test('tag lookup allows self', async () => {
    const u = await make('self', ['student']);
    const tok = await login('self');
    const r = await bearer(request(app).get(`/api/v1/tags/user/${u._id}`), tok);
    expect(r.status).toBe(200);
  });

  test('appeal detail is not visible to unrelated user', async () => {
    const owner = await make('apl', ['student']);
    const ex = await Exception.create({ exceptionType: 'other', summary: 's', subjectUserId: owner._id, openedBy: owner._id });
    const appeal = await Appeal.create({ exceptionId: ex._id, appellantUserId: owner._id, rationale: 'hi', status: 'submitted' });
    await make('stran', ['student']);
    const tok = await login('stran');
    const r = await bearer(request(app).get(`/api/v1/appeals/${appeal._id}`), tok);
    expect(r.status).toBe(403);
  });
});

describe('Workstream B — workflow transition role gating', () => {
  test('student subject cannot transition own exception to resolved', async () => {
    const subj = await make('sub', ['student']);
    const ops = await make('ops', ['operations_staff']);
    const ex = await Exception.create({ exceptionType: 'other', summary: 's', subjectUserId: subj._id, openedBy: ops._id });
    const tok = await login('sub');
    const r = await bearer(request(app).post(`/api/v1/exceptions/${ex._id}/transition`).send({ to: 'resolved' }), tok);
    expect(r.status).toBe(403);
  });
  test('corporate_mentor out-of-scope cannot start review of appeal', async () => {
    const subj = await make('sub', ['student'], [{ dimension: 'internship_cohort', value: 'COH-1' }]);
    const mentorWrong = await make('mwrong', ['corporate_mentor'], [{ dimension: 'internship_cohort', value: 'COH-2' }]);
    const ops = await make('ops', ['operations_staff']);
    const ex = await Exception.create({
      exceptionType: 'missed_check_in', summary: 's', subjectUserId: subj._id, openedBy: ops._id,
      scopes: [{ dimension: 'internship_cohort', value: 'COH-1' }],
    });
    const appeal = await Appeal.create({
      exceptionId: ex._id, appellantUserId: subj._id, rationale: 'x', status: 'submitted',
      scopes: ex.scopes,
    });
    const tok = await login('mwrong');
    const r = await bearer(request(app).post(`/api/v1/appeals/${appeal._id}/start-review`).send({}), tok);
    expect(r.status).toBe(403);
  });
  test('unrelated authenticated user cannot decide appeal', async () => {
    const subj = await make('su3', ['student']);
    const ops = await make('ops3', ['operations_staff']);
    const ex = await Exception.create({
      exceptionType: 'missed_check_in', summary: 's', subjectUserId: subj._id, openedBy: ops._id,
      scopes: [{ dimension: 'internship_cohort', value: 'COH-1' }],
    });
    const appeal = await Appeal.create({
      exceptionId: ex._id, appellantUserId: subj._id, rationale: 'x', status: 'under_review',
      scopes: ex.scopes,
    });
    const stranger = await make('stran3', ['faculty_advisor']);
    const tok = await login('stran3');
    const r = await bearer(request(app).post(`/api/v1/appeals/${appeal._id}/decide`).send({ outcome: 'approved', rationale: 'no reason' }), tok);
    expect(r.status).toBe(403);
  });
  test('illegal exception transition still fails with 409 for authorized reviewer', async () => {
    const ops = await make('ops4', ['operations_staff']);
    const subj = await make('su4', ['student']);
    const ex = await Exception.create({ exceptionType: 'other', summary: 's', subjectUserId: subj._id, openedBy: ops._id, status: 'resolved', resolvedAt: new Date() });
    const tok = await login('ops4');
    const r = await bearer(request(app).post(`/api/v1/exceptions/${ex._id}/transition`).send({ to: 'open' }), tok);
    expect(r.status).toBe(409);
  });
});

describe('Workstream C — KPI scope leakage regression', () => {
  // Seed two cohorts with observable volumetric differences so leakage is visible
  // via aggregate numbers — not just status codes.
  async function seedTwoCohorts() {
    const ops = await make('kops', ['operations_staff']);
    const subjC1 = await make('kstu1', ['student'], [{ dimension: 'internship_cohort', value: 'COH-1' }]);
    const subjC2 = await make('kstu2', ['student'], [{ dimension: 'internship_cohort', value: 'COH-2' }]);
    // 3 shoes + exceptions in COH-1, 1 shoe + exception in COH-2
    const shoesC1 = await Promise.all([1,2,3].map(() => makeShoe(subjC1, { scopes: [{ dimension: 'internship_cohort', value: 'COH-1' }] })));
    const shoesC2 = await Promise.all([1].map(() => makeShoe(subjC2, { scopes: [{ dimension: 'internship_cohort', value: 'COH-2' }] })));
    for (const s of shoesC1) {
      await Exception.create({ exceptionType: 'missed_check_in', summary: 'c1', subjectUserId: subjC1._id, openedBy: ops._id, shoeProfileId: s._id, scopes: [{ dimension: 'internship_cohort', value: 'COH-1' }] });
    }
    for (const s of shoesC2) {
      await Exception.create({ exceptionType: 'missed_check_in', summary: 'c2', subjectUserId: subjC2._id, openedBy: ops._id, shoeProfileId: s._id, scopes: [{ dimension: 'internship_cohort', value: 'COH-2' }] });
    }
    // Tag the scoped users so tag counts differ per cohort
    await MemberTag.create({ userId: subjC1._id, tagCode: 'c1_tag', source: 'static', assignedBy: ops._id });
    await MemberTag.create({ userId: subjC2._id, tagCode: 'c2_tag', source: 'static', assignedBy: ops._id });
    return { ops, subjC1, subjC2, shoesC1, shoesC2 };
  }

  test('corporate_mentor KPI response is scoped to assigned cohort and omits global totals', async () => {
    await seedTwoCohorts();
    await make('mC1', ['corporate_mentor'], [{ dimension: 'internship_cohort', value: 'COH-1' }]);
    const tok = await login('mC1');
    const r = await bearer(request(app).get('/api/v1/reports/kpis'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.scope).toBe('scoped');
    // Non-scope-tagged aggregates must not leak a global count
    expect(r.body.data.activeContracts).toBeNull();
    expect(r.body.data.reconciliations.pending).toBeNull();
    // Exceptions count should reflect COH-1 only (3), not global (4)
    const totalEx = Object.values(r.body.data.exceptionsByType).reduce((a, v) => a + v, 0);
    expect(totalEx).toBe(3);
    // Tag counts must not include COH-2 tag
    expect(r.body.data.tagCounts).toHaveProperty('c1_tag', 1);
    expect(r.body.data.tagCounts).not.toHaveProperty('c2_tag');
  });

  test('faculty_advisor KPI response is scoped to assigned academic scope', async () => {
    // Seed academic-scope data alongside cohort data; faculty in MAJOR-X must not see cohort COH-1 data.
    const ops = await make('fops', ['operations_staff']);
    const subjA = await make('fstu1', ['student'], [{ dimension: 'major', value: 'MAJOR-X' }]);
    const subjB = await make('fstu2', ['student'], [{ dimension: 'major', value: 'MAJOR-Y' }]);
    const shoesA = await Promise.all([1,2].map(() => makeShoe(subjA, { scopes: [{ dimension: 'major', value: 'MAJOR-X' }] })));
    const shoesB = await Promise.all([1,2,2,2].map(() => makeShoe(subjB, { scopes: [{ dimension: 'major', value: 'MAJOR-Y' }] })));
    for (const s of shoesA) await Exception.create({ exceptionType: 'other', summary: 'a', subjectUserId: subjA._id, openedBy: ops._id, shoeProfileId: s._id, scopes: [{ dimension: 'major', value: 'MAJOR-X' }] });
    for (const s of shoesB) await Exception.create({ exceptionType: 'other', summary: 'b', subjectUserId: subjB._id, openedBy: ops._id, shoeProfileId: s._id, scopes: [{ dimension: 'major', value: 'MAJOR-Y' }] });

    await make('facX', ['faculty_advisor'], [{ dimension: 'major', value: 'MAJOR-X' }]);
    const tok = await login('facX');
    const r = await bearer(request(app).get('/api/v1/reports/kpis'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.scope).toBe('scoped');
    const totalEx = Object.values(r.body.data.exceptionsByType).reduce((a, v) => a + v, 0);
    expect(totalEx).toBe(2); // MAJOR-X only; NOT 6
  });

  test('scoped reviewer with no effective scope assignment is denied (no global fallback)', async () => {
    await seedTwoCohorts();
    await make('fnone', ['faculty_advisor']); // no scope assignments
    const tok = await login('fnone');
    const r = await bearer(request(app).get('/api/v1/reports/kpis'), tok);
    expect(r.status).toBe(403);
  });

  test('department_admin still receives global KPI aggregates', async () => {
    await seedTwoCohorts();
    await make('kadm', ['department_admin']);
    const tok = await login('kadm');
    const r = await bearer(request(app).get('/api/v1/reports/kpis'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.scope).toBe('global');
    const totalEx = Object.values(r.body.data.exceptionsByType).reduce((a, v) => a + v, 0);
    expect(totalEx).toBe(4);
    expect(r.body.data.tagCounts).toHaveProperty('c1_tag', 1);
    expect(r.body.data.tagCounts).toHaveProperty('c2_tag', 1);
  });

  test('operations_staff with no specific scope still receives global KPI aggregates', async () => {
    await seedTwoCohorts();
    await make('kops2', ['operations_staff']);
    const tok = await login('kops2');
    const r = await bearer(request(app).get('/api/v1/reports/kpis'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.scope).toBe('global');
  });

  test('out-of-scope mentor does not see the other cohort cohort data', async () => {
    await seedTwoCohorts(); // COH-1 has 3 exceptions, COH-2 has 1
    await make('mC2', ['corporate_mentor'], [{ dimension: 'internship_cohort', value: 'COH-2' }]);
    const tok = await login('mC2');
    const r = await bearer(request(app).get('/api/v1/reports/kpis'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.scope).toBe('scoped');
    const totalEx = Object.values(r.body.data.exceptionsByType).reduce((a, v) => a + v, 0);
    expect(totalEx).toBe(1); // only COH-2, not the 3 COH-1 or global 4
  });
});

describe('Workstream E — Shoe object-level authorization (empty-scope + direct ID)', () => {
  test('student owner can fetch own shoe detail', async () => {
    const owner = await make('sowner', ['student']);
    const shoe = await makeShoe(owner);
    const tok = await login('sowner');
    const r = await bearer(request(app).get(`/api/v1/shoes/${shoe._id}`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.profile._id).toBe(String(shoe._id));
  });

  test('unrelated student cannot read another student shoe detail (empty scopes)', async () => {
    const owner = await make('sowner2', ['student']);
    await make('sother2', ['student']);
    const shoe = await makeShoe(owner, { scopes: [] }); // empty scopes must NOT broaden
    const tok = await login('sother2');
    const r = await bearer(request(app).get(`/api/v1/shoes/${shoe._id}`), tok);
    expect(r.status).toBe(403);
    // Payload must not leak shoe identity content either
    expect(r.body.data).toBeNull();
  });

  test('faculty/mentor out-of-scope cannot read shoe with different scope', async () => {
    const owner = await make('sox', ['student'], [{ dimension: 'major', value: 'MAJOR-X' }]);
    const shoe = await makeShoe(owner, { scopes: [{ dimension: 'major', value: 'MAJOR-X' }] });
    await make('facY', ['faculty_advisor'], [{ dimension: 'major', value: 'MAJOR-Y' }]);
    const tok = await login('facY');
    const r = await bearer(request(app).get(`/api/v1/shoes/${shoe._id}`), tok);
    expect(r.status).toBe(403);
  });

  test('faculty in-scope can read shoe with matching scope tag', async () => {
    const owner = await make('sox2', ['student'], [{ dimension: 'major', value: 'MAJOR-X' }]);
    const shoe = await makeShoe(owner, { scopes: [{ dimension: 'major', value: 'MAJOR-X' }] });
    await make('facX3', ['faculty_advisor'], [{ dimension: 'major', value: 'MAJOR-X' }]);
    const tok = await login('facX3');
    const r = await bearer(request(app).get(`/api/v1/shoes/${shoe._id}`), tok);
    expect(r.status).toBe(200);
  });

  test('shoe with empty scopes is invisible to unrelated scoped reviewers (regression for blocker)', async () => {
    const owner = await make('sown3', ['student']);
    const shoe = await makeShoe(owner, { scopes: [] });
    await make('facZ', ['faculty_advisor'], [{ dimension: 'major', value: 'MAJOR-Z' }]);
    const tok = await login('facZ');
    const r = await bearer(request(app).get(`/api/v1/shoes/${shoe._id}`), tok);
    expect(r.status).toBe(403);
  });

  test('shoe list does not leak other students shoes (direct list path)', async () => {
    const ownerA = await make('lstA', ['student']);
    const ownerB = await make('lstB', ['student']);
    const shoeA = await makeShoe(ownerA);
    const shoeB = await makeShoe(ownerB);
    const tokA = await login('lstA');
    const r = await bearer(request(app).get('/api/v1/shoes'), tokA);
    expect(r.status).toBe(200);
    const ids = r.body.data.items.map(i => String(i._id));
    expect(ids).toContain(String(shoeA._id));
    expect(ids).not.toContain(String(shoeB._id));
  });

  test('unauthorized shoe attachment access is denied via the attachment endpoint', async () => {
    const Attachment = require('../../src/models/Attachment');
    const owner = await make('oAu', ['student']);
    const other = await make('oBu', ['student']);
    const shoe = await makeShoe(owner);
    const att = await Attachment.create({
      opaqueId: 'op_' + Math.random().toString(36).slice(2),
      ownerType: 'shoe_profile', ownerId: shoe._id,
      contentType: 'image/png', sha256: 'x'.repeat(64),
      sizeBytes: 1, storagePath: '/tmp/nope-does-not-exist', active: true,
      uploaderUserId: owner._id,
    });
    const tok = await login('oBu');
    const r = await bearer(request(app).get(`/api/v1/shoes/attachments/${att.opaqueId}`), tok);
    expect(r.status).toBe(403);
  });

  test('shoe detail for admin returns full payload regardless of scopes', async () => {
    const owner = await make('oz1', ['student']);
    const shoe = await makeShoe(owner, { scopes: [] });
    await make('admz', ['department_admin']);
    const tok = await login('admz');
    const r = await bearer(request(app).get(`/api/v1/shoes/${shoe._id}`), tok);
    expect(r.status).toBe(200);
  });
});

describe('Workstream F — Saved address object-level authorization / IDOR', () => {
  async function createAddr(owner, label = 'home') {
    return SavedAddress.create({
      ownerUserId: owner._id,
      label,
      country: 'US',
      line1Enc: encryptField('123 Main St'),
      cityEnc: encryptField('Springfield'),
      stateEnc: encryptField('IL'),
      postalCodeEnc: encryptField('62701'),
      maskedPreview: '***, ***, IL 62701',
      active: true,
    });
  }

  test('owner can fetch own address with decrypted fields', async () => {
    const owner = await make('ao1', ['student']);
    const addr = await createAddr(owner);
    const tok = await login('ao1');
    const r = await bearer(request(app).get(`/api/v1/addresses/${addr._id}`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.line1).toBe('123 Main St');
    expect(r.body.data.city).toBe('Springfield');
  });

  test('other authenticated student cannot fetch another user address (404, no existence leak)', async () => {
    const owner = await make('ao2', ['student']);
    const addr = await createAddr(owner);
    await make('ao2b', ['student']);
    const tok = await login('ao2b');
    const r = await bearer(request(app).get(`/api/v1/addresses/${addr._id}`), tok);
    expect(r.status).toBe(404);
    // Must NOT return masked metadata for unauthorized id
    expect(r.body.data).toBeNull();
    expect(r.body.error.code).toBe('NOT_FOUND');
  });

  test('unauthorized response for unknown ID matches response for unauthorized ID (no enumeration)', async () => {
    await make('ao3', ['student']);
    const tokStranger = await login('ao3');
    const owner = await make('ao3o', ['student']);
    const addr = await createAddr(owner);
    const fakeId = '000000000000000000000000';
    const rUnknown = await bearer(request(app).get(`/api/v1/addresses/${fakeId}`), tokStranger);
    const rUnauth = await bearer(request(app).get(`/api/v1/addresses/${addr._id}`), tokStranger);
    expect(rUnknown.status).toBe(rUnauth.status);
    expect(rUnknown.body.error.code).toBe(rUnauth.body.error.code);
    expect(rUnknown.body.data).toEqual(rUnauth.body.data);
  });

  test('faculty_advisor (out-of-policy) cannot fetch unrelated address', async () => {
    const owner = await make('ao4', ['student']);
    const addr = await createAddr(owner);
    await make('fac4', ['faculty_advisor'], [{ dimension: 'major', value: 'MAJOR-X' }]);
    const tok = await login('fac4');
    const r = await bearer(request(app).get(`/api/v1/addresses/${addr._id}`), tok);
    expect(r.status).toBe(404);
    expect(r.body.data).toBeNull();
  });

  test('department_admin and operations_staff retain explicit policy access', async () => {
    const owner = await make('ao5', ['student']);
    const addr = await createAddr(owner);
    await make('admA', ['department_admin']);
    await make('opsA', ['operations_staff']);
    const tAdmin = await login('admA');
    const tOps = await login('opsA');
    const rAdmin = await bearer(request(app).get(`/api/v1/addresses/${addr._id}`), tAdmin);
    const rOps = await bearer(request(app).get(`/api/v1/addresses/${addr._id}`), tOps);
    expect(rAdmin.status).toBe(200);
    expect(rOps.status).toBe(200);
    expect(rAdmin.body.data.line1).toBe('123 Main St');
  });

  test('decrypted fields never appear for unauthorized requester', async () => {
    const owner = await make('ao6', ['student']);
    const addr = await createAddr(owner);
    await make('ao6b', ['student']);
    const tok = await login('ao6b');
    const r = await bearer(request(app).get(`/api/v1/addresses/${addr._id}`), tok);
    const body = JSON.stringify(r.body);
    expect(body).not.toContain('123 Main St');
    expect(body).not.toContain('Springfield');
  });
});

describe('Workstream G — Password reset start enumeration hardening', () => {
  test('known and unknown usernames return indistinguishable reset-start shapes', async () => {
    await make('rsu1', ['student']);
    const known = await request(app).post('/api/v1/auth/reset/start').send({ username: 'rsu1' });
    const unknown = await request(app).post('/api/v1/auth/reset/start').send({ username: 'nobody-here' });
    expect(known.status).toBe(unknown.status);
    expect(Object.keys(known.body.data).sort()).toEqual(Object.keys(unknown.body.data).sort());
    expect(known.body.data.masked).toBe(true);
    expect(unknown.body.data.masked).toBe(true);
    expect(known.body.data.questionText).toBeNull();
    expect(unknown.body.data.questionText).toBeNull();
    expect(known.body.data.questionId).toBeNull();
    expect(unknown.body.data.questionId).toBeNull();
  });

  test('downstream reset/complete still works for a legitimate user', async () => {
    await make('rsu2', ['student']);
    const start = await request(app).post('/api/v1/auth/reset/start').send({ username: 'rsu2' });
    expect(start.status).toBe(200);
    const r = await request(app).post('/api/v1/auth/reset/complete').send({
      username: 'rsu2', securityAnswer: 'rover', newPassword: 'NewPassPhrase12345!',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.reset).toBe(true);
  });
});

describe('Workstream H — Barcode label print workflow', () => {
  test('ops can fetch printable label payload for an intake shoe', async () => {
    const owner = await make('lblown', ['student']);
    const shoe = await makeShoe(owner);
    await make('lblops', ['operations_staff']);
    const tok = await login('lblops');
    const r = await bearer(request(app).get(`/api/v1/shoes/label/${shoe._id}`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.serial).toBe(shoe.serial);
    expect(r.body.data.barcode).toBe(shoe.barcode);
    expect(r.body.data.reprint).toBe(false);
  });
  test('reprint query flag is reflected in response', async () => {
    const owner = await make('lblown2', ['student']);
    const shoe = await makeShoe(owner);
    await make('lblops2', ['operations_staff']);
    const tok = await login('lblops2');
    const r = await bearer(request(app).get(`/api/v1/shoes/label/${shoe._id}?reprint=1`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.reprint).toBe(true);
  });
  test('unauthorized role cannot fetch label', async () => {
    const owner = await make('lblown3', ['student']);
    const shoe = await makeShoe(owner);
    await make('lblstu', ['student']);
    const tok = await login('lblstu');
    const r = await bearer(request(app).get(`/api/v1/shoes/label/${shoe._id}`), tok);
    // requireCapability('shoe.intake.create') returns 403 for plain students
    expect(r.status).toBe(403);
  });
});

describe('Workstream I — Service history workflow', () => {
  test('shoe history endpoint returns entries after delivery completion', async () => {
    const ServiceHistory = require('../../src/models/ServiceHistory');
    const serviceHistory = require('../../src/services/serviceHistoryService');
    const owner = await make('hown', ['student']);
    const shoe = await makeShoe(owner);
    shoe.completedAt = new Date();
    shoe.status = 'delivered';
    await shoe.save();
    await serviceHistory.recordCompletion(shoe, { outcome: 'delivered' });
    const all = await ServiceHistory.find({ shoeProfileId: shoe._id });
    expect(all.length).toBe(1);
    const tok = await login('hown');
    const r = await bearer(request(app).get(`/api/v1/shoes/${shoe._id}/history`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.items.length).toBe(1);
    expect(r.body.data.items[0].outcome).toBe('delivered');
  });
  test('history lookup denies unrelated student (inherits shoe authz)', async () => {
    const serviceHistory = require('../../src/services/serviceHistoryService');
    const owner = await make('hown2', ['student']);
    const shoe = await makeShoe(owner);
    await serviceHistory.recordCompletion(shoe, { outcome: 'delivered' });
    await make('hstr', ['student']);
    const tok = await login('hstr');
    const r = await bearer(request(app).get(`/api/v1/shoes/${shoe._id}/history`), tok);
    expect(r.status).toBe(403);
  });
  test('recordCompletion is idempotent for the same outcome', async () => {
    const ServiceHistory = require('../../src/models/ServiceHistory');
    const serviceHistory = require('../../src/services/serviceHistoryService');
    const owner = await make('hown3', ['student']);
    const shoe = await makeShoe(owner);
    await serviceHistory.recordCompletion(shoe, { outcome: 'delivered' });
    await serviceHistory.recordCompletion(shoe, { outcome: 'delivered' });
    const rows = await ServiceHistory.find({ shoeProfileId: shoe._id });
    expect(rows.length).toBe(1);
  });
});

describe('Workstream J — Runtime secret validation', () => {
  test('isStrongJwtSecret rejects known default and too-short values', () => {
    const { isStrongJwtSecret, isStrongEncryptionKeyHex } = require('../../src/config/env');
    expect(isStrongJwtSecret('dev-insecure-change-me-dev-insecure-change-me-dev-insecure-change-me')).toBe(false);
    expect(isStrongJwtSecret('replace-me-with-long-random-string-at-least-64-chars-long-abc123')).toBe(false);
    expect(isStrongJwtSecret('short')).toBe(false);
    expect(isStrongJwtSecret('a'.repeat(40))).toBe(false); // one class
    expect(isStrongJwtSecret('aB' + 'x'.repeat(40))).toBe(true);
    expect(isStrongEncryptionKeyHex('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).toBe(false);
    expect(isStrongEncryptionKeyHex('00'.repeat(32))).toBe(false);
    expect(isStrongEncryptionKeyHex('ab'.repeat(32))).toBe(false); // single repeating byte
    expect(isStrongEncryptionKeyHex(require('crypto').randomBytes(32).toString('hex'))).toBe(true);
    expect(isStrongEncryptionKeyHex('notHexAtAll')).toBe(false);
  });
});

describe('Workstream D — Tag visibility scope leakage regression', () => {
  async function seedTaggedUsers() {
    const ops = await make('tops', ['operations_staff']);
    const userA = await make('tusrA', ['student'], [{ dimension: 'internship_cohort', value: 'COH-1' }]);
    const userB = await make('tusrB', ['student'], [{ dimension: 'internship_cohort', value: 'COH-2' }]);
    const unscoped = await make('tusrN', ['student']); // no scope
    await MemberTag.create({ userId: userA._id, tagCode: 'premium', source: 'static', assignedBy: ops._id });
    await MemberTag.create({ userId: userB._id, tagCode: 'premium', source: 'static', assignedBy: ops._id });
    await MemberTag.create({ userId: unscoped._id, tagCode: 'standard', source: 'static', assignedBy: ops._id });
    return { userA, userB, unscoped };
  }

  test('corporate_mentor can read tags for in-cohort user', async () => {
    const { userA } = await seedTaggedUsers();
    await make('memA', ['corporate_mentor'], [{ dimension: 'internship_cohort', value: 'COH-1' }]);
    const tok = await login('memA');
    const r = await bearer(request(app).get(`/api/v1/tags/user/${userA._id}`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.length).toBe(1);
    expect(r.body.data[0].tagCode).toBe('premium');
  });

  test('corporate_mentor cannot read tags for out-of-cohort user (403)', async () => {
    const { userB } = await seedTaggedUsers();
    await make('mA2', ['corporate_mentor'], [{ dimension: 'internship_cohort', value: 'COH-1' }]);
    const tok = await login('mA2');
    const r = await bearer(request(app).get(`/api/v1/tags/user/${userB._id}`), tok);
    expect(r.status).toBe(403);
  });

  test('faculty_advisor can read tags only for in-scope user', async () => {
    const ops = await make('fops2', ['operations_staff']);
    const userX = await make('fusrX', ['student'], [{ dimension: 'major', value: 'MAJOR-X' }]);
    const userY = await make('fusrY', ['student'], [{ dimension: 'major', value: 'MAJOR-Y' }]);
    await MemberTag.create({ userId: userX._id, tagCode: 'premium', source: 'static', assignedBy: ops._id });
    await MemberTag.create({ userId: userY._id, tagCode: 'premium', source: 'static', assignedBy: ops._id });
    await make('facX2', ['faculty_advisor'], [{ dimension: 'major', value: 'MAJOR-X' }]);
    const tok = await login('facX2');
    const okResp = await bearer(request(app).get(`/api/v1/tags/user/${userX._id}`), tok);
    expect(okResp.status).toBe(200);
    const denied = await bearer(request(app).get(`/api/v1/tags/user/${userY._id}`), tok);
    expect(denied.status).toBe(403);
  });

  test('scoped reviewer cannot read tags for unscoped target user', async () => {
    const { unscoped } = await seedTaggedUsers();
    await make('mScoped', ['corporate_mentor'], [{ dimension: 'internship_cohort', value: 'COH-1' }]);
    const tok = await login('mScoped');
    const r = await bearer(request(app).get(`/api/v1/tags/user/${unscoped._id}`), tok);
    expect(r.status).toBe(403);
  });

  test('department_admin can read any user tags', async () => {
    const { userA, userB, unscoped } = await seedTaggedUsers();
    await make('adm', ['department_admin']);
    const tok = await login('adm');
    for (const u of [userA, userB, unscoped]) {
      const r = await bearer(request(app).get(`/api/v1/tags/user/${u._id}`), tok);
      expect(r.status).toBe(200);
    }
  });

  test('corporate_mentor /tags/counts returns cohort-scoped counts only', async () => {
    await seedTaggedUsers(); // COH-1 premium, COH-2 premium, unscoped standard
    await make('mC1c', ['corporate_mentor'], [{ dimension: 'internship_cohort', value: 'COH-1' }]);
    const tok = await login('mC1c');
    const r = await bearer(request(app).get('/api/v1/tags/counts'), tok);
    expect(r.status).toBe(200);
    const byTag = Object.fromEntries(r.body.data.map(t => [t.tagCode, t.count]));
    expect(byTag.premium).toBe(1); // only userA, NOT 2 globally
    expect(byTag.standard).toBeUndefined();
  });

  test('department_admin /tags/counts returns global counts', async () => {
    await seedTaggedUsers();
    await make('admc', ['department_admin']);
    const tok = await login('admc');
    const r = await bearer(request(app).get('/api/v1/tags/counts'), tok);
    expect(r.status).toBe(200);
    const byTag = Object.fromEntries(r.body.data.map(t => [t.tagCode, t.count]));
    expect(byTag.premium).toBe(2);
    expect(byTag.standard).toBe(1);
  });
});
