// Forest, meadow flora and fireflies.
import { THREE, Q, U, R, rand, pick, std, lakeD, notchAngle, PASS_ANG, mergeGeometries, LAYER_NO_REFLECT, VIEWS, D2R } from './core.js';
import { heightAt } from './world.js';
import { S, trackGrid, streetGrid, creekDist, PORTALS, CHURCH } from './route.js';

function addSway(mat) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.time; sh.uniforms.uWind = U.wind;
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
      #else
        float ph = 0.0;
      #endif
      float sw = sin(uTime * 1.4 + ph) * 0.5 + sin(uTime * 2.3 + ph * 1.7) * 0.25;
      float hgt = max(position.y - 1.0, 0.0);
      transformed.x += sw * (0.012 + 0.02 * uWind) * hgt;
      transformed.z += sw * 0.008 * hgt;`);
  };
  return mat;
}
function tint(geo, hex) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** true where nothing may grow: rail corridor, streets, town, creek, portals, views we keep open */
export function occupied(x, z) {
  const td = trackGrid.dist(x, z);
  if (td < 9) { const s = trackGrid.sAt(x, z); if (s > S.A - 12 && s < S.B + 12) return true; }
  if (streetGrid.dist(x, z) < 16) return true;
  if (creekDist(x, z) < 9) return true;
  for (const p of PORTALS) if (Math.hypot(x - p.x, z - p.z) < 16) return true;
  if (Math.hypot(x - CHURCH.x, z - CHURCH.z) < 14) return true;
  return false;
}

// keep the overview camera's line of sight clear (its foreground wedge)
const HERO = { x: VIEWS.hero.pos[0], z: VIEWS.hero.pos[2] };
function heroBlocks(x, z) {
  const d = Math.hypot(x - HERO.x, z - HERO.z);
  if (d < 12) return true;
  const a = Math.atan2(x - HERO.x, -(z - HERO.z)) / D2R;
  return d < 70 && a > 12 && a < 85;
}

export function createTrees(scene, lots = []) {
  const spruceGeo = mergeGeometries([
    tint(new THREE.CylinderGeometry(0.14, 0.22, 1.4, 5).translate(0, 0.7, 0), 0x4a3222),
    tint(new THREE.ConeGeometry(1.7, 2.4, 7).translate(0, 2.0, 0), 0x1f3b27),
    tint(new THREE.ConeGeometry(1.35, 2.2, 7).translate(0, 3.3, 0), 0x234329),
    tint(new THREE.ConeGeometry(1.0, 2.0, 7).translate(0, 4.5, 0), 0x284a2c),
    tint(new THREE.ConeGeometry(0.65, 1.7, 7).translate(0, 5.6, 0), 0x2d5231),
    tint(new THREE.ConeGeometry(0.32, 1.2, 6).translate(0, 6.5, 0), 0x335a35),
  ]);
  const pineGeo = mergeGeometries([
    tint(new THREE.CylinderGeometry(0.15, 0.26, 4.4, 6).translate(0, 2.2, 0), 0x5a3a26),
    tint(new THREE.IcosahedronGeometry(1.6, 0).scale(1, 0.62, 1).translate(0, 4.9, 0), 0x2a4a2a),
    tint(new THREE.IcosahedronGeometry(1.15, 0).scale(1, 0.6, 1).translate(0.55, 5.8, 0.25), 0x31552f),
    tint(new THREE.IcosahedronGeometry(0.8, 0).scale(1, 0.6, 1).translate(-0.4, 6.4, -0.2), 0x365c33),
  ]);
  const trees = [];
  const ok = (x, z) => {
    if (x > -10 && x < 22 && z > -13 && z < 28) return false;      // cabin clearing & lake view
    if (x > 18 && x < 112 && z > -34 && z < 26) return false;      // keep the town visible from the overview
    if (lakeD(x, z) < 1.1) return false;
    if (heroBlocks(x, z)) return false;
    for (const l of lots) if (Math.hypot(x - l.x, z - l.z) < l.r + 3) return false;
    if (z < -80 && lakeD(x, z) < 1.75) return false;                // keep the far-shore line visible across the lake
    const h = heightAt(x, z);
    if (h < 0.5 || h > 55) return false;
    if (z < -60 && Math.abs(notchAngle(x, z) - PASS_ANG) < 0.17) return false;
    return !occupied(x, z);
  };
  const scatter = (count, xr, zr, sr) => {
    let n = 0;
    for (let tries = 0; n < count && tries < count * 50; tries++) {
      const x = R(xr[0], xr[1]), z = R(zr[0], zr[1]);
      if (!ok(x, z)) continue;
      trees.push({ x, z, s: R(sr[0], sr[1]), pine: rand() < 0.3 }); n++;
    }
  };
  scatter(Q.nearTrees, [-60, 60], [-40, 50], [0.9, 1.6]);
  scatter(Math.round(Q.farTrees * 1.5), [-250, 235], [-230, 135], [1.2, 2.2]);   // wider range: the track and mountains moved out
  const build = (geo, list) => {
    const mesh = new THREE.InstancedMesh(geo, addSway(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 })), list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    list.forEach((t, i) => {
      m4.compose(new THREE.Vector3(t.x, heightAt(t.x, t.z) - 0.1, t.z), q.setFromEuler(e.set(0, R(0, 6.28), 0)), new THREE.Vector3(t.s * R(0.9, 1.1), t.s, t.s * R(0.9, 1.1)));
      mesh.setMatrixAt(i, m4);
      const k = R(0.8, 1.18); mesh.setColorAt(i, c.setRGB(k, k * R(0.95, 1.06), k));
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  };
  build(spruceGeo, trees.filter(t => !t.pine));
  build(pineGeo, trees.filter(t => t.pine));
  return trees.length;
}

export function createFlora(scene, cabin, lots = []) {
  const tuftGeo = mergeGeometries([0, 1, 2].map(k => new THREE.ConeGeometry(0.04, 0.28, 3).translate(0, 0.14, 0).rotateZ(R(-0.35, 0.35)).rotateY(k * 2.1)));
  const headGeo = new THREE.IcosahedronGeometry(0.075, 0);
  const flowerCols = [0xb38ad8, 0xf2d24a, 0xf4f1ea, 0xe98aa6, 0x7c95e6].map(h => new THREE.Color(h));
  const wm = cabin.windmill.position;
  const blocked = (x, z) =>
    (Math.abs(x) < 5.2 && z > -4 && z < 7.2) || Math.hypot(x - wm.x, z - wm.z) < 2.8 ||
    Math.hypot(x + 2.6, z - 7.6) < 1.6 || lakeD(x, z) < 1.12 || streetGrid.dist(x, z) < 3.5 || cabin.pathDist(x, z) < 0.8 ||
    lots.some(l => Math.hypot(x - l.x, z - l.z) < l.r + 0.5);
  const place = (count, nearPath) => {
    const out = [];
    for (let tries = 0; out.length < count && tries < count * 20; tries++) {
      let x, z;
      if (nearPath && rand() < 0.65) {
        const pt = cabin.pathCurve.getPointAt(rand()), tan = cabin.pathCurve.getTangentAt(0.5);
        const o = (rand() < 0.5 ? -1 : 1) * R(0.85, 2.4);
        x = pt.x - tan.z * o + R(-0.4, 0.4); z = pt.z + tan.x * o + R(-0.4, 0.4);
      } else { x = R(-22, 34); z = R(-12, 28); }
      if (blocked(x, z)) continue;
      out.push([x, z]);
    }
    return out;
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  const tufts = place(Math.round(1500 * Q.flora), false);
  const tm = new THREE.InstancedMesh(tuftGeo, std(0xffffff, { roughness: 1 }), tufts.length);
  tufts.forEach(([x, z], i) => {
    const s = R(0.6, 1.1);
    m4.compose(new THREE.Vector3(x, heightAt(x, z), z), q.setFromEuler(e.set(0, R(0, 6.28), 0)), new THREE.Vector3(s, s * R(0.8, 1.2), s));
    tm.setMatrixAt(i, m4); tm.setColorAt(i, c.setHSL(R(0.2, 0.26), R(0.35, 0.5), R(0.2, 0.32)));
  });
  tm.receiveShadow = true; tm.computeBoundingSphere(); tm.layers.set(LAYER_NO_REFLECT); scene.add(tm);
  const flowers = place(Math.round(650 * Q.flora), true);
  const fm = new THREE.InstancedMesh(headGeo, std(0xffffff, { roughness: 0.7 }), flowers.length);
  flowers.forEach(([x, z], i) => {
    const s = R(0.7, 1.3);
    m4.compose(new THREE.Vector3(x, heightAt(x, z) + R(0.14, 0.3), z), q.identity(), new THREE.Vector3(s, s, s));
    fm.setMatrixAt(i, m4); fm.setColorAt(i, pick(flowerCols));
  });
  fm.computeBoundingSphere(); fm.layers.set(LAYER_NO_REFLECT); scene.add(fm);
}

export function createFireflies(scene, scaleUniform) {
  const FF = Q.fireflies;
  const pos = new Float32Array(FF * 3), ph = new Float32Array(FF), base = [];
  for (let n = 0; base.length < FF && n < FF * 30; n++) {
    const x = R(-12, 34), z = R(-8, 24);
    if ((Math.abs(x) < 5.6 && z > -4 && z < 7.6) || lakeD(x, z) < 1.12 || Math.hypot(x + 2.6, z - 7.6) < 2) continue;
    base.push({ x, y: heightAt(x, z) + R(0.4, 1.8), z, ax: R(0.5, 1.6), ay: R(0.2, 0.5), az: R(0.5, 1.6), w: R(0.15, 0.45), ph: R(0, 100) });
    ph[base.length - 1] = R(0, 100);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: { uNight: U.night, uTime: U.time, uScale: scaleUniform },
    vertexShader: `attribute float aPhase; uniform float uTime, uNight, uScale; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        float blink = pow(max(sin(uTime * (0.9 + fract(aPhase) * 0.8) + aPhase), 0.0), 6.0);
        gl_PointSize = max(0.12 * uScale / -mv.z, 1.0); vA = blink * uNight; }`,
    fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r); gl_FragColor = vec4(vec3(2.2, 3.0, 0.7) * a * vA, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  return function update(t) {
    if (U.night.value < 0.01) { pts.visible = false; return; }
    pts.visible = true;
    base.forEach((b, i) => {
      pos[i * 3] = b.x + Math.sin(t * b.w + b.ph) * b.ax;
      pos[i * 3 + 1] = b.y + Math.sin(t * b.w * 1.7 + b.ph * 2) * b.ay;
      pos[i * 3 + 2] = b.z + Math.cos(t * b.w * 0.8 + b.ph) * b.az;
    });
    geo.attributes.position.needsUpdate = true;
  };
}
