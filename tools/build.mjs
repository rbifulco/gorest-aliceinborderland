// Keep the project's native browser modules and relative URLs. Copy complete asset
// directories: the runtime loads GLBs and images dynamically, outside an import graph.
import { cp, mkdir, rm, writeFile, readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
// Header rules use deployment-root paths even though application URLs are relative.
// Set this only when the exported files are mounted below the host's root.
const headerBasePath = (process.env.SPATIAL_REVIEW_BASE_PATH || '').replace(/\/+$/, '');
if (headerBasePath && (!headerBasePath.startsWith('/') || /[\\\s?#:*]/.test(headerBasePath) || headerBasePath.split('/').some(segment => segment === '.' || segment === '..'))) {
  throw new Error('SPATIAL_REVIEW_BASE_PATH must be an absolute URL path, such as /gorest-aliceinborderland');
}
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const entries = ['index.html', 'main.js', 'kit.js', 'player.js', 'spatial-review.html', 'city', 'spatial-review', 'models', 'cards', '.well-known', 'LICENSE', 'CREDITS.md'];
for (const entry of entries) await cp(resolve(root, entry), resolve(dist, entry), { recursive: true });
await mkdir(resolve(dist, 'trailer'), { recursive: true });
await cp(resolve(root, 'trailer/shotlist.js'), resolve(dist, 'trailer/shotlist.js'));
for (const dependency of ['three', 'three-mesh-bvh', '@alterno-dev/spatial-review', '@alterno-dev/spatial-review-protocol']) {
  const destination = resolve(dist, 'node_modules', dependency);
  await mkdir(destination, { recursive: true });
  await cp(resolve(root, 'node_modules', dependency), destination, { recursive: true });
}
await writeFile(resolve(dist, '.nojekyll'), '');
// Static hosts that understand _headers can use the approved production editor.
// Other hosts must configure the same response headers explicitly; this does not deploy.
await writeFile(resolve(dist, '_headers'), `${headerBasePath}/spatial-review.html\n  Content-Security-Policy: frame-ancestors 'self' https://spatial-review.alterno.dev\n${headerBasePath}/.well-known/spatial-review.json\n  Access-Control-Allow-Origin: https://spatial-review.alterno.dev\n${headerBasePath}/cards/*\n  Access-Control-Allow-Origin: https://spatial-review.alterno.dev\n`);
const manifest = JSON.parse(await readFile(resolve(dist, '.well-known/spatial-review.json'), 'utf8'));
if (manifest.schema !== 'spatial-review-discovery/v1' || manifest.liveCapture !== '../spatial-review.html') throw new Error('Invalid discovery manifest');
for (const required of ['spatial-review/generated.js', 'models/props/lod/jp_taxi.glb', 'models/real/shibuya_bldg.glb', 'cards/QH.webp']) await access(resolve(dist, required));
console.log('Built dist/ with complete runtime assets, SDK modules, and static discovery.');
