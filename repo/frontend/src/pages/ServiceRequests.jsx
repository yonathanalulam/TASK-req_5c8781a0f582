import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../store/auth.jsx';

export function ServiceRequestsPage() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);

  async function load() {
    try { setItems((await api('/service-requests')).items || []); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="card">
        <div className="row">
          <h2 style={{ flex: 1, margin: 0 }}>My service requests</h2>
          <Link to="/service-request/new">+ New request</Link>
        </div>
        {err && <div className="error">{err}</div>}
      </div>
      <div className="card">
        <table>
          <thead><tr><th>ID</th><th>Services</th><th>Status</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {items.map(s => (
              <tr key={s._id} data-testid={`sr-row-${s._id}`}>
                <td><code>{String(s._id).slice(-8)}</code></td>
                <td data-testid={`sr-codes-${s._id}`}>{(s.serviceCodes || []).join(', ')}</td>
                <td><span className="pill">{s.status}</span></td>
                <td className="muted">{new Date(s.createdAt).toLocaleString()}</td>
                <td><Link to={`/service-request/${s._id}`}>view</Link></td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan="5" className="muted">No service requests yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NewServiceRequestPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const [catalog, setCatalog] = useState([]);
  const [codes, setCodes] = useState([]);
  const [shoeProfileId, setShoe] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/catalog/services?limit=200').then(r => setCatalog(r.items || [])).catch(() => {});
    const pre = new URLSearchParams(loc.search).get('codes');
    if (pre) setCodes(pre.split(',').filter(Boolean));
  }, [loc.search]);

  function toggle(code) {
    setCodes(c => c.includes(code) ? c.filter(x => x !== code) : [...c, code]);
  }

  async function submit(e) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      if (codes.length === 0) throw new Error('Select at least one service');
      const r = await api('/service-requests', {
        method: 'POST',
        body: { serviceCodes: codes, shoeProfileId: shoeProfileId || undefined, notes: notes || undefined },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      nav(`/service-request/${r._id}`);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card formstack">
      <h2>New service request</h2>
      <form onSubmit={submit}>
        <label>Services</label>
        <div className="row">
          {catalog.filter(s => s.active !== false).map(s => (
            <label key={s.code} className="pill" style={{ cursor: 'pointer' }}>
              <input type="checkbox" aria-label={`svc-${s.code}`} checked={codes.includes(s.code)} onChange={() => toggle(s.code)} /> {s.name} (${((s.priceCents || 0) / 100).toFixed(2)})
            </label>
          ))}
          {catalog.length === 0 && <span className="muted">No services available.</span>}
        </div>
        <label>Linked shoe profile ID (optional)</label>
        <input value={shoeProfileId} onChange={e => setShoe(e.target.value)} placeholder="e.g. shoe-id from intake" />
        <label>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} />
        {err && <div className="error">{err}</div>}
        <div className="row">
          <button type="submit" disabled={busy || codes.length === 0}>{busy ? 'Submitting…' : 'Submit request'}</button>
          <Link to="/service-requests">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

export function ServiceRequestDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const nav = useNavigate();

  async function load() {
    try { setData(await api(`/service-requests/${id}`)); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [id]);

  async function cancel() {
    if (!confirm('Cancel this request?')) return;
    try { await api(`/service-requests/${id}/cancel`, { method: 'POST', body: {} }); await load(); }
    catch (e) { setErr(e.message); }
  }

  if (err) return <div className="error">{err}</div>;
  if (!data) return <div>Loading…</div>;
  const sr = data.request;

  return (
    <div>
      <div className="card">
        <div className="row">
          <h2 style={{ flex: 1, margin: 0 }}>Service request {String(sr._id).slice(-8)}</h2>
          <Link to="/service-requests">Back</Link>
        </div>
        <div>Status: <span className="pill">{sr.status}</span></div>
        <div>Services: {(sr.serviceCodes || []).join(', ')}</div>
        <div className="muted">Created {new Date(sr.createdAt).toLocaleString()}</div>
        {sr.notes && <div>Notes: {sr.notes}</div>}
      </div>
      {data.shoe && (
        <div className="card">
          <h3>Linked shoe</h3>
          <div>Barcode <code>{data.shoe.barcode}</code> · Serial <code>{data.shoe.serial}</code></div>
          <div>{data.shoe.brand} · {data.shoe.color} · size {data.shoe.size}</div>
          <div>Status: <span className="pill">{data.shoe.status}</span></div>
        </div>
      )}
      <div className="card">
        <h3>Requested services</h3>
        <ul>
          {(data.catalog || []).map(c => <li key={c.code}>{c.name} — ${((c.priceCents || 0) / 100).toFixed(2)} · {c.estimatedDurationMinutes || 0} min</li>)}
        </ul>
      </div>
      {['submitted','draft','accepted'].includes(sr.status) && (
        <div className="card">
          <button onClick={cancel}>Cancel request</button>
        </div>
      )}
    </div>
  );
}
