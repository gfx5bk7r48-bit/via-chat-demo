import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Login } from './components/Login';
import { BACKEND, chatwoot } from './store';
import { loadSession } from './data/chatwootSession';
import './styles.css';

function Root() {
  const [session, setSession] = useState(() => (BACKEND === 'chatwoot' ? loadSession() : null));
  if (BACKEND !== 'chatwoot' || !chatwoot) return <App />;
  if (!session) return <Login onSignedIn={() => setSession(loadSession())} />;
  chatwoot.setSessionOnce(session, () => setSession(null));
  return <App key={session.client} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
