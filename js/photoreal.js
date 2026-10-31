import * as THREE from '../vendor/three.module.min.js';

// ---------- photoreal Earth (NASA Blue Marble, Black Marble, cloud composite)
const EV = `varying vec3 vB; varying vec3 vWN; varying vec3 vWP;
void main(){ vB=position; vWN=normalize(mat3(modelMatrix)*position); vec4 w=modelMatrix*vec4(position,1.); vWP=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const COORD = `const float PI=3.14159265; vec2 geo(vec3 b){ return vec2(atan(b.y,b.x)/(2.*PI)+.5, asin(clamp(b.z,-1.,1.))/PI+.5); }`;
const EF = `uniform sampler2D tDay,tNight,tCloud,tSpec; uniform vec3 uSun; uniform float uOp,uQ; varying vec3 vB; varying vec3 vWN; varying vec3 vWP;
${COORD}
void main(){
 vec3 N=normalize(vWN), L=normalize(uSun), V=normalize(cameraPosition-vWP); vec2 uv=geo(normalize(vB));
 vec3 alb=texture2D(tDay,uv).rgb; float sp=texture2D(tSpec,uv).r; float cl=texture2D(tCloud,uv).r;
 float ndl=dot(N,L); float lit=clamp((ndl+.06)/1.06,0.,1.); lit=pow(lit,.82);
 float ndv=max(dot(N,V),0.);
 // sun-lit surface; ocean is darker and glints
 vec3 c=alb*(lit*1.32);
 // cloud shadow (small offset along the sun direction, in uv space)
 float sh=texture2D(tCloud,uv+vec2(.0012,-.0008)).r; c*=1.-.28*sh*lit;
 vec3 H=normalize(L+V); float gl=pow(max(dot(N,H),0.),420.)*sp*lit; c+=vec3(1.,.93,.8)*gl*1.1+vec3(.5,.62,.8)*pow(max(dot(N,H),0.),24.)*sp*lit*.12;
 float fr=pow(1.-ndv,4.); c+=vec3(.35,.55,.9)*fr*sp*lit*.55;
 // night lights
 float nm=smoothstep(.05,-.18,ndl); vec3 nl=texture2D(tNight,uv).rgb; float nb=dot(nl,vec3(.33)); vec3 night=pow(nb,1.35)*vec3(1.,.74,.42)*2.4*(1.-.8*cl)+nl*vec3(.0,.0,.03);
 c+=night*nm; c+=vec3(.012,.018,.035)*(1.-lit)*(.6+sp);
 // limb scattering and twilight band
 float rim=pow(1.-ndv,2.8); c+=vec3(.2,.42,.95)*rim*smoothstep(-.25,.45,ndl)*1.05;
 float tw=exp(-pow(ndl/.11,2.)); c+=vec3(1.,.38,.14)*tw*pow(1.-ndv,2.4)*.28;
 gl_FragColor=vec4(c,uOp);
}`;
const CF = `uniform sampler2D tCloud; uniform vec3 uSun; uniform float uOp; varying vec3 vB; varying vec3 vWN; varying vec3 vWP;
${COORD}
void main(){ vec3 N=normalize(vWN), L=normalize(uSun), V=normalize(cameraPosition-vWP); vec2 uv=geo(normalize(vB)); float a=texture2D(tCloud,uv).r; a=smoothstep(.12,.9,a);
 float ndl=dot(N,L); float lit=clamp((ndl+.05)/1.05,0.,1.); float ndv=max(dot(N,V),0.);
 vec3 c=vec3(1.,.985,.96)*(lit*1.28+.012); float tw=exp(-pow(ndl/.11,2.)); c+=vec3(1.,.4,.18)*tw*.14; c+=vec3(.4,.6,1.)*pow(1.-ndv,3.)*lit*.4;
 gl_FragColor=vec4(c,a*.92*uOp); }`;
const AV = `varying vec3 vN; varying vec3 vV; varying vec3 vWN; void main(){ vN=normalize(normalMatrix*normal); vWN=normalize(mat3(modelMatrix)*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`;
const AF = `uniform float uOp; uniform vec3 uSun; varying vec3 vN; varying vec3 vV; varying vec3 vWN;
void main(){ float f=clamp(-dot(vN,vV)*2.55,0.,1.); float sl=dot(normalize(vWN),normalize(uSun)); float day=smoothstep(-.4,.55,sl);
 float a=pow(f,2.1)*(.08+1.15*day); vec3 col=mix(vec3(.2,.45,1.),vec3(.55,.78,1.),pow(f,3.)); float tw=exp(-pow(sl/.2,2.)); col=mix(col,vec3(1.,.5,.22),tw*.55);
 gl_FragColor=vec4(col*a*1.4,a*uOp); }`;

export function photoEarth(U, L, tier) {
  const hi = tier === 'high', ld = new THREE.TextureLoader();
  const load = (urls) => new Promise(res => { let i = 0; const t = () => ld.load(urls[i], tx => { tx.anisotropy = Math.min(hi ? 8 : 2, U.r.capabilities.getMaxAnisotropy()); tx.wrapS = THREE.RepeatWrapping; tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter; res(tx); }, undefined, () => { i++; if (i < urls.length) t(); else res(null); }); t(); });
  const geom = (r, w, h) => { const g = new THREE.SphereGeometry(r, w, h), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x, -z, y); } p.needsUpdate = true; return g; };
  Promise.all([
    load(hi ? ['tex/day-hi.jpg', 'tex/day-lo.jpg'] : ['tex/day-lo.jpg']),
    load(hi ? ['tex/night-hi.jpg', 'tex/night-lo.png'] : ['tex/night-lo.png']),
    load(['tex/cloud-hi.jpg']),
    load(['tex/spec.jpg'])
  ]).then(([day, night, cloud, spec]) => {
    if (!day) return; // stay with the dot globe
    const blank = (() => { const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); t.needsUpdate = true; return t; })();
    const mat = new THREE.ShaderMaterial({ vertexShader: EV, fragmentShader: EF, transparent: true, depthWrite: true, uniforms: { tDay: { value: day }, tNight: { value: night || blank }, tCloud: { value: cloud || blank }, tSpec: { value: spec || blank }, uSun: { value: U.sunDir }, uOp: { value: 1 }, uQ: { value: 1 } } });
    const seg = hi ? 160 : 96;
    const globe = new THREE.Mesh(geom(1, seg, seg / 2), mat); globe.renderOrder = 1; U.earthGroup.add(globe);
    const cmat = new THREE.ShaderMaterial({ vertexShader: EV, fragmentShader: CF, transparent: true, depthWrite: false, uniforms: { tCloud: { value: cloud || blank }, uSun: { value: U.sunDir }, uOp: { value: 1 } } });
    const clouds = new THREE.Mesh(geom(1.0065, seg, seg / 2), cmat); clouds.renderOrder = 2; U.earthGroup.add(clouds);
    mat.userData.base = 1; cmat.userData.base = 1; L.mats.push(mat, cmat);
    U.photo = { globe, clouds, mat, cmat };
    if (U.globe) U.globe.visible = false;
    if (U.coreMat) U.coreMat.visible = false;
    U.photoReady = true;
  });
  // atmosphere upgrade
  const am = new THREE.ShaderMaterial({ vertexShader: AV, fragmentShader: AF, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending, uniforms: { uOp: { value: 1 }, uSun: { value: U.sunDir } } });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.06, 96, 64), am); atmo.renderOrder = 3; L.scene.add(atmo); am.userData.base = 1; L.mats.push(am);
  return { atmo, am };
}

// ---------- sun glare
export function sunGlare(U, L) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(.06, 'rgba(255,236,200,.85)'); gr.addColorStop(.2, 'rgba(255,200,140,.28)'); gr.addColorStop(.5, 'rgba(255,150,90,.07)'); gr.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, opacity: 0.8 }));
  sp.renderOrder = 6; L.scene.add(sp); sp.material.userData.base = 0.9; L.mats.push(sp.material); return sp;
}

// ---------- Milky Way band in the sky layer
export function milkyWay(U, L, poleDir, centreDir) {
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { uOp: { value: 1 }, uP: { value: poleDir }, uC: { value: centreDir }, uQ: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform float uOp,uQ; uniform vec3 uP,uC; varying vec3 vD;
float h(vec3 p){ p=fract(p*.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=.5; } return s; }
void main(){ vec3 d=normalize(vD); float s=dot(d,uP); vec3 e2=cross(uP,uC); float x=dot(d,uC), y=dot(d,e2); float l=atan(y,x);
 float n1=fbm(d*6.), n2=fbm(d*14.+3.); float w=.16+.08*n1; float band=exp(-s*s/(2.*w*w)); float core=exp(-l*l/1.5)*exp(-s*s/(2.*.1*.1));
 float dust=smoothstep(.38,.72,fbm(d*9.+7.+vec3(0.,0.,s*6.)))*exp(-s*s/(2.*.07*.07)); float cloud=.55+.9*n2;
 vec3 col=mix(vec3(.42,.5,.78),vec3(1.,.82,.58),clamp(core*1.4+exp(-l*l/.6)*.35,0.,1.));
 float I=(band*.085*cloud+core*.16)*(1.-.82*dust); gl_FragColor=vec4(col*I*uQ,I*uOp); }` });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 32), m); mesh.renderOrder = -20; mesh.frustumCulled = false; L.scene.add(mesh); m.userData.base = 1; L.mats.push(m); return mesh;
}

