// Draws the demo shop's logo (images/shop-logo.png) and cover picture (images/shop-cover.jpg).
const fs = require('fs');
const path = require('path');
const sharp = require(path.join(__dirname, '../../app/node_modules/sharp'));

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6b3f"/><stop offset="1" stop-color="#1f4a2b"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <path d="M116 214 L140 132 H372 L396 214 Z" fill="#ffab85"/>
  ${[0, 1, 2, 3, 4].map((i) => `<path d="M${116 + i * 56} 214 a28 28 0 0 0 56 0 Z" fill="${i % 2 ? '#fffaf3' : '#f08a5d'}"/>`).join('')}
  <rect x="136" y="242" width="240" height="150" rx="10" fill="#fffaf3"/>
  <rect x="164" y="270" width="72" height="122" rx="8" fill="#2f6b3f"/>
  <rect x="258" y="270" width="92" height="64" rx="8" fill="#ffe1cc"/>
  <text x="256" y="452" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="44" fill="#fffaf3">SHARMA</text>
</svg>`;

function shelfItems(y, h) {
  let x = 40, out = '';
  const colors = ['#e2412d', '#f2c230', '#2f6b3f', '#a6532a', '#ffab85', '#3b6fb6', '#f6ead8', '#8a4420', '#d97a9b', '#68c062'];
  while (x < 1160) {
    const w = pick([46, 58, 70, 84]), hh = pick([60, 74, 88, 100]) * (h / 120), c = pick(colors), kind = rnd();
    if (kind < 0.4) out += `<rect x="${x}" y="${y - hh}" width="${w}" height="${hh}" rx="6" fill="${c}"/><rect x="${x + 7}" y="${y - hh + 16}" width="${w - 14}" height="${hh * 0.32}" rx="4" fill="#fffaf3" opacity=".85"/>`;
    else if (kind < 0.75) out += `<rect x="${x + 8}" y="${y - hh + 14}" width="${w - 16}" height="${hh - 14}" rx="12" fill="${c}"/><rect x="${x + w / 2 - 9}" y="${y - hh}" width="18" height="18" rx="3" fill="#5a3a1e"/>`;
    else out += `<circle cx="${x + w / 2}" cy="${y - w / 2}" r="${w / 2}" fill="${c}"/>`;
    x += w + pick([8, 12, 18]);
  }
  return out;
}

const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420">
  <defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e2c9"/><stop offset="1" stop-color="#ead0ae"/></linearGradient></defs>
  <rect width="1200" height="420" fill="url(#w)"/>
  ${[130, 260, 390].map((y) => shelfItems(y, 120) + `<rect x="20" y="${y}" width="1160" height="14" rx="4" fill="#8a5a33"/>`).join('')}
</svg>`;

(async () => {
  await sharp(Buffer.from(logo)).resize(512, 512).png().toFile(path.join(__dirname, 'images/shop-logo.png'));
  await sharp(Buffer.from(cover)).jpeg({ quality: 84 }).toFile(path.join(__dirname, 'images/shop-cover.jpg'));
  console.log('shop pictures done');
})();
