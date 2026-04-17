const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');
const ServiceCategory = require('../../src/models/ServiceCategory');
const ServiceTag = require('../../src/models/ServiceTag');
const ServiceCatalogEntry = require('../../src/models/ServiceCatalogEntry');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function seedCatalog() {
  await ServiceCategory.create({ code: 'clean', name: 'Cleaning' });
  await ServiceTag.create({ code: 'express', label: 'Express' });
  await ServiceCatalogEntry.create({ code: 'basic-clean', name: 'Basic Clean', categoryCode: 'clean', tags: ['express'], priceCents: 1500 });
}

describe('GET /api/v1/catalog/categories', () => {
  test('authenticated user gets active categories only', async () => {
    await ServiceCategory.create({ code: 'x1', name: 'X One', active: true });
    await ServiceCategory.create({ code: 'x2', name: 'X Two', active: false });
    await makeUser('uuu1', ['student']);
    const tok = await loginAs(app, 'uuu1');
    const r = await auth(request(app).get('/api/v1/catalog/categories'), tok);
    expect(r.status).toBe(200);
    const codes = r.body.data.map(c => c.code);
    expect(codes).toContain('x1');
    expect(codes).not.toContain('x2');
  });

  test('unauthenticated request is 401', async () => {
    const r = await request(app).get('/api/v1/catalog/categories');
    expect(r.status).toBe(401);
  });
});

describe('GET /api/v1/catalog/tags', () => {
  test('authenticated user gets active tags only', async () => {
    await ServiceTag.create({ code: 'a', label: 'Alpha' });
    await ServiceTag.create({ code: 'b', label: 'Beta', active: false });
    await makeUser('uuu2', ['student']);
    const tok = await loginAs(app, 'uuu2');
    const r = await auth(request(app).get('/api/v1/catalog/tags'), tok);
    expect(r.status).toBe(200);
    const codes = r.body.data.map(t => t.code);
    expect(codes).toContain('a');
    expect(codes).not.toContain('b');
  });
});

describe('GET /api/v1/catalog/services/sync', () => {
  test('returns services, categories, tags, syncedAt', async () => {
    await seedCatalog();
    await makeUser('uuu3', ['student']);
    const tok = await loginAs(app, 'uuu3');
    const r = await auth(request(app).get('/api/v1/catalog/services/sync'), tok);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.services)).toBe(true);
    expect(Array.isArray(r.body.data.categories)).toBe(true);
    expect(Array.isArray(r.body.data.tags)).toBe(true);
    expect(typeof r.body.data.syncedAt).toBe('string');
    expect(r.body.data.services.map(s => s.code)).toContain('basic-clean');
  });
});

