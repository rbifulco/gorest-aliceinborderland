import * as THREE from 'three';
import { HeightFog, installHeightFog } from './city/hfog.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { createPlayer } from './player.js';
import { R, _m, addSpot, beacons, canvasTex, idleSpots, mats, plane, spotCount, std, texAsphalt, texPuddle, spots, setZone, initKit, buildBatches, zoneMeshes } from './kit.js';
import { buildCity } from './city/index.js';
import { buildCompound, WH, L1, L2 } from './city/compound.js';
import { createDayNight } from './city/sky.js';
import { DISTRICTS } from './city/map.js';
import { createGrade } from './city/grade.js';
import { createGodRays } from './city/godrays.js';
import { setCardLite } from './city/cards.js';
import { setTreeLite, setTreeSun } from './city/trees.js';
import { FAC_INT } from './kit.js';
import { createAudio } from './city/audio.js';
import { attachBulb } from './city/lightbulb.js';
import { huntState } from './city/hunt.js';

/* ───────────── renderer / scene ───────────── */
const renderer = new THREE.WebGLRenderer({ antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });   // only the composer's full-screen quads reach the canvas (SMAA does the AA)
// integrated GPUs share system memory with everything else: render at 1× and decode model textures at ≤512 px there.
// ?lite (or a previous context loss this session) forces the same budget on any GPU.
const igpu = (() => { try { const gl = renderer.getContext(), d = gl.getExtension('WEBGL_debug_renderer_info'); return /Intel|UHD|Iris|Radeon\(TM\) Graphics|Microsoft Basic/i.test(d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : ''); } catch (e) { return false; } })();
const LITE = igpu || new URLSearchParams(location.search).has('lite') || (() => { try { return sessionStorage.getItem('lite') === '1'; } catch (e) { return false; } })();
const DPR_MAX = LITE ? 1 : 2;
if (LITE && window.createImageBitmap) {   // GLTF images decode through createImageBitmap(blob): shrink big ones before they reach the GPU
  const cib = window.createImageBitmap.bind(window), CAP = 512;
  window.createImageBitmap = async (src, ...rest) => {
    if (!(src instanceof Blob) || rest.length > 1) return cib(src, ...rest);
    const bmp = await cib(src, ...rest), m = Math.max(bmp.width, bmp.height);
    if (m <= CAP) return bmp;
    const out = await cib(bmp, { resizeWidth: Math.round(bmp.width * CAP / m), resizeHeight: Math.round(bmp.height * CAP / m), resizeQuality: 'high' });
    bmp.close(); return out;
  };
}
renderer.domElement.addEventListener('webglcontextlost', () => {   // out of GPU memory: retry once in lite mode
  try { if (sessionStorage.getItem('lite') !== '1') { sessionStorage.setItem('lite', '1'); setTimeout(() => location.reload(), 300); } } catch (e) {}
});
renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_MAX));
setCardLite(LITE);
setTreeLite(LITE);   // fewer near trees, shorter LOD bands, 512² leaf atlas
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04070c);
installHeightFog();
scene.fog = new HeightFog(0x0b1424, 0.0034, .0018);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
scene.environmentIntensity = .22;   // dim env so metals read at night

const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.5, 9000);
camera.position.set(-95, 72, 112);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 6, -4);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.maxDistance = 2600;

const hemi = new THREE.HemisphereLight(0x5a78a0, 0x1a1e26, 1.1); scene.add(hemi);
const moon = new THREE.DirectionalLight(0x7f9fd0, 0.8);
moon.position.set(-80, 120, 60);
scene.add(moon);
initKit(scene);
setZone('compound');


/* ───────────── ground ───────────── */
const groundGeo = new THREE.PlaneGeometry(640, 640);   // compound apron only: the city has its own land slab
const asphalt = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: texAsphalt, color: 0x74767a, roughnessMap: texPuddle, roughness: 1, metalness: .05, alphaMap: texPuddle, transparent: true }));
asphalt.rotation.x = -Math.PI / 2; asphalt.position.set(10, 0, 10); asphalt.receiveShadow = true; scene.add(asphalt);
const refl = new Reflector(groundGeo, { textureWidth: Math.max(512, Math.floor(innerWidth * .6)), textureHeight: Math.max(512, Math.floor(innerHeight * .6)), color: 0xa4b0c0, clipBias: .003, multisample: 0 });
const mirrorOnlyInBeauty = (r) => { const f = r.onBeforeRender; r.onBeforeRender = function (rd, sc, cam, ...a) { if (sc.overrideMaterial) return; f.call(this, rd, sc, cam, ...a); }; };   // AO / DOF passes draw with an override material: skip the mirror re-render there
mirrorOnlyInBeauty(refl);
refl.rotation.x = -Math.PI / 2; refl.position.set(10, -.03, 10); scene.add(refl);

