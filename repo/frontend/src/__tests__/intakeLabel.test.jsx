import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntakePage } from '../pages/Intake.jsx';
import { renderWith } from './testUtils.jsx';

function json(data, status = 200) {
  return {
    ok: status < 400,
    status,
    async json() { return { success: status < 400, data, error: null, meta: {} }; },
  };
}

describe('Intake label print workflow', () => {
  it('prints a label and then switches to reprint on subsequent presses', async () => {
    const calls = [];
    globalThis.fetch = vi.fn(async (url, opts = {}) => {
      calls.push({ url, method: opts.method || 'GET' });
      if (url.endsWith('/auth/me')) return json({ id: 'op', username: 'op', roles: ['operations_staff'] });
      if (url.endsWith('/shoes/intake') && opts.method === 'POST') {
        return json({ _id: 'sh1', serial: 'SER-001', barcode: 'BC-001', brand: 'Acme', size: '10', status: 'intake_draft' }, 201);
      }
      if (url.endsWith('/shoes/label/sh1')) {
        return json({
          shoeId: 'sh1', serial: 'SER-001', barcode: 'BC-001',
          brand: 'Acme', color: '', size: '10', reprint: false,
          labelText: 'SER-001 | BC-001',
        });
      }
      if (url.endsWith('/shoes/label/sh1?reprint=1')) {
        return json({
          shoeId: 'sh1', serial: 'SER-001', barcode: 'BC-001',
          brand: 'Acme', color: '', size: '10', reprint: true,
          labelText: 'SER-001 | BC-001',
        });
      }
      return json(null, 404);
    });
    window.print = vi.fn();

    localStorage.setItem('token', 't');
    const { container } = renderWith(IntakePage);
    const user = userEvent.setup();

    // Labels in Intake are not associated via htmlFor; fill required inputs by index.
    await screen.findByText(/Shoe intake/i);
    const inputs = container.querySelectorAll('input[type="text"], input:not([type])');
    // order: ownerUserId, brand, material, color, size
    await user.type(inputs[0], 'u1');
    await user.type(inputs[1], 'Acme');
    await user.type(inputs[4], '10');
    await user.click(screen.getByRole('button', { name: /Create intake/i }));

    const printBtn = await screen.findByTestId('print-label');
    expect(printBtn.textContent).toMatch(/Print label/);
    await user.click(printBtn);

    const preview = await screen.findByTestId('label-preview');
    expect(preview.textContent).toContain('SER-001');
    expect(screen.getByTestId('label-serial').textContent).toBe('SER-001');
    expect(screen.getByTestId('label-barcode').textContent).toBe('BC-001');

    await waitFor(() => {
      expect(screen.getByTestId('print-label').textContent).toMatch(/Reprint label/);
    });

    await user.click(screen.getByTestId('print-label'));
    await waitFor(() => {
      const reprintCall = calls.find(c => c.url.endsWith('/shoes/label/sh1?reprint=1'));
      expect(reprintCall).toBeDefined();
    });
  });
});
