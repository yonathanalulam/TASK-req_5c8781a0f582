const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');
const { generateBarcodeFromSerial } = require('../../src/services/barcodeService');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

describe('GET /api/v1/custody/verify-barcode/:code', () => {
  test('returns valid:true for a well-formed 12-digit Luhn barcode', async () => {
    await makeUser('vvv1', ['student']);
    const tok = await loginAs(app, 'vvv1');
    const code = generateBarcodeFromSerial('test-serial-1');
    const r = await auth(request(app).get(`/api/v1/custody/verify-barcode/${code}`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.valid).toBe(true);
  });

  test('returns valid:false for malformed code (wrong length)', async () => {
    await makeUser('vvv2', ['student']);
    const tok = await loginAs(app, 'vvv2');
    const r = await auth(request(app).get('/api/v1/custody/verify-barcode/12345'), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.valid).toBe(false);
  });

  test('returns valid:false for a bad check digit', async () => {
    await makeUser('vvv3', ['student']);
    const tok = await loginAs(app, 'vvv3');
    // take a valid code, flip last digit
    const good = generateBarcodeFromSerial('test-serial-2');
    const badLast = ((parseInt(good.charAt(11), 10) + 1) % 10).toString();
    const bad = good.slice(0, 11) + badLast;
    const r = await auth(request(app).get(`/api/v1/custody/verify-barcode/${bad}`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.valid).toBe(false);
  });

  test('requires authentication (401)', async () => {
    const r = await request(app).get('/api/v1/custody/verify-barcode/12345670');
    expect(r.status).toBe(401);
  });
});
