export const initials = (name?: string, phone?: string) => {
  if (name) return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return phone ? '#' : '?';
};
const COLORS = ['#8e8e93', '#7f8fa6', '#a1887f', '#90a4ae', '#9fa8da', '#80cbc4', '#bcaaa4', '#b0bec5'];
export const avatarColor = (key: string) => COLORS[[...key].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

export function listTime(at: number, now = Date.now()) {
  const d = new Date(at), n = new Date(now);
  if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  if (now - at < 6 * 864e5) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
}
export function dividerTime(at: number, now = Date.now()) {
  const d = new Date(at), n = new Date(now);
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === n.toDateString()) return { day: 'Today', t };
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return { day: 'Yesterday', t };
  return { day: d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), t };
}
export const clock = (at: number) => new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const prettyDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

let ctx: AudioContext | null = null;
export function ding() {
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1046, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1568, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.4);
  } catch { /* audio unavailable */ }
}
