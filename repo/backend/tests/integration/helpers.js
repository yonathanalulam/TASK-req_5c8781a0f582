const request = require('supertest');
const User = require('../../src/models/User');
const UserRoleAssignment = require('../../src/models/UserRoleAssignment');
const ScopeAssignment = require('../../src/models/ScopeAssignment');
const SecurityQuestion = require('../../src/models/SecurityQuestion');
const { hashPassword } = require('../../src/utils/password');

async function makeUser(username, roles = ['student'], scopes = []) {
  const q = (await SecurityQuestion.findOne()) || (await SecurityQuestion.create({ text: 'Q?' }));
  const u = await User.create({
    username,
    passwordHash: await hashPassword('SuperSecure12345!'),
    roles,
    securityQuestionId: q._id,
    securityAnswerHash: await hashPassword('rover'),
  });
  for (const r of roles) await UserRoleAssignment.create({ userId: u._id, roleCode: r });
  for (const s of scopes) await ScopeAssignment.create({ userId: u._id, dimension: s.dimension, value: s.value });
  return u;
}

async function loginAs(app, username) {
  const r = await request(app).post('/api/v1/auth/login').send({ username, password: 'SuperSecure12345!' });
  if (r.status !== 200) throw new Error(`loginAs(${username}) failed: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data.token;
}

function auth(req, token) {
  return req.set('Authorization', `Bearer ${token}`);
}

module.exports = { makeUser, loginAs, auth };
