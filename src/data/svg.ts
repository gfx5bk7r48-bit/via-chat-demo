// Locally generated SVG placeholders for MMS photos (no external images).
const uri = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

export const errorCodePhoto = uri(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9dde2"/><stop offset="1" stop-color="#9aa1aa"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#ff5a3c" stop-opacity=".55"/><stop offset="1" stop-color="#ff5a3c" stop-opacity="0"/></radialGradient></defs>
<rect width="480" height="360" fill="url(#g)"/>
<rect x="40" y="70" width="400" height="200" rx="18" fill="#22262b"/>
<rect x="70" y="100" width="210" height="120" rx="8" fill="#0b0d0f"/>
<ellipse cx="175" cy="160" rx="120" ry="70" fill="url(#glow)"/>
<text x="175" y="188" font-family="'Courier New',monospace" font-weight="700" font-size="84" fill="#ff5a3c" text-anchor="middle">F21</text>
<circle cx="360" cy="160" r="48" fill="#3a3f46" stroke="#5b626b" stroke-width="6"/>
<circle cx="360" cy="160" r="6" fill="#9aa1aa"/>
<g fill="#6b737c"><rect x="70" y="236" width="40" height="14" rx="7"/><rect x="120" y="236" width="40" height="14" rx="7"/><rect x="170" y="236" width="40" height="14" rx="7"/></g>
<text x="240" y="320" font-family="-apple-system,Helvetica,Arial" font-size="18" fill="#30343a" text-anchor="middle">Washer display — sample photo</text>
</svg>`);

export const valvePhoto = uri(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">
<rect width="480" height="360" fill="#e9e4dc"/>
<rect x="0" y="260" width="480" height="100" fill="#cfc6b8"/>
<ellipse cx="250" cy="300" rx="150" ry="22" fill="#7fb3d5" opacity=".55"/>
<rect x="120" y="130" width="230" height="70" rx="14" fill="#2f2f33"/>
<rect x="80" y="145" width="60" height="40" rx="6" fill="#b87333"/>
<rect x="330" y="145" width="70" height="40" rx="6" fill="#b87333"/>
<rect x="200" y="80" width="70" height="60" rx="8" fill="#3d3d42"/>
<path d="M210 205 q8 30 -4 55" stroke="#4a90c8" stroke-width="7" fill="none" stroke-linecap="round"/>
<circle cx="204" cy="268" r="7" fill="#4a90c8"/>
<text x="240" y="40" font-family="-apple-system,Helvetica,Arial" font-size="18" fill="#4a4237" text-anchor="middle">Under the washer — sample photo</text>
</svg>`);
