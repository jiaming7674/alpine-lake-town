// The original cabin, windmill, cobblestone path and campfire (ported from v2).
import { THREE, Q, U, R, rand, pick, lerp, smooth, hash, std, box, mergeGeometries, WIND_DIR } from './core.js';
import { heightAt } from './world.js';

export const M = {
  log: std(0xffffff, { roughness: 0.88 }),
  roof: std(0x3a2d27, { roughness: 0.95 }),
  wood: std(0x5a3a24),
  darkWood: std(0x3a2618),
  frame: std(0x2b1d15),
  char: std(0x1d1510, { roughness: 1 }),
  stones: [std(0x8b857d, { roughness: 0.75 }), std(0x746e67, { roughness: 0.7 }), std(0x9a9186, { roughness: 0.8 })],
  stoneInst: std(0xffffff, { roughness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1c1108, emissive: 0xffa94d, emissiveIntensity: 3, roughness: 0.35 }),
  glassDim: new THREE.MeshStandardMaterial({ color: 0x1c1108, emissive: 0xff9a3c, emissiveIntensity: 1.4, roughness: 0.35 }),
};
const shadowAll = obj => obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

export function addWindow(parent, w, h, x, y, z, rotY = 0, px = 2, py = 2, glassMat = M.glass) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassMat); glass.userData.glass = true; g.add(glass);
  const t = 0.1, d = 0.14;
  for (const s of [-1, 1]) {
    const hb = box(w + 2 * t, t, d, M.frame); hb.position.y = s * (h / 2 + t / 2); g.add(hb);
    const vb = box(t, h, d, M.frame); vb.position.x = s * (w / 2 + t / 2); g.add(vb);
  }
  for (let i = 1; i < px; i++) { const m = box(0.05, h, 0.06, M.frame); m.position.set(-w / 2 + i * w / px, 0, 0.02); g.add(m); }
  for (let i = 1; i < py; i++) { const m = box(w, 0.05, 0.06, M.frame); m.position.set(0, -h / 2 + i * h / py, 0.02); g.add(m); }
  const sill = box(w + 0.36, 0.08, 0.26, M.wood); sill.position.set(0, -h / 2 - 0.13, 0.08); g.add(sill);
  g.position.set(x, y, z); g.rotation.y = rotY;
  parent.add(g);
  return g;
}

