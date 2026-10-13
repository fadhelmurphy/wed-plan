// Pembaruan data bulanan. Node 20+, tanpa dependensi.
// 1) Harga emas Antam (logammulia.com)  2) Venue dari OpenStreetMap (Overpass)
// Data tangan (harga paket gedung, vendor) ada di data/curated.json dan tidak disentuh.
import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const UA = 'Mozilla/5.0 (compatible; rencana-nikah-updater)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const warnings = [];
const warn = m => { console.log('::warning::' + m); warnings.push(m); };

const cur = read('data/curated.json');
let prev = {};
try { prev = read('data/data.json'); } catch {}
let manual = {};
try { manual = read('data/manual.json'); } catch {}

const idDate = d => d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' });
const rad = Math.PI / 180;
const km = (a, b, c, d) => {
  const x = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
};
const norm = s => s.toLowerCase().replace(/\b(gedung|hotel|the|graha|balai|ballroom)\b/g, ' ').replace(/[^a-z0-9]/g, '');

/* ---------- 1. emas ---------- */
async function fetchGold(prevPrice) {
  const url = process.env.GOLD_URL || 'https://www.logammulia.com/id/harga-emas-hari-ini';
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'id' }, signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const text = (await res.text())
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const m = text.match(/\b1\s*(?:gr|gram)\b\D{0,30}?(\d{1,3}(?:[.,]\d{3}){1,2})/i);
  if (!m) throw new Error('baris 1 gram tidak ditemukan di halaman');
  const price = parseInt(m[1].replace(/[.,]/g, ''), 10);
  const lo = prevPrice ? prevPrice * 0.8 : 5e5, hi = prevPrice ? prevPrice * 1.2 : 2e7;
  if (!(price >= lo && price <= hi)) throw new Error(`angka ${price} di luar batas wajar (${Math.round(lo)}-${Math.round(hi)})`);
  return price;
}
const prevGold = prev.gold || cur.gold;
let gold = { ...prevGold };
try {
  const price = await fetchGold(prevGold.price);
  gold = { price, asOf: idDate(new Date()), source: 'logammulia.com (Antam)', stale: false };
  console.log('emas:', price);
} catch (e) {
  if (manual.goldPrice) {
    gold = { price: manual.goldPrice, asOf: manual.goldAsOf || idDate(new Date()), source: 'manual', stale: false };
    warn('Harga emas otomatis gagal (' + e.message + '). Memakai data/manual.json.');
  } else {
    gold = { ...prevGold, stale: true };
    warn('Harga emas gagal diperbarui (' + e.message + '). Memakai nilai sebelumnya.');
  }
}

/* ---------- 2. venue OpenStreetMap ---------- */
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function overpass(query) {
  let last;
  for (const ep of ENDPOINTS) {
    for (let t = 0; t < 2; t++) {
      try {
        const res = await fetch(ep, { method: 'POST', headers: { 'user-agent': UA, 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(90000) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return (await res.json()).elements || [];
      } catch (e) { last = e; await sleep(4000); }
    }
  }
  throw last;
}
const q = (a, r) => `[out:json][timeout:60];(
nwr(around:${r},${a.lat},${a.lng})[amenity=events_venue][name];
nwr(around:${r},${a.lat},${a.lng})[amenity=conference_centre][name];
nwr(around:${r},${a.lat},${a.lng})[name~"wedding|ballroom",i][building];
);out center tags 80;`;

function toVenue(el) {
  const t = el.tags || {};
  const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
  if (!t.name || lat == null || lng == null) return null;
  let area = cur.areas[0], best = Infinity;
  for (const a of cur.areas) { const d = km(a.lat, a.lng, lat, lng); if (d < best) { best = d; area = a; } }
  const addr = t['addr:full'] || [t['addr:street'], t['addr:housenumber'], t['addr:suburb'] || t['addr:city']].filter(Boolean).join(' ') || ('Dekat ' + area.name);
  const cap = parseInt(t.capacity, 10);
  return {
    id: 'osm-' + el.type[0] + el.id, name: t.name, area: area.id, addr,
    lat: +lat.toFixed(5), lng: +lng.toFixed(5), cap: cap > 0 ? cap : null,
    kind: 'Sewa gedung', cat: 'cek', year: null, phone: t.phone || t['contact:phone'] || null,
    src: 'OpenStreetMap', pkgs: []
  };
}

const prevOsm = (prev.venues || []).filter(v => v.src === 'OpenStreetMap');
const found = new Map();
let okAreas = 0;
for (const a of cur.areas) {
  const r = a.grp === 'jabodetabek' ? 12000 : 8000;
  try {
    const els = await overpass(q(a, r));
    okAreas++;
    for (const el of els) { const v = toVenue(el); if (v) found.set(v.id, v); }
    console.log(a.id, els.length);
  } catch (e) { warn(`Overpass gagal untuk ${a.name}: ${e.message}`); }
  await sleep(2500);
}
let osm = [...found.values()];
if (okAreas === 0) { osm = prevOsm; warn('Semua permintaan Overpass gagal. Memakai venue OSM bulan sebelumnya.'); }

// buang duplikat terhadap data tangan dan antar-OSM, batasi per daerah
const curN = cur.venues.map(v => ({ n: norm(v.name), lat: v.lat, lng: v.lng }));
const seen = new Set(), perArea = {}, merged = [];
for (const v of osm.sort((a, b) => a.name.localeCompare(b.name))) {
  const n = norm(v.name); if (n.length < 3) continue;
  if (curN.some(c => (c.n && (c.n.includes(n) || n.includes(c.n))) || km(c.lat, c.lng, v.lat, v.lng) < 0.15)) continue;
  const key = n + v.lat.toFixed(3) + v.lng.toFixed(3); if (seen.has(key)) continue; seen.add(key);
  perArea[v.area] = (perArea[v.area] || 0) + 1; if (perArea[v.area] > 12) continue;
  merged.push(v);
}

const out = {
  updatedAt: new Date().toISOString(), mode: 'otomatis', gold,
  osmCount: merged.length, warnings,
  venues: [...cur.venues, ...merged], vendors: cur.vendors
};
fs.writeFileSync('data/data.json', JSON.stringify(out, null, 1) + '\n');
console.log(`selesai: ${out.venues.length} venue (${merged.length} dari OSM), emas ${gold.price}`);
