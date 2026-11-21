// Writes Netlify's `_headers` into the build output from the hosting headers
// in firebase.json, so the security headers (CSP, frame, cache) have one
// source of truth for both hosts. Run after `ng build` (netlify.toml).
//   node scripts/netlify-headers.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = 'dist/zyppi-admin/browser/_headers';

// Firebase glob → Netlify path patterns.
const paths = (source) => {
  if (source === '**') return ['/*'];
  const ext = source.match(/^\*\*\/\*\.@\(([^)]+)\)$/);
  if (ext) return ext[1].split('|').map((e) => `/*.${e}`);
  if (source.startsWith('/')) return [source];
  throw new Error(`netlify-headers: no Netlify mapping for "${source}"`);
};

const { hosting } = JSON.parse(readFileSync('firebase.json', 'utf8'));
const blocks = hosting.headers.flatMap(({ source, headers }) =>
  paths(source).map((p) => [p, ...headers.map((h) => `  ${h.key}: ${h.value}`)].join('\n')),
);
writeFileSync(OUT, blocks.join('\n\n') + '\n');
console.log(`netlify-headers: wrote ${OUT} (${blocks.length} rules)`);
