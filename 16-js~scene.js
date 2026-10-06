import * as THREE from '../vendor/three.module.min.js';
import * as E from './engine.js';
import { photoEarth, sunGlare, milkyWay, Post } from './photoreal.js';
const TIER = (innerWidth < 860 || /Mobi|Android/i.test(navigator.userAgent)) ? 'low' : 'high';

const KPC = 3.0856775814914e16, MPC = KPC * 1000, RE = E.R_EARTH;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const V3 = v => new THREE.Vector3(v[0], v[1], v[2]);
const T3 = v => { const t = E.toThree(v); return new THREE.Vector3(t[0], t[1], t[2]); };

const PT_VERT = `attribute float size; attribute vec3 color; attribute float alpha; uniform float uPx; uniform float uOp; varying vec3 vC; varying float vA;
void main(){ vC=color; vA=alpha*uOp; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=max(size*uPx,0.0); }`;
const PT_FRAG = `varying vec3 vC; varying float vA; void main(){ vec2 p=gl_PointCoord-.5; float d=length(p); float a=smoothstep(.5,.08,d); if(a<.01) discard; gl_FragColor=vec4(vC,a*vA); }`;
function pointsMat(extra = {}) {
  return new THREE.ShaderMaterial({ vertexShader: PT_VERT, fragmentShader: PT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: 1 }, uOp: { value: 1 } }, ...extra });
}
function points(pos, sizes, colors, alphas) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas, 1));
  const p = new THREE.Points(g, pointsMat()); p.frustumCulled = false; return p;
}
const GLOBE_V = `attribute float land; uniform float uPx; uniform float uOp; uniform vec3 uSun; uniform mat3 uRot; varying float vL; varying float vN; varying float vF;
void main(){ vec3 n=normalize(position); vec3 wn=normalize(uRot*n); vN=dot(wn,uSun); vL=land; vec4 mv=modelViewMatrix*vec4(position,1.);
 vec3 viewN=normalize(normalMatrix*n); vF=dot(viewN,normalize(-mv.xyz)); gl_Position=projectionMatrix*mv; gl_PointSize=(land>.5?3.0:1.5)*uPx; if(vF<-0.05) gl_PointSize=0.; }`;
const GLOBE_F = `uniform float uOp; varying float vL; varying float vN; varying float vF; void main(){ vec2 p=gl_PointCoord-.5; float d=length(p); float a=smoothstep(.5,.15,d); if(a<.02) discard;
 float day=smoothstep(-.12,.18,vN); vec3 land=mix(vec3(.42,.50,.68),vec3(1.,.93,.82),day); vec3 sea=mix(vec3(.09,.13,.22),vec3(.16,.38,.62),day);
 vec3 c=vL>.5?land:sea; float edge=smoothstep(.0,.35,vF); gl_FragColor=vec4(c,a*uOp*(vL>.5?1.:.8)*(.35+.65*edge)); }`;
const ATMO_V = `varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`;
const ATMO_F = `uniform float uOp; varying vec3 vN; varying vec3 vV; void main(){ float f=clamp(-dot(vN,vV)*2.7,0.,1.); float a=pow(f,2.4)*.62; gl_FragColor=vec4(.42,.7,1.,a*uOp); }`;

