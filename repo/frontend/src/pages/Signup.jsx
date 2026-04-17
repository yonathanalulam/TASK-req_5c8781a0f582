import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export function SignupPage() {
  const nav = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', displayName: '', securityQuestionId: '', securityAnswer: '' });
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    api('/auth/security-questions').then(setQuestions).catch(() => {});
  }, []);

  function upd(k) { return (e) => setForm({ ...form, [k]: e.target.value }); }

  async function submit(e) {
    e.preventDefault(); setErr(null);
    try {
      await api('/auth/signup', { method: 'POST', body: form });
      setOk(true);
      setTimeout(() => nav('/login'), 1200);
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="card formstack" style={{ maxWidth: 480, margin: '40px auto' }}>
      <h2>Create account</h2>
      <form onSubmit={submit}>
        <label>Username (3–64 chars; letters, digits, . _ -)</label>
        <input value={form.username} onChange={upd('username')} required />
        <label>Display name</label>
        <input value={form.displayName} onChange={upd('displayName')} />
        <label>Password (min 12 chars)</label>
        <input type="password" value={form.password} onChange={upd('password')} minLength={12} required />
        <label>Security question</label>
        <select value={form.securityQuestionId} onChange={upd('securityQuestionId')} required>
          <option value="">Choose…</option>
          {questions.map(q => <option key={q.id} value={q.id}>{q.text}</option>)}
        </select>
        <label>Security answer</label>
        <input value={form.securityAnswer} onChange={upd('securityAnswer')} required />
        {err && <div className="error">{err}</div>}
        {ok && <div className="success">Account created. Redirecting…</div>}
        <button type="submit">Create account</button>
      </form>
      <div className="muted spacer"><Link to="/login">Back to sign in</Link></div>
    </div>
  );
}
