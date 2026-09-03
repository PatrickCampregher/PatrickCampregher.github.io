#!/usr/bin/env node
// Weapon roster report: prints a balance table and flags weapons whose stat profile is near-identical.
// Usage: node tools/weapon-report.mjs [--round 10] [--all] [--threshold 0.16]
//   --all     include Pack-a-Punch variants (def.pap) in the table (they are always excluded from the similarity check)
import { WEAPON_LIST, RARITY_WEIGHT, weaponDps, sustainedRpm, magDamage, magEmptyTime, burstInterval, boxWeaponPool } from '../shared/weapons.js';
import { zombieHealthForRound } from '../shared/zombies.js';

const args = process.argv.slice(2);
const opt = { round: 10, all: false, threshold: 0.15 };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--round') opt.round = parseInt(args[++i], 10);
  else if (args[i] === '--all') opt.all = true;
  else if (args[i] === '--threshold') opt.threshold = parseFloat(args[++i]);
}

const hp = zombieHealthForRound(opt.round);
const list = WEAPON_LIST.filter(w => opt.all || !w.pap);
const boxTotal = boxWeaponPool().reduce((a, w) => a + RARITY_WEIGHT[w.rarity], 0);

const rows = list.map(w => {
  const pellets = w.pellets || 1;
  const shot = w.damage * pellets;
  const dps = weaponDps(w);
  const hdps = dps * w.headMul;
  const stkBody = Math.ceil(hp / shot);
  const stkHead = Math.ceil(hp / (shot * w.headMul));
  const reload = w.reloadPerShell ? w.reloadTime * w.mag + 0.4 : w.reloadTime;
  const boxPct = w.inBox ? RARITY_WEIGHT[w.rarity] / boxTotal * 100 : 0;
  return {
    id: w.id, name: w.name, cls: w.cls, dmg: shot, pel: pellets, rpm: Math.round(sustainedRpm(w)), burst: w.burst ? `${w.burst}x@${w.rpm}` : w.hyperburst ? `hb${w.hyperburst}@${w.burstRpm}` : '',
    dps: Math.round(dps), hdps: Math.round(hdps), magDmg: magDamage(w), mag: w.mag, res: w.reserve, stkB: stkBody, stkH: stkHead,
    reload: +reload.toFixed(2), empty: +magEmptyTime(w).toFixed(2), ads: w.adsTime, zoom: w.zoom, mob: w.moveMul, head: w.headMul,
    hip: w.spreadHip, adsSp: w.spreadAds, rec: w.recoil.pitch, range: w.range, rarity: w.rarity, box: w.inBox ? boxPct.toFixed(1) + '%' : (w.pap ? 'pap' : 'wall'),
    w,
  };
});

const cols = [
  ['id', 15], ['cls', 22], ['dmg', 5], ['pel', 3], ['rpm', 5], ['burst', 9], ['dps', 5], ['hdps', 5], ['magDmg', 7], ['mag', 4], ['res', 4], ['stkB', 4], ['stkH', 4],
  ['reload', 6], ['empty', 6], ['ads', 5], ['zoom', 4], ['mob', 4], ['head', 4], ['hip', 4], ['adsSp', 5], ['rec', 4], ['range', 5], ['rarity', 9], ['box', 6],
];
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log(`Weapon report - ${rows.length} weapons - zombie hp at round ${opt.round}: ${hp}  (stkB/stkH = shots to kill body/head, box = Mystery Box chance)`);
console.log(cols.map(([k, n]) => pad(k, n)).join(' '));
console.log(cols.map(([, n]) => '-'.repeat(n)).join(' '));
for (const r of rows) console.log(cols.map(([k, n]) => pad(r[k], n)).join(' '));

// ---- similarity check ----
// Two weapons are "meaningfully different" in a stat when the values differ by >= 15% (relative to the larger one).
// A pair is flagged as near-identical when fewer than MIN_DIFF of the key stats differ (mechanics count as stats).
const MIN_DIFF = 5, REL = opt.threshold;
const NUM = ['dmg', 'rpm', 'mag', 'res', 'reload', 'ads', 'mob', 'head', 'hip', 'adsSp', 'rec', 'range'];
const mech = (r) => `${r.pel > 1 ? 'pellets' : ''}|${r.w.scope ? 'scope' : ''}|${r.w.auto ? 'auto' : ''}|${r.w.burst ? 'burst' : ''}|${r.w.hyperburst ? 'hyper' : ''}|${r.w.projectile ? 'proj' : ''}|${r.w.splash ? 'splash' : ''}|${r.w.chain ? 'chain' : ''}`;
const F = rows.filter(r => !r.w.pap);
const pairs = [];
for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
  const a = F[i], b = F[j];
  const diffs = [];
  for (const k of NUM) { const x = a[k], y = b[k]; if (Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y), 1e-9) >= REL) diffs.push(k); }
  const ma = mech(a).split('|'), mb = mech(b).split('|');
  for (let k = 0; k < ma.length; k++) if (ma[k] !== mb[k]) diffs.push(ma[k] || mb[k]);
  pairs.push({ a: a.id, b: b.id, n: diffs.length, diffs });
}
pairs.sort((x, y) => x.n - y.n);
console.log(`\nClosest stat profiles (number of key stats differing by >= ${Math.round(REL * 100)}%; fewer than ${MIN_DIFF} is flagged as near-identical):`);
for (const p of pairs.slice(0, 10)) console.log(`  ${p.n < MIN_DIFF ? 'FLAG' : '    '} ${pad(p.a, 15)} ~ ${pad(p.b, 15)} ${String(p.n).padStart(2)}  ${p.diffs.join(',')}`);
const flagged = pairs.filter(p => p.n < MIN_DIFF);
console.log(flagged.length ? `\n${flagged.length} near-identical pair(s) - tune them apart.` : '\nNo near-identical pairs.');
// per class overview
const byCls = {};
for (const r of rows) (byCls[r.w.look.type] ||= []).push(r.id);
console.log('\nBy model type: ' + Object.entries(byCls).map(([k, v]) => `${k}(${v.length})`).join('  '));
process.exit(flagged.length ? 1 : 0);
