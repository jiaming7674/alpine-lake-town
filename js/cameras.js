// Camera modes: free orbit, chase the train, locomotive cab, and a scripted tour.
import { THREE, clamp, smooth } from './core.js';
import { S, STREETS, trackAt, lakeSign } from './route.js';
import { heightAt } from './world.js';

const V = THREE.Vector3, Y = new V(0, 1, 0);

export function createCameras(camera, controls, train, fadeEl, lots = []) {
  let mode = 'free', snap = true, lastS = null, flash = 0, tourT = 0, chaseSide = 0;
  const saved = { pos: camera.position.clone(), target: controls.target.clone() };
  const pos = new V(), look = new V(), want = new V(), wantLook = new V(), P = new V(), T = new V(), L = new V();

  const pr = (u, y) => { const p = STREETS.promenade.getPointAt(u); return [p.x, heightAt(p.x, p.z) + y, p.z]; };
  const K = [
    [[-40, 24, 32], [55, 0, -40]],
    [[-10, 18, -40], [60, 4, -105]],
    [[38, 9, -92], [60, 5, -108]],
    [[76, 10, -84], [98, 3, -45]],
    [[77, 5, -24], [98, 3, -42]],
    [pr(0.3, 4.5), [80, 3, -26]],
    [pr(0.85, 5.5), [0, 2.5, 2]],
    [[-6, 3.2, 17], [0, 2, 3]],
    [[-30, 12, 30], [20, 3, -25]],
  ];
  const tourPos = new THREE.CatmullRomCurve3(K.map(k => new V(...k[0])), true, 'centripetal');
  const tourLook = new THREE.CatmullRomCurve3(K.map(k => new V(...k[1])), true, 'centripetal');
  const TOUR_DUR = K.length * 10;

  function setMode(m) {
    if (mode === 'free') { saved.pos.copy(camera.position); saved.target.copy(controls.target); }
    mode = m;
    controls.enabled = m === 'free';
    camera.fov = m === 'cab' ? 62 : 50;
    camera.updateProjectionMatrix();
    if (m === 'free') { camera.position.copy(saved.pos); controls.target.copy(saved.target); controls.update(); }
    if (m === 'tour') tourT = 0;
    snap = true; lastS = null; chaseSide = 0; flash = m === 'free' ? 0 : 0.6;
  }

  function follow(dt) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.5);
    pos.lerp(want, k); look.lerp(wantLook, k);
    snap = false;
    camera.position.copy(pos);
    camera.lookAt(look);
  }

  /** Returns where the shadow map should focus and how large it should be. */
  function update(dt) {
    let dark = 0, focus = look, radius = 40;
    if (mode === 'free') {
      controls.update();
      focus = controls.target; radius = camera.position.distanceTo(controls.target) * 0.9;
    } else if (mode === 'chase') {
      const st = train.st;
      // pacing shot: ahead of the locomotive and off to the lake side, looking back along the train
      const s = st.phase === 'hidden' ? S.A + 4 : clamp(st.s, S.A + 4, S.B - 4);
      if (lastS !== null && Math.abs(s - lastS) > 40) { snap = true; flash = 1; }
      lastS = s;
      trackAt(s + 9, P, T);
      L.crossVectors(Y, T).normalize();
      // prefer the lake side; switch sides when a building or a hillside is in the way
      const bad = sg => {
        const x = P.x + L.x * 12 * sg, z = P.z + L.z * 12 * sg;
        let b = heightAt(x, z) - P.y > 3 ? 1 : 0;
        for (const l of lots) if (Math.hypot(x - l.x, z - l.z) < l.r + 3) b += 2;
        return b;
      };
      const pref = lakeSign(s);
      if (!chaseSide || bad(chaseSide) > 0) chaseSide = bad(pref) <= bad(-pref) ? pref : -pref;
      L.multiplyScalar(chaseSide);
      want.copy(P).addScaledVector(L, 12).addScaledVector(Y, bad(chaseSide) >= 2 ? 16 : 5.2);   // rise over roofs if boxed in
      want.y = Math.max(want.y, heightAt(want.x, want.z) + 2);
      trackAt(s - 10, P); wantLook.copy(P).addScaledVector(Y, 2.2);
      follow(dt);
      radius = 35;
    } else if (mode === 'cab') {
      const loco = train.loco, st = train.st;
      if (st.phase === 'hidden') dark = 1;
      else {
        // the driver leaning out of the right-hand cab window, looking ahead along the boiler
        want.set(-1.95, 3.45, -1.9).applyMatrix4(loco.group.matrixWorld);
        wantLook.set(-1.5, 2.8, 30).applyMatrix4(loco.group.matrixWorld);
        snap = true; follow(dt);
        const sc = st.s - 9;
        dark = Math.max(smooth(S.B + 1, S.B + 8, sc), 1 - smooth(S.A - 8, S.A - 1, sc));
      }
      radius = 30;
    } else if (mode === 'tour') {
      tourT += dt;
      const u = (tourT / TOUR_DUR) % 1;
      tourPos.getPoint(u, want); tourLook.getPoint(u, wantLook);
      want.y = Math.max(want.y, heightAt(want.x, want.z) + 2);
      snap = true; follow(dt);
      radius = clamp(camera.position.distanceTo(look) * 0.8, 25, 120);
    }
    flash = Math.max(0, flash - dt * 1.6);
    fadeEl.style.opacity = Math.max(dark, flash).toFixed(3);
    return { focus, radius };
  }

  return { setMode, update, get mode() { return mode; } };
}
