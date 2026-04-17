import React, { useState } from 'react';
import { api } from '../services/api';

export function IntakePage() {
  const [form, setForm] = useState({ ownerUserId: '', brand: '', material: '', color: '', size: '', defectNotes: '' });
  const [profile, setProfile] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [err, setErr] = useState(null);
  const [duplicateOk, setDupOk] = useState(false);
  const [dupReason, setDupReason] = useState('');
  const [label, setLabel] = useState(null);
  const [labelPrintedCount, setLabelPrintedCount] = useState(0);

  const upd = k => e => setForm({ ...form, [k]: e.target.value });

  async function createIntake(e) {
    e.preventDefault(); setErr(null);
    try {
      const r = await api('/shoes/intake', {
        method: 'POST',
        body: { ...form, allowDuplicateOverride: duplicateOk, duplicateOverrideReason: duplicateOk ? dupReason : undefined },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      setProfile(r);
    } catch (e) { setErr(`${e.code || ''} ${e.message}`); }
  }

  async function uploadPhotos() {
    if (!profile || photos.length === 0) return;
    setErr(null);
    const fd = new FormData();
    for (const p of photos) fd.append('photos', p);
    try {
      await api(`/shoes/${profile._id}/photos`, { method: 'POST', formData: fd });
    } catch (e) { setErr(e.message); }
  }

  async function complete() {
    try {
      const r = await api(`/shoes/${profile._id}/complete-intake`, { method: 'POST', body: {} });
      setProfile(r);
    } catch (e) { setErr(e.message); }
  }

  async function fetchLabel(reprint = false) {
    if (!profile) return;
    setErr(null);
    try {
      const data = await api(`/shoes/label/${profile._id}${reprint ? '?reprint=1' : ''}`);
      setLabel(data);
      setLabelPrintedCount(n => n + 1);
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        setTimeout(() => window.print(), 50);
      }
    } catch (e) { setErr(`${e.code || ''} ${e.message}`); }
  }

  return (
    <div className="card formstack">
      <h2>Shoe intake</h2>
      <form onSubmit={createIntake}>
        <div className="grid2">
          <div><label>Owner user ID</label><input value={form.ownerUserId} onChange={upd('ownerUserId')} required /></div>
          <div><label>Brand</label><input value={form.brand} onChange={upd('brand')} required /></div>
          <div><label>Material</label><input value={form.material} onChange={upd('material')} /></div>
          <div><label>Color</label><input value={form.color} onChange={upd('color')} /></div>
          <div><label>Size</label><input value={form.size} onChange={upd('size')} required /></div>
          <div></div>
        </div>
        <label>Defect notes</label>
        <textarea value={form.defectNotes} onChange={upd('defectNotes')} maxLength={4000} />
        <label><input type="checkbox" checked={duplicateOk} onChange={e => setDupOk(e.target.checked)} /> Override duplicate warning</label>
        {duplicateOk && <><label>Override reason</label><input value={dupReason} onChange={e => setDupReason(e.target.value)} /></>}
        <button type="submit">Create intake</button>
      </form>
      {err && <div className="error">{err}</div>}

      {profile && (
        <div className="card">
          <div>Serial: <code>{profile.serial}</code></div>
          <div>Barcode: <code>{profile.barcode}</code></div>
          <div>Status: <span className="pill">{profile.status}</span></div>
          <div className="spacer" />
          <div>
            <label>Photos (JPEG/PNG, max 5MB, up to 8)</label>
            <input type="file" multiple accept="image/jpeg,image/png" onChange={e => setPhotos(Array.from(e.target.files || []))} />
            <div className="spacer" />
            <div className="row">
              <button onClick={uploadPhotos} disabled={photos.length === 0}>Upload photos</button>
              <button onClick={complete} disabled={profile.status !== 'intake_draft'}>Complete intake</button>
              <button
                data-testid="print-label"
                onClick={() => fetchLabel(labelPrintedCount > 0)}
                disabled={!profile._id}
              >
                {labelPrintedCount > 0 ? 'Reprint label' : 'Print label'}
              </button>
            </div>
            {label && (
              <div className="card label-preview" data-testid="label-preview">
                <h3>Shoe label</h3>
                <div>Serial: <code data-testid="label-serial">{label.serial}</code></div>
                <div>Barcode: <code data-testid="label-barcode">{label.barcode}</code></div>
                <div className="muted">
                  {label.brand} {label.color} — size {label.size}
                </div>
                {label.reprint && <div className="pill">REPRINT</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
