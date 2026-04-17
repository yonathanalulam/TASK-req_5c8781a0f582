import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../store/auth.jsx';
import { OfflineQueueProvider } from '../store/offlineQueue.jsx';

// fetch mocking utility — each test reinstalls a fresh queue.
export function mockFetchSequence(responses) {
  const queue = [...responses];
  globalThis.fetch = vi.fn(async (url, opts) => {
    const next = queue.shift() || { status: 404, data: null, error: { code: 'NOT_FOUND', message: 'unmocked ' + url } };
    const ok = next.status < 400;
    return {
      ok,
      status: next.status,
      async json() { return { success: ok, data: next.data || null, error: next.error || null, meta: {} }; },
    };
  });
  return globalThis.fetch;
}

// Preset common responses for tests that just need the auth/session shell.
export function mockMeResponse(user) {
  return {
    status: 200,
    data: user || { id: 'u1', username: 'alice', displayName: 'Alice', roles: ['student'], scopes: [] },
  };
}

export function renderApp(App, { route = '/', token = null, user = null } = {}) {
  if (token) localStorage.setItem('token', token);
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <OfflineQueueProvider>
          <App />
        </OfflineQueueProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

// Render helper that skips the built-in MemoryRouter wrapping (for pages that embed their own routing).
export function renderWith(Component, { route = '/', user = null } = {}) {
  if (user) localStorage.setItem('token', 'test-token');
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <OfflineQueueProvider>
          <Component />
        </OfflineQueueProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}
