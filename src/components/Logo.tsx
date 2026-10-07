/** VIA Appliance logo (self-hosted copy in public/assets). On dark backgrounds it sits on a light plate. */
export function Logo({ height = 22, className = '' }: { height?: number; className?: string }) {
  return (
    <span className={`via-logo ${className}`} style={{ height: height + 6 }}>
      <img src={`${import.meta.env.BASE_URL}assets/via-logo-trim.png`} alt="VIA" height={height} width={Math.round(height * 374 / 178)} draggable={false} />
    </span>
  );
}
