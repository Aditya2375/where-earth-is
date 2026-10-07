import * as THREE from '../vendor/three.module.min.js';
// True-radius, mission-textured bodies in the solar layer (unit: AU).
// Each map is a real spacecraft product; spin phase uses the IAU rotation model where the map's longitude frame is documented.
const AUKM = 149597870.7, D2R = Math.PI / 180, EPS0 = (84381.406 / 3600) * D2R;
const SPEC = {
  venus: { tex: 'tex/venus.jpg', R: 6051.8, a0: 272.76, d0: 67.16, W0: 160.20, Wd: -1.4813688, spin: true, lonOffset: .5,
    cap: 'Venus: USGS/PDS Magellan C3-MDIR radar surface mapped through clouds, not an optical view. Black areas are missing data, not dark terrain. 1024 px browse mosaic; IAU rotation model.' },
  mars: { tex: 'tex/mars.jpg', R: 3396.19, a0: 317.68143, d0: 52.88650, W0: 176.630, Wd: 350.89198226, spin: true, lonOffset: .5,
    cap: 'Mars: USGS/NASA Ames Viking MDIM2.1 colorized mosaic, not live imagery or exact eye color. 1024 px browse product. Equatorial-radius sphere and IAU 2009 mean spin model omit small orientation terms.' },
  mercury: { tex: 'tex/mercury.jpg', R: 2439.7, a0: 281.0103, d0: 61.4155, W0: 329.5988, Wd: 6.1385108, spin: true,
    cap: 'Mercury: NASA/JHU-APL/Carnegie, MESSENGER MDIS global map, enhanced color (not what the eye would see). Tilt and spin phase follow the IAU model.' },
  jupiter: { tex: 'tex/jupiter.jpg', R: 69911, a0: 268.057, d0: 64.495, W0: 0, Wd: 0, spin: false,
    cap: 'Jupiter: NASA/JPL Cassini map from the Dec 2000 flyby. The pole direction is real. The cloud pattern is that snapshot, not today\'s, and its rotation phase is not modelled.' }
};
const VS = 'varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normalize((modelMatrix*vec4(normal,0.)).xyz); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
const FS = 'uniform sampler2D tMap; uniform vec3 uSun; uniform float uOp; varying vec2 vUv; varying vec3 vN; void main(){ vec3 c=texture2D(tMap,vUv).rgb; c=pow(c,vec3(2.2)); float d=dot(normalize(vN),normalize(uSun)); float l=smoothstep(-.06,.22,d)*(.25+.75*max(d,0.)); l=max(l,.012); gl_FragColor=vec4(c*l*1.35,uOp); }';
function sphere(n) {
  const W = 128, H = 64, pos = [], uv = [], nor = [], idx = [];
  for (let j = 0; j <= H; j++) { const lat = (j / H - .5) * Math.PI; for (let i = 0; i <= W; i++) { const lon = i / W * 2 * Math.PI; const x = Math.cos(lat) * Math.cos(lon), y = Math.cos(lat) * Math.sin(lon), z = Math.sin(lat); pos.push(x, y, z); nor.push(x, y, z); uv.push(i / W + (n || 0), j / H); } }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const a = j * (W + 1) + i, b = a + W + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
export const BODY_R = n => SPEC[n] && SPEC[n].R;
export function buildBodies(U, L) {
  const ld = new THREE.TextureLoader(), out = { list: [] };
  const cap = document.createElement('div'); cap.className = 'imgcap2'; cap.style.cssText = 'position:fixed;left:50%;bottom:132px;transform:translateX(-50%);width:min(640px,calc(100vw - 32px));box-sizing:border-box;padding:6px 10px;background:rgba(0,0,0,.78);font:11px/1.45 ui-monospace,monospace;color:#9aa;text-align:center;opacity:0;transition:opacity .4s;pointer-events:none;z-index:3'; document.body.appendChild(cap);
  for (const name in SPEC) {
    const s = SPEC[name];
    ld.load(s.tex, tx => {
      tx.anisotropy = Math.min(8, U.r.capabilities.getMaxAnisotropy()); tx.wrapS = THREE.RepeatWrapping; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true;
      const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, side: THREE.DoubleSide, uniforms: { tMap: { value: tx }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uOp: { value: 1 } } });
      mat.userData.base = 1; L.mats.push(mat);
      const m = new THREE.Mesh(sphere(s.lonOffset), mat); m.matrixAutoUpdate = false; m.frustumCulled = false; m.renderOrder = 1; L.scene.add(m);
      out.list.push({ name, s, m, mat });
    }, undefined, () => { /* texture missing: body stays a dot */ });
  }
  const Rz = a => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const Rx = a => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const mul = (A, B) => A.map((r, i) => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  out.update = (fr, alA, names) => {
    const ms = fr.ms ?? Date.now(), d = ms / 86400000 + 2440587.5 - 2451545;
    let capTxt = '';
    for (const b of out.list) {
      const s = b.s, p = fr.bodies[b.name]; if (!p) { b.m.visible = false; continue; }
      const rAU = s.R / AUKM, dist = U.dist / AUKM;
      const a = s.a0 * D2R, de = s.d0 * D2R, W = ((s.W0 + s.Wd * d) % 360) * D2R;
      let R = mul(mul(Rz(a + Math.PI / 2), Rx(Math.PI / 2 - de)), Rz(W)); // body -> equatorial
      R = mul(Rx(-EPS0), R); // equatorial -> ecliptic J2000
      // ecliptic -> three: (x, z, -y)
      const C = [[1, 0, 0], [0, 0, 1], [0, -1, 0]]; R = mul(C, R);
      const M = new THREE.Matrix4().set(R[0][0] * rAU, R[0][1] * rAU, R[0][2] * rAU, p[0], R[1][0] * rAU, R[1][1] * rAU, R[1][2] * rAU, p[1], R[2][0] * rAU, R[2][1] * rAU, R[2][2] * rAU, p[2], 0, 0, 0, 1);
      b.m.matrix.copy(M); b.m.matrixWorldNeedsUpdate = true; b.m.visible = fr.regime === 'precision' || fr.regime === 'modeled';
      b.mat.uniforms.uSun.value.set(-p[0], -p[1], -p[2]);
      const near = dist < rAU * 400; if (near && b.m.visible) { const i = names.indexOf(b.name); if (i >= 0) alA.array[i] = 0; if (U.focus === b.name && dist < rAU * 60) capTxt = s.cap; }
    }
    cap.style.bottom = innerWidth < 600 ? '210px' : '132px'; cap.textContent = capTxt; cap.style.opacity = capTxt && scrollY < 200 ? 0.85 : 0;
  };
  return out;
}
