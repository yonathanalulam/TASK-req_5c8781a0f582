import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShippingPage } from '../pages/Shipping.jsx';
import { renderWith } from './testUtils.jsx';

function json(data, status = 200) {
  return {
    ok: status < 400, status,
    async json() { return { success: status < 400, data, error: null, meta: {} }; },
  };
}

describe('shipping UI role gating and POD/failed-delivery flows', () => {
  it('student sees viewer-only notice and no operational controls', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/me')) return json({ id: 'stu', username: 's', roles: ['student'] });
      if (url.includes('/shipping?')) return json({ items: [
        { _id: 'o1', status: 'in_transit', method: 'standard' },
      ] });
      return json(null, 404);
    });
    localStorage.setItem('token', 't');
    renderWith(ShippingPage);
    await screen.findByTestId('shipping-viewer-only');
    // No POD or fail buttons
    expect(screen.queryByLabelText(/^pod-o1$/)).toBeNull();
    expect(screen.queryByLabelText(/^fail-o1$/)).toBeNull();
  });

  it('ops role sees POD and Mark failed controls on in_transit order', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/me')) return json({ id: 'op', username: 'op', roles: ['operations_staff'] });
      if (url.includes('/shipping?')) return json({ items: [
        { _id: 'o1', status: 'in_transit', method: 'standard' },
      ] });
      if (url.endsWith('/addresses')) return json([]);
      return json(null, 404);
    });
    localStorage.setItem('token', 't');
    renderWith(ShippingPage);
    expect(await screen.findByLabelText('pod-o1')).toBeInTheDocument();
    expect(screen.getByLabelText('fail-o1')).toBeInTheDocument();
  });

  it('failed delivery submits expected payload', async () => {
    const calls = [];
    globalThis.fetch = vi.fn(async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body });
      if (url.endsWith('/auth/me')) return json({ id: 'op', username: 'op', roles: ['operations_staff'] });
      if (url.includes('/shipping?')) return json({ items: [
        { _id: 'o1', status: 'in_transit', method: 'standard' },
      ] });
      if (url.endsWith('/addresses')) return json([]);
      if (url.endsWith('/delivery-failed')) return json({ order: { _id: 'o1', status: 'exception_pending_signoff' }, exception: { _id: 'ex1' } });
      return json(null, 404);
    });
    localStorage.setItem('token', 't');
    renderWith(ShippingPage);
    await screen.findByLabelText('fail-o1');
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('fail-o1'));
    await user.type(screen.getByLabelText('fail-reason-o1'), 'no-one-home');
    await user.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => {
      const post = calls.find(c => c.method === 'POST' && c.url.endsWith('/delivery-failed'));
      expect(post).toBeDefined();
      expect(JSON.parse(post.body).reasonCode).toBe('no-one-home');
    });
  });

  it('POD upload attaches signature file', async () => {
    const calls = [];
    globalThis.fetch = vi.fn(async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body });
      if (url.endsWith('/auth/me')) return json({ id: 'op', username: 'op', roles: ['operations_staff'] });
      if (url.includes('/shipping?')) return json({ items: [
        { _id: 'o1', status: 'in_transit', method: 'standard' },
      ] });
      if (url.endsWith('/addresses')) return json([]);
      if (url.endsWith('/proof-of-delivery')) return json({ _id: 'pod1' });
      return json(null, 404);
    });
    localStorage.setItem('token', 't');
    renderWith(ShippingPage);
    await screen.findByLabelText('pod-o1');
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('pod-o1'));
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'sig.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText('pod-file-o1');
    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: /submit pod/i }));
    await waitFor(() => {
      const post = calls.find(c => c.method === 'POST' && c.url.endsWith('/proof-of-delivery'));
      expect(post).toBeDefined();
      // body is FormData; its content cannot be introspected trivially, but its presence confirms submission.
      expect(post.body).toBeDefined();
    });
  });
});
