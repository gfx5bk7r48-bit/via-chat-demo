import { useState } from 'react';
import { DOW, hourLabel, nf } from './format';

export interface Series { key: string; label: string; color: string }

/** Bars (stacked or grouped) or lines over time buckets. Pure SVG, scales to its container. */
export function TimeChart({ data, series, labels, mode = 'bars', height = 210 }: {
  data: Record<string, number | string>[]; series: Series[]; labels: string[]; mode?: 'bars' | 'stacked' | 'lines'; height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, L = 38, R = 8, T = 10, B = 26;
  const n = Math.max(1, data.length);
  const totals = data.map((d) => (mode === 'stacked' ? series.reduce((s, x) => s + Number(d[x.key] || 0), 0) : Math.max(...series.map((x) => Number(d[x.key] || 0)))));
  const max = niceMax(Math.max(1, ...totals));
  const x0 = (i: number) => L + ((W - L - R) * i) / n;
  const bw = (W - L - R) / n;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const every = Math.ceil(n / 12);
  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chart of ${series.map((s) => s.label).join(', ')}`}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" /><text x={L - 6} y={y(t) + 4} className="axis" textAnchor="end">{fmtTick(t)}</text></g>)}
        {data.map((d, i) => {
          const cx = x0(i);
          let acc = 0;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={cx} y={T} width={bw} height={H - T - B} fill="transparent" />
              {mode !== 'lines' && series.map((s, j) => {
                const v = Number(d[s.key] || 0);
                if (mode === 'stacked') { const yTop = y(acc + v); const h = y(acc) - yTop; acc += v; return <rect key={s.key} x={cx + bw * 0.15} width={bw * 0.7} y={yTop} height={Math.max(0, h)} fill={s.color} rx={Math.min(3, bw * 0.15)} opacity={hover == null || hover === i ? 1 : 0.55} />; }
                const gw = (bw * 0.76) / series.length;
                return <rect key={s.key} x={cx + bw * 0.12 + j * gw} width={Math.max(1, gw - 1)} y={y(v)} height={Math.max(0, y(0) - y(v))} fill={s.color} rx={Math.min(3, gw / 3)} opacity={hover == null || hover === i ? 1 : 0.55} />;
              })}
              {i % every === 0 && <text x={cx + bw / 2} y={H - 8} className="axis" textAnchor="middle">{labels[i]}</text>}
            </g>
          );
        })}
        {mode === 'lines' && series.map((s) => (
          <polyline key={s.key} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round"
            points={data.map((d, i) => `${x0(i) + bw / 2},${y(Number(d[s.key] || 0))}`).join(' ')} vectorEffect="non-scaling-stroke" />
        ))}
        {hover != null && <line x1={x0(hover) + bw / 2} x2={x0(hover) + bw / 2} y1={T} y2={H - B} className="hoverline" />}
      </svg>
      <div className="legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>
      {hover != null && data[hover] && (
        <div className="chart-tip" style={{ left: `${Math.min(80, Math.max(8, ((x0(hover) + bw / 2) / W) * 100))}%` }}>
          <b>{labels[hover]}</b>
          {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}: {nf.format(Number(data[hover][s.key] || 0))}</span>)}
        </div>
      )}
    </div>
  );
}
function niceMax(v: number) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
const fmtTick = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(Math.round(v)));

/** Hour x weekday heatmap (ET). Rows Mon..Sun. */
export function Heatmap({ cells, metric, open }: { cells: { dow: number; hour: number; inbound: number; outbound: number }[]; metric: 'inbound' | 'outbound'; open?: (dow: number, hour: number) => boolean }) {
  const grid = new Map(cells.map((c) => [`${c.dow}:${c.hour}`, c[metric]]));
  const max = Math.max(1, ...cells.map((c) => c[metric]));
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="heat" role="table" aria-label={`${metric} messages by weekday and hour (Eastern)`}>
      <div className="heat-row heat-head" role="row"><span />{Array.from({ length: 24 }, (_, h) => <span key={h} role="columnheader">{h % 3 === 0 ? hourLabel(h) : ''}</span>)}</div>
      {order.map((d) => (
        <div className="heat-row" key={d} role="row">
          <span role="rowheader">{DOW[d]}</span>
          {Array.from({ length: 24 }, (_, h) => {
            const v = grid.get(`${d}:${h}`) ?? 0;
            const a = v ? 0.12 + 0.88 * (v / max) : 0;
            return <span key={h} role="cell" className={`heat-cell ${open?.(d, h) ? 'bh' : ''}`} style={{ ['--a' as string]: a }} title={`${DOW[d]} ${hourLabel(h)}–${hourLabel((h + 1) % 24)} ET: ${v} ${metric}`} />;
          })}
        </div>
      ))}
    </div>
  );
}

/** Horizontal share bars. */
export function HBars({ rows, color = 'var(--accent)' }: { rows: { label: string; value: number; sub?: string; color?: string }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="hb-label">{r.label}</span>
          <span className="hb-track"><span style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color }} /></span>
          <span className="hb-val">{nf.format(r.value)}{r.sub && <small> {r.sub}</small>}</span>
        </li>
      ))}
      {rows.length === 0 && <li className="muted small">No data in this period</li>}
    </ul>
  );
}

/** One stacked 100% bar with a legend. */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const tot = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="split">
      <div className="split-bar">{parts.map((p) => p.value > 0 && <span key={p.label} style={{ width: `${(p.value / tot) * 100}%`, background: p.color }} title={`${p.label}: ${p.value}`} />)}</div>
      <div className="legend">{parts.map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label} <b>{nf.format(p.value)}</b> <small>{Math.round((p.value / tot) * 100)}%</small></span>)}</div>
    </div>
  );
}
