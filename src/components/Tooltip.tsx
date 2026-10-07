import { useEffect, useRef, useState } from 'react';

/**
 * Accessible label + styled tooltip for icon-only controls:
 *   <button {...tip('Preset Messages')}>⚡</button>
 * Sets aria-label, title (native fallback) and data-tip. The global <TooltipLayer/> shows a small
 * Apple-style bubble after ~400 ms on mouse hover, immediately-ish on keyboard focus, never on touch.
 */
export function tip(label: string, hint?: string) {
  return { 'aria-label': label, title: hint ? `${label} — ${hint}` : label, 'data-tip': label, ...(hint ? { 'data-tip-hint': hint } : {}) } as const;
}

type Shown = { label: string; hint?: string; x: number; y: number; below: boolean };
const DELAY = 400;

export function TooltipLayer() {
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const target = useRef<HTMLElement | null>(null);
  const lastPointer = useRef<string>('mouse');

  useEffect(() => {
    const find = (n: EventTarget | null) => (n instanceof Element ? (n.closest('[data-tip]') as HTMLElement | null) : null);
    // Park the native title while our bubble is in charge so the two never double up.
    const park = (el: HTMLElement) => { const t = el.getAttribute('title'); if (t != null) { el.dataset.tipTitle = t; el.removeAttribute('title'); } };
    const unpark = (el: HTMLElement | null) => { if (el && el.dataset.tipTitle != null) { el.setAttribute('title', el.dataset.tipTitle); delete el.dataset.tipTitle; } };
    const hide = () => { clearTimeout(timer.current); unpark(target.current); target.current = null; setShown(null); };
    const show = (el: HTMLElement, delay: number) => {
      clearTimeout(timer.current);
      if (target.current && target.current !== el) unpark(target.current);
      target.current = el; park(el);
      timer.current = setTimeout(() => {
        if (target.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 48;
        setShown({ label: el.dataset.tip || '', hint: el.dataset.tipHint, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
      }, delay);
    };
    const onPointerDown = (e: PointerEvent) => { lastPointer.current = e.pointerType; hide(); };
    const onOver = (e: PointerEvent) => {
      lastPointer.current = e.pointerType;
      if (e.pointerType !== 'mouse') return; // touch / pen: no hover tooltips, nothing sticky
      const el = find(e.target);
      if (el && el !== target.current) show(el, DELAY);
      else if (!el && target.current) hide();
    };
    const onOut = (e: PointerEvent) => { const el = find(e.target); if (el && el === target.current && !el.contains(e.relatedTarget as Node)) hide(); };
    const onFocus = (e: FocusEvent) => {
      const el = find(e.target);
      if (!el) return;
      // keyboard focus only (focus caused by a tap/click shouldn't pop a bubble)
      if (lastPointer.current !== 'keyboard' && !(e.target as HTMLElement).matches(':focus-visible')) return;
      show(el, 150);
    };
    const onKey = (e: KeyboardEvent) => { lastPointer.current = 'keyboard'; if (e.key === 'Escape') hide(); };
    document.addEventListener('pointerover', onOver, true);
    document.addEventListener('pointerout', onOut, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('focusout', hide, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('pointerout', onOut, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('focusout', hide, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
      clearTimeout(timer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null;
  const vw = window.innerWidth;
  const x = Math.min(Math.max(shown.x, 90), vw - 90);
  return (
    <div className={`tooltip ${shown.below ? 'below' : ''}`} role="tooltip" style={{ left: x, top: shown.y }}>
      <b>{shown.label}</b>{shown.hint && <span>{shown.hint}</span>}
    </div>
  );
}
