import { useState } from 'react';
import { signIn } from '../data/chatwootSession';
import { CHATWOOT_BASE } from '../store';

/** Sign-in screen for the self-hosted build. Uses the agent's own Chatwoot account. */
export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await signIn(CHATWOOT_BASE, email.trim(), password); setPassword(''); onSignedIn(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit} aria-label="Sign in">
        <div className="login-brand"><span className="brand-mark">VIA</span> Chat</div>
        <p className="muted small">Sign in with your VIA Chat (Chatwoot) account.</p>
        <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <div className="login-error" role="alert">{error}</div>}
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small login-foot">Demo environment · fictional customers only · no real SMS is sent</p>
      </form>
    </div>
  );
}
