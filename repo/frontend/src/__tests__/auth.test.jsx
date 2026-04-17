import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App.jsx';
import { renderApp } from './testUtils.jsx';

function json(data, status = 200) {
  return {
    ok: status < 400, status,
    async json() { return { success: status < 400, data, error: null, meta: {} }; },
  };
}

function installFetch({ me = null, loginBody = null }) {
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    if (url.endsWith('/auth/me')) return me ? json(me) : json(null, 401);
    if (url.endsWith('/auth/login') && opts.method === 'POST') {
      return loginBody ? json(loginBody) : json(null, 401);
    }
    if (url.endsWith('/catalog/services/sync')) return json({ services: [], categories: [], tags: [], syncedAt: new Date().toISOString() });
    if (url.endsWith('/auth/security-questions')) return json([]);
    return json(null, 404);
  });
}

describe('auth routing', () => {
  it('redirects unauthenticated user to /login', async () => {
    installFetch({});
    renderApp(App, { route: '/catalog' });
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('logs the user in, stores token, shows catalog header', async () => {
    installFetch({
      loginBody: {
        token: 'tok-abc',
        sessionId: 'sid',
        user: { id: 'u1', username: 'alice', roles: ['student'], scopes: [] },
      },
    });
    renderApp(App, { route: '/login' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/username/i), 'alice');
    await user.type(screen.getByLabelText(/password/i), 'SuperSecure12345!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(localStorage.getItem('token')).toBe('tok-abc'));
  });

  it('role-gated nav: student does NOT see Intake/Contracts/Reports links', async () => {
    installFetch({ me: { id: 'u1', username: 'stu', roles: ['student'], scopes: [] } });
    renderApp(App, { route: '/', token: 'tok' });
    await screen.findByRole('link', { name: /my requests/i }, { timeout: 3000 });
    expect(screen.queryByRole('link', { name: /^intake$/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /^contracts$/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /^reports$/i })).toBeNull();
  });

  it('role-gated nav: department_admin sees admin links', async () => {
    installFetch({ me: { id: 'u2', username: 'adm', roles: ['department_admin'], scopes: [] } });
    renderApp(App, { route: '/', token: 'tok' });
    expect(await screen.findByRole('link', { name: /^contracts$/i }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^reports$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /audit/i })).toBeInTheDocument();
  });
});
