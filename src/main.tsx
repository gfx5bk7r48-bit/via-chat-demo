import { lazy, StrictMode, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Login } from './components/Login';
import { BACKEND, chatwoot } from './store';
import { loadSession } from './data/chatwootSession';
import './styles.css';

// /via/manage: manager dashboard, loaded only when visited (agents never download it).
const Manage = lazy(() => import('./manage/Manage'));
const isManage = () => /\/manage\/?$/.test(location.pathname);

function Root() {
  const [session, setSession] = useState(() => (BACKEND === 'chatwoot' ? loadSession() : null));
  if (BACKEND !== 'chatwoot' || !chatwoot) return <App />;
  if (!session) return <Login onSignedIn={() => setSession(loadSession())} />;
  chatwoot.setSessionOnce(session, () => setSession(null));
  if (isManage()) return <Suspense fallback={<div className="mg-loading">Loading dashboard…</div>}><Manage onSignedOut={() => setSession(null)} /></Suspense>;
  return <App key={session.client} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
