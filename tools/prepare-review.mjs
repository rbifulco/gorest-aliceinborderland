// Regenerate capture identity and model descriptors before development/build:
//   node tools/prepare-review.mjs
// No browser or renderer is required. GLB positions and authored node transforms are read
// directly, so rotated nodes and normalized integer accessors do not get guessed bounds.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = 'spatial-review/generated.js';
const relevant = new Set();
async function add(relative) {
  let entries;
  try { entries = await readdir(path.join(root, relative), { withFileTypes: true }); }
  catch (error) {
    if (error.code === 'ENOTDIR') { if (relative !== output) relevant.add(relative); return; }
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    if (entry.isSymbolicLink()) throw new Error(`Capture inputs must not be symlinks: ${relative}/${entry.name}`);
    await add(path.posix.join(relative, entry.name));
  }
}
for (const source of [
  'index.html', 'spatial-review.html', 'main.js', 'kit.js', 'player.js', 'package.json', 'package-lock.json',
  'city', 'spatial-review', 'models', 'cards', 'trailer/shotlist.js', 'trailer/shots.js',
  'tools/prepare-review.mjs', 'tools/build.mjs', 'tools/build-review.mjs',
]) await add(source);

const component = {
  5120: { bytes: 1, read: 'getInt8', normalize: (v) => Math.max(v / 127, -1) },
  5121: { bytes: 1, read: 'getUint8', normalize: (v) => v / 255 },
  5122: { bytes: 2, read: 'getInt16', normalize: (v) => Math.max(v / 32767, -1) },
  5123: { bytes: 2, read: 'getUint16', normalize: (v) => v / 65535 },
  5125: { bytes: 4, read: 'getUint32', normalize: (v) => v / 4294967295 },
  5126: { bytes: 4, read: 'getFloat32', normalize: (v) => v },
};
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
function parseGLB(bytes, file) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)
    throw new Error(`Invalid GLB 2.0 file: ${file}`);
  let json, binary;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + length > bytes.length) throw new Error(`Invalid GLB chunk: ${file}`);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').replace(/\0+$/, ''));
    if (type === 0x004e4942) binary = chunk;
    offset += 8 + length;
  }
  if (!json || !binary) throw new Error(`GLB requires JSON and binary chunks: ${file}`);
  return { json, binary };
}
function modelMetrics(bytes, file) {
  const { json: gltf, binary } = parseGLB(bytes, file);
  if ((gltf.extensionsUsed || []).some((name) => ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'EXT_mesh_gpu_instancing'].includes(name)))
    throw new Error(`Add an explicit decoder for compressed/instanced geometry before reviewing ${file}`);
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  function bufferView(index) {
    const value = gltf.bufferViews[index];
    if (!value || (value.buffer || 0) !== 0 || gltf.buffers?.[0]?.uri) throw new Error(`Unsupported external geometry buffer: ${file}`);
    return value;
  }
  function readAccessor(index) {
    const accessor = gltf.accessors[index], format = component[accessor.componentType], size = components[accessor.type];
    if (!format || !size) throw new Error(`Unsupported accessor in ${file}`);
    const source = accessor.bufferView === undefined ? null : bufferView(accessor.bufferView);
    const start = (source?.byteOffset || 0) + (accessor.byteOffset || 0), stride = source?.byteStride || format.bytes * size;
    const overrides = new Map();
    if (accessor.sparse) {
      const sparse = accessor.sparse, indices = bufferView(sparse.indices.bufferView), values = bufferView(sparse.values.bufferView);
      const kind = component[sparse.indices.componentType];
      for (let i = 0; i < sparse.count; i++) {
        const n = view[kind.read]((indices.byteOffset || 0) + (sparse.indices.byteOffset || 0) + i * kind.bytes, true);
        overrides.set(n, (values.byteOffset || 0) + (sparse.values.byteOffset || 0) + i * size * format.bytes);
      }
    }
    return {
      count: accessor.count, size,
      get(i, c) {
        const offset = overrides.has(i) ? overrides.get(i) + c * format.bytes : source ? start + i * stride + c * format.bytes : null;
        const value = offset === null ? 0 : view[format.read](offset, true);
        return accessor.normalized ? format.normalize(value) : value;
      },
    };
  }
  const bounds = new Box3(), point = new Vector3(), attributes = new Set(['position']);
  let triangles = 0, vertices = 0, meshes = 0, sceneBytes = 0, reviewBytes = 0;
  const visit = (index, parent, ancestry = new Set()) => {
    if (ancestry.has(index)) throw new Error(`Cyclic GLB node hierarchy: ${file}`);
    const node = gltf.nodes[index], local = new Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else local.compose(new Vector3(...(node.translation || [0, 0, 0])), new Quaternion(...(node.rotation || [0, 0, 0, 1])), new Vector3(...(node.scale || [1, 1, 1])));
    const world = parent.clone().multiply(local);
    for (const primitive of gltf.meshes?.[node.mesh]?.primitives || []) {
      const mode = primitive.mode ?? 4;
      if (![4, 5, 6].includes(mode)) continue; // GLTFLoader makes points/lines, not the Mesh roots reviewed here.
      const positions = readAccessor(primitive.attributes.POSITION);
      if (positions.size !== 3) throw new Error(`Position accessor is not VEC3: ${file}`);
      for (let i = 0; i < positions.count; i++) {
        point.set(positions.get(i, 0), positions.get(i, 1), positions.get(i, 2)).applyMatrix4(world);
        if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error(`Non-finite geometry in ${file}`);
        // normalise() bakes node matrices into Float32 position arrays before computing its box.
        point.set(Math.fround(point.x), Math.fround(point.y), Math.fround(point.z)); bounds.expandByPoint(point);
      }
      const sourceCount = primitive.indices === undefined ? positions.count : gltf.accessors[primitive.indices].count;
      const triangleCount = mode === 4 ? Math.floor(sourceCount / 3) : Math.max(0, sourceCount - 2);
      const indexCount = mode === 4 ? sourceCount : triangleCount * 3;
      const indexBytes = indexCount * (positions.count <= 65535 ? 2 : 4);
      sceneBytes += positions.count * 12 + indexBytes;
      reviewBytes += positions.count * 12 + indexBytes;
      for (const attribute of ['NORMAL', 'TEXCOORD_0', 'COLOR_0']) if (primitive.attributes[attribute] !== undefined) {
        const a = gltf.accessors[primitive.attributes[attribute]];
        const size = a.count * components[a.type] * 4;
        reviewBytes += size;
        if (attribute !== 'NORMAL') sceneBytes += size;
        attributes.add({ NORMAL: 'normal', TEXCOORD_0: 'uv', COLOR_0: 'color' }[attribute]);
      }
      triangles += triangleCount; vertices += positions.count; meshes++;
    }
    const next = new Set(ancestry); next.add(index);
    for (const child of node.children || []) visit(child, world, next);
  };
  const children = new Set((gltf.nodes || []).flatMap((node) => node.children || []));
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes || (gltf.nodes || []).map((_, i) => i).filter((i) => !children.has(i));
  for (const index of roots) visit(index, new Matrix4());
  if (bounds.isEmpty()) throw new Error(`No triangle geometry in ${file}`);
  return { bounds: { center: bounds.getCenter(new Vector3()).toArray(), size: bounds.getSize(new Vector3()).toArray() },
    triangles, vertices, meshes, estimatedBytes: reviewBytes, sceneBytes, fileBytes: bytes.length, attributes: [...attributes] };
}

