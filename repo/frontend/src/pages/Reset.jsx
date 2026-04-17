import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export function ResetPage() {
  const nav = useNavigate();
  const [username, setU] = useState('');
  const [answer, setA] = useState('');
  const [newPassword, setNp] = useState('');
  const [started, setStarted] = useState(false);
  const [startMessage, setStartMessage] = useState('');
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);

  async function start(e) {
    e.preventDefault(); setErr(null);
    try {
      const r = await api('/auth/reset/start', { method: 'POST', body: { username } });
      setStartMessage((r && r.message) || 'Continue with your security answer.');
      setStarted(true);
    } catch (e) { setErr(e.message); }
  }
  async function complete(e) {
    e.preventDefault(); setErr(null);
    try {
      await api('/auth/reset/complete', { method: 'POST', body: { username, securityAnswer: answer, newPassword } });
      setOk(true); setTimeout(() => nav('/login'), 1200);
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="card formstack" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h2>Reset password</h2>
      {!started ? (
        <form onSubmit={start}>
          <label>Username</label>
          <input value={username} onChange={e => setU(e.target.value)} required />
          {err && <div className="error">{err}</div>}
          <button>Continue</button>
        </form>
      ) : (
        <form onSubmit={complete}>
          <div className="muted">{startMessage}</div>
          <div className="spacer" />
          <label>Your security answer</label>
          <input value={answer} onChange={e => setA(e.target.value)} required />
          <label>New password (min 12 chars)</label>
          <input type="password" minLength={12} value={newPassword} onChange={e => setNp(e.target.value)} required />
          {err && <div className="error">{err}</div>}
          {ok && <div className="success">Password updated. Redirecting…</div>}
          <button type="submit">Reset password</button>
        </form>
      )}
      <div className="spacer muted"><Link to="/login">Back to sign in</Link></div>
    </div>
  );
}
