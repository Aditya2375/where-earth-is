import * as THREE from '../vendor/three.module.min.js';
// Observable universe and beyond. Unit: gigaparsec, Earth at the origin.
// The cosmic web here is SCHEMATIC (procedural filaments), not a survey.
export const GPC_KM = 3.0856775814914e22, R_OBS = 14.26; // 46.5 Gly comoving radius, NRAO
const PV = `attribute float size; attribute vec3 color; attribute float alpha; uniform float uPx; uniform float uOp; varying vec3 vC; varying float vA;
void main(){ vC=color; vA=alpha*uOp; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=max(size*uPx,0.0); }`;
const PF = `varying vec3 vC; varying float vA; void main(){ vec2 p=gl_PointCoord-.5; float d=length(p); float a=smoothstep(.5,.0,d); a*=a; if(a<.01) discard; gl_FragColor=vec4(vC*(.6+.9*a),a*vA); }`;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = r => { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

// LCDM background (Planck 2018: H0 67.4, Om 0.315, OL 0.685, Or 9.2e-5). Tables of age(a) and particle-horizon chi(a), inverted for any cosmic age.
const H0K = 67.4, OM = 0.315, OL = 0.685, ORAD = 9.2e-5, CH0 = 299792.458 / H0K / 1000, TH0 = 977.792 / H0K; // c/H0 in Gpc, 1/H0 in Gyr
const E_ = a => Math.sqrt(ORAD / a ** 4 + OM / a ** 3 + OL);
const TAB = (() => { const N = 2600, la0 = Math.log(1e-7), la1 = Math.log(2e3), A = [], T = [], X = []; let t = 0, x = 0, pa = 1e-7, pT = 0, pX = 0; // integrate in ln a
  const f = a => 1 / E_(a), g = a => 1 / (a * E_(a)); t = TH0 * 1e-7 * 1e-7 ** 0 / 2 * 0; // starts ~0
  for (let i = 0; i <= N; i++) { const a = Math.exp(la0 + (la1 - la0) * i / N); if (i) { const da = Math.log(a) - Math.log(pa); t += TH0 * 0.5 * (f(a) + f(pa)) * da; x += CH0 * 0.5 * (g(a) + g(pa)) * da; } A.push(a); T.push(t); X.push(x); pa = a; }
  return { A, T, X }; })();
export function lcdmAt(ageGyr) { const { A, T, X } = TAB; if (ageGyr <= T[0]) return { a: A[0], chi: X[0] }; if (ageGyr >= T[T.length - 1]) return { a: A[A.length - 1], chi: X[X.length - 1] };
  let lo = 0, hi = T.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= ageGyr) lo = m; else hi = m; } const u = (ageGyr - T[lo]) / (T[hi] - T[lo]); return { a: A[lo] + (A[hi] - A[lo]) * u, chi: X[lo] + (X[hi] - X[lo]) * u }; }