// Shared construction also serves the dedicated, render-free review capture.
const { highways: hw, truckSpots, backdrop: city } = buildCompound(scene);

/* ───────────── the rest of the city (districts in city/*.js) ───────────── */
const cityInfo = buildCity({ scene, camera, highways: hw });

/* ───────────── build merged meshes ───────────── */
const built = buildBatches(scene);
const collidables = [asphalt, ...built.collidables, ...cityInfo.collidables];
for (const ms of zoneMeshes.values()) for (const m of ms) { m.castShadow = !m.material.transparent && !m.material.isMeshBasicMaterial && !m.name.startsWith('det_') && !/\|(road|lineW|lineY|tactX|tactZ|lot|stZebra|shib_zebra|shib_road)$/.test(m.name); m.receiveShadow = true; }   // flat ground layers cast nothing
console.log('triangles', built.tris, 'spots', spotCount, 'beacons', beacons.length);

/* beacons: instanced, two blink phases, with additive halos */
const bGeo = new THREE.SphereGeometry(.24, 12, 8);
const bMatA = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, .15, .1) }), bMatB = bMatA.clone();
{ const keep = beacons.filter((p, i) => p[1] > 12 || i % 3 === 0); beacons.length = 0; beacons.push(...keep); }   // fewer low beacons: calmer night
const bA = new THREE.InstancedMesh(bGeo, bMatA, beacons.length), bB = new THREE.InstancedMesh(bGeo, bMatB, beacons.length);
let ia = 0, ib = 0;
beacons.forEach((p, i) => { _m.makeTranslation(...p); if (i % 2) bA.setMatrixAt(ia++, _m); else bB.setMatrixAt(ib++, _m); });
bA.count = ia; bB.count = ib; scene.add(bA, bB);
const haloTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,60,40,.9)'); gr.addColorStop(.25, 'rgba(255,40,30,.35)'); gr.addColorStop(1, 'rgba(255,20,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
const halos = [];
for (const arr of [beacons.filter((_, i) => i % 2), beacons.filter((_, i) => !(i % 2))]) {
  const pos = new Float32Array(arr.length * 3); arr.forEach((p, i) => pos.set(p, i * 3));
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pm = new THREE.PointsMaterial({ map: haloTex, size: 2.2, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const pts = new THREE.Points(geo, pm); pts.frustumCulled = false; scene.add(pts); halos.push(pm);
}

/* ───────────── markers & views ───────────── */
const POI = [
  { n: '01', name: '入口闸机 (18×4m · 高5m)', p: [0, 8, 47], cam: [-18, 9, 82], tgt: [0, 3, 44] },
  { n: '02', name: '主路 + 坡道 (长18m · 高6m)', p: [0, 7, 28], cam: [26, 16, 58], tgt: [0, 4, 24] },
  { n: '03', name: '迷宫围挡 (4m格 · 高6m)', p: [0, 8, -2], cam: [-14, 52, 40], tgt: [0, 0, -2] },
  { n: '04', name: '扑克牌塔 (12×12m · 高38m)', p: [0, 42, -33], cam: [-8, 24, 14], tgt: [0, 23, -28] },
  { n: '05', name: '控制塔 (8×8m · 高28m)', p: [43, 35, -27], cam: [16, 28, 8], tgt: [43, 17, -27] },
  { n: '06', name: '管道设备区', p: [27, 8, 24], cam: [4, 15, 50], tgt: [27, 3, 24] },
  { n: '07', name: '廊道塔架 (16×8m · 高15m)', p: [-38, 19, -28], cam: [-16, 20, 2], tgt: [-38, 12, -28] },
  { n: '08', name: '货运装卸区', p: [51, 6, 10], cam: [66, 21, 27], tgt: [51, 1, 13] },
];
const mk = document.getElementById('markers'), legend = document.getElementById('legend');
POI.forEach((o) => {
  const e = document.createElement('div'); e.className = 'mk'; e.textContent = o.n; e.onclick = () => fly(o.cam, o.tgt); mk.appendChild(e); o.el = e; o.v = new THREE.Vector3(...o.p);
  const li = document.createElement('li'); li.innerHTML = `<b>${o.n}</b>${o.name}`; li.onclick = () => fly(o.cam, o.tgt); legend.appendChild(li);
});
const VIEWS = [['城市全景', [700, 900, 900], [-600, 0, -300]], ['总览', [-95, 72, 112], [0, 6, -4]], ['俯视平面', [0.01, 200, 1], [0, 0, 0]], ['正立面', [0, 16, 165], [0, 16, 0]], ['侧立面', [170, 16, 0], [0, 14, 0]], ['夜景低角度', [-30, 4, 64], [0, 10, -10]]];
const vb = document.getElementById('views');
VIEWS.forEach(([t, c, g]) => { const b = document.createElement('button'); b.textContent = t; b.onclick = () => fly(c, g); vb.appendChild(b); });
const playBtn = document.createElement('button'); playBtn.textContent = '▶ 进入漫游'; playBtn.className = 'play'; vb.appendChild(playBtn);
let anim = null;
window.__view = fly;   // console helper: __view([x,y,z],[tx,ty,tz])
function fly(c, t) { anim = { t0: performance.now(), d: 1400, c0: camera.position.clone(), t0v: controls.target.clone(), c1: new THREE.Vector3(...c), t1: new THREE.Vector3(...t) }; }
function updateMarkers() {
  const v = new THREE.Vector3();
  for (const o of POI) { v.copy(o.v).project(camera); const vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 && camera.position.distanceTo(o.v) < 200; o.el.style.display = vis ? 'block' : 'none'; o.el.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; o.el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px'; }
}

/* ───────────── GLB assets: Blender trucks + rigged Mixamo characters ───────────── */
const loader = new GLTFLoader();
const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));
const mixers = [], walkers = [], charRoots = [];   // charRoots: distance-culled (skinned meshes can't frustum-cull reliably)
window.__walkers = walkers;   // console helper
const player = createPlayer({ scene, camera, renderer, controls, spawn: new THREE.Vector3(0, .2, 64), spawnYaw: 0 });
playBtn.onclick = () => player.enter();
// city districts: legend entries fly the camera there; ▶ drops the player at the district's spawn
const cityPOI = new Map(cityInfo.pois.map((p) => [p.id, p]));
const cityHead = document.createElement('h1'); cityHead.textContent = '城市区域'; cityHead.style.marginTop = '12px'; legend.after(cityHead);
const cityList = document.createElement('ul'); cityHead.after(cityList);
for (const d of DISTRICTS) {
  if (d.id === 'compound') continue;
  const p = cityPOI.get(d.id) || { cam: [d.x + d.w * .9, Math.max(d.w, d.d) * .8, d.z + d.d * 1.1], tgt: [d.x, 0, d.z], spawn: [d.x, 1, d.z + d.d / 2 + 8], yaw: 0 };
  const li = document.createElement('li'); li.innerHTML = `<b>${d.suit || '·'}</b>${d.name} <span class="go" title="在这里漫游">▶</span>`;
  li.onclick = (e) => { if (e.target.classList.contains('go')) { player.enter(); player.teleport(new THREE.Vector3(...p.spawn), p.yaw || 0); } else fly(p.cam, p.tgt); };
  cityList.appendChild(li);
}
{ const h = cityPOI.get('hunt'); if (h) {   // cinematic entry for the Shibuya gunfight
  const li = document.createElement('li'); li.innerHTML = `<b style="background:#d8242a;color:#fff">!</b>涩谷 · 狩猎现场 <span class="go" title="在这里漫游">▶</span>`;
  li.onclick = (e) => { if (e.target.classList.contains('go')) { player.enter(); player.teleport(new THREE.Vector3(...h.spawn), h.yaw); } else fly(h.cam, h.tgt); };
  cityList.prepend(li);
  const k = cityPOI.get('hunt_konbini'); if (k) { const kl = document.createElement('li'); kl.innerHTML = '<b style="background:#d8242a;color:#fff">!</b>涩谷 · 便利店内'; kl.onclick = () => fly(k.cam, k.tgt); li.after(kl); }
} }
const dayBtn = document.createElement('button'); vb.insertBefore(dayBtn, playBtn);
const cineBtn = document.createElement('button'); cineBtn.textContent = '▭ 电影模式'; vb.insertBefore(cineBtn, playBtn);
let cine = false; cineBtn.onclick = () => { cine = !cine; grade.setBars(cine); dof.enabled = cine; document.body.classList.toggle('cine', cine); };
window.__player = player;   // console helper
Promise.all([load('./models/truck_semi.glb'), load('./models/truck_box.glb'), ...(cityInfo.pending || [])]).then(([semi, boxT]) => {
  const src = { truck_semi: semi.scene, truck_box: boxT.scene };
  for (const t of truckSpots) {
    const o = src[t.file].clone(); o.position.set(t.x, 0, t.z); o.rotation.y = t.ry; scene.add(o);
    o.traverse((c) => { if (c.isMesh) collidables.push(c); });
    const f = new THREE.Vector3(Math.cos(t.ry), 0, -Math.sin(t.ry));      // truck forward in world
    const head = new THREE.Vector3(t.x, 1.3, t.z).addScaledVector(f, 1.7);
    addSpot(0xfff4e0, 260, 30, .45, .6, head, head.clone().addScaledVector(f, 12).setY(0));
  }
}).catch((e) => console.error('truck load failed', e)).finally(() => { try { for (const m of cityInfo.collidables) if (!collidables.includes(m)) collidables.push(m); player.setCollider(collidables); } catch (e) { console.error('collider build failed', e); } });
window.__collidables = collidables;

// patrol / work routes: pts in xz, y = walking surface height
const ROUTES = [
  { m: 'Soldier', pts: [[-28, 14.5], [28, 14.5], [28, -20], [-28, -20]], y: L1 + .06, loop: true, v: 1.15 },   // 10m loop
  { m: 'Soldier', pts: [[-54, 40.9], [-18, 40.9]], y: WH + .11, v: 1.05 },                                     // wall walk
  { m: 'Soldier', pts: [[-45, -28], [-8, -28]], y: L2 + .06, v: 1.05 },                                         // 15m deck
  { m: 'Soldier', pts: [[-48, -40.3], [46, -40.3]], y: .06, v: 1.25 },                                          // back service road
  { m: 'Xbot', pts: [[-2.5, 40], [-2.5, 18]], y: .12, v: 1.15 },                                                // main road
  { m: 'Xbot', pts: [[14, 34.2], [40, 34.2]], y: .06, v: 1.05 },                                                // pipe plant front
  { m: 'Xbot', pts: [[-49.3, 30], [-49.3, -30]], y: .06, v: 1.15 },                                             // west yard
  { m: 'Xbot', pts: [[51.6, -10], [51.6, 29]], y: .13, v: 1.0 },                                                // truck yard
];
// compound staff: Tripo characters (guards patrol, hi-vis workers, two players); old Mixamo robots only as fallback
const loadOr = (u, fb) => load(u).catch(() => load(fb));
Promise.all(['guard', 'hivis', 'player_m', 'player_f'].map((n, i) => loadOr(`./models/people/web/${n}.glb`, i % 2 ? './models/chars/Xbot.glb' : './models/chars/Soldier.glb'))).then(([guard, hivis, pm, pf]) => {
  const lib = { Soldier: guard, Xbot: hivis, pm, pf };
  const spawn = (name, clipName) => {
    const g = lib[name], o = cloneSkinned(g.scene);
    o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.geometry.computeBoundingSphere(); c.boundingSphere = c.geometry.boundingSphere.clone(); c.boundingSphere.radius *= 1.4; } });   // cull on the bind-pose sphere
    const root = new THREE.Group(); root.add(o); scene.add(root); charRoots.push(root);
    o.rotation.y = g.scene.getObjectByName('mixamorigHips') ? (name === 'Soldier' ? Math.PI : 0) : -Math.PI / 2;   // Tripo faces +X, Soldier −Z, Xbot +Z
    const clip = g.animations.find((c) => c.name.toLowerCase() === clipName.toLowerCase()) || g.animations.find((c) => /idle/i.test(c.name)) || g.animations[0];
    const mx = new THREE.AnimationMixer(o), act = mx.clipAction(clip); act.play(); act.time = Math.random() * clip.duration; mixers.push(mx);
    return root;
  };
  for (const r of ROUTES) {
    const pts = r.pts.map(([x, z]) => new THREE.Vector2(x, z)); if (r.loop) pts.push(pts[0].clone());
    const segs = []; let L = 0;
    for (let i = 0; i < pts.length - 1; i++) { const l = pts[i].distanceTo(pts[i + 1]); segs.push({ a: pts[i], b: pts[i + 1], l, s0: L }); L += l; }
    walkers.push({ ...r, o: spawn(r.m, 'walk'), segs, L, s: Math.random() * L * 2 });
  }
  const idlers = [['Soldier', 'look_around'], ['Xbot', 'idle'], ['pm', 'look_around'], ['pf', 'wait'], ['Xbot', 'fold_arms'], ['pm', 'standing_relax'], ['pf', 'idle']];
  idleSpots.forEach((p, i) => {
    const [m, c] = idlers[i % idlers.length];
    const o = spawn(m, c); o.position.set(p.x, p.y, p.z); o.rotation.y = R() * Math.PI * 2;
  });
  console.log('characters', walkers.length + idleSpots.length);
}).catch((e) => console.error('character load failed', e));

