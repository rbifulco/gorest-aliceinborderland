# Spatial Review integration plan

This is the permission, scope, source-mapping, and acceptance record for the new
Spatial Review integration on `feat/spatial-review`. The integration follows
[Install or update Spatial Review](https://github.com/rbifulco/alterno-spatial-review/blob/main/agents/install.md)
and its linked structure, transport, navigation, and performance references.

**Record date:** 2026-10-22. **Source baseline:**
`25b9b98ed2f59a7061ecd31cc8682f0150e0b252`.

**Historical installation acceptance (22 October):** implementation and capture/transport checks are complete.
Full hosted-editor UI acceptance remains **blocked during preparation in the
software-rendered test environment**. The editor received the final catalog and
successful asset responses but did not open. The unverified checks are listed
below; this record does not claim full end-to-end installation acceptance.

## 1. Permission and scope

The user requested a branch implementing the installation procedure and
explicitly authorized `https://spatial-review.alterno.dev` as an editor on
2026-10-22. This authorizes the capture workflow and the framing needed for
that editor. Reconfirmation is unnecessary for this scope.

| Decision | Recorded scope |
| --- | --- |
| Official editor | `allowOfficialEditor: true`; exact origin `https://spatial-review.alterno.dev` |
| Registered data | Explicitly registered scene/asset structure, geometry, transforms, materials, generated and model textures, texture URL strings, and repository source references |
| Other application data | The SDK does not expose arbitrary DOM, cookies, storage, unrelated state, or unregistered objects |
| Local editors | Cross-port loopback peers may be enabled only when the producer runs on loopback, for local development acceptance |
| Other production editors | No additional production origin is authorized |
| Framing | Permit the official editor to embed the capture document; inspect its actual HTTP headers during acceptance |
| Deployment | This task prepares a development integration and static build. No production deployment or GitHub Pages configuration is included |

Before bridge attachment, inspect the registered textures' `sourceRef`,
`requestUrl`, `currentSrc`, and `src` strings. Publish stable credential-free
URLs only. Generated canvas and embedded model images use the origin-checked
live resource transport when no suitable image URL exists. A texture resource
ID alone is not evidence that bytes can be delivered.

The capture bridge announces build identity, counts, capabilities, and limits
to its parent/opener before request authorization. Catalog geometry and texture
bytes remain subject to SDK origin and peer checks.

## 2. Packages, commands, and URLs

| Item | Value |
| --- | --- |
| SDK | Released npm package `@alterno-dev/spatial-review`, pinned to `0.9.0` |
| Protocol | Resolved by the SDK's exact `0.9.0` dependency |
| Three.js | Existing `0.170.0` retained; compatible with SDK peer range `>=0.160.0 <1` |
| Package installation | `npm ci` from the committed lockfile |
| Development server | `npm run dev`, serving with `python tools/serve.py 8765` |
| Ordinary website | `http://localhost:8765/` |
| Capture document | `http://localhost:8765/spatial-review.html` |
| Discovery | `http://localhost:8765/.well-known/spatial-review.json` |
| Review | <https://spatial-review.alterno.dev/review?site=http%3A%2F%2Flocalhost%3A8765%2F> |
| Checks | `npm test`: existing JavaScript syntax check (`bash tools/check.sh`); browser acceptance is recorded separately |
| Static build | `npm run build`, writing the complete runnable site to `dist/` |

The review URL above is the result of
`spatialReviewEditorUrl('http://localhost:8765/')` from SDK 0.9.0. The capture
document generates its own link for the address actually in use. `localhost`
and `127.0.0.1` are different origins; use one consistently within a workflow.

Static discovery is the selected discovery path. It supports the official
browser editor and direct/non-browser inspection while keeping SDK code off
the ordinary route. Do not attach an additional discovery bridge to the game.
The manifest's `liveCapture` value is `../spatial-review.html`, relative to the
final discovery-document URL. For a project subpath `/project/`, the manifest
is `/project/.well-known/spatial-review.json` and resolves the capture page at
`/project/spatial-review.html`.

The static build must copy the complete runtime models, card images,
JavaScript modules, required dependencies, capture page, and `.well-known`
directory. Hidden-file retention and asset completeness require direct checks
of the generated output. Those checks do not establish deployment success. The generated `_headers`
contains exact official-origin framing for the capture, discovery CORS and
card-image CORS. Its default routes target a root deployment. Set
`SPATIAL_REVIEW_BASE_PATH=/gorest-aliceinborderland npm run build` when a host
mounts the export at that project path; relative application URLs need no
rewrite. Hosts without `_headers` support require equivalent server settings.

## 3. Representation and source inventory

The capture is a frozen development-review representation of the city. It
reuses authoritative construction functions without creating the game's
renderer, post-processing, collision BVH, or player interaction loop.

| Review subject | Scale and ownership | Authoritative source |
| --- | --- | --- |
| Compound, entrance, maze, towers, pipe plant, yards, approach highways | Scene environment and construction assets; existing merged boundaries remain coarse | `city/compound.js#buildCompound`; inner `entrance`, `maze`, `catwalks`, `cardTower`, `controlTower`, `pipeZone`, `truckYard`, `highway` |
| Authored districts and their place bounds | Transform-only place assemblies with explicitly owned contents | `city/map.js#DISTRICTS`; district `build` functions |
| City land, quay, street grid, procedural buildings and general context | Scene environment assets from source zones | `city/index.js#buildCity`; `city/buildings.js#cityBuilding`; `city/street.js` |
| Canonical props and each placement | One actual source placement exposes each canonical Asset; other placements are independent actors or instance groups within the same authored zone and design | `city/props.js#prop`, `PROPS`, `normalise`; calling district source; `models/props/lod/`; `spatial-review/instances.js` |
| Canonical tree variants and each placement | One actual source placement exposes each species/variant Asset; other placements are independent actors or instance groups within the same authored zone and design | `city/trees.js#plantTree`; `city/treegen.js`; `city/treetex.js`; calling district source; `spatial-review/instances.js` |
| Shibuya/Tokyo Tower PLATEAU buildings and street furniture | Loaded source roots, with source model and placement traceability | `city/realbldg.js#realBuildings`; `city/index.js#buildCity`; `models/real/` |
| Shibuya underground and Takeshiba interior | Source model roots and their authored placement | `city/ubld.js`; `city/takeshiba.js#takeshiba`; `models/real/` |
| Airships and card faces | Frozen source placements at capture time zero; canonical model/card assets | `city/index.js#airships`; `city/cards.js#paintedMap`; `models/props/lod/airship.glb`; `cards/` |
| Compound trucks | Independent source placements using canonical GLB designs | `city/compound.js#truckYard`; returned `truckSpots`; `models/truck_semi.glb`, `models/truck_box.glb` |
| Hunt participants and Light Bulb interior participants | Frozen physical people and attachments within their source venue hierarchies | `city/hunt.js#hunt`; `city/lightbulb.js#createLevel`; `models/people/web/` |
| Authored trailer camera movement, when exposed | Experience sequences mapped from authored inputs; Scene actors provide context | `trailer/shotlist.js#SHOTS` and `trailer/shots.js` |

Each rendered subtree has one registration owner. A district assembly has no
render geometry. Asset identity, actor placement identity, and assembly identity
are separate. Shared materials, proximity, or a render-batch name alone do not
define scene ownership.

### Complete placement inventory within the editor actor limit

The editor supports at most 5,000 catalog actors. The adapter partitions the
complete source prop and tree inventories instead of dropping distant or
repeated placements. It sorts source IDs and reserves one actual placement
per canonical design as an independent actor, keeping the canonical Asset
available for design-level review. Remaining placements can be grouped only when both their authored source zone
and canonical design match. The adapter selects the largest groups until the
complete catalog fits a 4,500-actor budget, leaving room below the editor limit.
Smaller sets remain ordinary actors sharing the same canonical asset. This
minimizes the number of distinct group assets the editor eagerly prepares
without omitting a placement or changing its ownership.

Each larger group is one deferred Scene actor whose component meshes carry
all of that group's instance transforms and stable placement IDs. The actor
is anchored at its first source position; inverse-anchor and canonical
component transforms are folded into the instance matrices. Its descriptor
bounds cover every instance, and byte estimates include component matrices
and stable IDs. Grouping changes the catalog's granularity without changing
source positions, discarding placements, or merging unrelated source owners.
Actor, asset, instance-group, and represented-placement counts must be recorded
separately after the browser capture confirms them.

`PlacementRegistry` subclasses the SDK through public APIs only. It lets
`SceneAssetRegistry.produceAssetRepresentation()` serialize the actual Three
root and retain live texture ownership, adds stable IDs to the returned
transfer copy, and calls public `prepareAssetTransfer()` again. It does not
replace the SDK's serializer or hand-build an asset document that would bypass
live resource retention.

### Boundaries and intentional exclusions

- Procedural environment geometry is already merged into zone/material batches.
  The initial integration exposes those coarse construction boundaries. It
  cannot independently move every wall, beam, or procedural building that was
  merged into one source surface. More detailed placement feedback requires an
  explicit construction adapter for that subject.
- Prop and tree placements come from source records, not the live camera's
  distance-culling and LOD pools. A source placement is included once even when
  the game renderer would currently hide it or draw overlapping LOD transitions.
- Main-level moving compound staff, their patrol animation, and the controlled
  player are initially excluded. This limits reviews that depend on those
  people, poses, or gameplay clearances.
- The capture does not simulate the Light Bulb puzzle, combat, collision, audio,
  day/night progression, or interactive game state. The selected frozen state
  must be stated beside any screenshot or feedback that depends on it.
- Hunt and Light Bulb people are sampled at animation time zero. Capture bypasses
  their camera-range visibility checks, so the crossing's runners receive their
  authored starting path offsets and the physical underground venue remains
  included. These capture branches do not change the ordinary game's culling.
- The painted skyline ring is disabled by the ordinary game and is excluded
  from visible review context. Actual city geometry supplies the skyline.
- Collision-only meshes, helpers, duplicate LODs, and presentation-only effects
  are excluded from registered roots.
- Full visual reproduction of the renderer's shader and post-processing stack
  is outside the initial review representation; material limits are below.

### Experience selection

The integration exposes all 18 authored camera journeys in Experience. Each
sequence is derived from `SHOTS` rather than copying its numbers into another
source definition. Use the authored line endpoints,
look-at endpoints and FOV. Retain duration as source metadata and segment
weight; weight is relative within a sequence, so the editor does not guarantee
the trailer's absolute playback time. The representative journey is `a1_aerial`: an authored eight-second shot,
linear camera/aim paths and 32-degree FOV.

The `a3_airship` shot uses a time-dependent `cam()` function. It requires a
read-only sampled representation or an explicit exclusion. Shots with shake,
nonlinear easing, changing gameplay state, or lighting carry those additional
limits. The ordinary UI's independent POI destinations are not one continuous
authored route; `main.js#fly` starts at the current camera and uses smoothstep
timing. The final acceptance record must list the actually exposed journeys.

## 4. Identity and feedback mapping

Use deterministic semantic IDs from source content and role. Independent actor
IDs name their source placements; grouped actor/asset IDs name the authored
zone and canonical design. The separate canonical Asset keeps its design ID.
Assembly IDs and actor IDs share a cross-kind namespace. Keep registration
order, component hierarchy, and material ordering stable for unchanged content.

`stablePlacementId(sourceId)` computes an unsigned 32-bit FNV-1a hash over the
UTF-8 source placement ID. Capture checks collisions across both prop and tree
inventories and fails explicitly rather than publishing an ambiguous ID.
Every component of a placement group carries the same stable-ID sequence in
its `instanceData`, with `selection: 'instance'`. The group's retained
`sourceIds`/`stableIds` mapping resolves instance feedback to the original
placement. Source ordering may change an instance's numeric array index;
feedback must follow its stable ID, not that array index. Generated placement
source IDs use authored zone/design ordinals unless an explicit review ID is
provided; reordering those authored calls still requires an identity mapping
or a declared new review baseline.

This is a new review baseline. The extraction of compound construction from
`main.js` into `city/compound.js` changes source location without changing its
construction values or call order. New feedback must use the new source path.
When future changes alter identity, retain old review sets and record a mapping
to new IDs, or declare a new baseline. Do not silently retarget old feedback.

| Coordinate | Mapping to authoritative source |
| --- | --- |
| Position and size | Metres; +X east, +Y up, +Z south; no axis or unit conversion |
| Protocol rotation | XYZ Euler angles in degrees; convert to radians when applying Three.js source transforms |
| Source YXZ rotations | Preserve the source quaternion/rotation order; decompose the same orientation instead of reinterpreting XYZ degree values as YXZ |
| Owned actor/assembly operation | Apply the supplied parent-local pose to the named owner exactly once; do not also apply derived child-world changes |
| Asset component operation | Component-local coordinates in the canonical design |
| Instance operation | Resolve group, component and stable instance ID to the original source placement; convert the group-local instance matrix through the group's anchor before applying a source edit |
| World camera/aim point | Apply directly in source world coordinates |
| Surface annotation | Keep actor/component-local anchor and stable target ID; bounds center may differ from the source pivot |

Every actor/asset/assembly/journey should carry a repository-relative path and
searchable source symbol or content key in `sourceRef`. Material definitions
have no protocol `sourceRef` field: resolve them using their stable asset and
material identity plus the table below. A texture URL identifies transport,
not its construction code.

The review loop is: identify a subject, export compact feedback, map its stable
target to source, apply the intended source edit, refresh the website/capture,
then verify the result. Retire a matching local proposal only after source
contains the intended result. Preserve unresolved annotations across refresh.

## 5. Materials and textures

| Material family | Source mapping | Representation and limit |
| --- | --- | --- |
| Compound/city procedural surfaces | `kit.js#mats`, `def`, `canvasTex`; district material definitions | Standard PBR fields and supported map slots in Asset detail; generated canvas textures transferred live |
| Procedural facade appearance | `kit.js#parallaxFacade`; `city/index.js#facade`; `city/buildings.js` | Retain supported base/normal/roughness/emissive maps; parallax and interior shader injection are approximate |
| Imported prop/truck models | GLB material definitions; `city/props.js#normalise`; model path | Retain material/component structure and decoded images supported by the SDK |
| PLATEAU replacement materials | `city/realbldg.js`; `city/takeshiba.js`; `city/ubld.js` | Retain supported replacement PBR materials and generated maps |
| Trees | `city/trees.js`; `city/treetex.js`; `city/treegen.js` | Detail preserves branching, leaf-card geometry, bark/leaf maps and an alpha mask. Visible RGB/RGBA vertex colors remain spatially varying; per-placement seasonal tint, wind, crown shading, dithering, translucency and custom shadows are omitted |
| Card paintings | `city/cards.js#paintedMap`; `cards/` | Stable credential-free direct image URL where available; live decoded-image fallback |
| Water, reflections, fog, grading, bloom, AO, DOF, shafts | `main.js`; `city/sky.js`; `city/hfog.js`; `city/grade.js`; `city/godrays.js`; `spatial-review/water.js` | Static standard-material water retains supported appearance and baked venue openings; shader-only effects, additive fog/light pools and reflection surfaces are excluded, and renderer effects are not reproduced |

SDK 0.9.0 retains visible RGB/RGBA vertex colors, UVs and supported texture maps
in both Scene and Asset exports. The scene profile omits supplied normals.
Overview geometry with UV/color attributes uses a cached BufferGeometry wrapper
that shares source attribute/index buffers while preserving old geometry IDs and seams;
position-only surfaces can still use the established welding optimization.
The existing tree overview remains a declared crown/trunk composition proxy,
with source vertex tint; the detailed tree retains bark and leaf maps.

Both prop profiles reuse one canonical GLB source per asset for the capture
lifetime. Repeated placement groups keep sharing that geometry and its textures.
Material copies preserve the original vertexColors opt-in; custom shader
attributes do not enable RGB shading by their mere presence. The inspected tree
RGB is visible color. Wind, dither, crown lighting, seasonal instance tint,
water/reflection effects and facade parallax remain documented approximations.

The SDK also omits `emissiveIntensity`. The adapter multiplies each cloned
emissive color by the source's sampled intensity before serialization, so
surfaces with emission switched off remain dark. The protocol's color fields
do not preserve the source renderer's HDR glow or bloom.

The 0.9 adapter removes the older mean-vertex and mean-map tint workarounds.
It preserves original maps and the material transparent flag in both profiles.
The SDK still omits alphaTest: cutouts retain the existing source-derived
threshold alpha-map approximation; ordinary RGBA blending retains its white mask.
The editor uses transparency rather than the source renderer's alpha-test
pipeline, so edge blending and depth ordering remain approximations. Existing
source alpha maps remain intact. Live transfer and decoding passed the focused browser check, and the generated
mask matched all 524,288 source-alpha pixels. Visual appearance in the official
editor is a separate acceptance item. The procedural leaf atlas is an
RGBA8 DataTexture; mask creation reads its typed pixels directly. Its custom
coverage-preserving mip chain is not transferred by the SDK.

Shader-material flame, smoke, jet and light-shaft meshes, additive transparent
fog and light-pool meshes, tracer lines, points, sprites, hidden subtrees and
explicit presentation exclusions are omitted. Ordinary basic-material neon
geometry remains included.
Their undeformed CPU geometry cannot stand in for the rendered effect. Bounds
and byte estimates use the same filtered traversal as representation creation,
so these effects cannot inflate descriptors or introduce a false origin anchor.
Skinned people and active morph poses are baked into request-owned static
geometry. Overview buffers and their vertex cache are capture-owned; detailed
unchanged geometry and source textures remain shared. Materials and generated
alpha masks are request-owned. Runtime `userData` graphs are not
JSON-cloned or exposed as component metadata.

The bay plane needs a geometry adapter because its source shader discards
water over the arena pits, Shibuya concourse and Light Bulb stair shaft.
Capture-only metadata records those authored rectangle limits with the same
one-decimal rounding used in the source shader. Before measuring or exporting
the bay, `bakeReviewWaterHoles()` subtracts the rectangles into nonoverlapping
quad pieces, including overlapping-hole unions, and retains the original
water-plane UV mapping. Descriptor costs therefore count the baked geometry.
The ordinary page retains its original plane and shader implementation.

Representative texture acceptance must record the asset, material ID, map
slot, direct/live path, MIME type, decoded result, and terminal outcome. Use one
generated texture and, when direct loading is used, one card image. Keep the
capture alive while live resources are requested. The SDK's deferred texture
delivery grace is 60 seconds; an evicted resource requires a regenerated
representation and its current resource IDs.

## 6. Capture lifecycle and performance decisions

The capture document sets its fixed random seed before dynamically importing
modules with top-level procedural texture generation. It constructs the source
world through `buildCompound` and the capture mode of `buildCity`. Simulation
time is fixed at zero. Runtime camera culling and collision batch construction
are bypassed only for capture. Loading failure must be explicit rather than
silently publishing a smaller ready catalog.

Hunt participants use fixed clip time, playback scale, and crouch depth for
capture; the initial runner offsets remain the authored values. Light Bulb
preallocates its four participant roots in source order before asynchronous
model loads, so model completion order cannot change those component paths.
Both venues evaluate their initial physical poses even when the capture camera
is elsewhere. Animated shader effects and gameplay progression are excluded
from this frozen state.

Complete every intended eager registration, deferred descriptor, assembly,
and selected navigation sequence before attaching one authorized capture
bridge. The SDK promotes the first requested catalog from `booting` to
`catalog-ready`; producer-controlled initial bootstrap progress is unsupported.
Use `setSourceStatus()` only for forward post-catalog status.

Large geometry is deferred so metadata and bounds can be available without
serializing the entire city. Canonical designs are retained once per requested
profile for the capture lifetime; placement groups share their geometry and
materials while owning their instance matrices. Each descriptor needs accurate world
bounds, transform, representation revision, and size estimates. Producers
must honor `AbortSignal`, lower request byte ceilings, and progress limits.
Yield between expensive chunks; the default long-task trigger is 50 ms.
Deferred producers use `scheduler.yield()` with a short-lived `MessageChannel`
fallback, avoiding a background timer for every representation. This scheduling
change is capture-only.

The observed pre-change ordinary-page trace contains a **19,268 ms** startup
long task and a **24,128.2 ms** ready time in this test environment. This is
evidence that reconstructing the world is expensive. Capture construction and
individual representation timings still require their own measurements; the
ordinary-page trace does not establish their transfer cost.

The compatibility target is the current official editor with
`asset-stream-v1`. Deferred-only content is absent from older complete-catalog
consumers; no legacy-editor compatibility is promised without a named and
tested fallback target. Assembly-aware consumers get ownership editing;
SDK flat fallback loses inherited assembly movement/visibility.

On refresh, replace the entire registry or detach its bridge before changing
multiple registrations. Attach the replacement only after the new initial set
is complete. Build identity must change when source can change captured
geometry, materials, textures, placements, or journeys. Teardown detaches the
bridge and releases capture-owned producers, resources, timers, and caches.

## 7. Ordinary-page baseline

Baseline evidence was recorded before integration at
`http://127.0.0.1:8765/?lite`, viewport **960 × 600**, using a fresh browser
context and server `Cache-Control: no-store`.

| Observation | Recorded result |
| --- | --- |
| Navigation to recorded ready state | 24,128.2 ms |
| Initial camera | `[-95, 72, 112]` |
| Initial target | `[0, 6, -4]` |
| Representative interaction | Select the overhead plan view |
| Interaction to recorded result | 7,952.1 ms |
| Result camera/target | `[0.01, 200, 1]` / `[0, 0, 0]` |
| Scene children at initial observation | 5,362; assets continued loading later |
| Visible view buttons | Ten recorded buttons, including overview, plan, elevation, day/dusk, cinema, quality, and play |
| District entries | 13 |
| Console | One resource-404 message and repeated Canvas2D readback performance warnings |
| Network limitation | `shibuya_bldg.glb` recorded `net::ERR_ABORTED`; full model-load completion is not proven by this baseline |

Evidence locations from the implementation session:

- `/tmp/gorest-browser-before/results.json`
- `/tmp/gorest-browser-before/overview.png`
- `/tmp/gorest-browser-before/plan-view.png`

These are recorded session artifacts, not repository files or production
measurements. Their key results are retained above. The numerical baseline
comes from a single sample; compare only with the same environment, route,
viewport, interaction, and cache state. Do not treat the baseline's partial
load observation as evidence that all asset requests succeeded.

The original package had an `npm test` placeholder that deliberately exited 1
and no build script. Its meaningful existing check was `bash tools/check.sh`.
The integration adds real test/build commands rather than treating the
placeholder as a passing suite.

## 8. Acceptance evidence

The performance screen applies because this integration extracts shared
construction code and adds capture branches in source modules. Although the
ordinary page does not import the review SDK, that isolation alone does not
prove visual, functional, or performance parity.

| Check | Trigger | Before | After | Result or limitation |
| --- | --- | --- | --- | --- |
| Ordinary-page startup | Shared construction extraction | 19,513.3 ms median | 20,241.6 ms median | Three alternating fresh-context samples per revision; +728.3 ms / +3.73%, below the combined >10% and ≥100 ms trigger |
| Representative interaction | Shared runtime source | 7,952.1 ms, overhead-plan selection | 7,463.5 ms | Same resulting camera `[0.01, 200, 1]`, target `[0, 0, 0]`, and visible plan |
| Review-only runtime work | New capture path | Ordinary page had no review SDK | Zero SDK/capture requests | The ordinary route has no review bridge, registry or continuous review work |
| Visual/functional parity | Shared construction extraction | Overview and plan screenshots recorded | Matching views and controls inspected | No application exceptions in the repeated startup comparison; this is not a full gameplay test |

| Acceptance item | Evidence/status |
| --- | --- |
| Pre-change syntax check | Existing `bash tools/check.sh` passed; original `npm test` was a failing placeholder |
| Compound extraction syntax | `bash tools/check.sh` passed immediately after extraction |
| Compound source equivalence | 335 moved construction lines matched the original after removing indentation and two descriptive mesh-name additions |
| Complete changed-source checks | `npm test` passed; final revision rerun recorded in validation JSON |
| Static build | `npm run build` passed; discovery, models, modules and card image served at both root and a project subpath |
| Discovery from ordinary URL | The official editor discovered the capture from the ordinary website URL and received the final 4,497-actor / 920-asset catalog |
| Static discovery status/schema/CORS | HTTP 200, correct discovery schema, relative capture URL and exact approved-origin CORS verified |
| Capture framing | Actual capture CSP permits the official editor; its embedded capture loaded and returned a catalog |
| Catalog completeness/readiness | 4,497 actors and 920 assets represent all 13,493 props and 3,720 trees exactly once, plus 246 architecture/source-root actors; 194 assemblies and 18 journeys |
| Reproducible capture | Keyed IDs/transforms/bounds/placement inventories matched across reloads, with zero producer-induced changes; final direct-root sorting also stabilizes async completion order |
| Scene representative | Source geometry and placement checks pass; interactive hosted Scene inspection was not reached before the preparation deadline |
| Asset representative | Canonical taxi and generated tree detail transferred and decoded; hosted Asset visual inspection was not reached |
| Experience representative | All 18 source-derived sequences are present in the final catalog; hosted `a1_aerial` stop/segment/handle interaction was not reached |
| Deferred geometry | Every one of 920 overview assets completed under both request profiles; grouped detail, canonical detail and resources passed focused cross-origin transport checks. Official UI acceptance is recorded separately |
| Generated live texture | Tree bark, leaf atlas and generated cutout mask transferred as PNG and decoded; canonical taxi and grouped texture paths also passed |
| Direct image path, if used | Card image responded HTTP 200 with image MIME and approved editor CORS at root and project subpath |
| Feedback export | Unverified: editor preparation blocked access. No disposable source change or feedback note was made; `a1_aerial` FOV remains 32 |
| Deferred cancellation | In-flight city-bus request reached terminal `cancelled`; the corresponding fetch aborted as expected |
| Refresh and teardown | Unchanged catalog/placement digests matched across full reloads; after disposal the bridge stopped replying |
| Production deployment | Outside this task; unverified |

The first startup comparison used a delayed DevTools observation while the
software renderer was busy. The repeated comparison instead timestamps loading
overlay removal inside the page. Before samples were **18,950.6, 19,513.3 and
19,528.5 ms**; after samples were **19,812.5, 20,540.7 and 20,241.6 ms**. The
three-pair comparison ran with no concurrent renderer workload, at 960 × 600,
DPR 1, with fresh contexts. These numbers characterize this constrained
software-rendered acceptance environment, not real-device game performance.

For a `busy` deferred result, wait at least `retryAfterMs` and attempt the
representative request no more than three times. After the third `busy`, record
an explicit unsettled failure. Do not mark queued, active, or progress states
as a completed transfer.

Only add a check when this integration changes the corresponding capability.
Protocol queue, resource lifetime, and transport conformance belong to the SDK
suite. Record editor defects separately from website regressions. Restore
disposable review edits and preserve any existing user feedback.

## 9. Completion record

The final implementation build is `gorest-30675664aa7cefb63be6b3b3`.
`npm test`, `npm run build` and `git diff --check` pass. Complete portable
measurements and revision qualifications are in
[spatial-review-validation.json](spatial-review-validation.json).

The full overview-budget scan used the immediately preceding geometry revision
`gorest-3cf3f5363669dd17f98b0264`. Subsequent changes stabilize catalog ordering
and tree component/material names, and complete static header configuration;
they do not change geometry or placement coverage.

| Final capture inventory | Count |
| --- | ---: |
| Source prop placements | 13,493 |
| Source tree placements | 3,720 |
| Individual prop/tree actors | 3,641 |
| Placement-group actors | 610, covering 13,572 placements |
| Architecture and other source-root actors | 246 |
| Total actors / unique assets | 4,497 / 920 |
| Place assemblies / nested place relationships | 194 / 6 |
| Authored camera journeys / stops / segments | 18 / 36 / 18 |

| Complete overview production | Scene request profile | Review request profile |
| --- | ---: | ---: |
| Successful assets | 920 / 920 | 920 / 920 |
| Prepared payload accounting | 122.40 MiB | 122.49 MiB |
| Consumer allocation accounting | 93.83 MiB | 93.83 MiB |
| Allocation including reconstructed normals | 149.71 MiB | 149.71 MiB |
| Nodes | 8,319 | 8,319 |
| Expanded-instance accounting | 26,446 | 22,298 |
| Render-free producer time | 3.796 s | 1.034 s |

Capture bootstrap took 11.885 s in that scan. The current official consumer's
192 MiB payload/allocation gates are per profile; its node and expanded-instance
limits are 100,000 and 200,000. Selected detail consumes additional budget.
Asset and Experience share the review-profile client. These figures do not
measure editor rendering or preview-generation time.

Critical static-subpath checks passed: all six parent relationships, all 4,497
reconstructed world poses (maximum numerical error 1.08 × 10⁻¹³), full placement
coverage, stable instance IDs, canonical asset separation, water openings,
live decoded textures, leaf cutouts, cancellation and teardown. The maximum
sampled grouped-vertex error was 7.63 × 10⁻⁶ m. No application/HTTP errors or
requests escaping the static subpath were observed.

A raw metadata hash initially differed because asynchronous model completion
reordered four direct-root actors. A keyed comparison proved identical IDs,
transforms, bounds, placements and groups, with SHA-256
`2c9431b9c3037f917f343e4ed6d468aea9d08aeaf4c624a3981d3dbd128c4249`.
The final adapter sorts direct-root registration by stable metadata ID. Tree
components and materials use the same `Wood`/`Leaves` semantic names in overview
and detail, preserving targets when a representation is replaced.

### Hosted editor acceptance

The initial full-detail overview attempt used 1,763 distinct assets and hit the
editor's 300-second absolute preparation deadline at 180 ready assets. Successful
asset writes continued near the deadline; no JavaScript or HTTP failure was
reported. Consumer-source inspection established eager overview preparation
for Scene, Asset and Experience. The resulting asset-count and geometry-buffer
optimizations are reflected in the measurements above.

The fresh final-revision attempt used a 960 × 600 viewport, DPR 0.5 and reduced
motion. The official editor discovered the ordinary local website, loaded the
capture and received the correct final catalog. Capture bootstrap took 15.129 s;
the catalog arrived 17.58 s into the traced connection. All 226 asset requests
received successful responses, with median 141 ms latency and no geometry-budget
rejection. The last successful response arrived at 323.15 s.

The editor then reported: **“Scene preparation stopped making progress.
221 of 920 scene assets ready.”** Its configured absolute preparation deadline
is 300 s after preparation starts; delayed consumer work also delayed observing
the terminal page. The recorded terminal snapshot was taken at 365.46 s. There
were no JavaScript exceptions or HTTP error responses. The editor's removal
of the capture aborted one remaining Shibuya furniture model fetch.

This environment exposes no hardware GPU; Chromium used SwiftShader. Source
production and the complete payload/allocation budget checks pass, while the
consumer's rendered preparation did not complete. Software rendering is a
likely contributor, but performance in a hardware-accelerated browser remains
unverified. This is a concrete acceptance limitation, not a passing editor test.

The Open editor gate was never reached, so interactive Scene, Asset and
Experience review, feedback export, a disposable source edit, and unresolved
feedback retention across refresh are **not verified**. The planned FOV edit
was not made; `a1_aerial` remains at its authored 32 degrees. Existing feedback
was not altered. The remaining acceptance step is to run this branch in a
browser with hardware acceleration and complete those interactions, resolving
any preparation performance issue found there before calling the installation
fully accepted. No production deployment or hosting change was performed.


## SDK 0.9.0 upgrade — 24 October 2026

The owner explicitly requested this update and publication through the existing
GitHub Pages workflow. Source remains `feat/spatial-review`; its successful
`Spatial Review build` triggers the default branch's existing deployment workflow.
The published website is https://rbifulco.github.io/gorest-aliceinborderland/;
the capture is `spatial-review.html`, with unchanged static discovery and origin
approval. No game route, live source renderer, runtime controls or ordinary-page
imports changed. The ordinary-page performance screen is not triggered: all
modified code is capture-only and dependency copies are used only by capture.

Npm pins SDK and transitive protocol at 0.9.0; Three.js remains 0.170.0. There are
no directly declared validator/CLI packages. `package-lock.json` is committed.
`prepare:review` regenerated all 111 model descriptors (59 canonical prop
metrics) with UV/color float sizes and a dependency-inclusive build identity:
`gorest-8d3e96fec3f11f54d0c8d42f`. Existing actor, asset, component, material and
assembly naming/order are retained; build and representation revisions change.
There are no prepared review packages to migrate.

### Local verification and cost

- Before and after: `npm test` (the repository's complete syntax suite) and
  production `npm run build` pass. The final build uses
  `SPATIAL_REVIEW_BASE_PATH=/gorest-aliceinborderland` and retains `.well-known`,
  `.nojekyll`, model and card assets.
- Real capture: 4,497 actors, 920 asset families, 194 assemblies, all 13,493 prop
  and 3,720 tree placements, and 18 authored journeys. Capture had no warnings
  or page errors. One software-browser bootstrap took 42.516 seconds; this is
  an observation under shared test-host load, not a hardware performance claim.
- Aggregate navigation: 36 stops, 18 segments, 68 native point occurrences plus
  50 sampled occurrences (118 camera/aim points total), counted recursively
  across all serialized sequences including baseline/extension fields.
- A cross-origin peer starting from the ordinary URL discovered the capture,
  received the catalog and requested `prop:jp_taxi` and `tree:keyaki:0` in
  Scene/overview and Asset/detail profiles. Every requested map decoded.
- The taxi has 4,360 unique vertices: 105,200 geometry bytes in Scene and
  157,520 in Asset, including 34,880 UV bytes in each. Its three unique image
  resources are shared between profiles and across placements: 2,639,870 PNG
  transfer bytes; 6,291,456 bytes for decoded RGBA8 image storage; approximately
  8,388,610 bytes for full RGBA8 GPU mip chains. These are separate costs, and
  the GPU figure is a format-based estimate, not measured driver allocation.
- Keyaki detail has 1,452 vertices, 71,676 geometry bytes, 17,424 RGB bytes and
  11,616 UV bytes. The established crown/trunk overview has 88 vertices and
  2,576 geometry bytes, including 504 RGB bytes. Four detail texture resources
  transfer 740,999 PNG bytes and decode to 4,456,448 RGBA8 bytes; full mip-chain
  storage is approximately 5,941,932 bytes. Do not multiply these shared-design
  costs by placement count or extrapolate them to the whole city.
- An actual-adapter browser fixture verified normalized RGBA values, Scene and
  Asset UV/maps, source vertexColors true/false flags, shared geometry/textures,
  and disposal without mutating source resources. The old and updated adapters
  were also compared using the actual taxi and keyaki source factories: all
  node, material and geometry IDs match in both profiles, including unnamed
  primitive geometries. Attribute buffers remain shared.

The official editor discovered the ordinary local website and began preparation.
Its UI became unresponsive while preparing this large catalog in SwiftShader;
interactive Scene/Asset/Experience acceptance and feedback export were not
completed locally. This is consistent with the historical preparation limit
above, and is not reported as a passing editor view check. Deployment and hosted
editor results must be assessed separately from these producer checks.