export function buildCosmos(U, L, tier) {
  const grpA = new THREE.Group(), grpS = new THREE.Group(); L.scene.add(grpA); L.scene.add(grpS); const st = { a: 1, k: 1 }, ghostRings = [];
  const r = rng(20261007), nodes = [], NN = tier === 'high' ? 340 : 220;
  for (let i = 0; i < NN; i++) { let x, y, z; do { x = (r() * 2 - 1) * R_OBS; y = (r() * 2 - 1) * R_OBS; z = (r() * 2 - 1) * R_OBS; } while (x * x + y * y + z * z > R_OBS * R_OBS); nodes.push([x, y, z]); }
  const pos = [], size = [], col = [], al = [], per = tier === 'high' ? 46 : 30;
  const add = (x, y, z, s, a, c) => { if (x * x + y * y + z * z > R_OBS * R_OBS) return; pos.push(x, y, z); size.push(s); al.push(a); col.push(...c); };
  nodes.forEach((n, i) => {
    const d = nodes.map((m, j) => [j, (n[0] - m[0]) ** 2 + (n[1] - m[1]) ** 2 + (n[2] - m[2]) ** 2]).sort((a, b) => a[1] - b[1]).slice(1, 4);
    for (const [j] of d) { if (j < i) continue; const m = nodes[j]; const len = Math.sqrt(d.find(q => q[0] === j)[1]); const cnt = Math.min(per * 3, Math.floor(len * 9));
      for (let k = 0; k < cnt; k++) { const t = r(), sc = 0.22; add(n[0] + (m[0] - n[0]) * t + gauss(r) * sc, n[1] + (m[1] - n[1]) * t + gauss(r) * sc, n[2] + (m[2] - n[2]) * t + gauss(r) * sc, 1.1 + r() * 1.6, 0.35 + r() * 0.5, r() < 0.7 ? [0.62, 0.74, 1] : [1, 0.82, 0.6]); } }
    for (let k = 0; k < per; k++) add(n[0] + gauss(r) * 0.32, n[1] + gauss(r) * 0.32, n[2] + gauss(r) * 0.32, 1.8 + r() * 2.4, 0.5 + r() * 0.5, r() < 0.5 ? [1, 0.88, 0.7] : [0.7, 0.8, 1]);
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('size', new THREE.Float32BufferAttribute(size, 1)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('alpha', new THREE.Float32BufferAttribute(al, 1));
  const pm = new THREE.ShaderMaterial({ vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: 1 }, uOp: { value: 1 } } });
  const web = new THREE.Points(g, pm); web.frustumCulled = false; web.visible = false; grpA.add(web); pm.userData.base = 1; L.mats.push(pm);
  // observable-universe shell
  const sm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending, uniforms: { uOp: { value: 1 }, uBoost: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform float uOp,uBoost; varying vec3 vN; varying vec3 vV; void main(){ float f=1.-abs(dot(vN,vV)); float a=(pow(f,3.2)*.5+.012)*uBoost+.05*(1.-f)*(uBoost-1.); gl_FragColor=vec4(vec3(.45,.65,1.)*a*1.6,min(a,1.)*uOp); }' });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R_OBS, 96, 64), sm); grpS.add(shell); sm.userData.base = 1; L.mats.push(sm);
  const ring = (R, o, c, dash) => { const pts = []; for (let k = 0; k <= 160; k++) { const a = k / 160 * 2 * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R)); }
    const m = dash ? new THREE.LineDashedMaterial({ color: c, transparent: true, opacity: o, dashSize: R * 0.025, gapSize: R * 0.025 }) : new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false });
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m); l.computeLineDistances(); m.userData.base = o; L.mats.push(m); return l; };
  const eq = ring(R_OBS, 0.5, 0x8fd0ff, false); grpS.add(eq); const mer = ring(R_OBS, 0.25, 0x8fd0ff, false); mer.rotation.x = Math.PI / 2; grpS.add(mer);
  // other observers' bubbles (illustrative): every observer has their own observable universe
  const ghosts = [[34, 6, -12], [-30, -10, 22], [12, 24, 36], [-24, 18, -34], [48, -22, 20], [-52, 8, 6]];
  ghosts.forEach((p, i) => { const e = ring(R_OBS, 0.3, 0x8fd0ff, true); e.position.set(...p); grpA.add(e); const e2 = ring(R_OBS, 0.18, 0x8fd0ff, true); e2.position.set(...p); e2.rotation.x = Math.PI / 2; grpA.add(e2); ghostRings.push(e, e2); });
  // far dashed rings: "size unknown" markers, fade outward
  [60, 120, 240].forEach((R, i) => { const e = ring(R, 0.09 - i * 0.02, 0xffffff, true); L.scene.add(e); });
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff4b2b, transparent: true })); dot.material.userData.base = 1; L.mats.push(dot.material); L.scene.add(dot);
  U.label(L, 'You are here', () => [0, 0, 0], '', null).rng = [22.9, 26.6];
  U.label(L, 'Observable universe: about 93 billion light-years across', () => [0, R_OBS * st.k, 0], 'sm', null).rng = [23.7, 24.9];
  U.label(L, 'Edge of what we can see', () => [0, -R_OBS * st.k, 0], 'sm', null).rng = [24.7, 26.6];
  U.label(L, 'Another observer\'s observable universe (illustrative)', () => [34 * st.a + R_OBS * st.k, 6 * st.a, -12 * st.a], 'sm', null).rng = [24.75, 26.6];
  U.label(L, 'Beyond this: unknown. The whole universe may be far larger, or infinite.', () => [0, -60, 0], '', null).rng = [24.75, 26.6];
  U.label(L, 'Planck 2018: curvature consistent with flat (Omega_K = 0.001 +/- 0.002)', () => [0, -75, 0], 'sm', null).rng = [24.9, 26.6];
  // Real galaxies: 2MASS Redshift Survey (Huchra et al. 2012, ApJS 199:26), fetched at build from VizieR.
  const EPS = 84381.406 / 3600 * Math.PI / 180, ce = Math.cos(EPS), se = Math.sin(EPS), H0 = 70; // km/s/Mpc
  const toW = (ra, de, d) => { const a = ra * Math.PI / 180, e = de * Math.PI / 180; const x = Math.cos(e) * Math.cos(a), y = Math.cos(e) * Math.sin(a), z = Math.sin(e); const ye = y * ce + z * se, ze = -y * se + z * ce; return [x * d, ze * d, -ye * d]; };
  const SURVEY_R = 0.74; // Gpc, deepest 2MRS redshift (cz about 52,000 km/s) at H0 = 70
  fetch('data/2mrs.csv').then(r => r.ok ? r.text() : Promise.reject()).then(txt => {
    const P = [], S = [], C = [], A = []; let n = 0;
    for (const ln of txt.split('\n')) { const f = ln.split(','); if (f.length < 4) continue; const cz = +f[2]; if (!(cz > 0)) continue; const d = cz / H0 / 1000; const p = toW(+f[0], +f[1], d); P.push(...p); const k = +f[3]; S.push(Math.max(1.3, Math.min(3.4, 4.4 - 0.28 * k))); const t = Math.min(1, d / SURVEY_R); C.push(1 - 0.25 * t, 0.78 - 0.1 * t, 0.55 + 0.45 * t); A.push(0.8); n++; }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g2.setAttribute('size', new THREE.Float32BufferAttribute(S, 1)); g2.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g2.setAttribute('alpha', new THREE.Float32BufferAttribute(A, 1));
    const real = new THREE.Points(g2, pm); real.frustumCulled = false; grpA.add(real);
    const sr = ring(SURVEY_R, 0.35, 0xffd9a0, true); grpA.add(sr);
    const gc = toW(266.405, -28.936, 0.45), gcn = toW(266.405, -28.936, 0.3);
    U.label(L, '2MASS Redshift Survey: ' + n.toLocaleString('en-US') + ' real galaxies', () => [0, 0.5 * st.a, 0], 'sm', null).rng = [22.3, 23.4];
    U.label(L, 'Survey limit: 0.74 Gpc (2.4 billion ly)', () => [SURVEY_R * st.a, 0, 0], 'sm', null).rng = [22.7, 23.4];
    U.label(L, 'Zone of avoidance: Milky Way dust hides galaxies', () => gc.map(v => v * st.a), 'sm', null).rng = [22.2, 23.2];
  }).catch(() => { web.visible = true; U.label(L, 'Cosmic web: schematic, not a survey', () => [0, -R_OBS * 0.55, 0], 'sm', null).rng = [22.7, 24.2]; });
  const setAge = ageGyr => { const { a, chi } = lcdmAt(ageGyr); st.a = a; st.k = a * chi / R_OBS; grpA.scale.setScalar(a); grpS.scale.setScalar(st.k); for (const e of ghostRings) e.scale.setScalar(st.k / a); return { a, chiGpc: chi, horizonGpc: a * chi }; };
  return { web, shell, pm, sm, setAge };
}
