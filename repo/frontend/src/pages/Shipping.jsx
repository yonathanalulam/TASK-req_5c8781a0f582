import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../store/auth.jsx';
import { useOfflineQueue } from '../store/offlineQueue.jsx';

export function ShippingPage() {
  const { hasAnyRole } = useAuth();
  const canAct = hasAnyRole('operations_staff', 'department_admin');
  const [items, setItems] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [err, setErr] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ shoeProfileId: '', addressId: '', fulfillmentOperator: 'ops1' });
  const { enqueue, isOnline } = useOfflineQueue();

  async function load() {
    try {
      setItems((await api('/shipping?limit=100')).items || []);
      if (canAct) setAddresses((await api('/addresses')) || []);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, [canAct]);

  async function createOrder(e) {
    e.preventDefault(); setErr(null);
    try {
      const body = form;
      const key = crypto.randomUUID();
      if (isOnline) {
        await api('/shipping', { method: 'POST', body, headers: { 'Idempotency-Key': key } });
      } else {
        await enqueue({ path: '/shipping', method: 'POST', body: { ...body, offline: true, offlineCreatedAt: new Date().toISOString() } });
      }
      await load();
    } catch (e) { setErr(e.message); }
  }

  async function transition(id, to) {
    try { await api(`/shipping/${id}/transition`, { method: 'POST', body: { to } }); await load(); }
    catch (e) { setErr(e.message); }
  }

  return (
    <>
      <div className="card">
        <h2>Shipping orders</h2>
        {canAct && (
          <form onSubmit={createOrder} className="row">
            <input aria-label="shoeProfileId" placeholder="shoeProfileId" value={form.shoeProfileId} onChange={e => setForm({ ...form, shoeProfileId: e.target.value })} required />
            <select aria-label="addressId" value={form.addressId} onChange={e => setForm({ ...form, addressId: e.target.value })} required>
              <option value="">Select address…</option>
              {addresses.map(a => <option key={a.id} value={a.id}>{a.label} · {a.maskedPreview || a.postalCode}</option>)}
            </select>
            <input aria-label="operator" placeholder="operator" value={form.fulfillmentOperator} onChange={e => setForm({ ...form, fulfillmentOperator: e.target.value })} required />
            <button>Create{!isOnline ? ' (queue offline)' : ''}</button>
          </form>
        )}
        {!canAct && <div className="muted" data-testid="shipping-viewer-only">You are viewing your own shipping status; operational actions are not available for your role.</div>}
        {err && <div className="error">{err}</div>}
      </div>
      <div className="card">
        <table>
          <thead><tr><th>ID</th><th>Status</th><th>Method</th><th>Actions</th></tr></thead>
          <tbody>
            {items.map(o => (
              <React.Fragment key={o._id}>
                <tr>
                  <td><button onClick={() => setExpanded(expanded === o._id ? null : o._id)} aria-label={`expand-${o._id}`}>{expanded === o._id ? '▼' : '▶'}</button> <code>{String(o._id).slice(-8)}</code></td>
                  <td><span className="pill" data-testid={`status-${o._id}`}>{o.status}</span></td>
                  <td>{o.method}</td>
                  <td className="row">
                    {canAct && o.status === 'draft' && <button onClick={() => transition(o._id, 'ready_to_ship')}>Ready</button>}
                    {canAct && o.status === 'ready_to_ship' && <button onClick={() => transition(o._id, 'in_transit')}>In transit</button>}
                    {canAct && o.status === 'in_transit' && <FailedDeliveryButton orderId={o._id} onDone={load} />}
                    {canAct && o.status === 'in_transit' && <PODButton orderId={o._id} onDone={load} />}
                    {canAct && o.status === 'delivered' && <button onClick={() => transition(o._id, 'closed')}>Close</button>}
                    {canAct && o.status === 'exception_pending_signoff' && <SignoffButton order={o} onDone={load} />}
                  </td>
                </tr>
                {expanded === o._id && <OrderDetail orderId={o._id} />}
              </React.Fragment>
            ))}
            {items.length === 0 && <tr><td colSpan="4" className="muted">No shipping orders.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function OrderDetail({ orderId }) {
  const [data, setData] = useState(null);
  useEffect(() => { api(`/shipping/${orderId}`).then(setData).catch(() => setData(null)); }, [orderId]);
  if (!data) return <tr><td colSpan="4" className="muted">Loading details…</td></tr>;
  const pod = data.proofOfDelivery;
  return (
    <tr>
      <td colSpan="4">
        <div className="card" style={{ marginTop: 6 }}>
          <div><strong>Proof of delivery:</strong> {pod ? `Delivered ${new Date(pod.deliveredAt).toLocaleString()}${pod.recipientName ? ' to ' + pod.recipientName : ''}` : 'not captured'}</div>
          {pod && pod.overrideReason && <div className="warn">Override by admin: {pod.overrideReason}</div>}
          {(data.deliveryExceptions || []).length > 0 && (
            <div>
              <strong>Delivery exceptions:</strong>
              <ul>{data.deliveryExceptions.map(e => (
                <li key={e._id}>{e.reasonCode} {e.signedOffBy ? '✔ signed off' : '· pending sign-off'}</li>
              ))}</ul>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function PODButton({ orderId, onDone }) {
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const fd = new FormData();
      if (file) fd.append('signature', file);
      if (recipient) fd.append('recipientName', recipient);
      if (notes) fd.append('notes', notes);
      await api(`/shipping/${orderId}/proof-of-delivery`, { method: 'POST', formData: fd });
      setOpen(false); setRecipient(''); setFile(null); setNotes('');
      onDone && onDone();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  if (!open) return <button onClick={() => setOpen(true)} aria-label={`pod-${orderId}`}>POD</button>;
  return (
    <div className="card" style={{ position: 'absolute', zIndex: 3, width: 320 }} role="dialog">
      <form onSubmit={submit}>
        <label>Recipient name</label>
        <input value={recipient} onChange={e => setRecipient(e.target.value)} />
        <label>Signature photo (JPEG/PNG)</label>
        <input type="file" accept="image/jpeg,image/png" onChange={e => setFile(e.target.files[0] || null)} aria-label={`pod-file-${orderId}`} />
        <label>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} />
        {err && <div className="error">{err}</div>}
        <div className="row">
          <button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit POD'}</button>
          <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function FailedDeliveryButton({ orderId, onDone }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [steps, setSteps] = useState('');
  const [err, setErr] = useState(null);
  async function submit(e) {
    e.preventDefault(); setErr(null);
    try {
      await api(`/shipping/${orderId}/delivery-failed`, { method: 'POST', body: { reasonCode: reason, remediationSteps: steps } });
      setOpen(false); setReason(''); setSteps(''); onDone && onDone();
    } catch (e) { setErr(e.message); }
  }
  if (!open) return <button onClick={() => setOpen(true)} aria-label={`fail-${orderId}`}>Mark failed</button>;
  return (
    <div className="card" style={{ position: 'absolute', zIndex: 3, width: 320 }} role="dialog">
      <form onSubmit={submit}>
        <label>Reason code</label>
        <input aria-label={`fail-reason-${orderId}`} value={reason} onChange={e => setReason(e.target.value)} required />
        <label>Remediation steps</label>
        <textarea value={steps} onChange={e => setSteps(e.target.value)} />
        {err && <div className="error">{err}</div>}
        <div className="row">
          <button type="submit">Submit</button>
          <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function SignoffButton({ order, onDone }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [followUp, setFollowUp] = useState('returned');
  const [exceptions, setExceptions] = useState([]);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api(`/shipping/${order._id}`).then(d => setExceptions(d.deliveryExceptions || [])).catch(() => {});
  }, [order._id]);
  async function submit(e) {
    e.preventDefault(); setErr(null);
    try {
      const last = exceptions[exceptions.length - 1];
      if (!last) throw new Error('No delivery exception found to sign off');
      await api(`/shipping/${order._id}/delivery-exception/signoff`, {
        method: 'POST',
        body: { exceptionId: last._id, notes, followUpStatus: followUp },
      });
      setOpen(false); onDone && onDone();
    } catch (e) { setErr(e.message); }
  }
  if (!open) return <button onClick={() => setOpen(true)} aria-label={`signoff-${order._id}`}>Sign off</button>;
  return (
    <div className="card" style={{ position: 'absolute', zIndex: 3, width: 320 }} role="dialog">
      <form onSubmit={submit}>
        <label>Follow-up status</label>
        <select value={followUp} onChange={e => setFollowUp(e.target.value)}>
          <option value="returned">returned</option>
          <option value="ready_to_ship">ready_to_ship (retry)</option>
          <option value="closed_exception">closed_exception</option>
        </select>
        <label>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} />
        {err && <div className="error">{err}</div>}
        <div className="row">
          <button type="submit">Sign off</button>
          <button type="button" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