export class Universe {
  constructor(canvas, hooks) {
    this.canvas = canvas; this.hooks = hooks;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); this.r.autoClear = false; this.r.setClearColor(0x000000, 1);
    this.cam = new THREE.PerspectiveCamera(46, 1, 0.1, 1e6);
    this.yaw = 0.6; this.pitch = 0.32; this.logd = 4.4; this.focus = 'earth';
    this.vy = 0; this.vp = 0; this.layers = {}; this.labels = []; this.mats = [];
    this.sunDir = new THREE.Vector3(1, 0, 0); this.simBodies = {}; this.regime = 'precision'; this.sunScale = 1;
    this.tier = TIER; this.buildSky(); this.buildEarth(); this.buildSolar(); this.buildGalaxy(); this.buildLG();
    try { this.post = new Post(this.r, TIER); } catch (e) { this.post = null; }
    this.resize(); addEventListener('resize', () => this.resize());
    this.bindInput();
  }
  mkLayer(name, unit) { const s = new THREE.Scene(); const L = { name, unit, scene: s, fade: 1, mats: [] }; this.layers[name] = L; return L; }
  reg(L, obj, base = 1) { obj.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { m.userData.base = base; L.mats.push(m); }); } }); }
  label(L, text, getPos, cls = '', onClick) {
    const el = document.createElement('button'); el.className = 'lbl ' + cls; el.textContent = text; el.tabIndex = cls.includes('sm') ? -1 : 0;
    if (onClick) el.addEventListener('click', onClick); document.getElementById('labels').appendChild(el);
    const l = { L, el, getPos, text }; this.labels.push(l); return l;
  }
  // ---- sky
  buildSky() {
    const L = this.mkLayer('sky', 1); this.stars = null;
    { const P = E.toThree(E.galToEcl([0, 0, 1])), C = E.toThree(E.galToEcl([1, 0, 0])); this.mw = milkyWay(this, L, new THREE.Vector3(P[0], P[1], P[2]).normalize(), new THREE.Vector3(C[0], C[1], C[2]).normalize()); }
    this.hooks.stars.then(arr => {
      const pos = [], size = [], col = [], al = [];
      for (const [ra, dec, mag, bv] of arr) {
        const eq = E.fromSph(ra, dec, 1), e = E.eqToEcl(eq), t = E.toThree(e);
        pos.push(t[0] * 500, t[1] * 500, t[2] * 500);
        const b = Math.max(0.18, Math.min(1, 1.15 - mag * 0.17)); size.push(0.9 + (6.4 - mag) * 0.62); al.push(b);
        const k = Math.max(-0.2, Math.min(1.6, bv)); const r = k < 0.6 ? 0.78 + 0.22 * (k + 0.2) / 0.8 : 1, bl = k < 0.6 ? 1 : Math.max(0.55, 1 - (k - 0.6) * 0.45), g = k < 0.6 ? 0.86 + 0.14 * (k + 0.2) / 0.8 : Math.max(0.65, 1 - (k - 0.6) * 0.25);
        col.push(r, g, bl);
      }
      this.stars = points(pos, size, col, al); L.scene.add(this.stars); this.reg(L, this.stars, 1);
    });
  }
  // ---- earth + moon (unit: Earth radii)
  buildEarth() {
    const L = this.mkLayer('earth', RE); this.earthGroup = new THREE.Group(); L.scene.add(this.earthGroup);
    this.hooks.landMask.then(mask => {
      const N = 26000, pos = [], land = [], ga = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) {
        const y = 1 - (2 * (i + 0.5)) / N, rad = Math.sqrt(1 - y * y), th = ga * i, x = Math.cos(th) * rad, z = Math.sin(th) * rad;
        // body frame: z north, x at lon 0. Here (x,y,z) lattice with y as north; remap
        const bx = x, by = z, bz = y, lat = Math.asin(bz) * 180 / Math.PI, lon = Math.atan2(by, bx) * 180 / Math.PI;
        pos.push(bx, by, bz); land.push(mask(lat, lon) ? 1 : 0);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('land', new THREE.Float32BufferAttribute(land, 1));
      this.globeMat = new THREE.ShaderMaterial({ vertexShader: GLOBE_V, fragmentShader: GLOBE_F, transparent: true, depthWrite: false, uniforms: { uPx: { value: 1 }, uOp: { value: 1 }, uSun: { value: new THREE.Vector3(1, 0, 0) }, uRot: { value: new THREE.Matrix3() } } });
      this.globe = new THREE.Points(g, this.globeMat); this.globe.frustumCulled = false; this.globe.renderOrder = 1; this.earthGroup.add(this.globe);
      this.globeMat.userData.base = 1; L.mats.push(this.globeMat);
    });
    // atmosphere
    this.atmoMat = new THREE.ShaderMaterial({ vertexShader: ATMO_V, fragmentShader: ATMO_F, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending, uniforms: { uOp: { value: 1 } } });
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.07, 64, 48), this.atmoMat); atmo.renderOrder = 2; atmo.visible = false; L.scene.add(atmo); this.atmoMat.userData.base = 1; L.mats.push(this.atmoMat);
    // dark occluder so far-side dots are hidden by shading, not depth
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.995, 48, 32), new THREE.MeshBasicMaterial({ color: 0x03040a })); L.scene.add(core); core.renderOrder = -5; this.coreMat = core; core.material.transparent = true; core.material.userData.base = 1; L.mats.push(core.material);
    this.photoFx = photoEarth(this, L, TIER); this.glare = sunGlare(this, L);
    // graticule + axis in body frame
    const gl = []; for (let lat = -60; lat <= 60; lat += 30) { const p = []; for (let k = 0; k <= 96; k++) { const lo = k / 96 * 2 * Math.PI; p.push(new THREE.Vector3(Math.cos(lat * Math.PI / 180) * Math.cos(lo) * 1.002, Math.cos(lat * Math.PI / 180) * Math.sin(lo) * 1.002, Math.sin(lat * Math.PI / 180) * 1.002)); } gl.push(p); }
    for (let lo = 0; lo < 360; lo += 30) { const p = []; for (let k = 0; k <= 64; k++) { const la = (k / 64 - 0.5) * Math.PI; p.push(new THREE.Vector3(Math.cos(la) * Math.cos(lo * Math.PI / 180) * 1.002, Math.cos(la) * Math.sin(lo * Math.PI / 180) * 1.002, Math.sin(la) * 1.002)); } gl.push(p); }
    const grat = new THREE.Group(); for (const p of gl) grat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), new THREE.LineBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.07, depthWrite: false })));
    this.earthGroup.add(grat); this.reg(L, grat, 0.07);
    const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -1.9), new THREE.Vector3(0, 0, 1.9)]), new THREE.LineBasicMaterial({ color: 0xff4b2b, transparent: true, opacity: 0.8 })); this.earthGroup.add(axis); this.reg(L, axis, 0.8);
    // sun ray
    this.sunLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1.2, 0, 0), new THREE.Vector3(3.2, 0, 0)]), new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.7 })); L.scene.add(this.sunLine); this.reg(L, this.sunLine, 0.7);
    // moon
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(0.2727, 32, 24), new THREE.MeshBasicMaterial({ color: 0x9a9ca4, transparent: true })); L.scene.add(this.moon); this.moon.material.userData.base = 1; L.mats.push(this.moon.material);
    this.moonShade = new THREE.Mesh(new THREE.SphereGeometry(0.2735, 32, 24), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) }, uOp: { value: 1 } }, vertexShader: 'varying vec3 vW; void main(){ vW=normalize((modelMatrix*vec4(position,0.)).xyz); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'uniform vec3 uSun; uniform float uOp; varying vec3 vW; void main(){ float d=dot(vW,uSun); float s=smoothstep(-.05,.1,d); gl_FragColor=vec4(0.,0.,0.,(1.-s)*.92*uOp); }' }));
    this.moonShade.material.userData.base = 1; this.moonShade.material.userData.uni = 1; L.mats.push(this.moonShade.material); this.moon.add(this.moonShade);
    this.moonOrbit = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 })); L.scene.add(this.moonOrbit); this.reg(L, this.moonOrbit, 0.2);
    this.marker = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff4b2b })); this.marker.visible = false; this.earthGroup.add(this.marker);
    this.label(L, 'Moon', () => this.moon.position.toArray(), '', () => this.focusOn('moon'));
    this.label(L, 'To the Sun', () => this.sunDir.clone().multiplyScalar(3.4).toArray(), 'sm');
    this.label(L, 'Spin axis', () => { const p = this.poleDir || new THREE.Vector3(0, 1, 0); return p.clone().multiplyScalar(1.95).toArray(); }, 'sm');
  }
  // ---- solar system (unit: AU)
  buildSolar() {
    const L = this.mkLayer('solar', E.AU); this.solarL = L;
    const names = ['sun', ...E.BODY_LIST]; this.solarNames = names;
    const colors = { sun: [1, 0.88, 0.62], mercury: [0.7, 0.68, 0.64], venus: [0.95, 0.8, 0.55], earth: [0.56, 0.82, 1], mars: [1, 0.52, 0.34], jupiter: [0.9, 0.78, 0.62], saturn: [0.92, 0.84, 0.62], uranus: [0.65, 0.88, 0.9], neptune: [0.5, 0.62, 1], pluto: [0.8, 0.74, 0.7] };
    this.bodyPx = { sun: 9, mercury: 3.2, venus: 4, earth: 5, mars: 3.6, jupiter: 6, saturn: 5.5, uranus: 4.4, neptune: 4.4, pluto: 3 };
    const pos = [], size = [], col = [], al = [];
    names.forEach(n => { pos.push(0, 0, 0); size.push(this.bodyPx[n]); col.push(...colors[n]); al.push(1); });
    this.bodyPts = points(pos, size, col, al); L.scene.add(this.bodyPts); this.reg(L, this.bodyPts, 1);
    // sun glow
    this.sunGlow = points([0, 0, 0], [60], [1, 0.78, 0.45], [0.55]); L.scene.add(this.sunGlow); this.reg(L, this.sunGlow, 0.55);
    this.orbitLines = {}; for (const n of E.BODY_LIST) { const l = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: n === 'earth' ? 0xff4b2b : 0xffffff, transparent: true, opacity: n === 'earth' ? 0.65 : 0.17 })); L.scene.add(l); this.orbitLines[n] = l; this.reg(L, l, n === 'earth' ? 0.65 : 0.17); }
    this.trailPast = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff4b2b, transparent: true, opacity: 1 })); this.trailFut = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff4b2b, transparent: true, opacity: 0.3 }));
    L.scene.add(this.trailPast, this.trailFut); this.reg(L, this.trailPast, 1); this.reg(L, this.trailFut, 0.3);
    // heliopause ring (Voyager 1 crossing near 121 au)
    const hp = []; for (let k = 0; k <= 128; k++) { const a = k / 128 * 2 * Math.PI; hp.push(new THREE.Vector3(121 * Math.cos(a), 0, 121 * Math.sin(a))); }
    const hl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(hp), new THREE.LineDashedMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.25, dashSize: 3, gapSize: 3 })); hl.computeLineDistances(); L.scene.add(hl); this.reg(L, hl, 0.25);
    // protoplanetary disc (illustrative), shown before Earth forms
    const dp = [], ds = [], dc = [], da = []; for (let i = 0; i < 5200; i++) { const r = 0.2 + Math.pow(Math.random(), 1.6) * 60, a = Math.random() * 2 * Math.PI, h = (Math.random() - 0.5) * 0.12 * r; dp.push(r * Math.cos(a), h, r * Math.sin(a)); ds.push(1 + Math.random() * 1.6); dc.push(1, 0.62 + Math.random() * 0.2, 0.4); da.push(0.15 + Math.random() * 0.4); }
    this.disc = points(dp, ds, dc, da); L.scene.add(this.disc); this.reg(L, this.disc, 1); this.disc.visible = false;
    for (const n of names) this.label(L, n[0].toUpperCase() + n.slice(1), () => this.simPos(n), n === 'earth' ? '' : '', () => this.focusOn(n));
    this.label(L, 'Heliopause, about 121 AU', () => [121, 0, 0], 'sm');
  }
  simPos(n) { const p = this.simBodies[n]; return p ? p : [0, 0, 0]; } // three coords, AU
  // ---- galaxy (unit: kpc, Sun-centred, ecliptic->three)
  buildGalaxy() {
    const L = this.mkLayer('galaxy', KPC); this.galL = L;
    const R0 = E.FRAMES.R0_kpc, pos = [], size = [], col = [], al = [];
    const gal = (qx, qy, qz) => { const t = E.toThree(E.galToEcl([R0 + qx, qy, qz])); return t; };
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) / 0.58; };
    for (let i = 0; i < 42000; i++) { // four-arm schematic, log spiral pitch about 12 deg
      const arm = i % 4, rr = 1.5 + Math.pow(rnd(), 0.8) * 14.5, th = (Math.log(rr / 1.5) / Math.tan(12 * Math.PI / 180)) + arm * Math.PI / 2 + gauss() * (0.12 + 0.02 * rr);
      const x = rr * Math.cos(th), y = rr * Math.sin(th), z = gauss() * 0.12 * (1 - rr / 22);
      const t = gal(x, y, z); pos.push(t[0], t[1], t[2]); size.push(1.6 + rnd() * 2.2); const w = Math.exp(-rr / 9); col.push(0.55 + 0.4 * w, 0.62 + 0.25 * w, 1 - 0.3 * w); al.push(0.16 + 0.34 * rnd());
    }
    for (let i = 0; i < 9000; i++) { const rr = Math.abs(gauss()) * 1.6, ph = rnd() * 2 * Math.PI, ct = rnd() * 2 - 1, st = Math.sqrt(1 - ct * ct); const t = gal(rr * st * Math.cos(ph), rr * st * Math.sin(ph) * 1, rr * ct * 0.55); pos.push(t[0], t[1], t[2]); size.push(1.2 + rnd() * 1.6); col.push(1, 0.84, 0.6); al.push(0.2 + 0.4 * rnd()); }
    this.galPts = points(pos, size, col, al); L.scene.add(this.galPts); this.reg(L, this.galPts, 1);
    // GC and Sun markers, Sun orbit
    const gc = E.toThree(E.galToEcl([R0, 0, 0]));
    this.galMark = points([gc[0], gc[1], gc[2], 0, 0, 0], [12, 9], [1, 0.75, 0.4, 0.56, 0.82, 1], [1, 1]); L.scene.add(this.galMark); this.reg(L, this.galMark, 1);
    const orb = []; for (let k = 0; k <= 180; k++) { const a = k / 180 * 2 * Math.PI, t = gal(-R0 * Math.cos(a), -R0 * Math.sin(a), 0); orb.push(new THREE.Vector3(t[0], t[1], t[2])); }
    const ol = new THREE.Line(new THREE.BufferGeometry().setFromPoints(orb), new THREE.LineDashedMaterial({ color: 0xff4b2b, transparent: true, opacity: 0.55, dashSize: 0.25, gapSize: 0.18 })); ol.computeLineDistances(); L.scene.add(ol); this.reg(L, ol, 0.55);
    this.galArrow = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })); L.scene.add(this.galArrow); this.reg(L, this.galArrow, 0.9);
    this.label(L, 'Galactic centre (Sgr A*)', () => gc, '', null);
    this.label(L, 'Sun and Earth', () => [0, 0, 0], '', () => this.focusOn('earth'));
    this.label(L, 'Sun orbit, about 8.15 kpc', () => gal(-R0 * Math.cos(2.4), -R0 * Math.sin(2.4), 0), 'sm');
    this.label(L, 'Schematic disc, not a map', () => gal(9, 9, 0), 'sm');
    for (const a of E.ANCHORS.filter(a => a.kind === 'lg' && a.d < 100)) { const p = E.toThree(E.anchorEcl(a)); this.label(L, a.name, () => p, 'sm'); }
  }
  // ---- Local Group and beyond (unit: Mpc, Sun-centred)
  buildLG() {
    const L = this.mkLayer('lg', MPC); this.lgL = L;
    const pos = [0, 0, 0], size = [9], col = [0.56, 0.82, 1], al = [1];
    for (const a of E.ANCHORS) { if (a.id === 'gc') continue; const e = E.anchorEcl(a), t = E.toThree(e); pos.push(t[0] / 1000, t[1] / 1000, t[2] / 1000); const big = a.kind === 'cl'; size.push(big ? 14 : 6); col.push(big ? 1 : 0.82, big ? 0.6 : 0.88, big ? 0.4 : 1); al.push(big ? 0.9 : 1); }
    this.lgPts = points(pos, size, col, al); L.scene.add(this.lgPts); this.reg(L, this.lgPts, 1);
    for (const a of E.ANCHORS) { if (a.id === 'gc') continue; const t = E.toThree(E.anchorEcl(a)); this.label(L, a.name, () => [t[0] / 1000, t[1] / 1000, t[2] / 1000], a.kind === 'cl' ? '' : 'sm'); }
    this.label(L, 'Milky Way (you are here)', () => [0, 0, 0], '', () => this.focusOn('earth'));
    this.cmbArrow = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff4b2b, transparent: true, opacity: 0.9 })); L.scene.add(this.cmbArrow); this.reg(L, this.cmbArrow, 0.9);
    const d = E.toThree(E.galToEcl(E.fromSph(E.FRAMES.cmbL, E.FRAMES.cmbB, 1)));
    this.cmbArrow.geometry.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(d[0] * 40, d[1] * 40, d[2] * 40)]);
    this.label(L, 'Sun motion vs CMB, 369.82 km/s', () => [d[0] * 40, d[1] * 40, d[2] * 40], '');
    const ring = []; for (let k = 0; k <= 128; k++) { const a = k / 128 * 2 * Math.PI; ring.push(new THREE.Vector3(Math.cos(a) * 10, 0, Math.sin(a) * 10)); }
    // rough Local Group extent (about 3 Mpc across) shown as ring
    const lr = []; for (let k = 0; k <= 128; k++) { const a = k / 128 * 2 * Math.PI; lr.push(new THREE.Vector3(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5)); }
    const lrl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(lr), new THREE.LineDashedMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.25, dashSize: 0.08, gapSize: 0.08 })); lrl.computeLineDistances(); L.scene.add(lrl); this.reg(L, lrl, 0.25);
    this.label(L, 'Local Group, about 3 Mpc across', () => [1.5, 0, 0], 'sm');
  }
  // ---- control
  get dist() { return Math.pow(10, this.logd); }
  focusOn(n) {
    this.focus = n; this.hooks.onFocus && this.hooks.onFocus(n);
    const z = n === 'moon' ? 5.7 : n === 'earth' ? this.logd : 7.3 + (n === 'sun' ? 0.7 : 0.6);
    this.hooks.gotoZ(n === 'earth' ? Math.min(Math.max(this.logd, 3.95), 9.5) : z);
  }
  resize() { const w = this.canvas.clientWidth, h = this.canvas.clientHeight; this.r.setSize(w, h, false); if (this.post) this.post.resize(); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.W = w; this.H = h; this.focalPx = (h / 2) / Math.tan((this.cam.fov * Math.PI / 180) / 2); }
  bindInput() {
    const c = this.canvas, ptrs = new Map(); let lastPinch = 0, moved = 0, down = null;
    c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; down = { x: e.clientX, y: e.clientY, t: performance.now() }; lastPinch = 0; this.vy = this.vp = 0; });
    c.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return; const p = ptrs.get(e.pointerId); const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 1) { moved += Math.abs(dx) + Math.abs(dy); this.yaw -= dx * 0.0055; this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + dy * 0.0055)); this.vy = -dx * 0.0055; this.vp = dy * 0.0055; this.hooks.touched && this.hooks.touched(); }
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (lastPinch) { this.hooks.zoomBy(-Math.log10(d / lastPinch) * 2.2); } lastPinch = d; moved += 9; }
    });
    const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) lastPinch = 0; if (down && moved < 6 && performance.now() - down.t < 500) this.click(e.clientX, e.clientY); if (ptrs.size === 0) down = null; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', e => { e.preventDefault(); this.hooks.zoomBy(Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.16); this.hooks.touched && this.hooks.touched(); }, { passive: false });
    addEventListener('keydown', e => { if (e.target.closest('input,textarea,select')) return; if (e.key === '+' || e.key === '=') this.hooks.zoomBy(-0.2); if (e.key === '-') this.hooks.zoomBy(0.2); });
  }
  camSetup(L) {
    const d = this.dist, dl = d / L.unit, cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(cp * Math.sin(this.yaw), Math.sin(this.pitch), cp * Math.cos(this.yaw));
    let tgt = new THREE.Vector3(0, 0, 0);
    if (L.name === 'solar') { tgt = V3(this.simPos(this.focus === 'moon' ? 'earth' : this.focus)); }
    this.cam.position.copy(tgt).addScaledVector(dir, dl); this.cam.up.set(0, 1, 0); this.cam.lookAt(tgt);
    this.cam.near = dl * 0.0008; this.cam.far = dl * 4000; this.cam.updateProjectionMatrix(); this.cam.updateMatrixWorld(true);
  }
  fades() {
    const lg = this.logd, f = {};
    f.earth = (this.showEarth === false ? 0 : 1) * (1 - sstep(6.4, 7.5, lg)); f.solar = sstep(5.2, 6.4, lg) * (1 - sstep(12.0, 13.4, lg)); f.galaxy = sstep(12.6, 13.9, lg) * (1 - sstep(18.4, 19.6, lg)); f.lg = sstep(18.7, 19.8, lg); f.sky = 1 - 0.8 * sstep(10, 14, lg) ;
    f.sky *= 1 - sstep(17.5, 19.5, lg) * 0.6; return f;
  }
  setOpacity(L, f) { const px = this.r.getPixelRatio(); for (const m of L.mats) { const b = m.userData.base ?? 1; if (m.uniforms) { if (m.uniforms.uOp) m.uniforms.uOp.value = f * b; if (m.uniforms.uPx) m.uniforms.uPx.value = px; } else { m.opacity = f * b; } if (!m.uniforms) m.visible = f > 0.01; } }
  setSkyPx() { const px = this.r.getPixelRatio(); if (this.stars) this.stars.material.uniforms.uPx.value = px; }
  update(frame) { // frame: {sunDir(three), orient R(ecl) , moonRel(three Earth radii), bodies(three AU), ...}
    const f = this.fades(); this.f = f; this.setOpacity(this.layers.sky, f.sky);
    this.yaw += this.vy; this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + this.vp)); this.vy *= 0.93; this.vp *= 0.93; if (Math.abs(this.vy) < 1e-5) this.vy = 0;
    if (this.post) this.post.begin(); else this.r.clear();
    // sky: camera at origin
    { const s = this.layers.sky; const cp = Math.cos(this.pitch), dir = new THREE.Vector3(cp * Math.sin(this.yaw), Math.sin(this.pitch), cp * Math.cos(this.yaw)); this.cam.position.set(0, 0, 0); this.cam.up.set(0, 1, 0); this.cam.lookAt(dir.clone().multiplyScalar(-1)); this.cam.near = 1; this.cam.far = 2000; this.cam.updateProjectionMatrix(); this.cam.updateMatrixWorld(true);
      if (this.stars) { this.stars.material.uniforms.uPx.value = this.r.getPixelRatio(); } this.r.render(s.scene, this.cam); }
    this.applyFrame(frame);
    if (frame && !this.aimed && !this.noAim) { this.aimed = true; const sd = this.sunDir.clone().normalize(), up = new THREE.Vector3(0, 1, 0), rt = new THREE.Vector3().crossVectors(up, sd).normalize(); const d = sd.multiplyScalar(Math.cos(0.62)).addScaledVector(rt, Math.sin(0.62)).addScaledVector(up, 0.12).normalize(); this.yaw = Math.atan2(d.x, d.z); this.pitch = Math.asin(d.y); }
    for (const n of ['lg', 'galaxy', 'solar', 'earth']) {
      const L = this.layers[n], fv = f[n]; this.setOpacity(L, fv); if (fv < 0.01) continue;
      this.r.clearDepth(); this.camSetup(L); this.r.render(L.scene, this.cam);
    }
    if (this.post) this.post.end(performance.now() * 0.001);
    this.placeLabels();
  }
  applyFrame(fr) {
    if (!fr) return;
    // Earth orientation: ecl->three
    const R = fr.R; const m = new THREE.Matrix4(); const Rt = [[R[0][0], R[0][1], R[0][2]], [R[2][0], R[2][1], R[2][2]], [-R[1][0], -R[1][1], -R[1][2]]];
    m.set(Rt[0][0], Rt[0][1], Rt[0][2], 0, Rt[1][0], Rt[1][1], Rt[1][2], 0, Rt[2][0], Rt[2][1], Rt[2][2], 0, 0, 0, 0, 1);
    this.earthGroup.quaternion.setFromRotationMatrix(m); this.earthGroup.updateMatrixWorld(true);
    this.poleDir = new THREE.Vector3(Rt[0][2], Rt[1][2], Rt[2][2]);
    this.sunDir.set(fr.sunDir[0], fr.sunDir[1], fr.sunDir[2]); if (this.glare) { this.glare.position.copy(this.sunDir).multiplyScalar(60); const k = 1 + 0; this.glare.scale.set(15 * k, 15 * k, 1); }
    if (this.globeMat) { this.globeMat.uniforms.uSun.value.copy(this.sunDir); const u = this.globeMat.uniforms.uRot.value; u.set(Rt[0][0], Rt[0][1], Rt[0][2], Rt[1][0], Rt[1][1], Rt[1][2], Rt[2][0], Rt[2][1], Rt[2][2]); }
    this.moonShade.material.uniforms.uSun.value.copy(this.sunDir);
    this.sunLine.geometry.setFromPoints([this.sunDir.clone().multiplyScalar(1.25), this.sunDir.clone().multiplyScalar(3.2)]);
    this.moon.visible = !!fr.moonRel; if (fr.moonRel) this.moon.position.set(...fr.moonRel);
    if (fr.moonOrbit && fr.moonOrbitKey !== this._mk) { this._mk = fr.moonOrbitKey; this.moonOrbit.geometry.setFromPoints(fr.moonOrbit.map(p => new THREE.Vector3(...p))); }
    // solar
    const names = this.solarNames, arr = this.bodyPts.geometry.attributes.position.array, szAttr = this.bodyPts.geometry.attributes.size, alA = this.bodyPts.geometry.attributes.alpha;
    const show = fr.regime === 'precision';
    names.forEach((n, i) => { const p = fr.bodies[n] || [0, 0, 0]; this.simBodies[n] = p; arr[i * 3] = p[0]; arr[i * 3 + 1] = p[1]; arr[i * 3 + 2] = p[2]; alA.array[i] = (n === 'sun' || show) ? 1 : 0; });
    this.bodyPts.geometry.attributes.position.needsUpdate = true; alA.needsUpdate = true;
    // sun scale for red giant
    const sunR = fr.sunRadiusAU, dl = this.dist / E.AU, pxPerUnit = this.focalPx / Math.max(dl, 1e-9);
    szAttr.array[0] = Math.max(this.bodyPx.sun, 2 * sunR * pxPerUnit); szAttr.needsUpdate = true;
    this.sunGlow.geometry.attributes.size.array[0] = Math.max(60, 5 * sunR * pxPerUnit); this.sunGlow.geometry.attributes.size.needsUpdate = true;
    this.disc.visible = fr.regime === 'before';
    if (fr.orbits && fr.orbitKey !== this._ok) { this._ok = fr.orbitKey; for (const n of E.BODY_LIST) if (fr.orbits[n]) this.orbitLines[n].geometry.setFromPoints(fr.orbits[n].map(p => new THREE.Vector3(...p))); }
    const hideOrb = fr.regime === 'before' || fr.regime === 'after'; for (const n in this.orbitLines) this.orbitLines[n].visible = !hideOrb;
    if (fr.trail && fr.trailKey !== this._tk) { this._tk = fr.trailKey; this.trailPast.geometry.setFromPoints(fr.trail.past.map(p => new THREE.Vector3(...p))); this.trailFut.geometry.setFromPoints(fr.trail.fut.map(p => new THREE.Vector3(...p))); }
    this.trailPast.visible = this.trailFut.visible = show;
    this.regime = fr.regime;
    // galaxy arrows (velocity direction)
    if (fr.vGalDir && fr.vGalKey !== this._gk) { this._gk = fr.vGalKey; const d = fr.vGalDir; this.galArrow.geometry.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(d[0] * 2.2, d[1] * 2.2, d[2] * 2.2)]); }
  }
  placeLabels() {
    const f = this.f, show = {};
    for (const l of this.labels) {
      const L = l.L, fv = f[L.name]; let vis = fv > 0.12;
      if (vis && L.name === 'solar') { const key = l.text; if (this.regime !== 'precision' && key !== 'Sun' && !key.startsWith('Helio') && key !== 'Earth') vis = false; if (this.regime === 'after' && key === 'Earth') vis = false; if (this.regime === 'before' && key !== 'Sun') vis = false; }
      if (vis && L.name === 'earth' && l.el.classList.contains('sm') && this.logd > 5.3) vis = false;
      if (!vis) { if (l.on) { l.el.style.opacity = 0; l.el.style.pointerEvents = 'none'; l.on = false; } continue; }
      this.camSetup(L); const p = l.getPos(); const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.cam);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { if (l.on) { l.el.style.opacity = 0; l.el.style.pointerEvents = 'none'; l.on = false; } continue; }
      const x = (v.x * 0.5 + 0.5) * this.W + 8, y = (-v.y * 0.5 + 0.5) * this.H;
      l.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; l.el.style.opacity = Math.min(1, fv * 1.4); l.el.style.pointerEvents = l.el.classList.contains('sm') ? 'none' : 'auto'; l.on = true; l.el.style.left = 0;
      l.sx = x; l.sy = y;
    }
  }
  click(cx, cy) {
    const rect = this.canvas.getBoundingClientRect(), x = cx - rect.left, y = cy - rect.top;
    if (this.f.earth > 0.5 && this.globe && this.logd < 6.6) {
      this.camSetup(this.layers.earth);
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((x / this.W) * 2 - 1, -(y / this.H) * 2 + 1), this.cam);
      const o = ray.ray.origin, d = ray.ray.direction, b = o.dot(d), c = o.dot(o) - 1, disc = b * b - c;
      if (disc > 0) { const t = -b - Math.sqrt(disc), hit = o.clone().addScaledVector(d, t); const inv = this.earthGroup.quaternion.clone().invert(); const q = hit.clone().applyQuaternion(inv); const lat = Math.asin(q.z) * 180 / Math.PI, lon = Math.atan2(q.y, q.x) * 180 / Math.PI; this.marker.position.copy(q).multiplyScalar(1.004); this.marker.visible = true; this.hooks.onPick && this.hooks.onPick(lat, lon); return; }
    }
    // nearest solar body label
    if (this.f.solar > 0.3) { let best = null, bd = 28; for (const l of this.labels) { if (l.L.name !== 'solar' || !l.on || l.sx === undefined) continue; const dd = Math.hypot(l.sx - 8 - x, l.sy - y); if (dd < bd) { bd = dd; best = l; } } if (best) best.el.click(); }
  }
}
