import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewServiceRequestPage, ServiceRequestsPage } from '../pages/ServiceRequests.jsx';
import { renderWith } from './testUtils.jsx';

function json(data, status = 200) {
  return {
    ok: status < 400, status,
    async json() { return { success: status < 400, data, error: null, meta: {} }; },
  };
}

describe('student service request flow', () => {
  it('lists own service requests', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/me')) return json({ id: 'u1', username: 'a', roles: ['student'] });
      if (url.endsWith('/service-requests')) return json({ items: [
        { _id: 'sr1', serviceCodes: ['basic-clean'], status: 'submitted', createdAt: new Date().toISOString() },
      ], total: 1 });
      return json(null, 404);
    });
    localStorage.setItem('token', 'tok');
    renderWith(ServiceRequestsPage);
    await screen.findByTestId('sr-row-sr1', {}, { timeout: 3000 });
    expect(screen.getByTestId('sr-codes-sr1').textContent).toMatch(/basic-clean/);
    expect(screen.getByText('submitted')).toBeInTheDocument();
  });

  it('submits a new request end-to-end against mocked backend', async () => {
    const calls = [];
    globalThis.fetch = vi.fn(async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
      if (url.endsWith('/auth/me')) return json({ id: 'u1', username: 'a', roles: ['student'] });
      if (url.endsWith('/catalog/services?limit=200')) return json({ items: [
        { code: 'basic-clean', name: 'Basic Clean', priceCents: 1500, active: true },
        { code: 'deep-clean', name: 'Deep Clean', priceCents: 3500, active: true },
      ] });
      if (url.endsWith('/service-requests') && opts.method === 'POST') return json({ _id: 'new1', serviceCodes: ['basic-clean'], status: 'submitted', createdAt: new Date().toISOString() }, 201);
      if (url.endsWith('/service-requests/new1')) return json({
        request: { _id: 'new1', serviceCodes: ['basic-clean'], status: 'submitted', createdAt: new Date().toISOString() },
        catalog: [{ code: 'basic-clean', name: 'Basic Clean', priceCents: 1500 }],
      });
      return { ok: false, status: 404, async json() { return { success: false, data: null, error: { code: 'NF' }, meta: {} }; } };
    });
    localStorage.setItem('token', 'tok');
    renderWith(NewServiceRequestPage);
    await screen.findByLabelText(/svc-basic-clean/i);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(/svc-basic-clean/i));
    await user.click(screen.getByRole('button', { name: /submit request/i }));
    // The POST went through
    await waitFor(() => {
      const postCall = calls.find(c => c.method === 'POST' && c.url.endsWith('/service-requests'));
      expect(postCall).toBeDefined();
      expect(JSON.parse(postCall.body).serviceCodes).toEqual(['basic-clean']);
      // Idempotency-Key header is sent.
      expect(postCall.headers['Idempotency-Key']).toMatch(/.+/);
    });
  });
});

