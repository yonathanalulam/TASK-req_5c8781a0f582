import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppealsPage } from '../pages/Appeals.jsx';
import { renderWith } from './testUtils.jsx';

function json(data, status = 200) {
  return {
    ok: status < 400,
    status,
    async json() { return { success: status < 400, data, error: null, meta: {} }; },
  };
}

describe('Appeals page — evidence attachment flow', () => {
  it('renders a file picker that accepts multiple files', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/me')) return json({ id: 'u1', username: 'stu', roles: ['student'] });
      if (url.endsWith('/appeals')) return json({ items: [] });
      if (url.endsWith('/exceptions')) return json({ items: [] });
      return json(null, 404);
    });
    localStorage.setItem('token', 't');
    renderWith(AppealsPage);
    const input = await screen.findByTestId('evidence-input');
    expect(input).toBeInTheDocument();
    expect(input.multiple).toBe(true);
    expect(input.type).toBe('file');
  });

  it('submits appeal with multiple evidence files as FormData under the evidence field', async () => {
    const calls = [];
    globalThis.fetch = vi.fn(async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET', body: opts.body, headers: opts.headers });
      if (url.endsWith('/auth/me')) return json({ id: 'u1', username: 'stu', roles: ['student'] });
      if (url.endsWith('/appeals') && (!opts.method || opts.method === 'GET')) return json({ items: [] });
      if (url.endsWith('/exceptions')) return json({ items: [] });
      if (url.endsWith('/appeals') && opts.method === 'POST') return json({ _id: 'apl1', status: 'submitted' }, 201);
      return json(null, 404);
    });
    localStorage.setItem('token', 't');
    renderWith(AppealsPage);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Exception ID/i), 'ex-123');
    await user.type(screen.getByLabelText(/^Rationale$/i), 'Please reconsider');

    const file1 = new File([new Uint8Array([1, 2, 3])], 'note.txt', { type: 'text/plain' });
    const file2 = new File([new Uint8Array([4, 5])], 'photo.png', { type: 'image/png' });
    const input = screen.getByTestId('evidence-input');
    await user.upload(input, [file1, file2]);

    // Files should appear in selected list before submit
    const list = await screen.findByTestId('evidence-list');
    expect(list.textContent).toContain('note.txt');
    expect(list.textContent).toContain('photo.png');

    await user.click(screen.getByRole('button', { name: /Submit appeal/i }));

    await waitFor(() => {
      const post = calls.find(c => c.method === 'POST' && c.url.endsWith('/appeals'));
      expect(post).toBeDefined();
      expect(post.body).toBeInstanceOf(FormData);
      const evidenceEntries = post.body.getAll('evidence');
      expect(evidenceEntries.length).toBe(2);
      const names = evidenceEntries.map(f => f.name);
      expect(names).toContain('note.txt');
      expect(names).toContain('photo.png');
      expect(post.body.get('exceptionId')).toBe('ex-123');
      expect(post.body.get('rationale')).toBe('Please reconsider');
      expect(post.headers['Idempotency-Key']).toBeDefined();
    });
  });

  it('shows a validation error when neither rationale nor evidence is provided', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/me')) return json({ id: 'u1', username: 'stu', roles: ['student'] });
      if (url.endsWith('/appeals')) return json({ items: [] });
      if (url.endsWith('/exceptions')) return json({ items: [] });
      return json(null, 404);
    });
    localStorage.setItem('token', 't');
    renderWith(AppealsPage);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Exception ID/i), 'ex-123');
    await user.click(screen.getByRole('button', { name: /Submit appeal/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/rationale|evidence/i);
  });

  it('removes a selected evidence file when the remove button is clicked', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/me')) return json({ id: 'u1', username: 'stu', roles: ['student'] });
      if (url.endsWith('/appeals')) return json({ items: [] });
      if (url.endsWith('/exceptions')) return json({ items: [] });
      return json(null, 404);
    });
    localStorage.setItem('token', 't');
    renderWith(AppealsPage);
    const user = userEvent.setup();

    await screen.findByTestId('evidence-input');
    const file = new File([new Uint8Array([1])], 'only.txt', { type: 'text/plain' });
    await user.upload(screen.getByTestId('evidence-input'), file);
    const list = await screen.findByTestId('evidence-list');
    expect(list.textContent).toContain('only.txt');
    await user.click(screen.getByLabelText('remove-only.txt'));
    await waitFor(() => {
      expect(screen.queryByTestId('evidence-list')).toBeNull();
    });
  });
});
