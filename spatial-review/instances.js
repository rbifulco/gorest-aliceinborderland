import * as THREE from 'three';

const compareIds = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const encoder = new TextEncoder();

/** FNV-1a over the authored UTF-8 source ID. The catalog checks every collision. */
export function stablePlacementId(sourceId) {
  let hash = 0x811c9dc5;
  for (const byte of encoder.encode(sourceId)) hash = Math.imul(hash ^ byte, 0x01000193);
  return hash >>> 0;
}

/**
 * Keep one real actor for each canonical Asset view, then combine repeated
 * placements only within the same authored zone and canonical asset family.
 * Pass the same stableIdOwners Map to separate prop/tree calls, or pass both
 * catalogs together. Its numeric keys also resolve feedback to source IDs.
 */
export function partitionPlacements(placements, stableIdOwners = new Map()) {
  const singles = [], pending = new Map(), canonical = new Set(), seen = new Set();
  for (const placement of [...placements].sort(compareIds)) {
    if (!placement.id || !placement.assetId || !placement.m?.isMatrix4) throw new Error('Incomplete review placement.');
    if (seen.has(placement.id)) throw new Error(`Duplicate placement ID: ${placement.id}`);
    seen.add(placement.id);
    const stableId = stablePlacementId(placement.id), previous = stableIdOwners.get(stableId);
    if (previous !== undefined && previous !== placement.id) throw new Error(`Placement ID hash collision: ${previous} / ${placement.id}`);
    stableIdOwners.set(stableId, placement.id);
    if (!canonical.has(placement.assetId)) {
      canonical.add(placement.assetId); singles.push(placement); continue;
    }
    const zone = placement.zone || 'world';
    const key = `${encodeURIComponent(zone)}:${encodeURIComponent(placement.assetId)}`;
    if (!pending.has(key)) pending.set(key, { key, zone, canonicalAssetId: placement.assetId, placements: [] });
    pending.get(key).placements.push(placement);
  }
  const groups = [];
  for (const group of pending.values()) {
    if (group.placements.length === 1) { singles.push(group.placements[0]); continue; }
    const anchor = new THREE.Vector3().setFromMatrixPosition(group.placements[0].m);
    groups.push({
      actorId: `placement-group:${group.key}`,
      assetId: `placement-group:${group.key}`,
      canonicalAssetId: group.canonicalAssetId,
      zone: group.zone,
      placements: group.placements,
      matrix: new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z),
      sourceIds: group.placements.map((placement) => placement.id),
      stableIds: Uint32Array.from(group.placements, (placement) => stablePlacementId(placement.id)),
    });
  }
  return { singles: singles.sort(compareIds), groups };
}

/**
 * Minimize the number of distinct placement-group assets under an actor budget.
 * A group of n placements saves n - 1 actors, so selecting the largest savings
 * first reaches the budget with the fewest additional assets. All other source
 * placements stay ordinary actors sharing their canonical asset geometry.
 * Mutates the supplied partition results; use fresh partitions for a new budget.
 */
export function limitPlacementActors(catalogs, maxActors = 4500, otherActors = 0) {
  if (!Number.isSafeInteger(maxActors) || maxActors < 1 || !Number.isSafeInteger(otherActors) || otherActors < 0) {
    throw new Error('Placement actor budgets must be nonnegative integers with a positive maximum.');
  }
  const candidates = catalogs.flatMap((catalog) => catalog.groups);
  const originalSingles = catalogs.reduce((sum, catalog) => sum + catalog.singles.length, 0);
  const placements = originalSingles + candidates.reduce((sum, group) => sum + group.placements.length, 0);
  const fullyGroupedActors = otherActors + originalSingles + candidates.length;
  if (fullyGroupedActors > maxActors) throw new Error(`Cannot fit the complete capture within ${maxActors} actors; at least ${fullyGroupedActors} are required.`);
  const ranked = [...candidates].sort((a, b) =>
    b.placements.length - a.placements.length || (a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0));
  const selected = new Set();
  let actors = otherActors + placements, groupedPlacements = 0;
  for (const group of ranked) {
    if (actors <= maxActors) break;
    selected.add(group);
    actors -= group.placements.length - 1;
    groupedPlacements += group.placements.length;
  }
  for (const catalog of catalogs) {
    const singles = [...catalog.singles];
    for (const group of catalog.groups) if (!selected.has(group)) singles.push(...group.placements);
    catalog.singles = singles.sort(compareIds);
    catalog.groups = catalog.groups.filter((group) => selected.has(group));
  }
  return {
    actors, otherActors, placements, groups: selected.size, groupedPlacements,
    individualPlacements: placements - groupedPlacements,
    actorsSaved: otherActors + placements - actors,
    candidateGroups: candidates.length, fullyGroupedActors, maxActors,
  };
}

