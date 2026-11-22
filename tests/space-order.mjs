// Space goes to the part people sing next, and c to the right chorus (#51): runs presentation.js's spaceTarget
// and chorusTarget on song shapes and checks the order. No browser or server needed.
// usage: node tests/space-order.mjs
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../presentation.js', import.meta.url), 'utf8');
const start = src.indexOf('const choralType');
const end = src.indexOf('function spaceNext(');
const { spaceTarget, chorusTarget } = new Function(src.slice(start, end) + '; return { spaceTarget, chorusTarget };')();

const N = { verse: 'V', chorus: 'C', 'pre-chorus': 'P', 'final chorus': 'F', bridge: 'B', ending: 'E', 'no label': 'N' };
const R = Object.fromEntries(Object.entries(N).map(([k, v]) => [v, k]));
const song = shape => {
  const types = shape.split(' ').map(c => R[c[0]]);
  return { types, doc: { content: types.map(type => [{ type }, []]) }, chunk_index: 0, sung: new Set([0]), sungOrder: [0] };
};
// a part's name: V2 for the second verse; a chorus written twice is C, then C2
const name = (types, i) => {
  const same = types.slice(0, i + 1).filter(t => t === types[i]).length;
  return types[i] === 'verse' ? 'V' + same : N[types[i]] + (same > 1 ? same : '');
};
const go = (s, i) => { s.chunk_index = i; s.sung.add(i); s.sungOrder.push(i); };
let bad = 0;
const check = (what, got, want) => {
  const pass = got === want;
  if (!pass) bad++;
  console.log((pass ? 'ok   ' : 'FAIL ') + what.padEnd(40) + got + (pass ? '' : '   wanted ' + want));
};

// Space, from the first part to the end of the song
const spaces = {
  'V C V V B F': 'V1 C V2 C V3 C B F',
  'V P C V V E': 'V1 P C V2 P C V3 P C E',
  'V V C V': 'V1 V2 C V3 C',
  'C V V': 'C V1 C V2 C',
  'V C V B': 'V1 C V2 C B C',
  'V C V C': 'V1 C V2 C2',
  'V V V E': 'V1 V2 V3 E',
  'N N N': 'N N2 N3',
  'V V V N': 'V1 V2 V3 N',
  'V C V V V V F': 'V1 C V2 C V3 C V4 C V5 F',
  // two verses to each chorus, as the song starts (Evan)
  'V V C V V': 'V1 V2 C V3 V4 C',
  'V V C V V V': 'V1 V2 C V3 V4 C V5 C',
  'V V C V V B': 'V1 V2 C V3 V4 C B C',
  // a second chorus: the verses after it go back to it, not the first (Evan: To Every Tribe and Tongue)
  'V C V C V': 'V1 C V2 C2 V3 C2',
  'V C V V C V': 'V1 C V2 C V3 C2 V4 C2',
};
for (const [shape, want] of Object.entries(spaces)) {
  const s = song(shape);
  const order = [0];
  for (let guard = 0; guard < 40; guard++) {
    const t = spaceTarget(s);
    if (t === null) break;
    go(s, t);
    order.push(t);
  }
  check('Space ' + shape, order.map(i => name(s.types, i)).join(' '), want);
}

// c: the chorus that goes with the part, until every verse is sung; then the final chorus
const cs = [
  // [shape, parts sung in order, where c goes]
  ['V C V V B F', [0], 'C'],
  ['V C V V B F', [0, 1, 2], 'C'],
  ['V C V V B F', [0, 1, 2, 1, 3], 'F'],
  ['V C V V B F', [0, 1, 2, 1, 3, 1, 4], 'F'],
  ['V P C V V E', [0], 'P'],
  ['V C V C V', [0, 1, 2, 3, 4], 'C2'],
  ['V C V C V', [0, 1, 2], 'C'],
  ['V V V', [0], 'none'],
  ['V F', [0], 'F'],
];
for (const [shape, sung, want] of cs) {
  const s = song(shape);
  sung.slice(1).forEach(i => go(s, i));
  const t = chorusTarget(s);
  check(`c ${shape} after ${sung.map(i => name(s.types, i)).join(',')}`, t < 0 ? 'none' : name(s.types, t), want);
}
process.exit(bad ? 1 : 0);