const _p = new THREE.Vector2();
function updateWalkers(dt) {
  for (const w of walkers) {
    w.s += w.v * dt;
    let d = w.s % (w.loop ? w.L : 2 * w.L), back = false;
    if (!w.loop && d > w.L) { d = 2 * w.L - d; back = true; }
    const sg = w.segs.find((g) => d <= g.s0 + g.l) || w.segs[w.segs.length - 1];
    _p.lerpVectors(sg.a, sg.b, (d - sg.s0) / sg.l);
    const dx = (sg.b.x - sg.a.x) * (back ? -1 : 1), dz = (sg.b.y - sg.a.y) * (back ? -1 : 1);
    w.o.position.set(_p.x, w.y, _p.y);
    const target = Math.atan2(dx, dz);   // characters face +Z
    let da = target - w.o.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da));
    w.o.rotation.y += da * Math.min(1, dt * 8);
  }
}

/* ───────────── post ───────────── */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// ground-truth ambient occlusion: contact shadows under cars, in corners, along wall bases (half resolution)
const gtao = new GTAOPass(scene, camera, Math.floor(innerWidth / 2), Math.floor(innerHeight / 2));
gtao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.2, thickness: 2, scale: 1.1, samples: 12, distanceFallOff: .6 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
gtao.blendIntensity = .85; composer.addPass(gtao);
// keep see-through effects out of the AO depth/normal pass (the cloud sheet, clipped by the far plane, drew a hard line across the sky)
gtao.overrideVisibility = function () {
  const cache = this._visibilityCache;
  this.scene.traverse((o) => { cache.set(o, o.visible); const m = o.material; if (o.isPoints || o.isLine || o.isSprite || (m && !Array.isArray(m) && m.transparent && !m.depthWrite) || o.userData.noAO) o.visible = false; });   // noAO: alpha-tested leaf pools would AO as full cards
};
// integrated GPUs share system memory: default them to standard quality unless the viewer chose otherwise
let hiQ = !LITE; try { const q = localStorage.getItem('qualityChoice'); if (q) hiQ = q !== 'std'; } catch (e) {}   // only an explicit click is remembered
gtao.enabled = hiQ;
// cinema-mode depth of field (off otherwise): focus on what the camera looks at
const dof = new BokehPass(scene, camera, { focus: 60, aperture: .00012, maxblur: .006 }); dof.enabled = false; composer.addPass(dof);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.6, 1.0); composer.addPass(bloom);
const rays = createGodRays(composer, composer.passes.indexOf(dof));   // sun shafts between the towers (day / dusk)
composer.addPass(new OutputPass());
const grade = createGrade(composer);   // the show's teal / amber film look
const audio = createAudio();
const smaa = new SMAAPass(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()); composer.addPass(smaa);
const qBtn = document.createElement('button'); vb.insertBefore(qBtn, playBtn);
const setQ = (q, save) => { hiQ = q; gtao.enabled = q; qBtn.textContent = q ? '画质: 高' : '画质: 标准'; if (save) try { localStorage.setItem('qualityChoice', q ? 'hi' : 'std'); } catch (e) {} };
setQ(hiQ); qBtn.onclick = () => setQ(!hiQ, true);
const facadeMats = Object.values(mats).filter((m) => m.userData.nightGlow);   // lit windows / signs / shopfronts at night
const CITY_NIGHT_LIGHTS = .15;
city.visible = false;   // the real city fills the horizon now; the painted skyline ring looked fake
const dayNight = createDayNight({ scene, renderer, hemi, moon, bloom, spots, nightBackdrop: null, onChange: [
  // the show's night has no city electricity: only a few windows (generators) glow; game venues light themselves
  (day) => { for (const m of facadeMats) m.emissiveIntensity = day ? 0 : m.userData.nightGlow * CITY_NIGHT_LIGHTS; },
  (day) => {   // the wet-asphalt mirror is a night look; by day the apron is plain dry asphalt
    refl.visible = !day; const am = asphalt.material;
    am.alphaMap = day ? null : texPuddle; am.transparent = !day; am.roughness = day ? .95 : 1; am.roughnessMap = day ? null : texPuddle; am.color.set(day ? 0xf0f2f4 : 0x74767a); am.needsUpdate = true;
  },
  (day) => { for (const k of ['poolC', 'poolY', 'beam', 'beamY']) mats[k].visible = !day; },   // fake light pools / cones are night-only
  (day) => grade.setDay(day, dayNight?.isDusk),
  (day, dusk) => { FAC_INT.uIntLight.value = dusk ? .45 : day ? .7 : .05; },   // rooms behind the windows: daylit, dim at dusk, dark at night
  (day, dusk) => rays.setDay(day, dusk),
  (day) => audio.setDay(day),
  (day) => { dayBtn.textContent = !day ? '☀ 切换白天' : dayNight?.isDusk ? '☾ 切换夜晚' : '◐ 切换黄昏'; },
  ...(cityInfo.dayNight || []),
] });
const shadowQ = () => { const sh = dayNight.sun.shadow, n = hiQ ? 4096 : 2048; if (sh.mapSize.x !== n) { sh.mapSize.set(n, n); if (sh.map) { sh.map.dispose(); sh.map = null; } } };   // standard quality: 2048 sun shadow (¼ the memory)
shadowQ(); qBtn.addEventListener('click', shadowQ);
dayBtn.onclick = () => dayNight.set(dayNight.isDusk ? 'night' : dayNight.isDay ? 'dusk' : 'day');   // day → dusk → night
setTreeSun(dayNight.sunDir);
dayNight.set(true);
attachBulb({ player, audio, grade, dayNight });   // ♦4 Light Bulb level: interaction, water, door colliders
window.__controls = controls; window.__pois = cityInfo.pois; window.__grade = grade; window.__dof = dof; window.__bloom = bloom; window.__audio = audio; window.__day = dayNight; window.__renderer = renderer; window.__scene = scene; window.__camera = camera; window.__composer = composer;
dayNight.interiors.push([402, 618, 40, -224, -76]);   // black warehouse hall (x0,x1,yTop,z0,z1)
dayNight.interiors.push([-1247, -831, -1.2, 143, 480, -30]);   // the real Shibuya underground (PLATEAU LOD4.1) under the scramble
dayNight.interiors.push([-348, -312, 136, -418, -382, 122]);    // King of Diamonds courtroom (top of the tower)
dayNight.interiors.push([-241, -144, 7.4, -41, 103, -.5]);       // Port City Takeshiba street-level galleria (PLATEAU LOD4)
addEventListener('resize', () => { const pr = Math.min(devicePixelRatio, DPR_MAX); renderer.setPixelRatio(pr); composer.setPixelRatio(pr); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); gtao.setSize(Math.floor(innerWidth / 2), Math.floor(innerHeight / 2)); refl.getRenderTarget().setSize(Math.max(512, Math.floor(innerWidth * .6)), Math.max(512, Math.floor(innerHeight * .6))); });

