import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth.jsx';

export function LoginPage() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) { nav('/'); return null; }

  async function submit(e) {
    e.preventDefault(); setErr(null); setBusy(true);
    try { await login(username, password); nav('/'); }
    catch (e) { setErr(e.message || 'Login failed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="card formstack" style={{ maxWidth: 420, margin: '40px auto' }}>
      <h2>Sign in</h2>
      <form onSubmit={submit}>
        <label htmlFor="login-username">Username</label>
        <input id="login-username" value={username} onChange={e => setU(e.target.value)} autoFocus required />
        <label htmlFor="login-password">Password</label>
        <input id="login-password" type="password" value={password} onChange={e => setP(e.target.value)} required />
        {err && <div className="error">{err}</div>}
        <button disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="spacer" />
      <div className="muted">
        <Link to="/reset">Forgot password?</Link> &middot; <Link to="/signup">Create account</Link>
      </div>
    </div>
  );
}
