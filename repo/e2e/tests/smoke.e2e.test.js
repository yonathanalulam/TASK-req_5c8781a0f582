// Real FE <-> BE end-to-end tests.
// Exercises the actual nginx-served SPA container AND the /api proxy reaching
// the real Express backend + real MongoDB. Does NOT mock transport.

const fetch = require('node-fetch');
const cheerio = require('cheerio');

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://e2e-frontend').replace(/\/+$/, '');
const BACKEND_URL = (process.env.BACKEND_URL || 'http://e2e-app:4000').replace(/\/+$/, '');
const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMeNow!2026';

async function waitFor(url, label, { retries = 60, delayMs = 1000 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, { timeout: 5000 });
      if (r.ok) return r;
      lastErr = new Error(`${label} returned status ${r.status}`);
    } catch (e) { lastErr = e; }
    await new Promise(res => setTimeout(res, delayMs));
  }
  throw new Error(`Timed out waiting for ${label} (${url}): ${lastErr && lastErr.message}`);
}

beforeAll(async () => {
  await waitFor(`${FRONTEND_URL}/`, 'frontend');
  await waitFor(`${BACKEND_URL}/api/v1/health`, 'backend health (direct)');
}, 120000);

describe('frontend container serves the SPA', () => {
  test('GET / returns HTML shell that boots the React SPA', async () => {
    const r = await fetch(`${FRONTEND_URL}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type') || '').toMatch(/text\/html/);
    const body = await r.text();
    const $ = cheerio.load(body);
    // Vite injects the built script tag with module type; we should see a <script src="/assets/..."> reference.
    const scripts = $('script[src]').map((_, el) => $(el).attr('src')).get();
    expect(scripts.some(s => s.startsWith('/assets/') && s.endsWith('.js'))).toBe(true);
    // The SPA root mount point must exist so the React app can hydrate.
    expect($('#root').length).toBe(1);
  });

  test('/api proxy reaches the backend (GET /api/v1/health through nginx)', async () => {
    const r = await fetch(`${FRONTEND_URL}/api/v1/health`);
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('ok');
  });
});

describe('auth/login journey via frontend proxy', () => {
  let token;

  test('unauthenticated /api/v1/auth/me is rejected with 401 through the proxy', async () => {
    const r = await fetch(`${FRONTEND_URL}/api/v1/auth/me`);
    expect(r.status).toBe(401);
    const json = await r.json();
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  test('seeded admin can log in via the same JSON endpoint the SPA uses', async () => {
    const r = await fetch(`${FRONTEND_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    });
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.success).toBe(true);
    expect(typeof json.data.token).toBe('string');
    expect(json.data.user.username).toBe(ADMIN_USERNAME);
    expect(Array.isArray(json.data.user.roles)).toBe(true);
    expect(json.data.user.roles).toContain('department_admin');
    token = json.data.token;
  });

  test('authenticated /auth/me through the proxy returns the same identity', async () => {
    const r = await fetch(`${FRONTEND_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json.data.username).toBe(ADMIN_USERNAME);
  });
});

describe('intake-style fullstack workflow through the proxy', () => {
  // Log in as operations_staff and as a seeded student. Create a shoe intake for the
  // student and then let the student fetch their own shoe list — covers the
  // UI proxy path, authz, scoping, and a real state transition against real MongoDB.
  let opsToken, studentToken, studentId, shoeId;

  test('ops1 and student1 can both authenticate', async () => {
    const ops = await fetch(`${FRONTEND_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ops1', password: 'OpsPass!2026ABC' }),
    });
    expect(ops.status).toBe(200);
    opsToken = (await ops.json()).data.token;

    const stu = await fetch(`${FRONTEND_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student1', password: 'StudentPass!2026' }),
    });
    expect(stu.status).toBe(200);
    const stuBody = await stu.json();
    studentToken = stuBody.data.token;
    studentId = stuBody.data.user.id;
  });

  test('ops creates a shoe intake; response shape matches API contract', async () => {
    const r = await fetch(`${FRONTEND_URL}/api/v1/shoes/intake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opsToken}` },
      body: JSON.stringify({
        ownerUserId: studentId,
        brand: 'E2E Brand',
        size: '10',
        material: 'Leather',
        color: 'Black',
      }),
    });
    expect(r.status).toBe(201);
    const json = await r.json();
    expect(json.success).toBe(true);
    expect(json.data.brand).toBe('E2E Brand');
    expect(typeof json.data.serial).toBe('string');
    shoeId = json.data._id;
  });

  test('student sees their own new shoe in the list — and only their own', async () => {
    const r = await fetch(`${FRONTEND_URL}/api/v1/shoes`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(r.status).toBe(200);
    const json = await r.json();
    const ids = (json.data.items || []).map(i => i._id);
    expect(ids).toContain(shoeId);
    for (const item of json.data.items) {
      expect(item.ownerUserId).toBe(studentId);
    }
  });

  test('a second student cannot read the first student shoe detail (403)', async () => {
    // Sign up a fresh student account through the SPA proxy and confirm object-level authz.
    const qRes = await fetch(`${FRONTEND_URL}/api/v1/auth/security-questions`);
    const qJson = await qRes.json();
    const qId = qJson.data[0].id;
    const signup = await fetch(`${FRONTEND_URL}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `e2e.stu.${Date.now()}`,
        password: 'AnotherE2EPass!2026',
        displayName: 'E2E Stranger',
        securityQuestionId: qId,
        securityAnswer: 'rover',
      }),
    });
    expect(signup.status).toBe(201);
    const stranger = await signup.json();
    const strLogin = await fetch(`${FRONTEND_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: stranger.data.username, password: 'AnotherE2EPass!2026' }),
    });
    const strToken = (await strLogin.json()).data.token;
    const r = await fetch(`${FRONTEND_URL}/api/v1/shoes/${shoeId}`, {
      headers: { Authorization: `Bearer ${strToken}` },
    });
    expect(r.status).toBe(403);
  });
});

describe('catalog browse workflow', () => {
  test('seeded catalog is visible to an authenticated student through the proxy', async () => {
    const stu = await fetch(`${FRONTEND_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'student1', password: 'StudentPass!2026' }),
    });
    const studentToken = (await stu.json()).data.token;
    const r = await fetch(`${FRONTEND_URL}/api/v1/catalog/services`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(Array.isArray(json.data.items)).toBe(true);
    const codes = json.data.items.map(i => i.code);
    expect(codes).toEqual(expect.arrayContaining(['basic-clean']));
  });
});
