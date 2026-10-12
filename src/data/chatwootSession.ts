/**
 * Chatwoot login for the self-hosted VIA Chat build.
 *
 * Each VIA agent signs in with their own Chatwoot email + password
 * (POST /auth/sign_in). We keep only the devise-token-auth session headers
 * (access-token / client / uid / expiry) in sessionStorage. They are scoped
 * to this browser tab, expire, and are revoked on sign-out. No API token is
 * ever baked into the static bundle.
 */
export interface ChatwootSession {
  accessToken: string;
  client: string;
  uid: string;
  expiry: string;
  tokenType: string;
  userId: number;
  accountId: number;
  pubsubToken: string;
  name: string;
  email: string;
}

const KEY = 'via-chat.chatwoot-session.v1';

export function loadSession(): ChatwootSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as ChatwootSession;
    if (s.expiry && Number(s.expiry) * 1000 < Date.now()) { sessionStorage.removeItem(KEY); return null; }
    return s.accessToken && s.client && s.uid ? s : null;
  } catch { return null; }
}

export function saveSession(s: ChatwootSession) { sessionStorage.setItem(KEY, JSON.stringify(s)); }
export function clearSession() { sessionStorage.removeItem(KEY); }

export function authHeaders(s: ChatwootSession): Record<string, string> {
  return { 'access-token': s.accessToken, client: s.client, uid: s.uid, expiry: s.expiry, 'token-type': s.tokenType || 'Bearer' };
}

export async function signIn(baseUrl: string, email: string, password: string, revokeSessionId?: number): Promise<ChatwootSession> {
  const r = await fetch(`${baseUrl}/auth/sign_in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password, ...(revokeSessionId ? { revoke_session_id: revokeSessionId } : {}) }),
    credentials: 'omit',
  });
  let body: any = null;
  try { body = await r.json(); } catch { /* non-JSON error */ }
  // Chatwoot 4.x caps concurrent sessions per user and answers a browser sign-in with 409 + a session
  // picker once the cap is hit. Do what Chatwoot does for API clients: sign out the least recently used
  // session and retry once.
  if (r.status === 409 && body?.sessions_limit_reached && !revokeSessionId) {
    const oldest = [...(body.sessions ?? [])].sort((a: any, b: any) => Date.parse(a.last_activity_at ?? a.created_at ?? 0) - Date.parse(b.last_activity_at ?? b.created_at ?? 0))[0];
    if (oldest?.id) return signIn(baseUrl, email, password, oldest.id);
  }
  if (!r.ok) {
    if (r.status === 429) throw new Error("Too many sign-in attempts. Please wait a few minutes and try again.");
    const msg = body?.errors?.[0] ?? body?.error ?? body?.message ?? `Sign-in failed (${r.status})`;
    throw new Error(typeof msg === 'string' ? msg : 'Sign-in failed');
  }
  if (body?.mfa_required) throw new Error('This account has two-factor auth enabled. Sign in through the Chatwoot dashboard instead.');
  const d = body?.data ?? {};
  const h = (n: string) => r.headers.get(n) ?? '';
  const via = (d.accounts ?? []).find((a: any) => /via/i.test(a.name ?? '')) ?? (d.accounts ?? [])[0];
  const s: ChatwootSession = {
    accessToken: h('access-token'), client: h('client'), uid: h('uid'), expiry: h('expiry'), tokenType: h('token-type') || 'Bearer',
    userId: d.id, accountId: d.account_id ?? via?.id, pubsubToken: d.pubsub_token,
    name: d.available_name || d.display_name || d.name || d.email, email: d.email,
  };
  if (!s.accessToken || !s.client) throw new Error('Sign-in succeeded but no session headers were returned.');
  if (!s.accountId) throw new Error('This user is not a member of any Chatwoot account.');
  saveSession(s);
  return s;
}

export async function signOut(baseUrl: string, s: ChatwootSession | null) {
  clearSession();
  if (!s) return;
  try { await fetch(`${baseUrl}/auth/sign_out`, { method: 'DELETE', headers: authHeaders(s), credentials: 'omit' }); } catch { /* best effort */ }
}
