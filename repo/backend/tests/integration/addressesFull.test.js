const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');
const SavedAddress = require('../../src/models/SavedAddress');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

describe('POST /api/v1/addresses', () => {
  test('creates a valid US address (201, maskedPreview present)', async () => {
    await makeUser('aaa1', ['student']);
    const tok = await loginAs(app, 'aaa1');
    const r = await auth(request(app).post('/api/v1/addresses').send({
      label: 'Home', line1: '1 Main St', city: 'Springfield', state: 'IL', postalCode: '62701',
    }), tok);
    expect(r.status).toBe(201);
    expect(r.body.data.label).toBe('Home');
    expect(r.body.data.maskedPreview).toContain('62701');
    expect(r.body.data).not.toHaveProperty('line1');
    const persisted = await SavedAddress.findById(r.body.data.id);
    expect(persisted.line1Enc.ct).toBeTruthy();
  });

  test('missing required fields returns 422', async () => {
    await makeUser('aaa2', ['student']);
    const tok = await loginAs(app, 'aaa2');
    const r = await auth(request(app).post('/api/v1/addresses').send({ label: 'Home' }), tok);
    expect(r.status).toBe(422);
  });

  test('non-US country is rejected', async () => {
    await makeUser('aaa3', ['student']);
    const tok = await loginAs(app, 'aaa3');
    const r = await auth(request(app).post('/api/v1/addresses').send({
      label: 'X', line1: '1', city: 'x', state: 'x', postalCode: '62701', country: 'CA',
    }), tok);
    expect(r.status).toBe(422);
  });

  test('invalid postal code format is rejected', async () => {
    await makeUser('aaa4', ['student']);
    const tok = await loginAs(app, 'aaa4');
    const r = await auth(request(app).post('/api/v1/addresses').send({
      label: 'X', line1: '1', city: 'x', state: 'x', postalCode: 'ABCDE',
    }), tok);
    expect(r.status).toBe(422);
  });
});

describe('GET /api/v1/addresses', () => {
  test('owner lists their addresses decrypted', async () => {
    await makeUser('aaa5', ['student']);
    const tok = await loginAs(app, 'aaa5');
    await auth(request(app).post('/api/v1/addresses').send({
      label: 'Home', line1: '10 Pine', city: 'Austin', state: 'TX', postalCode: '73301',
    }), tok);
    const r = await auth(request(app).get('/api/v1/addresses'), tok);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
    expect(r.body.data[0].line1).toBe('10 Pine');
    expect(r.body.data[0].city).toBe('Austin');
  });

  test('addresses are scoped to the owner (second user sees only their own)', async () => {
    await makeUser('aaa6', ['student']);
    const t1 = await loginAs(app, 'aaa6');
    await auth(request(app).post('/api/v1/addresses').send({
      label: 'A6', line1: 'OwnedByA6', city: 'X', state: 'NY', postalCode: '10001',
    }), t1);
    await makeUser('aaa7', ['student']);
    const t2 = await loginAs(app, 'aaa7');
    const r = await auth(request(app).get('/api/v1/addresses'), t2);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([]);
  });

  test('unauthenticated list returns 401', async () => {
    const r = await request(app).get('/api/v1/addresses');
    expect(r.status).toBe(401);
  });
});
