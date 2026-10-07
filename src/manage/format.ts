export const TZ = 'America/New_York';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const todayET = () => dayFmt.format(new Date());
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export const nf = new Intl.NumberFormat('en-US');
export const num = (v: number | null | undefined) => (v == null ? '—' : nf.format(Math.round(v)));
export const pct = (v: number | null | undefined, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`);
export const usd = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rateStr = (v: number) => `$${String(+Number(v).toFixed(4))}`;
export const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v < 100 ? 2 : 0 });
export function dur(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
const etTime = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const etStamp = (ms: number) => `${etTime.format(new Date(ms))} ET`;
const md = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' });
/** Bucket key "YYYY-MM-DDTHH:MM" is already ET wall time. */
export function bucketLabel(b: string, bucket: 'hour' | 'day' | 'week', short = false) {
  const [d, t] = b.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd));
  if (bucket === 'hour') { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`; }
  if (bucket === 'week') return `wk ${md.format(dt)}`;
  return short ? md.format(dt) : `${wd.format(dt)} ${md.format(dt)}`;
}
export const prettyDay = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return md.format(new Date(Date.UTC(y, m - 1, dd))); };
export const maskPhone = (p?: string | null) => { const d = (p ?? '').replace(/\D/g, ''); return d.length >= 4 ? `•••-${d.slice(-4)}` : ''; };
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
/** Relative change; null when not comparable. */
export const delta = (cur: number | null | undefined, prev: number | null | undefined) => (cur == null || prev == null || prev === 0 ? null : (cur - prev) / prev);

export function downloadCsv(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  // Guard against CSV formula injection when opened in Excel/Sheets.
  const safe = (v: unknown) => { const s = v == null ? '' : String(v); return /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s; };
  const csv = [header, ...rows].map((r) => r.map((v) => esc(safe(v))).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
