import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { useOfflineQueue } from '../store/offlineQueue.jsx';

const EVENT_TYPES = [
  'handoff','service_start','service_complete','quality_check','rework_assigned',
  'ready_for_delivery','shipping_prepared','in_transit','delivered','delivery_exception',
  'picked_up','returned_to_office','exception_hold_applied','exception_hold_cleared',
];

export function ScanPage() {
  const [barcode, setBarcode] = useState('');
  const [eventType, setEventType] = useState('handoff');
  const [toState, setToState] = useState('');
  const [station, setStation] = useState('STATION-1');
  const [notes, setNotes] = useState('');
  const [manual, setManual] = useState(false);
  const [manualReason, setManualReason] = useState('');
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const inputRef = useRef();
  const { enqueue, isOnline } = useOfflineQueue();

  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  async function submit(e) {
    e.preventDefault(); setErr(null); setResult(null);
    const body = { barcode, eventType, toState: toState || undefined, station, notes, manualEntry: manual, manualEntryReason: manualReason || undefined };
    try {
      if (isOnline) {
        const r = await api('/custody/scan', { method: 'POST', body, headers: { 'Idempotency-Key': crypto.randomUUID() } });
        setResult(r);
      } else {
        const key = await enqueue({ path: '/custody/scan', method: 'POST', body });
        setResult({ queuedOffline: true, idempotencyKey: key });
      }
      setBarcode('');
    } catch (e) { setErr(e.message || 'Scan failed'); }
    finally { inputRef.current && inputRef.current.focus(); }
  }

  async function lookup() {
    setResult(null); setErr(null);
    try { setResult(await api(`/custody/lookup?barcode=${encodeURIComponent(barcode)}`)); }
    catch (e) { setErr(e.message); }
  }

  return (
    <div className="card">
      <h2>Scan custody event</h2>
      <form onSubmit={submit} className="formstack">
        <label>Barcode (scanner-as-keyboard: enter auto-submits)</label>
        <input ref={inputRef} value={barcode} onChange={e => setBarcode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && barcode.length >= 8) {} }} autoFocus required />
        <div className="grid3">
          <div><label>Event type</label>
            <select value={eventType} onChange={e => setEventType(e.target.value)}>
              {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label>Target state (required for handoff)</label>
            <input value={toState} onChange={e => setToState(e.target.value)} placeholder="e.g. in_service_queue" />
          </div>
          <div><label>Station</label>
            <input value={station} onChange={e => setStation(e.target.value)} />
          </div>
        </div>
        <label>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} />
        <label><input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} /> Manual entry (scanner fallback — audit flagged)</label>
        {manual && <><label>Reason for manual entry</label><input value={manualReason} onChange={e => setManualReason(e.target.value)} required={manual} /></>}
        <div className="row">
          <button type="submit">Submit scan</button>
          <button type="button" onClick={lookup} disabled={!barcode}>Lookup only</button>
        </div>
      </form>
      {err && <div className="error">{err}</div>}
      {result && <pre className="card" style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
