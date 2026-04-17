const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');
const LeaseContract = require('../../src/models/LeaseContract');
const Exception = require('../../src/models/Exception');
const Appeal = require('../../src/models/Appeal');
const ShippingOrder = require('../../src/models/ShippingOrder');
const MemberTag = require('../../src/models/MemberTag');
const ExportJob = require('../../src/models/ExportJob');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

describe('POST /api/v1/exports/tags', () => {
  test('admin creates tags export job (CSV file written, 201)', async () => {
    const u = await makeUser('tx1', ['student']);
    await MemberTag.create({ userId: u._id, tagCode: 'premium', source: 'static' });
    await makeUser('adm1', ['department_admin']);
    const tok = await loginAs(app, 'adm1');
    const r = await auth(request(app).post('/api/v1/exports/tags').send({}), tok);
    expect(r.status).toBe(201);
    expect(r.body.data.jobType).toBe('tags');
    expect(r.body.data.status).toBe('completed');
    expect(r.body.data.recordCount).toBe(1);
    expect(fs.existsSync(r.body.data.filePath)).toBe(true);
  });

  test('student cannot export tags (403)', async () => {
    await makeUser('stu1', ['student']);
    const tok = await loginAs(app, 'stu1');
    const r = await auth(request(app).post('/api/v1/exports/tags').send({}), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/exports/exceptions', () => {
  test('admin creates exceptions export', async () => {
    const subj = await makeUser('sx1', ['student']);
    const ops = await makeUser('ops', ['operations_staff']);
    await Exception.create({ exceptionType: 'other', summary: 'e1', subjectUserId: subj._id, openedBy: ops._id });
    await makeUser('adm2', ['department_admin']);
    const tok = await loginAs(app, 'adm2');
    const r = await auth(request(app).post('/api/v1/exports/exceptions').send({}), tok);
    expect(r.status).toBe(201);
    expect(r.body.data.jobType).toBe('exceptions');
    expect(r.body.data.recordCount).toBe(1);
  });

  test('student cannot export exceptions (403)', async () => {
    await makeUser('stu2', ['student']);
    const tok = await loginAs(app, 'stu2');
    const r = await auth(request(app).post('/api/v1/exports/exceptions').send({}), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/exports/appeals', () => {
  test('admin creates appeals export', async () => {
    const subj = await makeUser('ap1', ['student']);
    const ops = await makeUser('ops2', ['operations_staff']);
    const ex = await Exception.create({ exceptionType: 'other', summary: 'x', subjectUserId: subj._id, openedBy: ops._id });
    await Appeal.create({ exceptionId: ex._id, appellantUserId: subj._id, rationale: 'hi', status: 'submitted' });
    await makeUser('adm3', ['department_admin']);
    const tok = await loginAs(app, 'adm3');
    const r = await auth(request(app).post('/api/v1/exports/appeals').send({}), tok);
    expect(r.status).toBe(201);
    expect(r.body.data.jobType).toBe('appeals');
    expect(r.body.data.recordCount).toBe(1);
  });

  test('student cannot export appeals (403)', async () => {
    await makeUser('stu3', ['student']);
    const tok = await loginAs(app, 'stu3');
    const r = await auth(request(app).post('/api/v1/exports/appeals').send({}), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/exports/shipping', () => {
  test('admin creates shipping export', async () => {
    await ShippingOrder.create({
      shoeProfileId: '000000000000000000000001', addressId: '000000000000000000000002',
      fulfillmentOperator: 'ops1', method: 'standard', status: 'ready_to_ship',
      createdBy: '000000000000000000000003',
    });
    await makeUser('adm4', ['department_admin']);
    const tok = await loginAs(app, 'adm4');
    const r = await auth(request(app).post('/api/v1/exports/shipping').send({}), tok);
    expect(r.status).toBe(201);
    expect(r.body.data.jobType).toBe('shipping');
    expect(r.body.data.recordCount).toBeGreaterThanOrEqual(1);
  });

  test('student cannot export shipping (403)', async () => {
    await makeUser('stu4', ['student']);
    const tok = await loginAs(app, 'stu4');
    const r = await auth(request(app).post('/api/v1/exports/shipping').send({}), tok);
    expect(r.status).toBe(403);
  });
});

describe('GET /api/v1/exports', () => {
  test('admin lists prior export jobs (own + global)', async () => {
    await makeUser('adm5', ['department_admin']);
    const tok = await loginAs(app, 'adm5');
    await auth(request(app).post('/api/v1/exports/tags').send({}), tok);
    const r = await auth(request(app).get('/api/v1/exports'), tok);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
    expect(r.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test('student cannot list exports (403, missing export.all)', async () => {
    await makeUser('stu5', ['student']);
    const tok = await loginAs(app, 'stu5');
    const r = await auth(request(app).get('/api/v1/exports'), tok);
    expect(r.status).toBe(403);
  });
});

describe('GET /api/v1/exports/:id/download', () => {
  test('admin can download their export and receives CSV with checksum header', async () => {
    await makeUser('adm6', ['department_admin']);
    const tok = await loginAs(app, 'adm6');
    const job = await auth(request(app).post('/api/v1/exports/tags').send({}), tok);
    const id = job.body.data._id;
    const r = await auth(request(app).get(`/api/v1/exports/${id}/download`), tok);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.headers['x-export-checksum']).toBeTruthy();
  });

  test('missing file returns 410', async () => {
    await makeUser('adm7', ['department_admin']);
    const tok = await loginAs(app, 'adm7');
    const job = await ExportJob.create({
      jobType: 'tags', requestedBy: '000000000000000000000001', requestedByUsername: 'x',
      filePath: path.join(__dirname, 'not-here.csv'), filename: 'not-here.csv', checksum: 'x',
      status: 'completed', recordCount: 0, sizeBytes: 0,
    });
    const r = await auth(request(app).get(`/api/v1/exports/${job._id}/download`), tok);
    expect(r.status).toBe(410);
  });

  test('unknown export id returns 404', async () => {
    await makeUser('adm8', ['department_admin']);
    const tok = await loginAs(app, 'adm8');
    const r = await auth(request(app).get('/api/v1/exports/000000000000000000000000/download'), tok);
    expect(r.status).toBe(404);
  });

  test('student cannot download another user export (403)', async () => {
    await makeUser('adm9', ['department_admin']);
    const atok = await loginAs(app, 'adm9');
    const job = await auth(request(app).post('/api/v1/exports/tags').send({}), atok);
    await makeUser('stu6', ['student']);
    const tok = await loginAs(app, 'stu6');
    const r = await auth(request(app).get(`/api/v1/exports/${job.body.data._id}/download`), tok);
    expect(r.status).toBe(403);
  });
});
