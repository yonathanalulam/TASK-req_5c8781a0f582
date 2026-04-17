import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

const MAX_EVIDENCE_FILES = 8;
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export function AppealsPage() {
  const [appeals, setAppeals] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [form, setForm] = useState({ exceptionId: '', rationale: '' });
  const [evidence, setEvidence] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);
  const [decideFor, setDecideFor] = useState(null); // { id, outcome }
  const [decisionRationale, setDecisionRationale] = useState('');
  const fileInputRef = useRef(null);

  async function load() {
    try {
      setAppeals((await api('/appeals')).items || []);
      setExceptions((await api('/exceptions')).items || []);
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);

  function onSelectFiles(e) {
    setErr(null);
    const files = Array.from(e.target.files || []);
    const tooMany = files.length + evidence.length > MAX_EVIDENCE_FILES;
    const tooBig = files.find(f => f.size > MAX_EVIDENCE_BYTES);
    if (tooMany) { setErr(`At most ${MAX_EVIDENCE_FILES} evidence files allowed.`); return; }
    if (tooBig) { setErr(`Each evidence file must be ≤ 5 MB (${tooBig.name} is too large).`); return; }
    setEvidence(prev => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeEvidence(idx) {
    setEvidence(prev => prev.filter((_, i) => i !== idx));
  }

  async function submit(e) {
    e.preventDefault(); setErr(null); setInfo(null);
    if (!form.exceptionId) { setErr('Exception ID is required.'); return; }
    const rationale = (form.rationale || '').trim();
    if (!rationale && evidence.length === 0) {
      setErr('Provide rationale text or at least one evidence attachment.');
      return;
    }
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('exceptionId', form.exceptionId);
      fd.append('rationale', rationale);
      for (const file of evidence) fd.append('evidence', file, file.name);
      await api('/appeals', { method: 'POST', formData: fd, headers: { 'Idempotency-Key': crypto.randomUUID() } });
      setForm({ exceptionId: '', rationale: '' });
      setEvidence([]);
      setInfo('Appeal submitted.');
      await load();
    } catch (e) {
      setErr(`${e.code || 'ERROR'}: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  function beginDecide(id, outcome) {
    setDecideFor({ id, outcome });
    setDecisionRationale('');
    setErr(null);
  }

  async function confirmDecide() {
    if (!decideFor) return;
    const rationale = decisionRationale.trim();
    if (rationale.length < 3) { setErr('Decision rationale must be at least 3 characters.'); return; }
    try {
      await api(`/appeals/${decideFor.id}/start-review`, { method: 'POST', body: {} });
      await api(`/appeals/${decideFor.id}/decide`, { method: 'POST', body: { outcome: decideFor.outcome, rationale } });
      setDecideFor(null); setDecisionRationale('');
      await load();
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <div className="card">
        <h2>My exceptions</h2>
        <table>
          <thead><tr><th>Type</th><th>Summary</th><th>Status</th></tr></thead>
          <tbody>
            {exceptions.map(e => (
              <tr key={e._id}><td>{e.exceptionType}</td><td>{e.summary}</td><td><span className="pill">{e.status}</span></td></tr>
            ))}
            {exceptions.length === 0 && <tr><td colSpan="3" className="muted">None.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card formstack">
        <h3>Submit appeal</h3>
        <form onSubmit={submit} aria-label="appeal-form">
          <label htmlFor="appeal-exception-id">Exception ID</label>
          <input
            id="appeal-exception-id"
            name="exceptionId"
            value={form.exceptionId}
            onChange={e => setForm({ ...form, exceptionId: e.target.value })}
            required
          />
          <label htmlFor="appeal-rationale">Rationale</label>
          <textarea
            id="appeal-rationale"
            name="rationale"
            value={form.rationale}
            onChange={e => setForm({ ...form, rationale: e.target.value })}
            placeholder="Explain the basis of the appeal. Rationale or evidence is required."
          />
          <label htmlFor="appeal-evidence">Evidence attachments (optional, up to {MAX_EVIDENCE_FILES} files, 5 MB each)</label>
          <input
            id="appeal-evidence"
            ref={fileInputRef}
            data-testid="evidence-input"
            type="file"
            multiple
            onChange={onSelectFiles}
          />
          {evidence.length > 0 && (
            <ul className="evidence-list" data-testid="evidence-list">
              {evidence.map((f, idx) => (
                <li key={`${f.name}-${idx}`}>
                  <code>{f.name}</code> <span className="muted">({Math.round(f.size / 1024)} KB)</span>
                  <button type="button" onClick={() => removeEvidence(idx)} aria-label={`remove-${f.name}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="submit" disabled={uploading}>
            {uploading ? 'Submitting…' : 'Submit appeal'}
          </button>
        </form>
        {err && <div className="error" role="alert">{err}</div>}
        {info && <div className="info" role="status">{info}</div>}
      </div>

      <div className="card">
        <h3>Appeals</h3>
        <table>
          <thead><tr><th>ID</th><th>Exception</th><th>Status</th><th>Decide</th></tr></thead>
          <tbody>
            {appeals.map(a => (
              <tr key={a._id}>
                <td><code>{a._id.slice(-8)}</code></td>
                <td><code>{String(a.exceptionId).slice(-8)}</code></td>
                <td><span className="pill">{a.status}</span></td>
                <td className="row">
                  {['submitted','under_review'].includes(a.status) && <>
                    <button onClick={() => beginDecide(a._id, 'approved')}>Approve</button>
                    <button onClick={() => beginDecide(a._id, 'denied')}>Deny</button>
                    <button onClick={() => beginDecide(a._id, 'remanded')}>Remand</button>
                  </>}
                </td>
              </tr>
            ))}
            {appeals.length === 0 && <tr><td colSpan="4" className="muted">No appeals.</td></tr>}
          </tbody>
        </table>
      </div>

      {decideFor && (
        <div className="card formstack" role="dialog" aria-label="decision-dialog">
          <h3>{decideFor.outcome} appeal</h3>
          <label>Rationale (required, min 3 characters)</label>
          <textarea
            value={decisionRationale}
            onChange={e => setDecisionRationale(e.target.value)}
            autoFocus
          />
          <div className="row">
            <button type="button" onClick={confirmDecide}>Confirm</button>
            <button type="button" onClick={() => setDecideFor(null)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
