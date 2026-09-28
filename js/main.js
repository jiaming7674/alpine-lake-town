// Entry point: builds the world and runs the frame loop.
import { THREE, Q, U, small, reduceMotion, VIEWS, lerp, LAYER_NO_REFLECT, D2R } from './core.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTerrain, createWater } from './terrain.js';
import { createSky } from './sky.js';
import { createSmoke } from './smoke.js';
import { createCabin } from './cabin.js';
import { createTrees, createFlora, createFireflies } from './nature.js';
import { createRailway } from './railway.js';
import { createPost } from './post.js';
import { createTrain } from './train.js';
import { createTown } from './town.js';
import { createCameras } from './cameras.js';
import { S } from './route.js';
import * as audio from './audio.js';
import { $, bindRange, segmented, setupPanel } from './ui.js';

const loader = $('loader');
try { boot(); } catch (err) {
  console.error(err);
  loader.textContent = '場景初始化失敗：' + err.message;
}

function boot() {
  const stage = $('stage');
  const W = () => stage.clientWidth, H = () => stage.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.dpr));
  renderer.setSize(W(), H());
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xa88272, 0.0032);
  const camera = new THREE.PerspectiveCamera(50, W() / H(), 0.1, 3000);
  camera.layers.enable(LAYER_NO_REFLECT);
  camera.position.fromArray(VIEWS.hero.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.fromArray(VIEWS.hero.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 4;
  controls.maxDistance = 260;
  controls.update();

  // world
  const water = createWater(scene);
  createTerrain(scene);
  const sky = createSky(renderer, scene, water);
  const smoke = createSmoke(scene, Q.smoke);
  const cabin = createCabin(scene, smoke, sky);
  const town = createTown(scene, smoke, cabin);
  sky.onTime(town.onTime);
  createTrees(scene, town.lots);
  createFlora(scene, cabin, town.lots);
  const updateFireflies = createFireflies(scene, cabin.emberScale);
  const rail = createRailway(scene);
  const train = createTrain(scene, smoke, rail);
  audio.initAudio(camera);
  const post = createPost(renderer, scene, camera, W(), H());
  const cams = createCameras(camera, controls, train, $('fade'), town.lots);
  window.__dbg = { train, camera, controls, sky, S, renderer, cams };
  sky.onTime((e, night) => { rail.glass.emissiveIntensity = lerp(4.2, 2.2, 1 - night); });

  // ───────────── UI ─────────────
  setupPanel(small);
  let tween = null;
  const sunCtl = bindRange('sun', v => v.toFixed(1) + '°', v => { tween = null; setSun(v); }, false);
  const phaseOf = e => e > 9 ? '白天' : e > -1.5 ? '日落' : e > -9 ? '藍調時刻' : '夜晚';
  const timeSeg = segmented('seg-time', v => { tween = { from: sky.state.elev, to: parseFloat(v), t: 0, dur: reduceMotion ? 0.01 : 3 }; });
  function setSun(v) {
    sky.applyTime(v);
    sunCtl.set(v);
    $('r-sun').textContent = v.toFixed(1) + '°';
    $('r-phase').textContent = phaseOf(v);
    timeSeg.buttons.forEach(b => b.setAttribute('aria-pressed', String(Math.abs(parseFloat(b.dataset.v) - v) < 0.05)));
  }
  setSun(4);
  bindRange('wind', v => v.toFixed(1) + ' m/s', v => { cabin.P.wind = v; U.wind.value = v; });
  bindRange('fire', v => '×' + v.toFixed(2), v => { cabin.P.fire = v; });
  bindRange('bloom', v => v.toFixed(2), v => { post.bloom.strength = v; });
  bindRange('rays', v => v.toFixed(2), v => { post.rays.uniforms.uIntensity.value = v; });
  $('dof').addEventListener('change', e => { post.bokeh.enabled = e.target.checked; });
  $('grp-train').hidden = false;
  $('r-train-wrap').hidden = false;
  bindRange('tspeed', v => '×' + v.toFixed(2), v => { train.st.mult = v; });
  $('whistle').addEventListener('click', () => train.blowWhistle([1.2]));
  $('sound').addEventListener('click', e => {
    const on = !audio.isEnabled();
    if (!audio.setEnabled(on)) { e.currentTarget.textContent = '此瀏覽器不支援音效'; return; }
    e.currentTarget.setAttribute('aria-pressed', String(on));
    e.currentTarget.textContent = on ? '音效：開' : '音效：關';
  });

  // camera modes
  const HINTS = { free: '拖曳旋轉 · 滾輪／雙指縮放 · 右鍵平移', chase: '跟車中：鏡頭跟著火車移動', cab: '駕駛室：從機車上往前看', tour: '導覽中：沿路線自動運鏡' };
  $('seg-cam').hidden = false;
  const camSeg = segmented('seg-cam', v => { fly = null; cams.setMode(v); $('hint').textContent = HINTS[v]; });
  // camera fly-to between saved views
  let fly = null;
  function flyTo(name) {
    if (cams.mode !== 'free') { cams.setMode('free'); camSeg.mark('free'); }
    const v = VIEWS[name];
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3().fromArray(v.pos), t1: new THREE.Vector3().fromArray(v.target), t: 0, dur: reduceMotion ? 0.01 : 1.8 };
  }
  document.querySelectorAll('#view-btns [data-view]').forEach(b => b.addEventListener('click', () => flyTo(b.dataset.view)));

  // ───────────── resize ─────────────
  function onResize() {
    camera.aspect = W() / H(); camera.updateProjectionMatrix();
    renderer.setSize(W(), H()); post.setSize(W(), H());
    cabin.emberScale.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(camera.fov * D2R / 2));
    sky.setPixelRatio(renderer.getPixelRatio());
  }
  addEventListener('resize', onResize);
  onResize();

  // warm up the smoke so it is already drifting on the first frame
  for (let i = 0; i < 270; i++) smoke.update(1 / 30, 1);

  // ───────────── loop ─────────────
  const clock = new THREE.Clock();
  const speed = reduceMotion ? 0.35 : 1;
  let t = 0, frames = 0, fpsT = 0, started = false;
  renderer.setAnimationLoop(() => {
    const rawDt = Math.min(clock.getDelta(), 0.05), dt = rawDt * speed;
    t += dt; U.time.value = t;

    if (tween) {
      tween.t += rawDt;
      const k = Math.min(tween.t / tween.dur, 1), ez = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      setSun(lerp(tween.from, tween.to, ez));
      if (k >= 1) tween = null;
    }
    if (fly) {
      fly.t += rawDt;
      const k = Math.min(fly.t / fly.dur, 1), ez = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.lerpVectors(fly.p0, fly.p1, ez);
      controls.target.lerpVectors(fly.t0, fly.t1, ez);
      if (k >= 1) fly = null;
    }

    water.material.uniforms.time.value += dt * 0.55;
    cabin.update(dt, t);
    train.update(dt);
    town.update(t);
    smoke.update(dt, cabin.P.wind);
    audio.updateAmbient(dt, cabin.FIRE, cabin.P.fire);
    updateFireflies(t);
    const view = cams.update(rawDt);
    sky.update(dt, camera);
    sky.updateShadow(view.focus, view.radius);
    post.update(sky.sunDir, sky.state.elev, camera.position.distanceTo(view.focus));
    post.composer.render(rawDt);

    frames++; fpsT += rawDt;
    if (fpsT > 0.5) {
      $('r-fps').textContent = Math.round(frames / fpsT); frames = 0; fpsT = 0;
      const stt = train.status();
      $('r-train').textContent = stt; $('o-train').textContent = stt;
      $('o-kmh').textContent = Math.round(train.st.v * 3.6);
    }
    if (!started) { started = true; window.__sceneStarted = true; requestAnimationFrame(() => loader.classList.add('done')); }
  });
}
