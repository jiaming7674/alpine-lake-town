// Low-poly terrain mesh (one color per face) and the reflective lake.
import { THREE, Q, R, rand, mulberry32, fbm, lakeD, WORLD_SIZE } from './core.js';
import { Water } from 'three/addons/objects/Water.js';
import { heightAt } from './world.js';

export function createTerrain(scene) {
  // Q.seg was tuned for a 900 m plane; scale it so the cell size (about 3 m) stays the same.
  const seg = Math.round(Q.seg * WORLD_SIZE / 900);
  let g = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)));
  g = g.toNonIndexed();
  g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const K = {
    bed: new THREE.Color(0x3f3a2e), sand: new THREE.Color(0x9c8759),
    grassA: new THREE.Color(0x4a6a2b), grassB: new THREE.Color(0x7d8a3a),
    rockA: new THREE.Color(0x5f5954), rockB: new THREE.Color(0x857b72), snow: new THREE.Color(0xe6e3ec),
  };
  // The first 2 * Q.seg² faces (what the old 900 m plane had) keep drawing from the shared random
  // stream; extra faces use their own. That way the town and trees generated afterwards stay exactly as before.
  const legacyFaces = 2 * Q.seg * Q.seg, extraRand = mulberry32(31337);
  for (let f = 0; f < pos.count; f += 3) {
    const cx = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
    const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
    const ny = nor.getY(f);
    const n = fbm(cx * 0.08, cz * 0.08, 2);
    if (cy < -0.4) c.copy(K.bed);
    else if (cy < 0.5 && lakeD(cx, cz) < 1.15) c.copy(K.sand);
    else if (cy > 85 && ny > 0.55) c.copy(K.snow);
    else if (ny < 0.78 || cy > 40) c.copy(K.rockA).lerp(K.rockB, n);
    else c.copy(K.grassA).lerp(K.grassB, n * 0.9);
    c.offsetHSL(0, 0, ((f / 3 < legacyFaces ? rand() : extraRand()) - 0.5) * 0.035);
    for (let k = 0; k < 3; k++) c.toArray(col, (f + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  terrain.receiveShadow = true;
  scene.add(terrain);
  return terrain;
}

function makeWaterNormals() {
  const N = 256, data = new Uint8Array(N * N * 4), waves = [];
  for (let k = 0; k < 16; k++) {
    const kx = Math.round(R(-9, 9)), ky = Math.round(R(-9, 9));
    if (kx === 0 && ky === 0) continue;
    waves.push({ kx, ky, a: R(0.3, 1) / (1 + k * 0.35), ph: R(0, Math.PI * 2) });
  }
  const v = new THREE.Vector3();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let dx = 0, dy = 0;
    for (const w of waves) { const c = Math.cos(2 * Math.PI * (w.kx * x / N + w.ky * y / N) + w.ph) * w.a; dx += c * w.kx; dy += c * w.ky; }
    v.set(-dx * 0.045, -dy * 0.045, 1).normalize();
    const i = (y * N + x) * 4;
    data[i] = (v.x * 0.5 + 0.5) * 255; data[i + 1] = (v.y * 0.5 + 0.5) * 255; data[i + 2] = (v.z * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export function createWater(scene) {
  const water = new Water(new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE), {
    textureWidth: Q.water, textureHeight: Q.water, waterNormals: makeWaterNormals(),
    sunDirection: new THREE.Vector3(0, 1, 0), sunColor: 0xffb070, waterColor: 0x0d2a33,
    distortionScale: 1.8, fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.material.uniforms.size.value = 1.6;
  scene.add(water);
  return water;
}