// ---------- post: HDR target, bloom, grade, grain, vignette
const FS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';
export class Post {
  constructor(r, tier) {
    this.r = r; this.hi = tier === 'high'; this.scene = new THREE.Scene(); this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(g, null); this.quad.frustumCulled = false; this.scene.add(this.quad);
    const mk = (f, u) => new THREE.ShaderMaterial({ vertexShader: FS, fragmentShader: f, uniforms: u, depthTest: false, depthWrite: false });
    this.mBright = mk(`uniform sampler2D t; varying vec2 vUv; void main(){ vec3 c=texture2D(t,vUv).rgb; float l=max(c.r,max(c.g,c.b)); float k=smoothstep(.62,1.4,l); gl_FragColor=vec4(c*k,1.); }`, { t: { value: null } });
    this.mBlur = mk(`uniform sampler2D t; uniform vec2 d; varying vec2 vUv; void main(){ vec3 s=texture2D(t,vUv).rgb*.2270; s+=(texture2D(t,vUv+d*1.3846).rgb+texture2D(t,vUv-d*1.3846).rgb)*.3162; s+=(texture2D(t,vUv+d*3.2308).rgb+texture2D(t,vUv-d*3.2308).rgb)*.0703; gl_FragColor=vec4(s,1.); }`, { t: { value: null }, d: { value: new THREE.Vector2() } });
    this.mComp = mk(`uniform sampler2D t,b1,b2,b3; uniform float time,bs,gr; varying vec2 vUv;
 void main(){ vec3 c=texture2D(t,vUv).rgb; vec3 b=texture2D(b1,vUv).rgb*.55+texture2D(b2,vUv).rgb*.75+texture2D(b3,vUv).rgb*.9; c+=b*bs;
  vec2 q=vUv-.5; float v=1.-dot(q,q)*.9; c*=v;
  c=c*(1.+c/6.)/(1.+c*.55); c=pow(c,vec3(.97));
  float n=fract(sin(dot(vUv*vec2(1731.,977.)+time,vec2(12.9898,78.233)))*43758.5453); c+=(n-.5)*gr;
  gl_FragColor=vec4(c,1.); }`, { t: { value: null }, b1: { value: null }, b2: { value: null }, b3: { value: null }, time: { value: 0 }, bs: { value: this.hi ? 0.62 : 0.42 }, gr: { value: this.hi ? 0.035 : 0.02 } });
    this.rts = {}; this.resize();
  }
  mkRT(w, h, ms) { const o = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: !!ms, samples: ms || 0 }; return new THREE.WebGLRenderTarget(Math.max(2, w | 0), Math.max(2, h | 0), o); }
  resize() {
    const s = this.r.getDrawingBufferSize(new THREE.Vector2()), w = s.x, h = s.y; for (const k in this.rts) this.rts[k].dispose();
    const R = this.rts; R.main = this.mkRT(w, h, this.hi ? 4 : 0); R.main.depthBuffer = true; if (!this.hi) { R.main.dispose(); R.main = new THREE.WebGLRenderTarget(w | 0, h | 0, { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }); }
    R.a1 = this.mkRT(w / 4, h / 4); R.b1 = this.mkRT(w / 4, h / 4); R.a2 = this.mkRT(w / 8, h / 8); R.b2 = this.mkRT(w / 8, h / 8); R.a3 = this.mkRT(w / 16, h / 16); R.b3 = this.mkRT(w / 16, h / 16); this.size = [w, h];
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.scene, this.cam); }
  blur(src, tmp, dst, w, h) { this.mBlur.uniforms.t.value = src.texture; this.mBlur.uniforms.d.value.set(1 / w, 0); this.pass(this.mBlur, tmp); this.mBlur.uniforms.t.value = tmp.texture; this.mBlur.uniforms.d.value.set(0, 1 / h); this.pass(this.mBlur, dst); }
  begin() { this.r.setRenderTarget(this.rts.main); this.r.setClearColor(0x000000, 1); this.r.clear(); }
  end(time) {
    const R = this.rts, [w, h] = this.size; this.mBright.uniforms.t.value = R.main.texture; this.pass(this.mBright, R.a1);
    this.blur(R.a1, R.b1, R.a1, w / 4, h / 4);
    this.mBlur.uniforms.t.value = R.a1.texture; this.mBlur.uniforms.d.value.set(1 / (w / 8), 0); this.pass(this.mBlur, R.b2); this.mBlur.uniforms.t.value = R.b2.texture; this.mBlur.uniforms.d.value.set(0, 1 / (h / 8)); this.pass(this.mBlur, R.a2);
    this.blur(R.a2, R.b3, R.a3, w / 16, h / 16);
    const u = this.mComp.uniforms; u.t.value = R.main.texture; u.b1.value = R.a1.texture; u.b2.value = R.a2.texture; u.b3.value = R.a3.texture; u.time.value = time % 100;
    this.pass(this.mComp, null);
  }
}
