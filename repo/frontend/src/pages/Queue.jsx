import React from 'react';
import { useOfflineQueue } from '../store/offlineQueue.jsx';

export function QueuePage() {
  const { queue, isOnline, replay } = useOfflineQueue();
  return (
    <div className="card">
      <div className="row">
        <h2 style={{ flex: 1, margin: 0 }}>Offline queue</h2>
        <span className={`status ${isOnline ? 'online' : 'offline'}`}>{isOnline ? 'online' : 'offline'}</span>
        <button onClick={replay} disabled={!isOnline}>Replay now</button>
      </div>
      <table>
        <thead><tr><th>Key</th><th>Path</th><th>Method</th><th>Retries</th><th>Status</th><th>Error</th></tr></thead>
        <tbody>
          {queue.map(q => (
            <tr key={q.idempotencyKey}>
              <td><code>{q.idempotencyKey.slice(0, 8)}</code></td>
              <td>{q.path}</td>
              <td>{q.method}</td>
              <td>{q.retryCount || 0}</td>
              <td><span className={`pill ${q.status === 'manual_review_required' ? 'failed' : (q.status === 'failed' ? 'pending' : 'success')}`}>{q.status || 'pending'}</span></td>
              <td className="muted">{q.lastError || '—'}</td>
            </tr>
          ))}
          {queue.length === 0 && <tr><td colSpan="6" className="muted">Queue empty.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
