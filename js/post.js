// Post-processing: god rays toward the sun, bloom, optional bokeh, tone-mapped output.
import { THREE, Q, smooth } from './core.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uVisible: { value: 1 },
    uIntensity: { value: 0.3 }, uThreshold: { value: 1.5 }, uDecay: { value: 0.965 }, uDensity: { value: 0.85 }, uWeight: { value: 0.045 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uVisible, uIntensity, uThreshold, uDecay, uDensity, uWeight;
    varying vec2 vUv;
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if (uVisible * uIntensity < 0.001) { gl_FragColor = base; return; }
      const int N = 48;
      vec2 delta = (vUv - uSun) * (uDensity / float(N));
      vec2 c = vUv; float illum = 1.0; vec3 acc = vec3(0.0);
      for (int i = 0; i < N; i++) {
        c -= delta;
        vec3 s = texture2D(tDiffuse, clamp(c, 0.0, 1.0)).rgb;
        float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
        float nearSun = smoothstep(0.45, 0.0, distance(c, uSun));
        acc += min(s * smoothstep(uThreshold, uThreshold * 3.0, l), vec3(8.0)) * nearSun * illum * uWeight;
        illum *= uDecay;
      }
      gl_FragColor = vec4(base.rgb + acc * uIntensity * uVisible, base.a);
    }`,
};

export function createPost(renderer, scene, camera, w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: Q.samples });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  const rays = new ShaderPass(GodRaysShader); composer.addPass(rays);
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.6, 1.0); composer.addPass(bloom);
  const bokeh = new BokehPass(scene, camera, { focus: 40, aperture: 0.0004, maxblur: 0.008 }); bokeh.enabled = false; composer.addPass(bokeh);
  composer.addPass(new OutputPass());

  const tmp = new THREE.Vector3(), dir = new THREE.Vector3();
  return {
    composer, rays, bloom, bokeh,
    update(sunDir, elev, focusDist) {
      tmp.copy(camera.position).addScaledVector(sunDir, 1000).project(camera);
      camera.getWorldDirection(dir);
      rays.uniforms.uSun.value.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);
      rays.uniforms.uVisible.value = smooth(0.05, 0.45, dir.dot(sunDir)) * smooth(-2.5, 1, elev);
      if (bokeh.enabled) bokeh.uniforms.focus.value = focusDist;
    },
    setSize(w, h) { composer.setSize(w, h); },
  };
}
