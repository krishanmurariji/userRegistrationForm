// Draws the fallback product pictures (fallback/<slug>.webp) and the shop's logo and cover picture.
// Run with: node draw.js   (needs the app's node_modules for sharp)
const fs = require('fs');
const path = require('path');
const sharp = require(path.join(__dirname, '../../app/node_modules/sharp'));
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'catalog.base.json'), 'utf8'));
const icons = path.join(__dirname, '../../app/node_modules/@phosphor-icons/core/assets/duotone');

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&#39;');

// Hand-drawn produce and a few other items, in a 300 x 300 box.
const drawings = {
  'onion': `<path d="M150 70 C120 110 70 140 74 196 C78 250 122 270 150 270 C178 270 222 250 226 196 C230 140 180 110 150 70Z" fill="#b5476f"/>
    <path d="M150 74 C136 120 118 160 122 262" stroke="#d97a9b" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M150 74 C164 120 182 160 178 262" stroke="#d97a9b" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M150 74 C150 130 150 190 150 266" stroke="#8f3354" stroke-width="5" fill="none"/>
    <path d="M150 74 C146 54 152 40 160 30" stroke="#6d9a3a" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M138 268 l-8 14 M150 270 v16 M162 268 l8 14" stroke="#c9a77c" stroke-width="5" stroke-linecap="round"/>`,
  'potato': `<path d="M70 168 C64 112 120 82 176 90 C232 98 246 150 236 196 C226 244 170 262 122 250 C82 240 74 210 70 168Z" fill="#c99a5c"/>
    <path d="M86 150 C96 116 140 100 180 108" stroke="#e2bb84" stroke-width="10" fill="none" stroke-linecap="round" opacity=".7"/>
    <circle cx="120" cy="170" r="6" fill="#9a6f3a"/><circle cx="178" cy="150" r="5" fill="#9a6f3a"/>
    <circle cx="200" cy="208" r="6" fill="#9a6f3a"/><circle cx="140" cy="222" r="5" fill="#9a6f3a"/><circle cx="104" cy="208" r="4" fill="#9a6f3a"/>`,
  'tomato': `<circle cx="150" cy="170" r="98" fill="#e2412d"/>
    <ellipse cx="114" cy="132" rx="26" ry="16" fill="#f47a66" transform="rotate(-30 114 132)"/>
    <path d="M150 86 l18 -22 l4 28 l26 -10 l-16 22 l26 10 l-30 6 l-6 -2 l-22 12 l-22 -12 l-6 2 l-30 -6 l26 -10 l-16 -22 l26 10 l4 -28 Z" fill="#3f8a33"/>
    <path d="M150 80 C150 64 156 52 166 44" stroke="#3f8a33" stroke-width="8" fill="none" stroke-linecap="round"/>`,
  'banana': `<path d="M70 110 C90 220 190 262 252 214 C256 206 250 200 242 204 C180 236 112 196 94 104 Z" fill="#f2c230"/>
    <path d="M86 92 C112 196 200 232 258 178 C262 170 256 164 248 168 C192 210 124 180 108 88 Z" fill="#f7d54d"/>
    <path d="M100 70 C118 172 206 204 262 146 C266 138 260 132 252 136 C202 180 138 158 122 66 Z" fill="#fbe27a"/>
    <path d="M112 66 C108 50 114 40 124 36 l6 12 C122 52 120 58 122 66Z" fill="#6b4a22"/>`,
  'shimla-apple': `<path d="M150 104 C120 82 66 92 62 152 C58 214 102 268 140 262 C146 261 154 261 160 262 C198 268 242 214 238 152 C234 92 180 82 150 104Z" fill="#d22f3a"/>
    <ellipse cx="104" cy="142" rx="18" ry="30" fill="#ef6b74" transform="rotate(20 104 142)"/>
    <path d="M150 106 C148 84 154 66 164 54" stroke="#6b4a22" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M160 74 C176 46 214 42 226 50 C216 78 188 90 160 74Z" fill="#4f9a3a"/>`,
  'lemon': `<path d="M58 160 C58 108 104 74 150 74 C196 74 242 108 242 160 C242 212 196 246 150 246 C104 246 58 212 58 160Z" fill="#f2cf3b" transform="rotate(-20 150 160)"/>
    <ellipse cx="116" cy="128" rx="34" ry="14" fill="#fbe58a" transform="rotate(-30 116 128)"/>`,
  'ginger': `<path d="M60 190 C56 160 84 150 104 160 C108 128 136 116 156 132 C168 106 202 104 214 128 C238 126 250 152 236 172 C254 190 240 222 214 220 C204 244 172 248 156 230 C136 250 100 246 92 224 C66 226 54 208 60 190Z" fill="#d9a35b"/>
    <path d="M104 186 C130 180 150 192 176 184 M122 210 C140 204 166 212 196 202" stroke="#b07b37" stroke-width="5" fill="none" stroke-linecap="round"/>
    <circle cx="210" cy="152" r="5" fill="#b07b37"/>`,
  'green-chilli': `<path d="M84 96 C80 182 136 246 236 252 C246 252 248 240 238 236 C150 220 112 168 112 98 Z" fill="#3d9a3a"/>
    <path d="M104 110 C108 170 140 210 200 230" stroke="#68c062" stroke-width="7" fill="none" stroke-linecap="round" opacity=".8"/>
    <path d="M78 98 C82 82 96 76 112 82 C114 70 106 56 92 52" stroke="#2d6b2a" stroke-width="10" fill="none" stroke-linecap="round"/>`,
  'coriander-leaves': `<path d="M150 270 C150 220 146 170 130 120 M150 270 C152 210 172 160 196 120 M150 270 C148 200 120 170 92 150" stroke="#3b7a2e" stroke-width="7" fill="none" stroke-linecap="round"/>
    ${[[130, 110], [196, 112], [92, 142], [160, 82], [110, 80], [216, 150], [70, 112]].map(([x, y]) => `<g transform="translate(${x} ${y})"><circle r="26" fill="#4caf50"/><circle cx="-16" cy="-12" r="18" fill="#5cc160"/><circle cx="16" cy="-12" r="18" fill="#5cc160"/></g>`).join('')}`,
  'farm-fresh-eggs': `${[[96, 170], [150, 150], [204, 170]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="44" ry="58" fill="#f3e2c7"/><ellipse cx="${x - 14}" cy="${y - 20}" rx="10" ry="18" fill="#fff6e8"/>`).join('')}
    <path d="M40 210 H260 L240 262 H60 Z" fill="#c4a07a"/><path d="M60 226 H240" stroke="#a9835c" stroke-width="5"/>`,
  'garbage-bags-medium': `<path d="M92 120 H208 C222 120 230 130 230 144 V236 C230 252 218 262 202 262 H98 C82 262 70 252 70 236 V144 C70 130 78 120 92 120Z" fill="#2f2f33"/>
    <path d="M118 120 C112 90 128 70 150 70 C172 70 188 90 182 120" stroke="#2f2f33" stroke-width="16" fill="none"/>
    <path d="M90 150 C110 180 110 220 92 246" stroke="#57575e" stroke-width="8" fill="none" stroke-linecap="round"/>
    <rect x="132" y="96" width="36" height="22" rx="8" fill="#ffab85"/>`,
};

const tints = [['#fde7d5', '#f6d3b8'], ['#f3e3ce', '#ead2b2'], ['#fff1e3', '#fbdcc4'], ['#eef3e3', '#dbe8c8']];

function iconFor(name, category) {
  const n = name.toLowerCase();
  const rules = [[/tea\b|coffee|nescafe|bru/, 'coffee'], [/juice|drink|cola|thums|sprite|frooti|maaza|aamras|water|bull/, 'drop'],
    [/soap|handwash|bathing|lux|lifebuoy|dettol/, 'hand-soap'], [/shampoo|oil|lotion|cream|face wash/, 'drop'],
    [/tooth|pepsodent|colgate/, 'sparkle'], [/razor|gillette/, 'sparkle'], [/detergent|surf|ariel|rin/, 'washing-machine'],
    [/vim|dishwash|scrub|scotch/, 'sparkle'], [/harpic|lizol|colin|cleaner|odonil/, 'spray-bottle'], [/good knight/, 'lightning'],
    [/noodle|maggi|yippee|ramen|soup|ready to eat|makhani/, 'bowl-food'], [/sauce|ketchup|chutney|mayo|jam|honey|butter|spread|nutella/, 'jar'],
    [/chocolate|silk|kitkat|star|munch|perk|gems|rocher|rasgulla/, 'cake'], [/biscuit|cookie|oreo|hide|bourbon|monaco|marie|parle|good day/, 'cookie'],
    [/chips|lay|kurkure|bingo|bhujia|popcorn|pringles|moong/, 'popcorn'], [/masala|powder|chilli|mirch|turmeric|jeera|cumin|coriander/, 'pepper'],
    [/oil|ghee/, 'drop'], [/atta|rice|dal|rajma|chana|besan|rava|sooji|poha|oats|flakes|chocos/, 'grains'], [/salt|sugar/, 'jar'],
    [/milk|paneer|dahi|cheese|cream|butter/, 'cow'], [/bread/, 'bread'], [/bournvita|horlicks/, 'coffee']];
  const hit = rules.find(([re]) => re.test(n));
  return hit ? hit[1] : 'basket';
}

function iconSvg(name) {
  const svg = fs.readFileSync(path.join(icons, `${name}-duotone.svg`), 'utf8');
  return svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

function wrap(text, max) {
  const words = text.split(' ');
  const lines = [''];
  for (const w of words) {
    const cur = lines[lines.length - 1];
    if ((cur + ' ' + w).trim().length > max && cur) lines.push(w); else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  return lines.slice(0, 2);
}

function card(row, index) {
  const [a, b] = tints[index % tints.length];
  const key = Object.keys(drawings).find((k) => slug(row.name).startsWith(k));
  const art = key
    ? `<g transform="translate(170 60) scale(1)">${drawings[key]}</g>`
    : `<g transform="translate(176 66) scale(1.125)" fill="#a6532a" color="#a6532a">${iconSvg(iconFor(row.name, ''))}</g>`;
  const lines = wrap(row.name, 24);
  const text = lines.map((l, i) => `<text x="320" y="${448 + i * 44}" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="36" fill="#2b1d12">${esc(l)}</text>`).join('');
  const unitY = 448 + lines.length * 44 + 6;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <defs><radialGradient id="g" cx="0.5" cy="0.35" r="0.8"><stop offset="0" stop-color="#fffaf4"/><stop offset="0.55" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs>
    <rect width="640" height="640" fill="url(#g)"/>
    <ellipse cx="320" cy="350" rx="150" ry="18" fill="#000" opacity=".06"/>
    ${art}
    ${text}
    <text x="320" y="${unitY}" text-anchor="middle" font-family="DejaVu Sans" font-size="26" fill="#75634f">${esc(row.unit)}</text>
  </svg>`;
}

(async () => {
  const out = path.join(__dirname, 'fallback');
  fs.mkdirSync(out, { recursive: true });
  let i = 0;
  for (const rows of Object.values(catalog)) {
    for (const row of rows) {
      await sharp(Buffer.from(card(row, i++))).webp({ quality: 82 }).toFile(path.join(out, `${slug(row.name)}.webp`));
    }
  }
  console.log('fallback pictures:', i);
})();
