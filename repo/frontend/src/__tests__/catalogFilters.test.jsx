import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogPage } from '../pages/Catalog.jsx';
import { renderWith } from './testUtils.jsx';

const CATALOG = {
  services: [
    { code: 'basic-clean', name: 'Basic Clean', categoryCode: 'clean', tags: ['express'], priceCents: 1500, estimatedDurationMinutes: 30, active: true },
    { code: 'deep-clean', name: 'Deep Clean', categoryCode: 'clean', tags: ['leather','premium'], priceCents: 3500, estimatedDurationMinutes: 90, active: true },
    { code: 'sole-repair', name: 'Sole Repair', categoryCode: 'repair', tags: ['premium'], priceCents: 5000, estimatedDurationMinutes: 120, active: true },
    { code: 'polish-shine', name: 'Polish & Shine', categoryCode: 'polish', tags: ['premium'], priceCents: 2500, estimatedDurationMinutes: 45, active: true },
  ],
  categories: [
    { code: 'clean', name: 'Cleaning' },
    { code: 'repair', name: 'Repair' },
    { code: 'polish', name: 'Polish' },
  ],
  tags: [
    { code: 'express', label: 'Express' },
    { code: 'leather', label: 'Leather' },
    { code: 'premium', label: 'Premium' },
  ],
  syncedAt: new Date().toISOString(),
};

function json(data, status = 200) {
  return {
    ok: status < 400, status,
    async json() { return { success: status < 400, data, error: null, meta: {} }; },
  };
}

function installDefaultFetch() {
  globalThis.fetch = vi.fn(async (url) => {
    if (url.endsWith('/auth/me')) return json({ id: 'u1', username: 'alice', roles: ['student'], scopes: [] });
    if (url.endsWith('/catalog/services/sync')) return json(CATALOG);
    return json(null, 404);
  });
}

describe('catalog filters', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'tok');
    installDefaultFetch();
  });

  it('renders all services initially', async () => {
    renderWith(CatalogPage);
    await screen.findByTestId('svc-row-basic-clean', {}, { timeout: 3000 });
    expect(screen.getByTestId('svc-row-deep-clean')).toBeInTheDocument();
    expect(screen.getByTestId('svc-row-sole-repair')).toBeInTheDocument();
    expect(screen.getByTestId('svc-row-polish-shine')).toBeInTheDocument();
  });

  it('filters by category', async () => {
    renderWith(CatalogPage);
    await screen.findByTestId('svc-row-basic-clean', {}, { timeout: 3000 });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/category-filter/i), 'clean');
    expect(screen.getByTestId('svc-row-basic-clean')).toBeInTheDocument();
    expect(screen.getByTestId('svc-row-deep-clean')).toBeInTheDocument();
    expect(screen.queryByTestId('svc-row-sole-repair')).toBeNull();
    expect(screen.queryByTestId('svc-row-polish-shine')).toBeNull();
  });

  it('filters by tag', async () => {
    renderWith(CatalogPage);
    await screen.findByTestId('svc-row-basic-clean', {}, { timeout: 3000 });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('tag-premium'));
    expect(screen.getByTestId('svc-row-deep-clean')).toBeInTheDocument();
    expect(screen.getByTestId('svc-row-sole-repair')).toBeInTheDocument();
    expect(screen.getByTestId('svc-row-polish-shine')).toBeInTheDocument();
    expect(screen.queryByTestId('svc-row-basic-clean')).toBeNull();
  });

  it('combines search, category, and tag filters', async () => {
    renderWith(CatalogPage);
    await screen.findByTestId('svc-row-basic-clean', {}, { timeout: 3000 });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/category-filter/i), 'clean');
    await user.click(screen.getByTestId('tag-leather'));
    expect(screen.getByTestId('svc-row-deep-clean')).toBeInTheDocument();
    expect(screen.queryByTestId('svc-row-basic-clean')).toBeNull();
    await user.type(screen.getByLabelText(/search/i), 'nomatch');
    await waitFor(() => expect(screen.queryByTestId('svc-row-deep-clean')).toBeNull());
  });

  it('falls back to cached catalog and shows offline banner when sync fails', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/me')) return json({ id: 'u2', username: 'b', roles: ['student'] });
      return { ok: false, status: 500, async json() { return { success: false, error: { code: 'ERR', message: 'down' } }; } };
    });
    renderWith(CatalogPage);
    await screen.findByText(/offline \(cached\)/i);
    expect(screen.getByText(/no services match/i)).toBeInTheDocument();
  });
});
