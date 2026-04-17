const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');
const UserRoleAssignment = require('../../src/models/UserRoleAssignment');
const ScopeAssignment = require('../../src/models/ScopeAssignment');
const auditService = require('../../src/services/auditService');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

describe('GET /api/v1/admin/users', () => {
  test('requires user.manage capability (403 for student)', async () => {
    await makeUser('stu01', ['student']);
    const tok = await loginAs(app, 'stu01');
    const r = await auth(request(app).get('/api/v1/admin/users'), tok);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('FORBIDDEN');
    expect(r.body.error.details).toEqual({ capability: 'user.manage' });
  });

  test('admin can list users with pagination metadata and filtering', async () => {
    await makeUser('alice', ['student']);
    await makeUser('bob_user', ['student']);
    await makeUser('admin_lister', ['department_admin']);
    const tok = await loginAs(app, 'admin_lister');
    const r = await auth(request(app).get('/api/v1/admin/users?limit=2&skip=0'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.total).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(r.body.data.items)).toBe(true);
    expect(r.body.data.limit).toBe(2);
    expect(r.body.data.skip).toBe(0);
    const r2 = await auth(request(app).get('/api/v1/admin/users?q=alice'), tok);
    expect(r2.status).toBe(200);
    expect(r2.body.data.items.some(i => i.username === 'alice')).toBe(true);
    expect(r2.body.data.items.every(i => /alice/i.test(i.username))).toBe(true);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const r = await request(app).get('/api/v1/admin/users');
    expect(r.status).toBe(401);
  });
});