describe('POST /api/v1/catalog/categories', () => {
  test('validation: missing code/name returns 422', async () => {
    await makeUser('adm1', ['department_admin']);
    const tok = await loginAs(app, 'adm1');
    const r = await auth(request(app).post('/api/v1/catalog/categories').send({ code: 'only-code' }), tok);
    expect(r.status).toBe(422);
  });

  test('admin creates a new category and persists it', async () => {
    await makeUser('adm2', ['department_admin']);
    const tok = await loginAs(app, 'adm2');
    const r = await auth(request(app).post('/api/v1/catalog/categories').send({ code: 'newcat', name: 'New Cat' }), tok);
    expect(r.status).toBe(201);
    expect(r.body.data.code).toBe('newcat');
    const persisted = await ServiceCategory.findOne({ code: 'newcat' });
    expect(persisted).not.toBeNull();
  });

  test('student cannot create category (403)', async () => {
    await makeUser('stu1', ['student']);
    const tok = await loginAs(app, 'stu1');
    const r = await auth(request(app).post('/api/v1/catalog/categories').send({ code: 'x', name: 'X' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/catalog/tags', () => {
  test('validation: missing code/label returns 422', async () => {
    await makeUser('adm3', ['department_admin']);
    const tok = await loginAs(app, 'adm3');
    const r = await auth(request(app).post('/api/v1/catalog/tags').send({ code: 'only-code' }), tok);
    expect(r.status).toBe(422);
  });

  test('admin creates a new tag', async () => {
    await makeUser('adm4', ['department_admin']);
    const tok = await loginAs(app, 'adm4');
    const r = await auth(request(app).post('/api/v1/catalog/tags').send({ code: 'newtag', label: 'New Tag' }), tok);
    expect(r.status).toBe(201);
    expect(r.body.data.code).toBe('newtag');
    const persisted = await ServiceTag.findOne({ code: 'newtag' });
    expect(persisted).not.toBeNull();
  });

  test('student cannot create tag (403)', async () => {
    await makeUser('stu2', ['student']);
    const tok = await loginAs(app, 'stu2');
    const r = await auth(request(app).post('/api/v1/catalog/tags').send({ code: 'x', label: 'X' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('PUT /api/v1/catalog/services/:id', () => {
  test('admin updates service, version bumps, audit fields touched', async () => {
    await makeUser('adm5', ['department_admin']);
    const tok = await loginAs(app, 'adm5');
    const create = await auth(request(app).post('/api/v1/catalog/services').send({ code: 'svc-a', name: 'Svc A', priceCents: 100 }), tok);
    expect(create.status).toBe(201);
    const id = create.body.data._id;
    const v = create.body.data.version;
    const upd = await auth(request(app).put(`/api/v1/catalog/services/${id}`).send({ name: 'Svc A2', priceCents: 200, version: v }), tok);
    expect(upd.status).toBe(200);
    expect(upd.body.data.name).toBe('Svc A2');
    expect(upd.body.data.priceCents).toBe(200);
    expect(upd.body.data.version).toBe(v + 1);
  });

  test('optimistic lock: stale version returns 409', async () => {
    await makeUser('adm6', ['department_admin']);
    const tok = await loginAs(app, 'adm6');
    const create = await auth(request(app).post('/api/v1/catalog/services').send({ code: 'svc-b', name: 'Svc B' }), tok);
    const id = create.body.data._id;
    const r = await auth(request(app).put(`/api/v1/catalog/services/${id}`).send({ name: 'Foo', version: 999 }), tok);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('CONFLICT');
  });

  test('404 for unknown id', async () => {
    await makeUser('adm7', ['department_admin']);
    const tok = await loginAs(app, 'adm7');
    const r = await auth(request(app).put('/api/v1/catalog/services/000000000000000000000000').send({ name: 'x' }), tok);
    expect(r.status).toBe(404);
  });

  test('student cannot update service (403)', async () => {
    const entry = await ServiceCatalogEntry.create({ code: 'svc-c', name: 'Svc C' });
    await makeUser('stu3', ['student']);
    const tok = await loginAs(app, 'stu3');
    const r = await auth(request(app).put(`/api/v1/catalog/services/${entry._id}`).send({ name: 'Hacked' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('DELETE /api/v1/catalog/services/:id', () => {
  test('admin soft-deletes (deactivates) service', async () => {
    const entry = await ServiceCatalogEntry.create({ code: 'svc-d', name: 'Svc D', active: true });
    await makeUser('adm8', ['department_admin']);
    const tok = await loginAs(app, 'adm8');
    const r = await auth(request(app).delete(`/api/v1/catalog/services/${entry._id}`), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.deactivated).toBe(true);
    const after = await ServiceCatalogEntry.findById(entry._id);
    expect(after.active).toBe(false);
  });

  test('404 for unknown id', async () => {
    await makeUser('adm9', ['department_admin']);
    const tok = await loginAs(app, 'adm9');
    const r = await auth(request(app).delete('/api/v1/catalog/services/000000000000000000000000'), tok);
    expect(r.status).toBe(404);
  });

  test('student cannot delete (403)', async () => {
    const entry = await ServiceCatalogEntry.create({ code: 'svc-e', name: 'Svc E' });
    await makeUser('stu4', ['student']);
    const tok = await loginAs(app, 'stu4');
    const r = await auth(request(app).delete(`/api/v1/catalog/services/${entry._id}`), tok);
    expect(r.status).toBe(403);
  });
});
