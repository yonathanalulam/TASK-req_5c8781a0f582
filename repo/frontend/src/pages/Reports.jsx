import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

export function ReportsPage() {
  const [kpi, setKpi] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api('/reports/kpis').then(setKpi).catch(e => setErr(e.message)); }, []);
  if (err) return <div className="error">{err}</div>;
  if (!kpi) return <div>Loading…</div>;
  const cells = [
    ['Active contracts', kpi.activeContracts],
    ['Expiring ≤7d', kpi.expiring.within7Days],
    ['Expiring ≤30d', kpi.expiring.within30Days],
    ['Expiring ≤90d', kpi.expiring.within90Days],
    ['Reconciliations pending', kpi.reconciliations.pending],
    ['Reconciliations overdue', kpi.reconciliations.overdue],
    ['Intake last 24h', kpi.intake.last24h],
    ['Intake last 7d', kpi.intake.last7days],
    ['Avg turnaround', kpi.turnaroundMs ? `${Math.round(kpi.turnaroundMs / 3600000)}h` : '—'],
    ['Delivery rate', kpi.delivery.successRate != null ? `${(kpi.delivery.successRate * 100).toFixed(1)}%` : '—'],
    ['Scan compliance', kpi.scanCompliance.rate != null ? `${(kpi.scanCompliance.rate * 100).toFixed(1)}%` : '—'],
    ['Appeal approval rate', kpi.appealApprovalRate != null ? `${(kpi.appealApprovalRate * 100).toFixed(1)}%` : '—'],
  ];
  return (
    <>
      <div className="grid3">
        {cells.map(([label, v]) => (
          <div key={label} className="card"><div className="muted">{label}</div><div style={{ fontSize: 28, fontWeight: 600 }}>{v}</div></div>
        ))}
      </div>
      <div className="card">
        <h3>Tag counts</h3>
        <ul>{Object.entries(kpi.tagCounts || {}).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>
      </div>
      <div className="card">
        <h3>Exceptions by type</h3>
        <ul>{Object.entries(kpi.exceptionsByType || {}).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>
      </div>
      <div className="muted">Generated {kpi.generatedAt}</div>
    </>
  );
}
