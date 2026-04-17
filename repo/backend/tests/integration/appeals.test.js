const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const User = require('../../src/models/User');
const UserRoleAssignment = require('../../src/models/UserRoleAssignment');
const ScopeAssignment = require('../../src/models/ScopeAssignment');
const SecurityQuestion = require('../../src/models/SecurityQuestion');
const { hashPassword } = require('../../src/utils/password');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function make(username, roles, scopes=[]) {
  const q = await SecurityQuestion.findOne() || await SecurityQuestion.create({ text: 'Q?' });
  const u = await User.create({ username, passwordHash: await hashPassword('SuperSecure12345!'), roles, securityQuestionId: q._id, securityAnswerHash: await hashPassword('rover') });
  for (const r of roles) await UserRoleAssignment.create({ userId: u._id, roleCode: r });
  for (const s of scopes) await ScopeAssignment.create({ userId: u._id, dimension: s.dimension, value: s.value });
  return u;
}
async function login(username) {
  const r = await request(app).post('/api/v1/auth/login').send({ username, password: 'SuperSecure12345!' });
  return r.body.data.token;
}

describe('appeals lifecycle', () => {
  test('student submits appeal, corporate mentor approves within cohort', async () => {
    const student = await make('stud', ['student'], [{ dimension: 'internship_cohort', value: 'COH-1' }]);
    const mentor = await make('men', ['corporate_mentor'], [{ dimension: 'internship_cohort', value: 'COH-1' }]);
    const ops = await make('ops', ['operations_staff']);
    const opsTok = await login('ops');
    const stuTok = await login('stud');
    const menTok = await login('men');
    // Ops creates exception for the student (cohort-scoped)
    const ex = await request(app).post('/api/v1/exceptions').set('Authorization', `Bearer ${opsTok}`).send({
      exceptionType: 'missed_check_in', summary: 'missed', subjectUserId: String(student._id),
      scopes: [{ dimension: 'internship_cohort', value: 'COH-1' }],
    });
    expect(ex.status).toBe(201);
    // Student submits appeal with rationale
    const appeal = await request(app).post('/api/v1/appeals').set('Authorization', `Bearer ${stuTok}`).send({
      exceptionId: ex.body.data._id, rationale: 'I was sick that day',
    });
    expect(appeal.status).toBe(201);
    // Start review as mentor
    const sr = await request(app).post(`/api/v1/appeals/${appeal.body.data._id}/start-review`).set('Authorization', `Bearer ${menTok}`).send({});
    expect(sr.status).toBe(200);
    // Mentor approves
    const dec = await request(app).post(`/api/v1/appeals/${appeal.body.data._id}/decide`).set('Authorization', `Bearer ${menTok}`).send({
      outcome: 'approved', rationale: 'evidence accepted',
    });
    expect(dec.status).toBe(200);
    expect(dec.body.data.appeal.status).toBe('approved');
  });

  test('second active appeal blocked until remand', async () => {
    const student = await make('stu2', ['student']);
    const ops = await make('ops2', ['operations_staff']);
    const opsTok = await login('ops2');
    const stuTok = await login('stu2');
    const ex = await request(app).post('/api/v1/exceptions').set('Authorization', `Bearer ${opsTok}`).send({
      exceptionType: 'other', summary: 'x', subjectUserId: String(student._id),
    });
    const a1 = await request(app).post('/api/v1/appeals').set('Authorization', `Bearer ${stuTok}`).send({
      exceptionId: ex.body.data._id, rationale: 'first',
    });
    expect(a1.status).toBe(201);
    const a2 = await request(app).post('/api/v1/appeals').set('Authorization', `Bearer ${stuTok}`).send({
      exceptionId: ex.body.data._id, rationale: 'second',
    });
    expect(a2.status).toBe(409);
  });

  test('mentor in wrong cohort cannot approve', async () => {
    const student = await make('stu3', ['student'], [{ dimension: 'internship_cohort', value: 'COH-1' }]);
    const badMentor = await make('men2', ['corporate_mentor'], [{ dimension: 'internship_cohort', value: 'COH-2' }]);
    const ops = await make('ops3', ['operations_staff']);
    const opsTok = await login('ops3');
    const stuTok = await login('stu3');
    const mTok = await login('men2');
    const ex = await request(app).post('/api/v1/exceptions').set('Authorization', `Bearer ${opsTok}`).send({
      exceptionType: 'missed_check_in', summary: 'x', subjectUserId: String(student._id),
      scopes: [{ dimension: 'internship_cohort', value: 'COH-1' }],
    });
    const a = await request(app).post('/api/v1/appeals').set('Authorization', `Bearer ${stuTok}`).send({
      exceptionId: ex.body.data._id, rationale: 'please review',
    });
    await request(app).post(`/api/v1/appeals/${a.body.data._id}/start-review`).set('Authorization', `Bearer ${mTok}`).send({});
    const dec = await request(app).post(`/api/v1/appeals/${a.body.data._id}/decide`).set('Authorization', `Bearer ${mTok}`).send({
      outcome: 'approved', rationale: 'wrong cohort',
    });
    expect(dec.status).toBe(403);
  });
});
