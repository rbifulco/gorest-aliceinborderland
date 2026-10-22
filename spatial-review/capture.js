import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  SceneAssetRegistry, attachSceneAssetRegistryBridge, createSpatialReviewEditorAuthorization,
  spatialReviewEditorUrl, SPATIAL_REVIEW_ASSET_STREAM_CAPABILITY, prepareAssetTransfer,
} from '@alterno-dev/spatial-review';
import { BUILD_ID, PROP_METRICS } from './generated.js';
import { makeReviewRoot, inspectTextureSources, measureReviewRoot } from './materials.js';
import { navigationSequences } from './navigation.js';
import { partitionPlacements, limitPlacementActors, createPlacementGroup, estimatePlacementGroup, attachStableInstanceIds } from './instances.js';
import { bakeReviewWaterHoles } from './water.js';

const MAX_BYTES = 64 * 1024 * 1024;
// Yield cooperatively without a timer for every deferred representation. The
// fallback owns its ports only until the next event task (or document teardown).
const nextTask = () => {
  if (typeof globalThis.scheduler?.yield === 'function') return globalThis.scheduler.yield();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = () => {
      channel.port1.onmessage = null;
      channel.port1.close(); channel.port2.close();
      removeEventListener('pagehide', finish);
      resolve();
    };
    addEventListener('pagehide', finish, { once: true });
    channel.port1.onmessage = finish;
    channel.port2.postMessage(null);
  });
};
const pose = (matrix) => {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  matrix.decompose(p, q, s);
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  return { position: p.toArray(), rotation: [e.x, e.y, e.z].map(THREE.MathUtils.radToDeg), scale: s.toArray() };
};
const bounds = (box) => ({ center: box.getCenter(new THREE.Vector3()).toArray(), size: box.getSize(new THREE.Vector3()).toArray() });
const slug = (value) => value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// The SDK owns serialization and live textures. Its public producer result is an
// owned transfer copy, so enriching that copy preserves both cache and source.
class PlacementRegistry extends SceneAssetRegistry {
  placementGroups = new Map();
  async produceAssetRepresentation(...args) {
    const result = await super.produceAssetRepresentation(...args);
    const group = this.placementGroups.get(args[0]);
    if (!result || !group) return result;
    return { ...result, ...prepareAssetTransfer(attachStableInstanceIds(result.asset, group), args[3], { typedInstances: true }) };
  }
}

// Tracks every Three loader, including card paintings, airship hulls and embedded GLB images.
// The ordinary game has independent loaders; this barrier is private to the capture document.
function trackLoading() {
  const manager = THREE.DefaultLoadingManager;
  const start = manager.itemStart.bind(manager), end = manager.itemEnd.bind(manager), error = manager.itemError.bind(manager);
  let active = 0, generation = 0; const failures = [];
  manager.itemStart = (url) => { active++; generation++; start(url); };
  manager.itemEnd = (url) => { active--; end(url); };
  manager.itemError = (url) => { failures.push(url); error(url); };
  return {
    failures,
    async idle() {
      const deadline = performance.now() + 120000;
      while (performance.now() < deadline) {
        const version = generation;
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (active === 0 && generation === version) return;
      }
      throw new Error('Timed out waiting for the registered model and texture sources.');
    },
    restore() { manager.itemStart = start; manager.itemEnd = end; manager.itemError = error; },
  };
}

