import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export function AuditPage() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);
  const [verify, setVerify] = useState(null);

  async function load() {
    try { setItems((await api('/admin/audit?limit=100')).items || []); }
    catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function verifyChain() {
    setVerify(null);
    try { setVerify(await api('/admin/audit/verify', { method: 'POST', body: {} })); }
    catch (e) { setErr(e.message); }
  }

  return (
    <>
      <div className="card">
        <div className="row">
          <h2 style={{ flex: 1, margin: 0 }}>Audit log</h2>
          <button onClick={verifyChain}>Verify chain integrity</button>
        </div>
        {verify && <div className={verify.valid ? 'success' : 'error'}>
          {verify.valid ? `Chain valid (${verify.checked} entries)` : `Chain BROKEN at seq ${verify.broken?.seq}`}
        </div>}
        {err && <div className="error">{err}</div>}
      </div>
      <div className="card">
        <table>
          <thead><tr><th>#</th><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Outcome</th></tr></thead>
          <tbody>
            {items.map(e => (
              <tr key={e._id}>
                <td>{e.seq}</td>
                <td className="muted">{new Date(e.timestamp).toLocaleString()}</td>
                <td>{e.actorUsername || '—'}</td>
                <td><code>{e.action}</code></td>
                <td className="muted">{e.entityType} {e.entityId ? `:${String(e.entityId).slice(-6)}` : ''}</td>
                <td><span className={`pill ${e.outcome === 'success' ? 'success' : (e.outcome === 'failure' ? 'failed' : 'pending')}`}>{e.outcome}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
