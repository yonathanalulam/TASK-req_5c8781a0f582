import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export function ContractsPage() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ contractNumber: '', facilityUnit: '', lessorName: '', lesseeName: '', startDate: '', endDate: '' });

  async function load() {
    try { setItems((await api('/contracts?limit=100')).items || []); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault(); setErr(null);
    try {
      await api('/contracts', { method: 'POST', body: form });
      setShowNew(false); setForm({ contractNumber: '', facilityUnit: '', lessorName: '', lesseeName: '', startDate: '', endDate: '' });
      await load();
    } catch (e) { setErr(e.message); }
  }

  async function act(id, action, body = {}) {
    try { await api(`/contracts/${id}/${action}`, { method: 'POST', body }); await load(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <div className="card">
      <div className="row"><h2 style={{ margin: 0, flex: 1 }}>Contracts</h2>
        <button onClick={() => setShowNew(!showNew)}>{showNew ? 'Cancel' : 'New contract'}</button>
      </div>
      {err && <div className="error">{err}</div>}
      {showNew && (
        <form onSubmit={create} className="formstack">
          <div className="grid2">
            <div><label>Number</label><input value={form.contractNumber} onChange={e => setForm({ ...form, contractNumber: e.target.value })} required /></div>
            <div><label>Facility unit</label><input value={form.facilityUnit} onChange={e => setForm({ ...form, facilityUnit: e.target.value })} required /></div>
            <div><label>Lessor</label><input value={form.lessorName} onChange={e => setForm({ ...form, lessorName: e.target.value })} required /></div>
            <div><label>Lessee</label><input value={form.lesseeName} onChange={e => setForm({ ...form, lesseeName: e.target.value })} required /></div>
            <div><label>Start</label><input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} required /></div>
            <div><label>End</label><input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} required /></div>
          </div>
          <button>Create draft</button>
        </form>
      )}
      <table>
        <thead><tr><th>Number</th><th>Unit</th><th>Dates</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {items.map(c => (
            <tr key={c._id}>
              <td>{c.contractNumber}</td>
              <td>{c.facilityUnit}</td>
              <td className="muted">{c.startDate?.slice(0, 10)} → {c.endDate?.slice(0, 10)}</td>
              <td><span className="pill">{c.status}</span></td>
              <td className="row">
                {c.status === 'draft' && <button onClick={() => act(c._id, 'activate')}>Activate</button>}
                {['active','amended'].includes(c.status) && <button onClick={() => {
                  const reason = prompt('Amendment reason?'); if (reason) act(c._id, 'amend', { reason });
                }}>Amend</button>}
                {['active','pending_renewal','expired'].includes(c.status) && <button onClick={() => {
                  const newEndDate = prompt('New end date (YYYY-MM-DD)?'); if (newEndDate) act(c._id, 'renew', { newEndDate });
                }}>Renew</button>}
                {['active','amended','pending_renewal','renewed','expired'].includes(c.status) && <button onClick={() => {
                  const d = prompt('Termination date (YYYY-MM-DD)?'); const r = d && prompt('Reason?');
                  if (d && r) act(c._id, 'terminate', { terminationEffectiveDate: d, reason: r });
                }}>Terminate</button>}
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan="5" className="muted">No contracts.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
