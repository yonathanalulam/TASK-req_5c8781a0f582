import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export function ExpirationDashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api('/contracts/expirations').then(setData).catch(e => setErr(e.message)); }, []);
  if (err) return <div className="error">{err}</div>;
  if (!data) return <div>Loading…</div>;
  return (
    <div className="grid3">
      {['within7Days','within30Days','within90Days'].map(k => (
        <div key={k} className="card">
          <h3>{k.replace(/([A-Z])/g, ' $1').replace('within', 'Within')}</h3>
          <div style={{ fontSize: 32, fontWeight: 600 }}>{data[k].length}</div>
          <ul className="muted">
            {data[k].slice(0, 10).map(c => <li key={c._id}>{c.contractNumber} ({c.endDate?.slice(0,10)})</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}
