// Space goes to the part people sing next (#51): runs presentation.js's spaceTarget on song shapes and checks
// the order Space plays them in. No browser or server needed.
// usage: node tests/space-order.mjs
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../presentation.js', import.meta.url), 'utf8');
const start = src.indexOf('function spaceTarget(');
const end = src.indexOf('function spaceNext(');
const spaceTarget = new Function(src.slice(start, end) + '; return spaceTarget;')();
const N = { verse: 'V', chorus: 'C', 'pre-chorus': 'P', 'final chorus': 'F', bridge: 'B', ending: 'E', 'no label': 'N' };
const cases = {
  'V C V V B F': 'V1 C V2 C V3 C B F',
  'V P C V V E': 'V1 P C V2 P C V3 P C E',
  'V V C V': 'V1 V2 C V3 C',
  'C V V': 'C V1 C V2 C',
  'V C V B': 'V1 C V2 C B C',
  'V C V C': 'V1 C V2 C',
  'V V V E': 'V1 V2 V3 E',
  'N N N': 'N N N',
  'V V V N': 'V1 V2 V3 N',
  'V C V V V V F': 'V1 C V2 C V3 C V4 C V5 F',
};
const R = Object.fromEntries(Object.entries(N).map(([k, v]) => [v, k]));
let bad = 0;
for (const [shape, want] of Object.entries(cases)) {
  const types = shape.split(' ').map(c => R[c]);
  const song = { doc: { content: types.map(type => [{ type }, []]) }, chunk_index: 0, sung: new Set([0]) };
  const order = [0];
  for (let guard = 0; guard < 30; guard++) {
    const t = spaceTarget(song);
    if (t === null) break;
    song.chunk_index = t; song.sung.add(t); order.push(t);
  }
  const got = order.map(i => types[i] === 'verse' ? 'V' + (types.slice(0, i + 1).filter(x => x === 'verse').length) : N[types[i]]).join(' ');
  const pass = got === want;
  if (!pass) bad++;
  console.log((pass ? 'ok   ' : 'FAIL ') + shape.padEnd(16) + got + (pass ? '' : '   wanted ' + want));
}
process.exit(bad ? 1 : 0);