function buildCabin() {
  const g = new THREE.Group();
  const W = 8, D = 6, r = 0.2, N = 14, step = r * 2 * 0.93;
  const geoX = new THREE.CylinderGeometry(r, r, 1, 7).rotateZ(Math.PI / 2);
  const geoZ = new THREE.CylinderGeometry(r, r, 1, 7).rotateX(Math.PI / 2);
  const mx = new THREE.InstancedMesh(geoX, M.log, N * 2), mz = new THREE.InstancedMesh(geoZ, M.log, N * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color();
  let ix = 0, iz = 0;
  for (let i = 0; i < N; i++) {
    const y = r + i * step;
    for (const zz of [-D / 2, D / 2]) { m4.compose(v.set(R(-0.05, 0.05), y, zz), q, s.set(W + 0.9 + R(-0.12, 0.12), 1, 1)); mx.setMatrixAt(ix, m4); mx.setColorAt(ix++, c.setHSL(0.07, 0.42, R(0.22, 0.31))); }
    for (const xx of [-W / 2, W / 2]) { m4.compose(v.set(xx, y + r * 0.5, R(-0.05, 0.05)), q, s.set(1, 1, D + 0.9 + R(-0.12, 0.12))); mz.setMatrixAt(iz, m4); mz.setColorAt(iz++, c.setHSL(0.07, 0.42, R(0.22, 0.31))); }
  }
  g.add(mx, mz);
  const wallTop = r + (N - 1) * step + r;
  const plinth = box(W + 0.7, 0.5, D + 0.7, M.stones[1]); plinth.position.y = -0.2; g.add(plinth);
  const rise = 2.2;
  const tri = new THREE.Shape([new THREE.Vector2(-D / 2 - 0.2, 0), new THREE.Vector2(D / 2 + 0.2, 0), new THREE.Vector2(0, rise + 0.1)]);
  const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.4, bevelEnabled: false }).rotateY(Math.PI / 2);
  for (const sx of [-1, 1]) { const gm = new THREE.Mesh(triGeo, M.wood); gm.position.set(sx > 0 ? W / 2 - 0.2 : -W / 2 - 0.2, wallTop - 0.05, 0); g.add(gm); }
  const pitch = Math.atan(rise / (D / 2)), over = 0.6;
  const slopeLen = Math.hypot(D / 2 + over, (D / 2 + over) * Math.tan(pitch));
  for (const sz of [-1, 1]) {
    const slab = box(W + 1.3, 0.24, slopeLen, M.roof);
    const midZ = sz * (D / 2 + over) / 2;
    slab.position.set(0, wallTop + rise - Math.abs(midZ) * Math.tan(pitch) + 0.14, midZ);
    slab.rotation.x = sz * pitch;
    g.add(slab);
    for (let k = 1; k <= 5; k++) {
      const zz = sz * (k / 6) * (D / 2 + over);
      const strip = box(W + 1.32, 0.06, 0.12, M.frame);
      strip.position.set(0, wallTop + rise - Math.abs(zz) * Math.tan(pitch) + 0.28, zz);
      strip.rotation.x = sz * pitch;
      g.add(strip);
    }
  }
  const ridge = box(W + 1.4, 0.22, 0.34, M.frame); ridge.position.set(0, wallTop + rise + 0.3, 0); g.add(ridge);
  const fz = D / 2 + r + 0.02;
  addWindow(g, 1.3, 1.2, -2.5, 1.75, fz); addWindow(g, 1.3, 1.2, 2.5, 1.75, fz);
  addWindow(g, 1.1, 0.95, -2.2, 4.05, fz); addWindow(g, 1.1, 0.95, 2.2, 4.05, fz);
  const door = box(1.1, 2.2, 0.12, M.darkWood); door.position.set(0, 1.2, fz); g.add(door);
  addWindow(g, 0.5, 0.45, 0, 1.75, fz + 0.08, 0, 2, 1);
  addWindow(g, 1.1, 1.0, -W / 2 - r - 0.02, 1.8, -0.8, -Math.PI / 2);
  addWindow(g, 0.9, 0.85, -W / 2 - r - 0.02, 4.05, -0.8, -Math.PI / 2);
  addWindow(g, 1.1, 1.0, W / 2 + r + 0.02, 1.8, -1.7, Math.PI / 2);
  const deck = box(W + 0.4, 0.2, 2.3, M.wood); deck.position.set(0, 0.2, D / 2 + 1.35); g.add(deck);
  const steps = box(1.7, 0.16, 0.5, M.wood); steps.position.set(0, 0.06, D / 2 + 2.7); g.add(steps);
  const postGeo = new THREE.CylinderGeometry(0.11, 0.12, 2.8, 6);
  for (const px of [-4, -1.1, 1.1, 4]) { const p = new THREE.Mesh(postGeo, M.wood); p.position.set(px, 1.7, D / 2 + 2.3); g.add(p); }
  const beam = box(W + 0.5, 0.2, 0.22, M.wood); beam.position.set(0, 3.05, D / 2 + 2.3); g.add(beam);
  const proof = box(W + 0.9, 0.14, 2.8, M.roof); proof.position.set(0, 3.35, D / 2 + 1.35); proof.rotation.x = 0.22; g.add(proof);
  for (const sx of [-1, 1]) {
    const rail = box(2.9, 0.08, 0.08, M.wood); rail.position.set(sx * 2.55, 1.2, D / 2 + 2.3); g.add(rail);
    for (let k = 0; k < 6; k++) { const b = box(0.05, 0.85, 0.05, M.wood); b.position.set(sx * (1.3 + k * 0.5), 0.72, D / 2 + 2.3); g.add(b); }
  }
  const chim = new THREE.Group();
  const layerH = 0.68, layers = 13;
  for (let i = 0; i < layers; i++) {
    const w = i < 9 ? 1.2 : 0.95;
    const b = box(w + R(-0.08, 0.08), layerH, w + R(-0.08, 0.08), pick(M.stones));
    b.position.set(R(-0.04, 0.04), layerH / 2 + i * layerH - 0.3, R(-0.04, 0.04)); b.rotation.y = R(-0.05, 0.05);
    chim.add(b);
  }
  const cap = box(1.2, 0.14, 1.2, M.stones[1]); cap.position.y = layers * layerH - 0.3 + 0.07; chim.add(cap);
  chim.position.set(W / 2 + r + 0.62, 0, 0.8);
  g.add(chim);
  g.userData.chimneyTop = new THREE.Vector3(chim.position.x, layers * layerH - 0.1, chim.position.z);
  shadowAll(g);
  g.traverse(o => { if (o.userData.glass) o.castShadow = false; });
  return g;
}

