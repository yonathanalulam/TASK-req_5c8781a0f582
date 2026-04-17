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

async function bootstrap() {
  const q = await SecurityQuestion.create({ text: 'Q?' });
  const owner = await User.create({ username: 'owner', passwordHash: await hashPassword('SuperSecure12345!'), roles: ['student'], securityQuestionId: q._id, securityAnswerHash: await hashPassword('rover') });
  await UserRoleAssignment.create({ userId: owner._id, roleCode: 'student' });
  const ops = await User.create({ username: 'ops', passwordHash: await hashPassword('SuperSecure12345!'), roles: ['operations_staff'], securityQuestionId: q._id, securityAnswerHash: await hashPassword('rover') });
  await UserRoleAssignment.create({ userId: ops._id, roleCode: 'operations_staff' });
  const login = await request(app).post('/api/v1/auth/login').send({ username: 'ops', password: 'SuperSecure12345!' });
  return { owner, ops, token: login.body.data.token };
}

// Construct a valid 1x1 JPEG for photo upload tests
const TINY_JPEG = Buffer.from([
  0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,
  0x00,0x01,0x00,0x00,0xff,0xdb,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,
  0x07,0x07,0x07,0x09,0x09,0x08,0x0a,0x0c,0x14,0x0d,0x0c,0x0b,0x0b,0x0c,0x19,0x12,
  0x13,0x0f,0x14,0x1d,0x1a,0x1f,0x1e,0x1d,0x1a,0x1c,0x1c,0x20,0x24,0x2e,0x27,0x20,
  0x22,0x2c,0x23,0x1c,0x1c,0x28,0x37,0x29,0x2c,0x30,0x31,0x34,0x34,0x34,0x1f,0x27,
  0x39,0x3d,0x38,0x32,0x3c,0x2e,0x33,0x34,0x32,0xff,0xc0,0x00,0x0b,0x08,0x00,0x01,
  0x00,0x01,0x01,0x01,0x11,0x00,0xff,0xc4,0x00,0x1f,0x00,0x00,0x01,0x05,0x01,0x01,
  0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,
  0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0xff,0xc4,0x00,0xb5,0x10,0x00,0x02,0x01,0x03,
  0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,0x01,0x7d,0xff,0xda,0x00,0x08,
  0x01,0x01,0x00,0x00,0x3f,0x00,0x37,0xff,0xd9,
]);

describe('intake + custody', () => {
  test('intake flow: create -> upload photo -> complete -> scan', async () => {
    const { owner, token } = await bootstrap();
    // Create intake
    const create = await request(app).post('/api/v1/shoes/intake').set('Authorization', `Bearer ${token}`).send({
      ownerUserId: String(owner._id), brand: 'Acme', size: '10', color: 'Black',
    });
    expect(create.status).toBe(201);
    const shoe = create.body.data;
    expect(shoe.barcode).toMatch(/^\d{12}$/);
    // Upload photo
    const up = await request(app).post(`/api/v1/shoes/${shoe._id}/photos`).set('Authorization', `Bearer ${token}`).attach('photos', TINY_JPEG, 'photo.jpg');
    expect(up.status).toBe(201);
    // Complete intake
    const done = await request(app).post(`/api/v1/shoes/${shoe._id}/complete-intake`).set('Authorization', `Bearer ${token}`).send({ station: 'A1' });
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('intake_completed');
    // Scan service_start
    const scan = await request(app).post('/api/v1/custody/scan').set('Authorization', `Bearer ${token}`).send({
      barcode: shoe.barcode, eventType: 'handoff', toState: 'in_service_queue', station: 'A1',
    });
    expect(scan.status).toBe(201);
    // Duplicate within 30s is idempotently suppressed
    const dup = await request(app).post('/api/v1/custody/scan').set('Authorization', `Bearer ${token}`).send({
      barcode: shoe.barcode, eventType: 'handoff', toState: 'in_service_queue',
    });
    expect(dup.body.data.suppressedDuplicate).toBe(true);
    // Illegal transition rejected
    const bad = await request(app).post('/api/v1/custody/scan').set('Authorization', `Bearer ${token}`).send({
      barcode: shoe.barcode, eventType: 'delivered', toState: 'delivered',
    });
    expect(bad.status).toBe(409);
  });

  test('unknown barcode rejected', async () => {
    const { token } = await bootstrap();
    const r = await request(app).post('/api/v1/custody/scan').set('Authorization', `Bearer ${token}`).send({
      barcode: '999999999999', eventType: 'handoff', toState: 'in_service_queue',
    });
    expect(r.status).toBe(404);
  });

  test('rejects too-small file with wrong magic', async () => {
    const { owner, token } = await bootstrap();
    const create = await request(app).post('/api/v1/shoes/intake').set('Authorization', `Bearer ${token}`).send({
      ownerUserId: String(owner._id), brand: 'Acme', size: '10',
    });
    const up = await request(app).post(`/api/v1/shoes/${create.body.data._id}/photos`).set('Authorization', `Bearer ${token}`).attach('photos', Buffer.from('not an image'), 'x.jpg');
    expect(up.status).toBe(422);
  });
});
