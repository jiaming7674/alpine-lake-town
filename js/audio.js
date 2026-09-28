// Synthesized sound: steam whistle, exhaust chuffs and campfire crackle (Web Audio, no samples).
import { THREE, clamp } from './core.js';

let ctx = null, master = null, noise = null, enabled = false, camera = null;
const tmp = new THREE.Vector3();

export function initAudio(cam) { camera = cam; }
export function isEnabled() { return enabled; }
export function setEnabled(on) {
  if (on && !ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noise = buf;
  }
  enabled = on;
  if (ctx) (on ? ctx.resume() : ctx.suspend()).catch(() => {});
  return true;
}

/** Gain + stereo pan for a source at world position pos. */
function spatial(pos, ref) {
  const d = camera.position.distanceTo(pos);
  const g = ctx.createGain();
  g.gain.value = clamp(ref / (d + ref * 0.4), 0, 1.4);
  tmp.copy(pos).applyMatrix4(camera.matrixWorldInverse);
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(tmp.x / (Math.abs(tmp.z) + 5), -0.9, 0.9);
    g.connect(p); p.connect(master);
  } else g.connect(master);
  return g;
}

export function whistle(pos, blasts = [1.3]) {
  if (!enabled) return;
  const out = spatial(pos, 60);
  let t = ctx.currentTime + 0.05;
  for (const dur of blasts) {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.22, t + 0.09);
    env.gain.setValueAtTime(0.22, t + dur);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.45);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.7;
    lp.connect(env); env.connect(out);
    for (const f of [311, 392, 466]) {                  // three-chime whistle
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.9, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.18);
      const og = ctx.createGain(); og.gain.value = 0.28;
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.5);
    }
    const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.value = 0.12;
    n.connect(bp); bp.connect(ng); ng.connect(env); n.start(t, Math.random()); n.stop(t + dur + 0.5);
    t += dur + 0.35;
  }
}

export function chuff(pos, k = 1) {
  if (!enabled) return;
  const out = spatial(pos, 30), t = ctx.currentTime;
  const n = ctx.createBufferSource(); n.buffer = noise;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420 + Math.random() * 120; bp.Q.value = 0.9;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.5 * k, t + 0.012); env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  n.connect(bp); bp.connect(lp); lp.connect(env); env.connect(out);
  n.start(t, Math.random() * 1.5); n.stop(t + 0.25);
}

let crackleT = 0;
export function updateAmbient(dt, firePos, fireK) {
  if (!enabled || fireK < 0.05) return;
  crackleT -= dt;
  if (crackleT > 0) return;
  crackleT = 0.05 + Math.random() * 0.25 / fireK;
  const out = spatial(firePos, 6), t = ctx.currentTime;
  const n = ctx.createBufferSource(); n.buffer = noise;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500 + Math.random() * 1500;
  const env = ctx.createGain(), dec = 0.02 + Math.random() * 0.05;
  env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.25 * fireK, t + 0.003); env.gain.exponentialRampToValueAtTime(0.0005, t + dec);
  n.connect(hp); hp.connect(env); env.connect(out);
  n.start(t, Math.random() * 1.8); n.stop(t + dec + 0.02);
}
