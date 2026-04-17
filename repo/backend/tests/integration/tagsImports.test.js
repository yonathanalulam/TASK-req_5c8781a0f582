const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');
const UserRoleAssignment = require('../../src/models/UserRoleAssignment');
const Exception = require('../../src/models/Exception');
const SecurityQuestion = require('../../src/models/SecurityQuestion');
const { hashPassword } = require('../../src/utils/password');
const runner = require('../../src/jobs/runner');
const TagRuleVersion = require('../../src/models/TagRuleVersion');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function adminToken() {
  const q = await SecurityQuestion.create({ text: 'Q?' });
  const u = await User.create({ username: 'adm', passwordHash: await hashPassword('SuperSecure12345!'), roles: ['department_admin'], securityQuestionId: q._id, securityAnswerHash: await hashPassword('rover') });
  await UserRoleAssignment.create({ userId: u._id, roleCode: 'department_admin' });
  const r = await request(app).post('/api/v1/auth/login').send({ username: 'adm', password: 'SuperSecure12345!' });
  return { token: r.body.data.token, user: u };
}

describe('tag import + computed recompute + export', () => {
  test('CSV tag import with mixed valid/invalid rows reports partial success', async () => {
    const { token } = await adminToken();
    const q = await SecurityQuestion.findOne();
    await User.create({ username: 'usr1', passwordHash: await hashPassword('x'), roles: [], securityQuestionId: q._id, securityAnswerHash: await hashPassword('r') });
    const csv = 'username,tagCode,action,reason\nusr1,premium,add,ok\nnonexistent,foo,add,bad\nusr1,premium,badaction,oops\n';
    const r = await request(app).post('/api/v1/imports/tags').set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), 'tags.csv');
    expect(r.status).toBe(201);
    expect(r.body.data.successCount).toBe(1);
    expect(r.body.data.failureCount).toBe(2);
    expect(r.body.data.status).toBe('partial');
  });

  test('computed tag recompute applies high_risk_exceptions rule', async () => {
    const { user } = await adminToken();
    const q = await SecurityQuestion.findOne();
    const subject = await User.create({ username: 'sub1', passwordHash: await hashPassword('x'), roles: [], securityQuestionId: q._id, securityAnswerHash: await hashPassword('r') });
    await TagRuleVersion.create({
      tagCode: 'high_risk_exceptions', versionNumber: 1, ruleType: 'exception_count_rolling',
      params: { windowDays: 14, minCount: 3 }, active: true,
    });
    for (let i = 0; i < 3; i++) {
      await Exception.create({ exceptionType: 'missed_check_in', summary: `e${i}`, subjectUserId: subject._id, openedBy: user._id });
    }
    const r = await runner.tagRecompute();
    expect(r.results.some(x => x.added >= 1)).toBe(true);
  });

  test('CSV export writes checksum-linked file', async () => {
    const { token } = await adminToken();
    const r = await request(app).post('/api/v1/exports/contracts').set('Authorization', `Bearer ${token}`).send({});
    expect(r.status).toBe(201);
    expect(r.body.data.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});
