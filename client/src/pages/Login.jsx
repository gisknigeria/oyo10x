import React, { useState } from 'react';
import { Alert, Field } from '../components/ui.jsx';
import { Crest, CandidatePortrait, GoldRule, CAMPAIGN } from '../components/Brand.jsx';

export default function Login({ onSignIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSignIn(username.trim(), password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-aside">
        <div className="login-portrait">
          <CandidatePortrait />
        </div>

        <div className="login-hero">
          <div className="login-crest">
            <Crest size={52} />
            <div>
              <div className="login-crest-text">OYO<em>10X</em></div>
              <div className="login-crest-sub">{CAMPAIGN.strapline}</div>
            </div>
          </div>

          <h1 className="login-headline">
            Make <em>Oyo 10X</em> Better
          </h1>
          <div className="login-subhead">{CAMPAIGN.subhead}</div>
        </div>

        <div className="login-candidate">
          <GoldRule width={110} />
          <div className="login-candidate-name">{CAMPAIGN.candidate}</div>
          <div className="login-candidate-note">{CAMPAIGN.candidateNote}</div>
          <div className="login-candidate-party">
            {CAMPAIGN.party} · {CAMPAIGN.period}
          </div>
        </div>

        <div className="login-tagline">{CAMPAIGN.tagline}</div>
      </aside>

      <main className="login-main">
        <div className="login-box">
          <div className="login-mobile-brand">
            <Crest size={42} />
            <div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 700,
                            color: 'var(--green-900)' }}>OYO 10X</div>
              <div className="eyebrow">{CAMPAIGN.strapline}</div>
            </div>
          </div>

          <div className="eyebrow">{CAMPAIGN.party}</div>
          <h2>Sign in</h2>
          <div className="sub">
            Accounts are issued by the programme office. Every entry submitted
            here is traceable to your login.
          </div>

          {error && <Alert type="error">{error}</Alert>}

          <form onSubmit={submit}>
            <Field label="Username" required>
              <input
                type="text" value={username} autoFocus autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. sen.oyo-central"
              />
            </Field>
            <Field label="Password" required>
              <input
                type="password" value={password} autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Issued password"
              />
            </Field>
            <button className="btn" disabled={busy || !username || !password}>
              {busy && <span className="spinner" />}
              {busy ? 'Signing in' : 'Sign in'}
            </button>
          </form>

          <div className="demo-creds">
            <strong>Demonstration accounts</strong>
            <div style={{ marginTop: 6, lineHeight: 1.9 }}>
              Administrator <code>admin</code> / <code>oyo10x-admin</code><br />
              Candidate, Ambassador, Champion and Mobiliser logins are listed in{' '}
              <code>server/data/credentials.csv</code>.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
