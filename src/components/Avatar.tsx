import { avatarColor, initials } from '../util';

export function Avatar({ name, phone, size = 40 }: { name?: string; phone: string; size?: number }) {
  return (
    <div className="avatar" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(180deg, ${avatarColor(phone)}cc, ${avatarColor(phone)})` }}>
      {name ? initials(name) : (
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="currentColor"><circle cx="12" cy="8" r="4.2" /><path d="M3.5 21c.8-4.4 4.3-7 8.5-7s7.7 2.6 8.5 7z" /></svg>
      )}
    </div>
  );
}