describe('POST /api/v1/admin/users/:id/roles', () => {
  test('validation: missing roleCode returns 422', async () => {
    const target = await makeUser('trole01', ['student']);
    await makeUser('adm_role01', ['department_admin']);
    const tok = await loginAs(app, 'adm_role01');
    const r = await auth(request(app).post(`/api/v1/admin/users/${target._id}/roles`).send({}), tok);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('admin assigns role and persists assignment + user.roles', async () => {
    const target = await makeUser('trole02', ['student']);
    await makeUser('adm_role02', ['department_admin']);
    const tok = await loginAs(app, 'adm_role02');
    const r = await auth(request(app).post(`/api/v1/admin/users/${target._id}/roles`).send({ roleCode: 'operations_staff' }), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.assigned).toBe(true);
    const assignments = await UserRoleAssignment.find({ userId: target._id });
    expect(assignments.map(a => a.roleCode)).toContain('operations_staff');
  });

  test('student cannot assign roles (403)', async () => {
    const target = await makeUser('trole03', ['student']);
    await makeUser('stu_role03', ['student']);
    const tok = await loginAs(app, 'stu_role03');
    const r = await auth(request(app).post(`/api/v1/admin/users/${target._id}/roles`).send({ roleCode: 'operations_staff' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('DELETE /api/v1/admin/users/:id/roles/:roleCode', () => {
  test('admin removes role assignment', async () => {
    const target = await makeUser('tdelr01', ['student', 'operations_staff']);
    await makeUser('adm_delr01', ['department_admin']);
    const tok = await loginAs(app, 'adm_delr01');
    const r = await auth(request(app).delete(`/api/v1/admin/users/${target._id}/roles/operations_staff`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.removed).toBe(true);
    const remaining = await UserRoleAssignment.find({ userId: target._id });
    expect(remaining.map(a => a.roleCode)).not.toContain('operations_staff');
  });

  test('student cannot delete role assignments (403)', async () => {
    const target = await makeUser('tdelr02', ['student']);
    await makeUser('stu_delr02', ['student']);
    const tok = await loginAs(app, 'stu_delr02');
    const r = await auth(request(app).delete(`/api/v1/admin/users/${target._id}/roles/student`), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/admin/users/:id/scopes', () => {
  test('validation: missing dimension/value returns 422', async () => {
    const target = await makeUser('tscope01', ['student']);
    await makeUser('adm_scope01', ['department_admin']);
    const tok = await loginAs(app, 'adm_scope01');
    const r = await auth(request(app).post(`/api/v1/admin/users/${target._id}/scopes`).send({ dimension: 'school' }), tok);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('admin assigns a scope', async () => {
    const target = await makeUser('tscope02', ['student']);
    await makeUser('adm_scope02', ['department_admin']);
    const tok = await loginAs(app, 'adm_scope02');
    const r = await auth(request(app).post(`/api/v1/admin/users/${target._id}/scopes`).send({ dimension: 'school', value: 'SCH-9' }), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.assigned).toBe(true);
    const rows = await ScopeAssignment.find({ userId: target._id });
    expect(rows.map(s => `${s.dimension}:${s.value}`)).toContain('school:SCH-9');
  });

  test('student cannot assign scopes (403)', async () => {
    const target = await makeUser('tscope03', ['student']);
    await makeUser('stu_scope03', ['student']);
    const tok = await loginAs(app, 'stu_scope03');
    const r = await auth(request(app).post(`/api/v1/admin/users/${target._id}/scopes`).send({ dimension: 'school', value: 'SCH-1' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/admin/users/:id/unlock', () => {
  test('404 when target user not found', async () => {
    // user.unlock capability belongs to security_admin only.
    await makeUser('sec_unlock01', ['security_admin']);
    const tok = await loginAs(app, 'sec_unlock01');
    const r = await auth(request(app).post('/api/v1/admin/users/000000000000000000000000/unlock').send({ reason: 'x' }), tok);
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });

  test('admin unlocks a locked user (resets counters and clears lockedUntil)', async () => {
    const User = require('../../src/models/User');
    const target = await makeUser('tunlock01', ['student']);
    target.lockedUntil = new Date(Date.now() + 3600 * 1000);
    target.failedLoginAttempts = 4;
    await target.save();
    await makeUser('sec_unlock02', ['security_admin']);
    const tok = await loginAs(app, 'sec_unlock02');
    const r = await auth(request(app).post(`/api/v1/admin/users/${target._id}/unlock`).send({ reason: 'support request' }), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.unlocked).toBe(true);
    const after = await User.findById(target._id);
    expect(after.lockedUntil).toBeNull();
    expect(after.failedLoginAttempts).toBe(0);
  });

  test('department_admin without user.unlock capability is denied (403)', async () => {
    const target = await makeUser('tunlock02', ['student']);
    await makeUser('dept_unlock02', ['department_admin']);
    const tok = await loginAs(app, 'dept_unlock02');
    const r = await auth(request(app).post(`/api/v1/admin/users/${target._id}/unlock`).send({ reason: 'support request' }), tok);
    expect(r.status).toBe(403);
  });

  test('student cannot unlock (403)', async () => {
    const target = await makeUser('tunlock03', ['student']);
    await makeUser('stu_unlock03', ['student']);
    const tok = await loginAs(app, 'stu_unlock03');
    const r = await auth(request(app).post(`/api/v1/admin/users/${target._id}/unlock`).send({ reason: 'x' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/admin/sessions/force-logout', () => {
  test('validation: missing userId returns 422', async () => {
    await makeUser('adm_fl01', ['department_admin']);
    const tok = await loginAs(app, 'adm_fl01');
    const r = await auth(request(app).post('/api/v1/admin/sessions/force-logout').send({ reason: 'bad actor' }), tok);
    expect(r.status).toBe(422);
  });

  test('validation: missing reason returns 422', async () => {
    const target = await makeUser('tfl01', ['student']);
    await loginAs(app, 'tfl01');
    await makeUser('adm_fl02', ['department_admin']);
    const tok = await loginAs(app, 'adm_fl02');
    const r = await auth(request(app).post('/api/v1/admin/sessions/force-logout').send({ userId: String(target._id) }), tok);
    expect(r.status).toBe(422);
  });

  test('admin revokes active session (subsequent /me returns 401)', async () => {
    const target = await makeUser('tfl02', ['student']);
    const targetTok = await loginAs(app, 'tfl02');
    const before = await auth(request(app).get('/api/v1/auth/me'), targetTok);
    expect(before.status).toBe(200);
    await makeUser('adm_fl03', ['department_admin']);
    const adminTok = await loginAs(app, 'adm_fl03');
    const r = await auth(request(app).post('/api/v1/admin/sessions/force-logout').send({ userId: String(target._id), reason: 'security incident' }), adminTok);
    expect(r.status).toBe(200);
    expect(r.body.data.revoked).toBeGreaterThanOrEqual(1);
    const after = await auth(request(app).get('/api/v1/auth/me'), targetTok);
    expect(after.status).toBe(401);
  });

  test('non-admin without force_logout capability is denied (403)', async () => {
    const target = await makeUser('tfl03', ['student']);
    await makeUser('stu_fl03', ['student']);
    const tok = await loginAs(app, 'stu_fl03');
    const r = await auth(request(app).post('/api/v1/admin/sessions/force-logout').send({ userId: String(target._id), reason: 'x' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('GET /api/v1/admin/audit', () => {
  test('student cannot view audit log (403)', async () => {
    await makeUser('stu_aud01', ['student']);
    const tok = await loginAs(app, 'stu_aud01');
    const r = await auth(request(app).get('/api/v1/admin/audit'), tok);
    expect(r.status).toBe(403);
  });

  test('security_admin can view audit log with filters applied', async () => {
    await makeUser('sec_aud01', ['security_admin']);
    const tok = await loginAs(app, 'sec_aud01');
    const r = await auth(request(app).get('/api/v1/admin/audit?action=auth.login&limit=10'), tok);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.items)).toBe(true);
    expect(r.body.data.limit).toBe(10);
    for (const it of r.body.data.items) expect(it.action).toBe('auth.login');
  });
});

describe('POST /api/v1/admin/audit/verify', () => {
  test('security_admin can run chain verification and gets a structured result', async () => {
    await makeUser('sec_ver01', ['security_admin']);
    const tok = await loginAs(app, 'sec_ver01');
    await auditService.record({ actorUsername: 'test', action: 'test.seed' });
    const r = await auth(request(app).post('/api/v1/admin/audit/verify').send({ limit: 50 }), tok);
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveProperty('valid');
    expect(typeof r.body.data.valid).toBe('boolean');
  });

  test('student cannot verify the audit chain (403)', async () => {
    await makeUser('stu_ver01', ['student']);
    const tok = await loginAs(app, 'stu_ver01');
    const r = await auth(request(app).post('/api/v1/admin/audit/verify').send({}), tok);
    expect(r.status).toBe(403);
  });
});
