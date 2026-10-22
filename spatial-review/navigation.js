import { SHOTS } from '../trailer/shotlist.js';

// Source and review both use metres, +Y up, +X east, +Z south. Feedback maps
// directly back to SHOTS[id].p / .l / .fov / .dur; no axis or unit conversion.
// The 17 two-key shots retain their exact spatial endpoints and straight locus.
// trailer/shots.js evaluates even two keys with clamped Catmull-Rom and then
// applies temporal easing. A line intentionally omits that nonlinear speed.
// Handheld shake, impact kicks, roll, DOF, exposure, time-of-day and game-state
// hooks are not NavigationSequence controls and are not reproduced here.
// Each shot is separate: the cuts between shots are not camera travel paths.

const DYNAMIC_SAMPLE_COUNT = 25;
const CAPTURE_START_TIME = 0;
const source = (shot, field = '') => `trailer/shotlist.js#SHOTS:${shot.id}${field ? '.' + field : ''}`;
const stopId = (shot, endpoint) => `${shot.id}:${endpoint}`;
const copy = (position) => position.slice();
const title = (shot) => shot.id.replace(/^[a-z]+\d+_/, '').replaceAll('_', ' ');
const lens = (shot, elapsed, progress) => typeof shot.fov === 'function'
  ? shot.fov(elapsed, progress) : (shot.fov || 36);

function authoredCurve(shot, field) {
  const keys = shot[field];
  const points = keys.map((position, index) => {
    const endpoint = index === 0 ? 'start' : index === keys.length - 1 ? 'end' : null;
    return {
      id: `${shot.id}:${field}:${endpoint || `through-${index}`}`,
      position: copy(position),
      role: endpoint ? 'stop' : 'through',
      ...(endpoint ? { stopId: stopId(shot, endpoint) } : {}),
      sourceRef: source(shot, `${field}[${index}]`),
      editable: true,
    };
  });
  if (points.length === 2) return { kind: 'line', points };
  // No current shot takes this branch. Preserve the authored through-points if
  // a later shot adds them; the runtime's endpoint clamping remains approximate.
  return { kind: 'catmull-rom', points, closed: false, curveType: 'catmullrom', tension: 0.5 };
}

function sampledCamera(shot) {
  // The dynamic airship shot has no editable camera keys. Sample its actual
  // cam() function with the global game clock beginning at t=0. Time advances
  // with the local shot clock; setup/prep/update hooks are deliberately not run.
  // Samples are calculated output and the protocol marks this curve read-only.
  const samples = Array.from({ length: DYNAMIC_SAMPLE_COUNT }, (_, index) => {
    const progress = index / (DYNAMIC_SAMPLE_COUNT - 1);
    const elapsed = progress * shot.dur;
    return shot.cam(elapsed, progress, CAPTURE_START_TIME + elapsed);
  });
  return {
    camera: { kind: 'sampled', samples: samples.map((sample) => copy(sample.p)) },
    aim: { kind: 'curve', curve: { kind: 'sampled', samples: samples.map((sample) => copy(sample.l)) } },
    start: samples[0],
    end: samples[samples.length - 1],
  };
}

/** All authored trailer shots, with stable IDs and no trailer runtime side effects. */
export function navigationSequences() {
  return SHOTS.map((shot) => {
    const dynamic = typeof shot.cam === 'function';
    const route = dynamic ? sampledCamera(shot) : {
      camera: authoredCurve(shot, 'p'),
      aim: { kind: 'curve', curve: authoredCurve(shot, 'l') },
      start: { p: shot.p[0], l: shot.l[0] },
      end: { p: shot.p[shot.p.length - 1], l: shot.l[shot.l.length - 1] },
    };
    const label = title(shot);
    const stops = [
      { endpoint: 'start', name: `${label} — opening`, pose: route.start, elapsed: 0, progress: 0 },
      { endpoint: 'end', name: `${label} — closing`, pose: route.end, elapsed: shot.dur, progress: 1 },
    ].map(({ endpoint, name, pose, elapsed, progress }) => ({
      id: stopId(shot, endpoint), name,
      camera: copy(pose.p), target: copy(pose.l), fov: lens(shot, elapsed, progress),
      sourceRef: source(shot, dynamic ? 'cam' : endpoint === 'start' ? 'p[0]' : `p[${shot.p.length - 1}]`),
    }));
    return {
      id: `trailer:${shot.id}`,
      name: `${shot.id} · ${shot.dur}s · ${shot.tod}${dynamic ? ' · sampled from t=0' : ''}`,
      category: dynamic ? 'Trailer · sampled camera' : 'Trailer · authored camera',
      sourceRef: source(shot),
      stops,
      segments: [{
        id: `${shot.id}:camera-move`,
        fromStopId: stopId(shot, 'start'), toStopId: stopId(shot, 'end'),
        camera: route.camera, aim: route.aim,
        weight: shot.dur,
        lensStart: 0,
        sourceRef: source(shot),
      }],
    };
  });
}
