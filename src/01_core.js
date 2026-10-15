'use strict';
const THREE = window.THREE;
const canvas = document.getElementById('c');
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('fallback').hidden = false;
  return;
}
const maxPR = Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 1.75);
let curPR = maxPR;
renderer.setPixelRatio(curPR);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 9000);
scene.add(camera);
/* shared uniforms. caus: x time, y caustic strength, z water surface height.
   water: rgb tint for anything below the surface, a = absorption per metre */
const U = {
  T: { value: 0 },
  caus: { value: new THREE.Vector3(0, 0.8, 0) },
  water: { value: new THREE.Vector4(0.1, 0.33, 0.38, 0.4) }
};
