// Sky, sun/moon lighting, night sky (dome, stars, milky way, moon, shooting stars) and the time-of-day model.
import { THREE, Q, U, D2R, R, rand, pick, smooth, lerp, clamp, SUN_AZ } from './core.js';
import { Sky } from 'three/addons/objects/Sky.js';

export function createSky(renderer, scene, water) {
  // ───────────── day sky + environment map ─────────────
  const sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);
  const su = sky.material.uniforms;
  su.turbidity.value = 7.5; su.rayleigh.value = 2.4; su.mieCoefficient.value = 0.005; su.mieDirectionalG.value = 0.82;
  const envScene = new THREE.Scene();
  const envSky = new Sky(); envSky.scale.setScalar(10000); envSky.material = sky.material; envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, envTimer = 0, lastEnv = 0;
  function updateEnv() { const next = pmrem.fromScene(envScene); if (envRT) envRT.dispose(); envRT = next; scene.environment = envRT.texture; }
  function scheduleEnv() {
    const now = performance.now();
    clearTimeout(envTimer);
    if (now - lastEnv > 350) { lastEnv = now; updateEnv(); }
    else envTimer = setTimeout(() => { lastEnv = performance.now(); updateEnv(); }, 200);
  }
  scene.environmentIntensity = 0.5;

  // ───────────── lights ─────────────
  const hemi = new THREE.HemisphereLight(0xffc49a, 0x3a2e25, 0.5);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffa860, 3);         // the sun, or the moon at night
  key.castShadow = true;
  key.shadow.mapSize.set(Q.shadow, Q.shadow);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.06;
  key.shadow.camera.near = 1; key.shadow.camera.far = 700;
  scene.add(key, key.target);
  const keyDir = new THREE.Vector3(0, 1, 0);

  // ───────────── night sky ─────────────
  const nightSky = new THREE.Group();          // follows the camera so the sky sits at infinity
  scene.add(nightSky);
  const BAND_N = new THREE.Vector3(0.55, 0.35, 0.76).normalize();
  const MOON_DIR = new THREE.Vector3().setFromSphericalCoords(1, (90 - 20) * D2R, 170 * D2R);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), new THREE.ShaderMaterial({
    uniforms: { uNight: U.night, uZenith: { value: new THREE.Color(0x03060f) }, uHorizon: { value: new THREE.Color(0x1a2a52) }, uBandN: { value: BAND_N } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uNight; uniform vec3 uZenith, uHorizon, uBandN; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(h, 0.45));
        float b = dot(d, uBandN);
        float mottled = 0.55 + 0.45 * sin(d.x * 23.0 + sin(d.z * 17.0) * 2.0) * sin(d.y * 29.0 + d.z * 11.0);
        col += vec3(0.045, 0.05, 0.07) * exp(-b * b / 0.018) * mottled * smoothstep(0.0, 0.25, h);
        gl_FragColor = vec4(col, uNight);
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false,
  }));
  dome.renderOrder = -2;
  nightSky.add(dome);

  const ST = Q.stars + Q.milky;
  const sPos = new Float32Array(ST * 3), sCol = new Float32Array(ST * 3), sSize = new Float32Array(ST), sPh = new Float32Array(ST);
  {
    const tints = [0xaecbff, 0xdfe8ff, 0xffffff, 0xfff1d6, 0xffd2a1].map(h => new THREE.Color(h));
    const v = new THREE.Vector3(), u1 = new THREE.Vector3(0, 1, 0).cross(BAND_N).normalize(), u2 = new THREE.Vector3().crossVectors(BAND_N, u1);
    for (let i = 0; i < ST; i++) {
      const mw = i >= Q.stars;
      if (!mw) { do { v.set(R(-1, 1), R(-0.05, 1), R(-1, 1)); } while (v.lengthSq() > 1 || v.lengthSq() < 0.01); v.normalize(); }
      else {
        const a = R(0, Math.PI * 2), off = (rand() + rand() + rand() - 1.5) * 0.12;
        v.copy(u1).multiplyScalar(Math.cos(a)).addScaledVector(u2, Math.sin(a)).addScaledVector(BAND_N, off).normalize();
        if (v.y < -0.05) v.y = -v.y;
      }
      v.multiplyScalar(2200).toArray(sPos, i * 3);
      const mag = Math.pow(rand(), mw ? 3 : 2.2);
      sSize[i] = mw ? 0.8 + mag * 1.4 : 0.9 + mag * 3.2;
      pick(tints).clone().multiplyScalar(mw ? 0.5 + mag * 0.8 : 0.6 + mag * 2.2).toArray(sCol, i * 3);
      sPh[i] = R(0, 6.28);
    }
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(sCol, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sPh, 1));
  const starPR = { value: renderer.getPixelRatio() };
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
    uniforms: { uNight: U.night, uTime: U.time, uPR: starPR },
    vertexShader: `attribute float aSize; attribute float aPhase; attribute vec3 aColor; uniform float uTime, uNight, uPR;
      varying vec3 vColor; varying float vA;
      void main(){
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        float tw = 0.7 + 0.3 * sin(uTime * (1.3 + fract(aPhase * 7.1) * 2.5) + aPhase * 10.0);
        gl_PointSize = aSize * uPR * 1.6;
        vColor = aColor; vA = uNight * tw * smoothstep(-0.02, 0.18, normalize(position).y);
      }`,
    fragmentShader: `varying vec3 vColor; varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r); a *= a; gl_FragColor = vec4(vColor * a * vA, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stars.frustumCulled = false; stars.renderOrder = -1;
  nightSky.add(stars);

  const moonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.25, 2.4), transparent: true, depthWrite: false, fog: false });
  const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(26, 2), moonMat);
  moon.position.copy(MOON_DIR).multiplyScalar(2150);
  const haloTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(190,205,255,0.55)'); g.addColorStop(0.25, 'rgba(150,175,255,0.18)'); g.addColorStop(1, 'rgba(120,150,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const haloMat = new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const halo = new THREE.Sprite(haloMat);
  halo.position.copy(moon.position); halo.scale.setScalar(460);
  nightSky.add(moon, halo);

  // shooting star
  const shoot = { t: -1, next: 4, dur: 1, head: new THREE.Vector3(), dir: new THREE.Vector3() };
  const shootGeo = new THREE.BufferGeometry();
  shootGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  shootGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([3, 3, 3.3, 0, 0, 0]), 3));
  const shootMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const shootLine = new THREE.Line(shootGeo, shootMat);
  shootLine.frustumCulled = false; shootLine.visible = false;
  nightSky.add(shootLine);
  function updateShoot(dt) {
    const night = U.night.value;
    if (shoot.t < 0) {
      shoot.next -= dt;
      if (shoot.next > 0 || night < 0.6) { shootLine.visible = false; if (shoot.next <= 0) shoot.next = R(2, 5); return; }
      const az = SUN_AZ * D2R + R(-0.9, 0.9), el = R(25, 55) * D2R;
      shoot.head.setFromSphericalCoords(2100, Math.PI / 2 - el, az);
      shoot.dir.set(R(-1, 1), R(-0.6, -0.2), R(-0.3, 0.3)).normalize().multiplyScalar(R(700, 1100));
      shoot.t = 0; shoot.dur = R(0.6, 1.1);
    }
    shoot.t += dt;
    const k = shoot.t / shoot.dur;
    if (k >= 1) { shoot.t = -1; shoot.next = R(5, 14); shootLine.visible = false; return; }
    const a = shootGeo.attributes.position.array;
    const hx = shoot.head.x + shoot.dir.x * shoot.t, hy = shoot.head.y + shoot.dir.y * shoot.t, hz = shoot.head.z + shoot.dir.z * shoot.t;
    const tail = 0.2 * Math.min(shoot.t / 0.15, 1);
    a[0] = hx; a[1] = hy; a[2] = hz;
    a[3] = hx - shoot.dir.x * tail; a[4] = hy - shoot.dir.y * tail; a[5] = hz - shoot.dir.z * tail;
    shootGeo.attributes.position.needsUpdate = true;
    shootMat.opacity = night * Math.sin(Math.PI * k);
    shootLine.visible = true;
  }

  // ───────────── time of day ─────────────
  const sunDir = new THREE.Vector3();
  const C = {
    sun: [0xff4a1a, 0xff4a1a, 0xffa860, 0xfff0dc],
    fog: [0x0a1022, 0x2c2a3c, 0x8e7c86, 0xa9b6c4],
    hemi: [0x1d2b52, 0x3b4a7a, 0xffc49a, 0xd4e2ff],
    water: [0x03080f, 0x0a1822, 0x0d2a33, 0x114052],
  };
  for (const k in C) C[k] = C[k].map(h => new THREE.Color(h));
  // night (≤ -14°) → dusk (-6°) → golden hour (3°) → day (15°)
  const grad = (arr, e, out = new THREE.Color()) => {
    if (e < -6) return out.copy(arr[0]).lerp(arr[1], smooth(-14, -6, e));
    if (e < 3) return out.copy(arr[1]).lerp(arr[2], smooth(-6, 3, e));
    return out.copy(arr[2]).lerp(arr[3], smooth(3, 15, e));
  };
  const MOON_COL = new THREE.Color(0x9fb6ff);
  const listeners = [];
  const state = { elev: 4, night: 0 };
  function applyTime(e) {
    const night = smooth(-3, -12, e);
    state.elev = e; state.night = night;
    U.night.value = night;
    U.lit.value = 0.92 * smooth(12, -8, e);
    sunDir.setFromSphericalCoords(1, (90 - e) * D2R, SUN_AZ * D2R);
    su.sunPosition.value.copy(sunDir);
    const wu = water.material.uniforms;
    const sunI = 3.2 * smooth(-1.5, 2.5, e);
    if (sunI > 0.001 || night < 0.001) {
      keyDir.copy(sunDir);
      wu.sunDirection.value.copy(sunDir); grad(C.sun, e, wu.sunColor.value);
      grad(C.sun, e, key.color); key.intensity = sunI;
    } else {
      keyDir.copy(MOON_DIR);                                   // moonlight takes over, shadows included
      wu.sunDirection.value.copy(MOON_DIR); wu.sunColor.value.copy(MOON_COL).multiplyScalar(0.9 * night);
      key.color.copy(MOON_COL); key.intensity = 0.75 * night;
    }
    grad(C.water, e, wu.waterColor.value);
    grad(C.hemi, e, hemi.color);
    hemi.intensity = e < -6 ? lerp(0.22, 0.32, smooth(-6, -14, e)) : lerp(0.22, 0.85, smooth(-6, 12, e));
    grad(C.fog, e, scene.fog.color);
    renderer.toneMappingExposure = e < -6 ? lerp(0.95, 1.15, smooth(-6, -14, e)) : lerp(0.95, 0.3, smooth(-6, 12, e));
    moonMat.opacity = night; haloMat.opacity = 0.85 * night;
    nightSky.visible = night > 0.001;
    for (const f of listeners) f(e, night);
    scheduleEnv();
  }

  // shadow box follows whatever the camera is looking at; texel-snapped to limit shimmer
  const snap = new THREE.Vector3();
  function updateShadow(focus, radius) {
    const r = clamp(radius, 22, 150), sc = key.shadow.camera;
    if (sc.right !== r) { sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.updateProjectionMatrix(); }
    const texel = (2 * r) / Q.shadow;
    snap.set(Math.round(focus.x / texel) * texel, focus.y, Math.round(focus.z / texel) * texel);
    key.target.position.copy(snap);
    key.position.copy(snap).addScaledVector(keyDir, 300);
  }

  return {
    sunDir, keyDir, key, hemi, state, applyTime, updateShadow,
    onTime(fn) { listeners.push(fn); },
    update(dt, camera) { nightSky.position.copy(camera.position); updateShoot(dt); },
    setPixelRatio(pr) { starPR.value = pr; },
  };
}