const hash = createHash('sha256'), models = {};
for (const file of [...relevant].sort()) {
  const bytes = await readFile(path.join(root, file));
  hash.update(file).update('\0').update(String(bytes.length)).update('\0').update(bytes).update('\0');
  if (file.startsWith('models/') && file.endsWith('.glb')) models[file] = modelMetrics(bytes, file);
}
// PROPS is an ordinary object literal in a browser module; evaluate only that data declaration,
// with no imports or browser side effects, to keep dimensions authoritative in one place.
const source = await readFile(path.join(root, 'city/props.js'), 'utf8');
const declaration = source.match(/export const PROPS = (\{[\s\S]*?\n\});/);
if (!declaration) throw new Error('Cannot find the authoritative PROPS object literal');
const specs = runInNewContext(`(${declaration[1]})`, Object.create(null), { timeout: 1000 });
const props = {};
for (const [name, spec] of Object.entries(specs)) {
  const metric = models[`models/props/lod/${name}.glb`];
  if (!metric) throw new Error(`Missing prop model: ${name}`);
  const [x, y, z] = metric.bounds.size, rotate = z > x * 1.05;
  const factor = spec.size[spec.fit === 'y' ? 1 : 0] / (spec.fit === 'y' ? y : rotate ? z : x);
  if (!Number.isFinite(factor) || factor <= 0) throw new Error(`Degenerate prop model: ${name}`);
  props[name] = { ...metric, bounds: { center: [0, y * factor / 2, 0], size: [(rotate ? z : x) * factor, y * factor, (rotate ? x : z) * factor] } };
}
const buildId = `gorest-${hash.digest('hex').slice(0, 24)}`;
const format = (data) => '{\n' + Object.entries(data).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(',\n') + '\n}';
const generated = '// Generated by node tools/prepare-review.mjs. Do not edit.\n'
  + '// Bounds include authored node transforms; prop bounds additionally match city/props.js#normalise.\n'
  + `export const BUILD_ID = ${JSON.stringify(buildId)};\n`
  + `export const MODEL_METRICS = ${format(models)};\n`
  + `export const PROP_METRICS = ${format(props)};\n`;
await mkdir(path.join(root, 'spatial-review'), { recursive: true });
let previous; try { previous = await readFile(path.join(root, output), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (previous !== generated) await writeFile(path.join(root, output), generated);
console.log(`Spatial Review ${buildId}: ${Object.keys(models).length} model descriptors, ${Object.keys(props).length} prop designs.`);