/** Full world bounds, independent of camera, runtime culling and GPU pools. */
export function placementGroupBounds(group, canonicalBounds) {
  const result = new THREE.Box3();
  for (const placement of group.placements) {
    const box = typeof canonicalBounds === 'function' ? canonicalBounds(placement) : canonicalBounds;
    if (!box?.isBox3 || box.isEmpty()) throw new Error(`Missing canonical bounds for ${placement.id}`);
    result.union(box.clone().applyMatrix4(placement.m));
  }
  return result;
}

/** Include all component matrices and stable IDs in the advertised byte budget. */
export function estimatePlacementGroup(metric, group, componentCount = metric.meshes || 1) {
  const instanceBytes = group.placements.length * componentCount * (16 * 4 + 4);
  const overhead = 8192 + componentCount * 2048;
  return {
    ...metric,
    estimatedBytes: Math.ceil((metric.estimatedBytes + instanceBytes + overhead) * 1.05),
    sceneBytes: Math.ceil(((metric.sceneBytes || metric.estimatedBytes) + instanceBytes + overhead) * 1.05),
    triangles: metric.triangles * group.placements.length,
    meshes: componentCount,
    instances: group.placements.length,
  };
}

/**
 * The caller retains canonicalRoot and owns its geometry/materials/textures.
 * This result owns only its InstancedMesh objects and matrix buffers. Returning
 * the raw Three root lets the SDK retain and transfer live texture resources.
 * The group actor is anchored at the first source position; all component
 * transforms are folded into its instance matrices without modifying sources.
 */
export function createPlacementGroup(canonicalRoot, group) {
  canonicalRoot.updateWorldMatrix(true, true);
  const canonicalInverse = canonicalRoot.matrixWorld.clone().invert();
  const groupInverse = group.matrix.clone().invert();
  const root = new THREE.Group();
  root.name = `${group.canonicalAssetId} placements in ${group.zone}`;
  root.matrix.copy(group.matrix); root.matrixAutoUpdate = false;
  const meshes = [], relative = new THREE.Matrix4(), matrix = new THREE.Matrix4();
  let disposed = false;
  try {
    canonicalRoot.traverseVisible((object) => {
      if (!object.isMesh) return;
      if (object.isInstancedMesh || object.isSkinnedMesh) throw new Error('Placement groups require ordinary canonical meshes.');
      relative.multiplyMatrices(canonicalInverse, object.matrixWorld);
      const mesh = new THREE.InstancedMesh(object.geometry, object.material, group.placements.length);
      mesh.name = `component-${meshes.length}:${object.name || object.type}`;
      mesh.castShadow = object.castShadow; mesh.receiveShadow = object.receiveShadow;
      for (let i = 0; i < group.placements.length; i++) {
        matrix.multiplyMatrices(groupInverse, group.placements[i].m).multiply(relative);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingBox(); mesh.computeBoundingSphere();
      meshes.push(mesh); root.add(mesh);
    });
    if (!meshes.length) throw new Error(`No canonical geometry for ${group.canonicalAssetId}`);
    root.updateMatrixWorld(true);
  } catch (error) {
    meshes.forEach((mesh) => mesh.dispose()); root.clear(); throw error;
  }
  return {
    root,
    dispose() {
      if (disposed) return; disposed = true;
      meshes.forEach((mesh) => mesh.dispose()); root.clear();
    },
  };
}

/**
 * Apply after SceneAssetRegistry.produceAssetRepresentation(), then call the
 * public prepareAssetTransfer() again. This keeps the SDK's live-resource
 * ownership and cache intact while adding IDs its Three serializer omits.
 */
export function attachStableInstanceIds(asset, group) {
  let components = 0;
  const nodes = asset.nodes.map((node) => {
    if (!node.instanceData && !node.instances) return node;
    const data = node.instanceData || {
      encoding: 'matrix-f32-v1', count: node.instances.length,
      transforms: Float32Array.from(node.instances.flat()),
    };
    if (data.count !== group.stableIds.length) throw new Error(`Placement component count mismatch: ${node.id}`);
    components++;
    const { instances, ...rest } = node;
    return { ...rest, instanceData: { ...data, stableIds: group.stableIds.slice(), selection: 'instance' } };
  });
  if (!components) throw new Error(`Missing instance data for ${group.assetId}`);
  return { ...asset, nodes };
}
