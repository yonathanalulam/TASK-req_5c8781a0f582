import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { upsertCatalog, getCatalog, getMeta, toggleFavorite, getFavorites, recordHistory, getHistory } from '../services/db';
import { useAuth } from '../store/auth.jsx';

export function CatalogPage() {
  const { hasAnyRole, hasRole } = useAuth();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [tagOptions, setTagOptions] = useState([]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');
  const [favoritesOnly, setFavOnly] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);
  const [offline, setOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tagFilters, setTagFilters] = useState([]);
  const [selected, setSelected] = useState([]);

  async function sync() {
    try {
      const r = await api('/catalog/services/sync');
      await upsertCatalog(r.services || []);
      setItems(r.services || []);
      setCategories(r.categories || []);
      setTagOptions(r.tags || []);
      setCachedAt(r.syncedAt);
      setOffline(false);
    } catch (e) {
      setOffline(true);
      const cached = await getCatalog();
      setItems(cached);
      // Derive categories/tags from cached catalog when offline.
      const catSet = new Set(); const tagSet = new Set();
      for (const s of cached) {
        if (s.categoryCode) catSet.add(s.categoryCode);
        for (const t of (s.tags || [])) tagSet.add(t);
      }
      setCategories([...catSet].map(c => ({ code: c, name: c })));
      setTagOptions([...tagSet].map(t => ({ code: t, label: t })));
      setCachedAt(await getMeta('catalogLastSync'));
    }
  }

  useEffect(() => {
    sync();
    getFavorites().then(setFavorites);
    getHistory().then(setHistory);
  }, []);

  const filtered = useMemo(() => {
    let arr = items.filter(s => s.active !== false);
    if (favoritesOnly) arr = arr.filter(s => favorites.includes(s.code));
    if (categoryFilter) arr = arr.filter(s => s.categoryCode === categoryFilter);
    if (tagFilters.length) arr = arr.filter(s => {
      const st = s.tags || [];
      return tagFilters.every(t => st.includes(t));
    });
    if (q.trim()) {
      const needle = q.toLowerCase();
      arr = arr.filter(s => (s.name + ' ' + s.code + ' ' + (s.description || '') + ' ' + (s.tags || []).join(' ')).toLowerCase().includes(needle));
    }
    if (sort === 'price_asc') arr = [...arr].sort((a, b) => (a.priceCents || 0) - (b.priceCents || 0));
    else if (sort === 'price_desc') arr = [...arr].sort((a, b) => (b.priceCents || 0) - (a.priceCents || 0));
    else if (sort === 'duration_asc') arr = [...arr].sort((a, b) => (a.estimatedDurationMinutes || 0) - (b.estimatedDurationMinutes || 0));
    else if (sort === 'duration_desc') arr = [...arr].sort((a, b) => (b.estimatedDurationMinutes || 0) - (a.estimatedDurationMinutes || 0));
    else arr = [...arr].sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [items, q, sort, favorites, favoritesOnly, categoryFilter, tagFilters]);

  async function fav(code) {
    await toggleFavorite(code);
    setFavorites(await getFavorites());
  }
  async function visit(code) {
    await recordHistory(code);
    setHistory(await getHistory());
  }
  function toggleSelect(code) {
    setSelected(s => s.includes(code) ? s.filter(c => c !== code) : [...s, code]);
  }
  function toggleTag(code) {
    setTagFilters(t => t.includes(code) ? t.filter(c => c !== code) : [...t, code]);
  }

  const canRequest = hasRole('student') || hasAnyRole('operations_staff', 'department_admin');

  return (
    <>
      <div className="card">
        <div className="row">
          <input aria-label="search" placeholder="Search services…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 240 }} />
          <select aria-label="category-filter" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c.code} value={c.code}>{c.name || c.code}</option>)}
          </select>
          <select aria-label="sort" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="name">Name</option>
            <option value="price_asc">Price ↑</option>
            <option value="price_desc">Price ↓</option>
            <option value="duration_asc">Duration ↑</option>
            <option value="duration_desc">Duration ↓</option>
          </select>
          <label><input type="checkbox" checked={favoritesOnly} onChange={e => setFavOnly(e.target.checked)} /> Favorites only</label>
          <button onClick={sync}>Sync</button>
          <span className={`status ${offline ? 'offline' : 'online'}`}>{offline ? 'offline (cached)' : 'live'}</span>
          {cachedAt && <span className="muted">cached: {new Date(cachedAt).toLocaleString()}</span>}
        </div>
        <div className="row" style={{ marginTop: 8 }} aria-label="tag-filters">
          <span className="muted">Tags:</span>
          {tagOptions.length === 0 && <span className="muted">none</span>}
          {tagOptions.map(t => (
            <button
              type="button"
              key={t.code}
              data-testid={`tag-${t.code}`}
              className={`pill ${tagFilters.includes(t.code) ? 'success' : ''}`}
              onClick={() => toggleTag(t.code)}
              aria-pressed={tagFilters.includes(t.code)}
            >
              {t.label || t.code}
            </button>
          ))}
          {(tagFilters.length > 0 || categoryFilter) && (
            <button type="button" onClick={() => { setTagFilters([]); setCategoryFilter(''); }}>Clear filters</button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="row">
          <span className="muted" style={{ flex: 1 }}>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
          {canRequest && selected.length > 0 && (
            <Link to={`/service-request/new?codes=${selected.join(',')}`}>Request {selected.length} selected →</Link>
          )}
        </div>
        <table>
          <thead>
            <tr><th></th><th></th><th>Name</th><th>Category</th><th>Tags</th><th>Price</th><th>Duration</th></tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.code} data-testid={`svc-row-${s.code}`} onClick={() => visit(s.code)}>
                <td><input type="checkbox" aria-label={`select-${s.code}`} checked={selected.includes(s.code)} onChange={() => toggleSelect(s.code)} onClick={(e) => e.stopPropagation()} /></td>
                <td><button onClick={(e) => { e.stopPropagation(); fav(s.code); }} aria-label={`fav-${s.code}`}>{favorites.includes(s.code) ? '★' : '☆'}</button></td>
                <td>{s.name} <span className="muted">({s.code})</span></td>
                <td>{s.categoryCode || '—'}</td>
                <td>{(s.tags || []).map(t => <span key={t} className="pill">{t}</span>)}</td>
                <td>${((s.priceCents || 0) / 100).toFixed(2)}</td>
                <td>{s.estimatedDurationMinutes || 0} min</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan="7" className="muted">No services match the current filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {history.length > 0 && (
        <div className="card">
          <h3>Recently viewed (on-device)</h3>
          <div>{history.slice(0, 10).map(h => <span key={h.id} className="pill">{h.code}</span>)}</div>
        </div>
      )}

      {hasAnyRole && hasAnyRole('department_admin') && <AdminCatalogEditor onChanged={sync} />}
    </>
  );
}

function AdminCatalogEditor({ onChanged }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [priceCents, setPriceCents] = useState(0);
  const [duration, setDuration] = useState(0);
  const [err, setErr] = useState(null);

  async function create(e) {
    e.preventDefault(); setErr(null);
    try {
      await api('/catalog/services', { method: 'POST', body: { code, name, priceCents, estimatedDurationMinutes: duration, active: true } });
      setCode(''); setName(''); setPriceCents(0); setDuration(0);
      onChanged && onChanged();
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="card">
      <h3>Add service (admin)</h3>
      <form onSubmit={create} className="row">
        <input placeholder="code" value={code} onChange={e => setCode(e.target.value)} required />
        <input placeholder="name" value={name} onChange={e => setName(e.target.value)} required style={{ flex: 1 }} />
        <input type="number" placeholder="price (cents)" value={priceCents} onChange={e => setPriceCents(parseInt(e.target.value || '0', 10))} />
        <input type="number" placeholder="duration (min)" value={duration} onChange={e => setDuration(parseInt(e.target.value || '0', 10))} />
        <button>Create</button>
      </form>
      {err && <div className="error">{err}</div>}
    </div>
  );
}