export async function startCapture() {
  const began = performance.now(), status = document.getElementById('status');
  const websiteUrl = new URL('./', location.href).href;
  document.getElementById('editor').href = spatialReviewEditorUrl(websiteUrl);
  const loading = trackLoading();
  const owned = new Map(), lifetime = new AbortController();
  let scene, trees, detach = () => {}, disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true;
    detach(); lifetime.abort();
    owned.forEach((item) => item.dispose()); owned.clear(); trees?.disposeTreeReviewCache();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene?.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) {
        materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose());
    scene?.clear(); loading.restore();
  };
  addEventListener('pagehide', dispose, { once: true });
  try {
    const [K, { buildCompound }, { buildCity }, { DISTRICTS }, props, treeSources] = await Promise.all([
      import('../kit.js'), import('../city/compound.js'), import('../city/index.js'),
      import('../city/map.js'), import('../city/props.js'), import('../city/trees.js'),
    ]);
    trees = treeSources; lifetime.signal.throwIfAborted();
    scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .5, 9000);
    camera.position.set(-95, 72, 112); camera.lookAt(0, 6, -4); camera.updateMatrixWorld(true);
    K.initKit(scene); K.setZone('compound');
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(640, 640), new THREE.MeshStandardMaterial({ map: K.texAsphalt, color: 0xf0f2f4, roughness: .95, metalness: .05 }));
    asphalt.name = 'Compound apron'; asphalt.rotation.x = -Math.PI / 2; asphalt.position.set(10, 0, 10); scene.add(asphalt);
    asphalt.userData.review = { id: 'compound-apron', owner: 'compound', sourceRef: 'main.js#asphalt', category: 'Landscape' };
    const compound = buildCompound(scene);
    compound.backdrop.userData.reviewExclude = true; // distant cylindrical skyline is a visual backdrop, not city geometry
    const city = buildCity({ scene, camera, highways: compound.highways, reviewCapture: true });
    const built = K.buildBatches(scene);
    status.textContent = 'Loading the real buildings, interiors and card artwork…';
    await nextTask();
    const trucks = await Promise.all(['truck_semi', 'truck_box'].map((name) => new GLTFLoader().loadAsync(`./models/${name}.glb`)));
    compound.truckSpots.forEach((placement, index) => {
      const root = trucks[placement.file === 'truck_semi' ? 0 : 1].scene.clone(true);
      root.position.set(placement.x, 0, placement.z); root.rotation.y = placement.ry;
      root.name = placement.file;
      root.userData.review = { id: `compound-truck-${index}`, owner: 'compound', sourceRef: 'city/compound.js#truckSpots', category: 'Vehicles' };
      scene.add(root);
    });
    await Promise.all(city.pending);
    await loading.idle();
    lifetime.signal.throwIfAborted();
    if (loading.failures.length) throw new Error(`Required scene resources failed to load: ${loading.failures.join(', ')}`);
    // Fix time/day before deriving bounds. No animation loop, physics, GPU renderer or culling pools.
    for (const update of city.dayNight) update(true, false);
    for (const update of city.updates) update(0, 0);
    scene.updateMatrixWorld(true);
    bakeReviewWaterHoles(scene);
    status.textContent = 'Preparing the complete placement catalog…';
    await nextTask();

    const registry = new PlacementRegistry(BUILD_ID);
    const districtMap = new Map(DISTRICTS.map((d) => [d.id, d]));
    const subareaParents = { bulb_ug: 'bulb', arena_in: 'arena', diamond_in: 'diamond', port_yard: 'port', port_sea: 'port', shibuya_sub: 'shibuya' };
    const owners = new Set();
    const stats = { buildId: BUILD_ID, actors: 0, assets: 0, props: 0, trees: 0, sourceTriangles: built.tris, warnings: [], bootstrapMs: 0 };
    const assets = new Set();

    function sourceFor(zone) {
      const key = zone.replace(/^det_/, '');
      if (key === 'compound') return 'city/compound.js#buildCompound';
      if (key === 'bulb_ug') return 'city/lightbulb.js#createLevel';
      if (subareaParents[key]) return `city/${subareaParents[key]}.js#build`;
      if (key === 'bridge' || key === 'island') return 'city/index.js#rainbowBridge';
      if (key === 'express') return 'city/index.js#expressway';
      if (key === 'airships') return 'city/index.js#airships';
      if (districtMap.has(key)) return `city/${key === 'bulb' ? 'lightbulb' : key}.js#build`;
      if (zone.startsWith('det_')) return 'city/buildings.js#cityBuilding';
      return 'city/index.js#buildCity';
    }
    function ownerFor(raw = 'world') {
      const zone = raw.replace(/^det_/, '');
      const assemblyId = `place:${zone}`;
      if (!owners.has(assemblyId)) {
        const district = districtMap.get(zone);
        const parentAssemblyId = subareaParents[zone] ? ownerFor(subareaParents[zone]) : undefined;
        registry.registerAssembly({ assemblyId, name: district?.name || zone.replaceAll('_', ' '), sourceRef: district ? `city/map.js#DISTRICTS:${zone}` : sourceFor(zone),
          parentAssemblyId,
          localTransform: { position: district ? [district.x, 0, district.z] : [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } });
        owners.add(assemblyId);
      }
      return assemblyId;
    }
    // This finite cache contains at most one representation per asset/profile in this catalog.
    // No source edits occur in place: refreshing unloads the capture and constructs a new build.
    // Retention for the complete capture session exceeds the SDK's 60-second texture grace.
    async function retain(key, create, signal) {
      signal.throwIfAborted(); lifetime.signal.throwIfAborted();
      if (owned.has(key)) return owned.get(key).root;
      const result = await create();
      if (signal.aborted || lifetime.signal.aborted) { result.dispose(); signal.throwIfAborted(); lifetime.signal.throwIfAborted(); }
      if (owned.has(key)) { result.dispose(); return owned.get(key).root; }
      owned.set(key, result); return result.root;
    }
    function registerDeferred({ actorId, assetId, name, sourceRef, owner, category, matrix, box, metrics, produce, tags = [] }) {
      if (box.isEmpty()) return;
      assets.add(assetId);
      registry.registerDeferred({ actorId, assetId, name, sourceRef, category, parentAssemblyId: ownerFor(owner), transform: pose(matrix), bounds: bounds(box), tags,
        stream: { capability: SPATIAL_REVIEW_ASSET_STREAM_CAPABILITY, revision: `${BUILD_ID}:${assetId}`, representations: [
          { id: 'overview', purpose: 'overview', revision: `${BUILD_ID}:${assetId}:overview`, estimatedBytes: metrics.sceneBytes || metrics.estimatedBytes, triangles: metrics.triangles, instances: metrics.instances, attributes: ['position'], geometricError: tags.includes('scene-crown-proxy') ? 2 : 0 },
          { id: 'detail', purpose: 'detail', revision: `${BUILD_ID}:${assetId}:detail`, estimatedBytes: metrics.estimatedBytes, triangles: metrics.triangles, instances: metrics.instances, attributes: ['position', 'normal', 'uv'], geometricError: 0 },
        ] },
        async produceRepresentation(context) {
          context.signal.throwIfAborted(); lifetime.signal.throwIfAborted();
          await nextTask();
          context.reportProgress({ phase: 'generating' });
          const profile = context.representation.purpose === 'overview' ? 'scene' : 'review';
          const signal = AbortSignal.any([context.signal, lifetime.signal]);
          const root = await retain(`${assetId}:${profile}`, () => produce(profile, signal), signal);
          if (!root) throw new Error(`No supported review geometry for ${assetId}.`);
          signal.throwIfAborted();
          await nextTask();
          return root;
        },
      });
    }
    function registerRoot(root, metadata) {
      root.updateWorldMatrix(true, true);
      const metrics = measureReviewRoot(root), box = metrics.box;
      if (box.isEmpty() || !metrics.renderables) return;
      inspectTextureSources(root);
      if (metrics.estimatedBytes > MAX_BYTES) stats.warnings.push(`${metadata.id}: detail exceeds 64 MiB; consumer may reject this representation.`);
      registerDeferred({ actorId: `actor:${metadata.id}`, assetId: `asset:${metadata.id}`, name: root.name || metadata.id, sourceRef: metadata.sourceRef,
        owner: metadata.owner, category: metadata.category, matrix: root.matrixWorld.clone(), box, metrics,
        produce: async (profile, signal) => { signal.throwIfAborted(); return makeReviewRoot(root, profile); } });
    }

    const batched = new Set();
    for (const [zone, meshes] of K.zoneMeshes) {
      const root = new THREE.Group(); root.name = `${districtMap.get(zone)?.name || zone} · environment`;
      for (const mesh of meshes) { batched.add(mesh); root.attach(mesh); }
      registerRoot(root, { id: `environment-${zone}`, owner: zone, sourceRef: sourceFor(zone), category: 'Environment' });
      scene.add(root);
    }
    const untaggedCounts = new Map(), directRoots = [];
    for (const root of [...scene.children]) {
      if (batched.has(root) || root.name.endsWith(' · environment') || root.userData.reviewExclude || root.isLight || root.isPoints || root.isSprite) continue;
      const key = slug(root.name || root.type), ordinal = untaggedCounts.get(key) || 0;
      untaggedCounts.set(key, ordinal + 1);
      const metadata = root.userData.review || { id: `compound-${key}-${ordinal}`, owner: 'compound', sourceRef: 'city/compound.js#buildCompound', category: 'Structures' };
      directRoots.push({ root, metadata });
    }
    // Model fetch completion may reorder scene.children. Registration order is
    // stable too, so an unchanged reload produces the same catalog document.
    directRoots.sort((a, b) => a.metadata.id < b.metadata.id ? -1 : a.metadata.id > b.metadata.id ? 1 : 0);
    for (const { root, metadata } of directRoots) registerRoot(root, metadata);

    const propPlacements = props.getPropReviewPlacements();
    const treePlacements = trees.getTreeReviewPlacements();
    const treeMetrics = new Map();
    const stableIdOwners = new Map();
    const propCatalog = partitionPlacements(propPlacements, stableIdOwners);
    const treeCatalog = partitionPlacements(treePlacements, stableIdOwners);
    // The editor eagerly requests every asset's overview. Keep smaller sets as
    // independent actors sharing their canonical geometry; group only the
    // largest sets needed to fit its actor limit, with room for future content.
    stats.placementBudget = limitPlacementActors([propCatalog, treeCatalog], 4500, registry.size);

    function placementMetric(placement, category) {
      if (category === 'Props') {
        const metric = PROP_METRICS[placement.name];
        if (!metric) throw new Error(`Missing bounds for ${placement.name}; run npm run prepare:review.`);
        return metric;
      }
      if (!treeMetrics.has(placement.assetId)) {
        const asset = trees.createTreeReviewAsset(placement.sp, placement.v, 'review');
        treeMetrics.set(placement.assetId, { ...measureReviewRoot(asset.root), meshes: asset.root.children.length }); asset.dispose();
      }
      return treeMetrics.get(placement.assetId);
    }
    function placementBounds(placement, category) {
      if (category === 'Trees') return placement.bounds.clone();
      const metric = placementMetric(placement, category);
      return new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...metric.bounds.center), new THREE.Vector3(...metric.bounds.size));
    }
    async function canonicalRoot(placement, category, profile, signal) {
      return retain(`${placement.assetId}:${profile}`, async () => {
        if (category === 'Props') {
          const asset = await props.loadPropReviewAsset(placement.name, { signal });
          try {
            const review = makeReviewRoot(asset.root, profile);
            return { root: review.root, dispose() { review.dispose(); asset.dispose(); } };
          } catch (error) { asset.dispose(); throw error; }
        }
        const asset = trees.createTreeReviewAsset(placement.sp, placement.v, profile, { signal });
        try {
          const review = makeReviewRoot(asset.root, profile);
          return { root: review.root, dispose() { review.dispose(); asset.dispose(); } };
        } catch (error) { asset.dispose(); throw error; }
      }, signal);
    }
    for (const [catalog, category] of [[propCatalog, 'Props'], [treeCatalog, 'Trees']]) {
      const tags = category === 'Trees' ? ['scene-crown-proxy', 'static-vegetation'] : [];
      const label = (p) => category === 'Trees' ? `${p.sp} tree` : p.name.replaceAll('_', ' ');
      for (const placement of catalog.singles) {
        registerDeferred({ actorId: placement.id, assetId: placement.assetId, name: label(placement),
          sourceRef: `${sourceFor(placement.zone)};${placement.sourceRef};${placement.assetSourceRef};placement:${placement.id}`,
          owner: placement.zone, category, matrix: placement.m,
          box: placementBounds(placement, category).applyMatrix4(placement.m), metrics: placementMetric(placement, category), tags,
          // canonicalRoot already owns its lifetime; this wrapper must not dispose it twice.
          produce: async (profile, signal) => ({ root: await canonicalRoot(placement, category, profile, signal), dispose() {} }) });
      }
      for (const group of catalog.groups) {
        const first = group.placements[0], box = new THREE.Box3();
        for (const placement of group.placements) box.union(placementBounds(placement, category).applyMatrix4(placement.m));
        registry.placementGroups.set(group.assetId, group);
        registerDeferred({ actorId: group.actorId, assetId: group.assetId, name: `${label(first)} placements · ${group.zone} (${group.placements.length})`,
          sourceRef: `${sourceFor(group.zone)};${first.assetSourceRef};group:${group.assetId}`,
          owner: group.zone, category: `${category} · placement groups`, matrix: group.matrix, box,
          metrics: estimatePlacementGroup(placementMetric(first, category), group), tags: [...tags, 'placement-group', `canonical:${first.assetId}`],
          produce: async (profile, signal) => createPlacementGroup(await canonicalRoot(first, category, profile, signal), group) });
      }
      await nextTask();
    }
    stats.props = propPlacements.length;
    stats.trees = treePlacements.length;
    stats.placementGroups = propCatalog.groups.length + treeCatalog.groups.length;
    stats.individualPlacements = propCatalog.singles.length + treeCatalog.singles.length;
    if (registry.size > 5000) throw new Error(`The catalog has ${registry.size} actors; the supported editor limit is 5000.`);
    for (const sequence of navigationSequences()) registry.registerNavigationSequence(sequence);

    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const authorization = createSpatialReviewEditorAuthorization({ allowOfficialEditor: true, allowedOrigins: [], allowLoopbackPeers: local });
    lifetime.signal.throwIfAborted(); loading.restore();
    detach = attachSceneAssetRegistryBridge(registry, { authorization, maxGeometryBytes: MAX_BYTES, maxConcurrentAssetRequests: 2, maxInFlightBytes: 96 * 1024 * 1024, maxQueuedAssetRequests: 24, maxResourceBytes: 32 * 1024 * 1024 });
    stats.actors = registry.size; stats.assets = assets.size; stats.assemblies = registry.assemblySize; stats.journeys = registry.navigationSize;
    stats.bootstrapMs = Math.round(performance.now() - began);
    // A capture-only diagnostic surface also allows the focused integration smoke to inspect results.
    window.__spatialReview = { registry, stats, dispose, sourceScene: scene, propPlacements, treePlacements, placementGroups: registry.placementGroups };
    document.documentElement.dataset.captureState = 'ready';
    status.textContent = `Ready: ${stats.actors.toLocaleString()} review actors represent all ${stats.props.toLocaleString()} props and ${stats.trees.toLocaleString()} trees, plus the city architecture.\n${stats.assemblies} places and ${stats.journeys} camera routes. Repeated placements are grouped by source owner; canonical designs remain separate Assets.\n${stats.warnings.join('\n')}`;
    console.info('Spatial Review ready', stats);
  } catch (error) { dispose(); throw error; }
}
