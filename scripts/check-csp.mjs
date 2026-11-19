// Fails the hosting deploy when an inline <script> in the built index.html
// isn't allowed by the Content-Security-Policy in firebase.json (its
// sha256 must be listed in script-src). Run by firebase.json predeploy.
//   node scripts/check-csp.mjs          check
//   node scripts/check-csp.mjs --print  print the hashes to put in script-src
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const html = readFileSync('dist/zyppi-admin/browser/index.html', 'utf8');
const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
  (m) => `'sha256-${createHash('sha256').update(m[1], 'utf8').digest('base64')}'`,
);
if (process.argv.includes('--print')) {
  console.log(hashes.join(' '));
  process.exit(0);
}
const config = JSON.parse(readFileSync('firebase.json', 'utf8'));
const csp = config.hosting.headers
  .flatMap((h) => h.headers)
  .find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src')) ?? '';
const missing = hashes.filter((h) => !scriptSrc.includes(h));
if (missing.length) {
  console.error(`CSP: inline scripts not allowed by script-src in firebase.json: ${missing.join(' ')}`);
  console.error('Add them (node scripts/check-csp.mjs --print) and deploy again.');
  process.exit(1);
}
console.log(`CSP: ${hashes.length} inline script(s) allowed.`);