// moving the window to a screen with another pixel ratio doesn't fire 'resize' — watch the ratio directly
(function watchDPR() { matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => { dispatchEvent(new Event('resize')); watchDPR(); }, { once: true }); })();

/* ───────────── loop ───────────── */
const clock = new THREE.Clock(), up = new THREE.Vector3(0, 1, 0);
const foliageMeshes = [...zoneMeshes.values()].flat().filter((m) => /^det_|\|(crown|ivy|leaf|trunk)/.test(m.name));   // + building detail zones
let cullT = 0;
let lastT = 0;
const BG_LOOP = new URLSearchParams(location.search).has('bg');   // dev: keep ticking in a hidden / background tab (timer loop)
window.__shot = async (name = 'shot') => {   // dev: save the current frame at full canvas resolution to .tmp/shots (local server only)
  composer.render(); const src = renderer.domElement, k = Math.min(1, 1000 / src.width), c = document.createElement('canvas');   // ~1000 px JPEG keeps review copies small
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', .8);
  return (await fetch('/__shot?name=' + name, { method: 'POST', body: await (await fetch(url)).blob() })).status;
};
const prof = window.__prof = { js: 0, render: 0 };
function tick() {
  const t0 = performance.now();
  const t = clock.getElapsedTime(), dt = Math.min(.05, t - lastT); lastT = t;
  for (const mx of mixers) mx.update(dt);
  updateWalkers(dt);
  if (anim) { let k = Math.min(1, (performance.now() - anim.t0) / anim.d); k = k * k * (3 - 2 * k); camera.position.lerpVectors(anim.c0, anim.c1, k); controls.target.lerpVectors(anim.t0v, anim.t1, k); if (k >= 1) anim = null; }
  if (player.active) player.update(dt); else controls.update();
  window.__camHook?.(dt, t);   // dev: trailer/rec.html drives the camera after the controls each frame
  document.body.classList.toggle('playing', player.active);
  const a = .55 + .45 * Math.sin(t * 2.4), b = .55 + .45 * Math.sin(t * 2.4 + 2.2);
  bMatA.color.setRGB(4 * a + .5, .15 * a, .1 * a); bMatB.color.setRGB(4 * b + .5, .15 * b, .1 * b);
  halos[0].opacity = .12 + .45 * a; halos[1].opacity = .12 + .45 * b;
  for (const f of cityInfo.updates) f(dt, t);
  if (!dayNight.isDay) refl.visible = Math.hypot(camera.position.x, camera.position.z) < 650;   // the wet-ground mirror re-renders the whole scene: only near the compound
  if ((cullT -= dt) < 0) {   // foliage / ivy beyond ~700 m is lost in haze — skip drawing it
    cullT = .4;
    gtao.enabled = hiQ && camera.position.y < 90;   // street-scale AO is invisible from the air — skip its extra scene pass
    for (const o of charRoots) o.visible = camera.position.distanceTo(o.position) < 260;
    for (const m of foliageMeshes) { const bs = m.geometry.boundingSphere; m.visible = camera.position.distanceTo(bs.center) - bs.radius < (m.name.startsWith('det_') ? 320 : 700); }
  }
  dayNight.update(player.active ? player.pos : controls.target, camera.position);
  updateMarkers();
  if (renderer.getPixelRatio() !== Math.min(devicePixelRatio, DPR_MAX)) dispatchEvent(new Event('resize'));   // pane / monitor DPR changed
  const tr = performance.now();
  grade.update(t, innerWidth, innerHeight); rays.update(camera, dayNight.sunDir, innerWidth, innerHeight);
  if (dof.enabled) dof.uniforms.focus.value = player.active ? 6 : camera.position.distanceTo(controls.target);
  audio.update(dt, camera, huntState.centre, huntState.firing);
  renderer.shadowMap.needsUpdate = true;   // shadows once per frame, not once per post pass (GTAO re-renders the scene)
  if (innerWidth > 0 && innerHeight > 0) composer.render();   // hidden pane → zero-size targets
  prof.render = prof.render * .9 + (performance.now() - tr) * .1; prof.js = prof.js * .9 + (tr - t0) * .1;
  if (BG_LOOP) setTimeout(tick, 33); else requestAnimationFrame(tick);
}
tick();
document.getElementById('load').style.opacity = 0; setTimeout(() => document.getElementById('load').remove(), 700);