function buildWindmill() {
  const g = new THREE.Group();
  const towerGeo = new THREE.CylinderGeometry(1.5, 2.2, 9, 10, 6);
  const p = towerGeo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    if (Math.hypot(v.x, v.z) < 0.01) continue;
    const k = 1 + (hash(Math.round(v.x * 50) * 0.37, Math.round(v.y * 50) * 0.21 + Math.round(v.z * 50) * 0.13) - 0.5) * 0.07;
    p.setX(i, v.x * k); p.setZ(i, v.z * k);
  }
  towerGeo.computeVertexNormals();
  const tower = new THREE.Mesh(towerGeo, M.stones[0]); tower.position.y = 4.5; g.add(tower);
  for (const y of [3.0, 6.3]) { const rr = 2.2 - (y / 9) * 0.7 + 0.04; const band = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 0.2, 10), M.darkWood); band.position.y = y; g.add(band); }
  const capBase = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.35, 10), M.darkWood); capBase.position.y = 9.15; g.add(capBase);
  const capCone = new THREE.Mesh(new THREE.ConeGeometry(2.05, 2.6, 10), M.roof); capCone.position.y = 10.6; g.add(capCone);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.3, 8).rotateX(Math.PI / 2), M.darkWood); hub.position.set(0, 9.4, 1.95); g.add(hub);
  const doorR = 2.2 - (0.95 / 9) * 0.7;
  const door = box(1.0, 1.9, 0.3, M.darkWood); door.position.set(0, 0.95, doorR - 0.05); g.add(door);
  addWindow(g, 0.5, 0.7, 0, 5.0, 2.2 - (5 / 9) * 0.7 + 0.03, 0, 1, 2, M.glassDim);
  const bx = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const parts = [];
  for (let b = 0; b < 4; b++) {
    const arr = [bx(0.2, 6.6, 0.2, 0, 3.4, 0)];
    const x0 = 0.15, x1 = 1.35, y0 = 1.3, y1 = 6.5;
    arr.push(bx(0.07, y1 - y0, 0.07, x1, (y0 + y1) / 2, 0));
    arr.push(bx(0.05, y1 - y0, 0.05, (x0 + x1) / 2, (y0 + y1) / 2, 0));
    for (let y = y0; y <= y1 + 0.01; y += 0.4) arr.push(bx(x1 - x0 + 0.07, 0.05, 0.05, (x0 + x1) / 2, y, 0));
    arr.push(bx(0.34, y1 - y0, 0.04, -0.28, (y0 + y1) / 2, 0));
    const m = mergeGeometries(arr); m.rotateZ(b * Math.PI / 2); parts.push(m);
  }
  const sails = new THREE.Mesh(mergeGeometries(parts), M.wood);
  sails.position.set(0, 9.4, 2.65);
  g.add(sails);
  g.userData.sails = sails;
  g.userData.doorLocal = new THREE.Vector3(0, 0, doorR + 0.4);
  shadowAll(g);
  // door lantern
  const lmat = new THREE.MeshStandardMaterial({ color: 0x2a1a0c, emissive: 0xffb050, emissiveIntensity: 0.6, flatShading: true });
  const lg = new THREE.Group();
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 4), M.frame); top.position.y = 0.23; top.rotation.y = Math.PI / 4;
  const arm = box(0.05, 0.05, 0.4, M.frame); arm.position.set(0, 0.32, -0.2);
  const light = new THREE.PointLight(0xffa040, 1, 10, 2); light.position.set(0, 0, 0.2);
  lg.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), lmat), top, arm, light);
  lg.position.set(0.75, 2.3, 2.37);
  g.add(lg);
  g.userData.lantern = { mat: lmat, light };
  return g;
}

export function createCabin(scene, smoke, sky) {
  const cabin = buildCabin();
  cabin.position.set(0, 0.22, 0);
  scene.add(cabin);

  const windmill = buildWindmill();
  windmill.position.set(12, heightAt(12, -2) - 0.1, -2);
  windmill.rotation.y = -0.45;
  scene.add(windmill);
  windmill.updateMatrixWorld(true);
  const doorWorld = windmill.localToWorld(windmill.userData.doorLocal.clone());

  // cobblestone path, porch → windmill
  const pathCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 6.2), new THREE.Vector3(1.9, 0, 7.6), new THREE.Vector3(5.3, 0, 7.2),
    new THREE.Vector3(8.4, 0, 4.8), new THREE.Vector3(doorWorld.x - 0.4, 0, doorWorld.z + 1.6), new THREE.Vector3(doorWorld.x, 0, doorWorld.z),
  ]);
  const pathPts = pathCurve.getSpacedPoints(120);
  const pathDist = (x, z) => { let d = Infinity; for (const p of pathPts) d = Math.min(d, (p.x - x) ** 2 + (p.z - z) ** 2); return Math.sqrt(d); };
  {
    const S = 120, stones = [];
    for (let i = 0; i < S; i++) {
      const t = i / (S - 1), pt = pathCurve.getPointAt(t), tan = pathCurve.getTangentAt(t);
      const nx = -tan.z, nz = tan.x;
      if (i % 6 === 0) stones.push({ x: pt.x, z: pt.z, sx: R(1.5, 1.9), sz: R(1.2, 1.5), big: true });
      else for (const side of [-1, 1]) { const o = side * R(0.18, 0.6); stones.push({ x: pt.x + nx * o + R(-0.08, 0.08), z: pt.z + nz * o + R(-0.08, 0.08), sx: R(0.75, 1.25), sz: R(0.65, 1.05) }); }
    }
    const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.32, 0), M.stoneInst, stones.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    stones.forEach((s, i) => {
      q.setFromEuler(e.set(R(-0.08, 0.08), R(0, Math.PI), R(-0.08, 0.08)));
      m4.compose(new THREE.Vector3(s.x, heightAt(s.x, s.z) + 0.02, s.z), q, new THREE.Vector3(s.sx, s.big ? 0.26 : 0.3, s.sz));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, c.setHSL(R(0.06, 0.1), R(0.04, 0.12), s.big ? R(0.42, 0.5) : R(0.3, 0.46)));
    });
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }

  // campfire
  const FIRE = new THREE.Vector3(-2.6, heightAt(-2.6, 7.6), 7.6);
  const fire = new THREE.Group();
  fire.position.copy(FIRE);
  {
    const sg = new THREE.DodecahedronGeometry(0.2, 0);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2, s = new THREE.Mesh(sg, pick(M.stones));
      s.position.set(Math.cos(a) * 0.78, 0.08, Math.sin(a) * 0.78);
      s.scale.set(R(0.9, 1.3), R(0.6, 0.85), R(0.9, 1.2)); s.rotation.set(R(0, 3), R(0, 3), 0);
      s.castShadow = true; fire.add(s);
    }
    for (let i = 0; i < 4; i++) {
      const holder = new THREE.Group(); holder.rotation.y = i * Math.PI / 2 + 0.3;
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.15, 6), M.char);
      lg.position.set(0.22, 0.33, 0); lg.rotation.z = 0.6; holder.add(lg); fire.add(holder);
    }
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.08, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a0d06, emissive: 0xff4a10, emissiveIntensity: 2.2, flatShading: true }));
    bed.position.y = 0.04; fire.add(bed);
  }
  const flameDefs = [
    { r: 0.42, h: 1.25, c: [2.6, 0.7, 0.12], x: 0.05, z: 0.02 }, { r: 0.34, h: 1.05, c: [2.8, 0.8, 0.14], x: -0.12, z: 0.1 },
    { r: 0.28, h: 0.95, c: [3.2, 1.7, 0.35], x: 0.1, z: -0.08 }, { r: 0.2, h: 0.8, c: [3.4, 2.4, 0.9], x: -0.02, z: 0.0 },
    { r: 0.12, h: 0.55, c: [4.0, 3.4, 2.0], x: 0.0, z: 0.03 },
  ];
  const flames = flameDefs.map((d, i) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(d.r, d.h, 6).translate(0, d.h / 2, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(...d.c), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    m.position.set(d.x, 0.08, d.z);
    m.userData = { seed: i * 1.7 + 0.3 };
    fire.add(m);
    return m;
  });
  const fireLight = new THREE.PointLight(0xff8a3c, 45, 18, 2);
  fireLight.position.set(0, 1.0, 0);
  fire.add(fireLight);
  scene.add(fire);
  const porchLight = new THREE.PointLight(0xffb060, 9, 9, 2);
  porchLight.position.set(0, 2.4, 4.1);
  cabin.add(porchLight);

  // embers
  const EMB = Q.embers;
  const ePos = new Float32Array(EMB * 3), eLife = new Float32Array(EMB), eSize = new Float32Array(EMB);
  const eVel = new Float32Array(EMB * 3), eDur = new Float32Array(EMB);
  function spawnEmber(i, warm) {
    eVel[i * 3] = R(-0.18, 0.18); eVel[i * 3 + 1] = R(0.9, 2.1); eVel[i * 3 + 2] = R(-0.18, 0.18);
    eDur[i] = R(1.6, 3.8); eSize[i] = R(0.035, 0.09);
    const life = warm ? rand() : 0, age = life * eDur[i];
    eLife[i] = life;
    ePos[i * 3] = FIRE.x + R(-0.3, 0.3) + eVel[i * 3] * age;
    ePos[i * 3 + 1] = FIRE.y + 0.3 + R(0, 0.3) + eVel[i * 3 + 1] * age;
    ePos[i * 3 + 2] = FIRE.z + R(-0.3, 0.3) + eVel[i * 3 + 2] * age;
  }
  for (let i = 0; i < EMB; i++) spawnEmber(i, true);
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3).setUsage(THREE.DynamicDrawUsage));
  eGeo.setAttribute('aLife', new THREE.BufferAttribute(eLife, 1).setUsage(THREE.DynamicDrawUsage));
  eGeo.setAttribute('aSize', new THREE.BufferAttribute(eSize, 1));
  const eMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 }, uIntensity: { value: 1 } },
    vertexShader: `attribute float aLife; attribute float aSize; uniform float uScale; varying float vLife;
      void main(){ vLife = aLife; vec4 mv = modelViewMatrix * vec4(position,1.0);
        gl_PointSize = max(aSize * (1.0 - aLife * 0.7) * uScale / -mv.z, 1.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uIntensity; varying float vLife;
      void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r) * (1.0 - vLife) * smoothstep(0.0, 0.08, vLife);
        vec3 c = mix(vec3(5.0, 2.6, 0.7), vec3(2.0, 0.35, 0.05), vLife);
        gl_FragColor = vec4(c * a * uIntensity, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const embers = new THREE.Points(eGeo, eMat);
  embers.frustumCulled = false;
  scene.add(embers);

  // smoke from the fire and chimney
  const P = { fire: 1, wind: 1 };
  const chimneyTop = cabin.localToWorld(cabin.userData.chimneyTop.clone());
  const fireSmoke = smoke.addEmitter(3.6, emit => emit({
    x: FIRE.x + R(-0.15, 0.15), y: FIRE.y + 0.9, z: FIRE.z + R(-0.15, 0.15), vx: R(-0.12, 0.12), vy: R(0.7, 1.05), vz: R(-0.12, 0.12),
    dur: R(5, 8.5), s0: 0.25 * R(0.8, 1.2), s1: 2.3 * R(0.8, 1.2), a: 0.3 * Math.min(P.fire, 1.2), color: 0x6f6966, buoy: 0.8, drag: 0.35, windK: 0.55,
  }));
  smoke.addEmitter(2.1, emit => emit({
    x: chimneyTop.x + R(-0.12, 0.12), y: chimneyTop.y, z: chimneyTop.z + R(-0.12, 0.12), vx: R(-0.1, 0.1), vy: R(0.45, 0.75), vz: R(-0.1, 0.1),
    dur: R(6, 10), s0: 0.3 * R(0.8, 1.2), s1: 1.8 * R(0.8, 1.2), a: 0.26, color: 0x8a8480, buoy: 0.6, drag: 0.35, windK: 0.55,
  }));

  const lantern = windmill.userData.lantern;
  sky.onTime((e, night) => {
    M.glass.emissiveIntensity = lerp(4.5, 2.0, smooth(-4, 12, e));
    porchLight.intensity = 9 + 14 * night;
    lantern.light.intensity = 1 + 10 * night;
    lantern.mat.emissiveIntensity = 0.6 + 3.4 * night;
  });

  function update(dt, t) {
    windmill.userData.sails.rotation.z -= dt * (0.15 + 0.35 * P.wind);
    fireSmoke.enabled = P.fire > 0.05;
    flames.forEach((f, i) => {
      const s = f.userData.seed;
      const k = P.fire * (0.85 + 0.2 * Math.sin(t * 9 + s) + 0.12 * Math.sin(t * 17.3 + s * 2.1));
      f.scale.set(0.9 + 0.1 * Math.sin(t * 7 + s), Math.max(k, 0.001), 0.9 + 0.1 * Math.cos(t * 6 + s));
      f.rotation.y += dt * (1 + i * 0.4);
      f.rotation.z = Math.sin(t * 3 + s) * 0.08 + P.wind * 0.06;
      f.visible = P.fire > 0.01;
    });
    fireLight.intensity = P.fire * (40 + 9 * Math.sin(t * 11) + 6 * Math.sin(t * 23.7) + 4 * Math.sin(t * 5.3));
    for (let i = 0; i < EMB; i++) {
      eLife[i] += dt / eDur[i];
      if (eLife[i] >= 1) { spawnEmber(i, false); continue; }
      const j = i * 3;
      ePos[j] += (eVel[j] + P.wind * 0.55 * WIND_DIR.x + Math.sin(t * 3 + i) * 0.15) * dt;
      ePos[j + 1] += eVel[j + 1] * dt;
      ePos[j + 2] += (eVel[j + 2] + P.wind * 0.55 * WIND_DIR.z + Math.cos(t * 2.3 + i) * 0.12) * dt;
      eVel[j + 1] *= 1 - 0.18 * dt;
    }
    eGeo.attributes.position.needsUpdate = true;
    eGeo.attributes.aLife.needsUpdate = true;
    embers.visible = P.fire > 0.01;
    eMat.uniforms.uIntensity.value = P.fire;
  }

  return { P, FIRE, pathCurve, pathDist, windmill, doorWorld, update, emberScale: eMat.uniforms.uScale };
}
