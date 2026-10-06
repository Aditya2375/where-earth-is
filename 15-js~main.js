import * as E from './engine.js';
import { Universe } from './scene.js';
import { SUPA_URL, SUPA_KEY } from './config.js';

const $ = id => document.getElementById(id);
const YEAR = E.YEAR_MS, KPC_KM = 3.0856775814914e16;
const BIGBANG_Y = -13.787e9, FUT_MAX_Y = 2.0e10;
const T0 = Date.now();

// ---------- formatting
const pad = (n, k = 2) => String(n).padStart(k, '0');
const nf = (x, d = 0) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const sci = x => { if (x === 0) return '0'; const e = Math.floor(Math.log10(Math.abs(x))), m = x / Math.pow(10, e); return m.toFixed(2) + 'e' + (e < 0 ? '-' : '+') + pad(Math.abs(e)); };
const deg = (x, d = 3) => nf(x, d) + '\u00b0';
const hms = raDeg => { const h = raDeg / 15, hh = Math.floor(h), m = (h - hh) * 60, mm = Math.floor(m), s = (m - mm) * 60; return `${pad(hh)}h ${pad(mm)}m ${s.toFixed(1).padStart(4, '0')}s`; };
function fmtDist(km) { const ly = km / 9.4607304725808e12; if (km < 1e4) return nf(km, 0) + ' km'; if (km < 1e8) return nf(km / 1e3, 0) + ' thousand km'; if (km < 1e10) return nf(km / E.AU, 2) + ' AU'; if (km < 1e13) return nf(km / E.AU, 0) + ' AU'; if (ly < 1e5) return nf(ly, ly < 100 ? 1 : 0) + ' light-years'; if (km / KPC_KM < 1000) return nf(km / KPC_KM, 1) + ' kpc'; if (km / KPC_KM / 1000 < 1000) return nf(km / KPC_KM / 1000, 1) + ' Mpc'; return nf(km / KPC_KM / 1e6, 1) + ' Gpc (' + nf(ly / 1e9, 0) + ' billion light-years)'; }
function fmtTime(ms, ty) {
  const aty = Math.abs(ty);
  if (aty > 1e5) { const g = aty >= 1e9 ? nf(aty / 1e9, 2) + ' Gyr' : aty >= 1e6 ? nf(aty / 1e6, 2) + ' Myr' : nf(aty / 1e3, 1) + ' kyr'; return ty < 0 ? g + ' ago' : 'in ' + g; }
  const d = new Date(ms); let y = d.getUTCFullYear(); const era = y <= 0 ? ` ${1 - y} BCE` : '';
  const ys = y <= 0 ? '' + (1 - y) : pad(y, 4);
  return `${ys}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC${y <= 0 ? ' BCE' : ''}`;
}

// ---------- state
const H = { stars: fetch('data/stars.json').then(r => r.json()), snapshot: fetch('data/snapshot.json').then(r => r.json()),
  landMask: loadLand() };
function loadLand() { return new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; res((lat, lon) => { let u = Math.floor(((lon + 180) / 360) * c.width), v = Math.floor(((90 - lat) / 180) * c.height); u = Math.max(0, Math.min(c.width - 1, u)); v = Math.max(0, Math.min(c.height - 1, v)); return d[(v * c.width + u) * 4] > 127; }); }; im.onerror = () => res(() => false); im.src = 'data/land.png'; }); }

const S = { simMs: T0, rate: 1, playing: true, live: true, base: null, baseSrc: 'none', fetching: false, lastFetch: 0, odo: { helio: 0, gal: 0, cmb: 0 }, lastT: performance.now(), frame: null, spinFrozen: 0 };

function elementsFor(state) {
  const els = {}, B = state.bodies;
  for (const n of E.BODY_LIST) { const b = B[n]; if (!b) continue; const mu = E.GM.sun + (n === 'earth' ? E.GM.earth : 0); els[n] = E.elements(b.slice(0, 3), b.slice(3, 6), mu); }
  if (B.moon && B.earth) { const rel = E.sub(B.moon.slice(0, 3), B.earth.slice(0, 3)), rv = E.sub(B.moon.slice(3, 6), B.earth.slice(3, 6)); els.moon = E.elements(rel, rv, E.GM.earth + E.GM.moon); }
  return els;
}
function adopt(state, ms, src) { S.base = { state, ms, els: elementsFor(state), src, at: Date.now() }; S.baseSrc = src; S.orbitKey = Math.random(); }
async function fetchState(ms) {
  if (S.fetching) return; S.fetching = true; S.lastFetch = performance.now();
  try {
    const q = '/api/state?t=' + Math.round(ms) + '&g=';
    const [a, b] = await Promise.all([fetch(q + 'a'), fetch(q + 'b')]);
    if (!a.ok) throw new Error('state ' + a.status);
    const ja = await a.json(), jb = b.ok ? await b.json() : { bodies: {} };
    const bodies = { ...ja.bodies, ...jb.bodies }; if (!bodies.earth) throw new Error('no earth');
    adopt({ bodies }, new Date(ja.utc).getTime(), 'JPL Horizons, live');
  } catch (e) {
    if (!S.base) { const snap = await H.snapshot; adopt({ bodies: snap.bodies }, new Date(snap.utc).getTime(), 'Baked snapshot (offline fallback)'); }
    else S.fetchFail = true;
  } finally { S.fetching = false; $('loading').classList.add('gone'); }
}
function bodiesAt(ms) {
  const B = S.base, dt = (ms - B.ms) / 1000, out = {};
  for (const n of E.BODY_LIST) { const el = B.els[n]; if (!el) continue; const p = E.propagate(el, dt); out[n] = [...p.pos, ...p.vel]; }
  if (B.els.moon && out.earth) { const p = E.propagate(B.els.moon, dt); out.moon = [...E.add(out.earth.slice(0, 3), p.pos), ...E.add(out.earth.slice(3, 6), p.vel)]; }
  return out;
}

// ---------- scene hooks
let U;
const Z = { zt: 4.1 };
function gotoZ(z) { if (window.gsap) gsap.to(Z, { zt: z, duration: 2.6, ease: 'power3.inOut', overwrite: true }); else Z.zt = z; }
function zoomBy(d) { if (window.gsap) gsap.killTweensOf(Z); Z.zt = Math.max(3.95, Math.min(26, Z.zt + d)); }
U = new Universe($('gl'), { stars: H.stars, landMask: H.landMask, gotoZ, zoomBy, touched: () => { if (window.gsap) gsap.killTweensOf(Z); $('hint').style.opacity = 0; },
  onFocus: () => {}, onPick: (lat, lon) => { S.pick = { lat, lon }; } });

// scale chips
const MOB = innerWidth < 860, ZE = MOB ? 4.8 : 4.4;
document.querySelectorAll('#scale button').forEach(b => b.addEventListener('click', () => { U.focus = 'earth'; let z = parseFloat(b.dataset.z); if (z < 4.5) z = ZE; gotoZ(z); if (z >= 12.5 && z < 19) lookFromNGP(); }));
function lookFromNGP() { const t = E.toThree(E.galToEcl([0, 0, 1])); const yaw = Math.atan2(t[0], t[2]), pitch = Math.asin(Math.max(-1, Math.min(1, t[1])))*0.97; if (window.gsap) { let dy = yaw - U.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); gsap.to(U, { yaw: U.yaw + dy, pitch, duration: 2.4, ease: 'power3.inOut', overwrite: 'auto' }); } else { U.yaw = yaw; U.pitch = pitch; } }
function chipSync() { let best = null, bd = 99; document.querySelectorAll('#scale button').forEach(b => { const d = Math.abs(parseFloat(b.dataset.z) - U.logd); if (d < bd) { bd = d; best = b; } b.classList.remove('on'); }); if (best) best.classList.add('on'); }

// ---------- timeline
const vOf = y => Math.sign(y) * Math.log10(1 + Math.abs(y) / 0.01);
const yOfV = v => Math.sign(v) * 0.01 * (Math.pow(10, Math.abs(v)) - 1);
const VMIN = vOf(BIGBANG_Y), VMAX = vOf(FUT_MAX_Y);
const pOf = y => (vOf(y) - VMIN) / (VMAX - VMIN);
const yPrecLo = (E.PRECISION.lo - T0) / YEAR, yPrecHi = (E.PRECISION.hi - T0) / YEAR, yEarth = (E.EARTH_FORMS_MS - Date.now()) / YEAR, yRG = (E.RED_GIANT_MS) / YEAR;
function seg(id, a, b) { const e = $(id); e.style.left = (a * 100) + '%'; e.style.width = ((b - a) * 100) + '%'; }
seg('segBefore', 0, pOf(yEarth)); seg('segModelPast', pOf(yEarth), pOf(yPrecLo)); seg('segPrec', pOf(yPrecLo), pOf(yPrecHi)); seg('segModelFut', pOf(yPrecHi), pOf(yRG)); seg('segAfter', pOf(yRG), 1);
const ticks = [[BIGBANG_Y, 'Big Bang', 0], [yEarth, 'Earth forms', 1], [-1e6, '1 Myr ago', 0], [-1e3, '1000 yr ago', 0], [0, 'Now', 0], [1e3, '+1000 yr', 0], [1e6, '+1 Myr', 0], [yRG, 'Earth engulfed', 1], [FUT_MAX_Y, 'Far future', 0]];
const tk = $('ticks'); ticks.forEach(([y, t, rw], i) => { const s = document.createElement('span'); if (rw) s.style.top = '11px'; s.textContent = t; s.style.left = (pOf(y) * 100) + '%'; if (i === 0) s.style.transform = 'none'; if (i === ticks.length - 1) s.style.transform = 'translateX(-100%)'; if (innerWidth < 860 && ![0, 1, 4, 7].includes(i)) s.style.display = 'none'; tk.appendChild(s); });
const slider = $('tSlider');
function tyNow() { return (S.simMs - T0) / YEAR; }
function setTy(y) { y = Math.max(BIGBANG_Y, Math.min(FUT_MAX_Y, y)); S.tyFar = Math.abs(y) > 2.5e5 ? y : null; S.simMs = S.tyFar !== null ? T0 + y * YEAR : T0 + y * YEAR; S.live = false; }
let sliding = false;
slider.addEventListener('input', () => { sliding = true; const v = VMIN + (slider.value / 1000) * (VMAX - VMIN); setTy(Math.abs(v) < 0.003 ? 0 : yOfV(v)); S.playing = false; $('tPlay').classList.remove('on'); $('tPlay').textContent = 'Play'; });
slider.addEventListener('change', () => { sliding = false; });
function syncSlider() { if (sliding) return; const y = S.tyFar !== null && S.tyFar !== undefined ? S.tyFar : (S.simMs - T0) / YEAR; slider.value = Math.round(((vOf(y) - VMIN) / (VMAX - VMIN)) * 1000); }
$('tNow').addEventListener('click', () => { S.simMs = Date.now(); S.tyFar = null; S.rate = 1; $('tRate').value = '86400'; S.playing = true; S.live = true; $('tPlay').textContent = 'Pause'; $('tPlay').classList.add('on'); });
let stepSec = 86400;
$('tM1').addEventListener('click', () => { S.playing = false; stepBy(-1); });
$('tP1').addEventListener('click', () => { S.playing = false; stepBy(1); });
function stepBy(k) { const r = parseFloat($('tRate').value); const s = Math.max(86400, r) * 1000; S.simMs += k * s; S.tyFar = null; S.live = false; const y = (S.simMs - T0) / YEAR; if (Math.abs(y) > 2.5e5) S.tyFar = y; $('tPlay').textContent = 'Play'; $('tPlay').classList.remove('on'); }
$('tPlay').addEventListener('click', () => { S.playing = !S.playing; if (S.playing && S.live) { S.rate = parseFloat($('tRate').value); S.live = false; } $('tPlay').textContent = S.playing ? 'Pause' : 'Play'; $('tPlay').classList.toggle('on', S.playing); if (S.playing) S.rate = parseFloat($('tRate').value); });
$('tRate').addEventListener('change', () => { S.rate = parseFloat($('tRate').value); });
// default: real-time live, button says Pause; rate select only applies after leaving live
S.rate = 1; $('tPlay').textContent = 'Pause'; $('tPlay').classList.add('on');

function advanceTime(dt) {
  if (S.playing) {
    if (S.live) S.simMs = Date.now();
    else { S.simMs += S.rate * dt * 1000; const y = (S.simMs - T0) / YEAR; if (y > FUT_MAX_Y) S.simMs = T0 + FUT_MAX_Y * YEAR; if (y < BIGBANG_Y) S.simMs = T0 + BIGBANG_Y * YEAR; }
  }
}

// ---------- frame build
const BANNER = {
  precision: ['', ''],
  modeled: ['Modeled zone', 'Earth exists here, but its position cannot be computed from the ephemeris. Planetary orbits are chaotic, and predictions lose meaning beyond roughly 50 to 100 million years. Orbits are drawn from today\'s shape. Planets are not placed on them. The globe shows an arbitrary spin and season.'],
  before: ['No Earth yet', 'Earth forms about 4.54 billion years ago. Before that, the Solar System is a collapsing cloud of gas and dust around a young Sun. The disc shown is illustrative, not a reconstruction.'],
  after: ['No Earth', 'About 7.59 billion years from now the Sun is predicted to swell into a red giant and engulf Earth (Schroeder and Smith 2008). The Sun is drawn at an illustrative large size.'],
};
function toThreeArr(a) { return a.map(p => E.toThree(p)); }
function buildFrame(ms, ty) {
  const rg = E.regime(ms), B = S.base; const fr = { ms, regime: rg, bodies: {}, sunRadiusAU: rg === 'after' ? 1.2 : 0.00465 };
  const ageY = Math.abs(ty);
  let d = null, orient;
  if (rg === 'precision') {
    const bodies = bodiesAt(ms), st = { bodies }; d = E.derive(st, ms); orient = d.orient;
    for (const n of E.BODY_LIST) if (bodies[n]) { const t = E.toThree(bodies[n].slice(0, 3).map(x => x / E.AU)); fr.bodies[n] = t; }
    fr.bodies.sun = [0, 0, 0];
    fr.sunDir = E.toThree(d.sunDir);
    if (d.moonRel) fr.moonRel = E.toThree(d.moonRel.map(x => x / E.R_EARTH));
    fr.d = d; fr.st = st;
  } else {
    // arbitrary season: use today's Earth direction rotated by mean motion for a visible but unclaimed phase
    const spin = S.spinFrozen; orient = ageY < 3e4 ? E.earthOrientation(ms) : E.earthOrientationModeled(ty, spin);
    const ang = (ty * 360) % 360 * Math.PI / 180; fr.sunDir = E.toThree([Math.cos(ang), Math.sin(ang), 0]); fr.bodies.sun = [0, 0, 0];
    fr.moonRel = null; fr.d = null;
  }
  fr.R = orient.R; fr.orient = orient;
  if (B && S.orbitKey !== undefined) {
    fr.orbitKey = S.orbitKey; fr.orbits = {}; for (const n of E.BODY_LIST) if (B.els[n]) fr.orbits[n] = toThreeArr(E.orbitPoints(B.els[n], 200).map(p => p.map(x => x / E.AU)));
    if (B.els.moon) { fr.moonOrbitKey = S.orbitKey; fr.moonOrbit = toThreeArr(E.orbitPoints(B.els.moon, 120).map(p => p.map(x => x / E.R_EARTH))); }
    if (rg === 'precision' && B.els.earth) { const key = Math.round(ms / 43200000) + ':' + S.orbitKey; fr.trailKey = key; const past = [], fut = []; for (let k = 0; k <= 60; k++) { const dtp = -(k / 60) * 45 * 86400, dtf = (k / 60) * 45 * 86400; const a = E.propagate(B.els.earth, (ms - B.ms) / 1000 + dtp).pos, b = E.propagate(B.els.earth, (ms - B.ms) / 1000 + dtf).pos; past.push(E.toThree(a.map(x => x / E.AU))); fut.push(E.toThree(b.map(x => x / E.AU))); } fr.trail = { past, fut }; }
  }
  if (d) { fr.vGalDir = E.toThree(E.galToEcl(E.mul(d.vGal, 1 / E.norm(d.vGal)))); fr.vGalKey = 'x'; }
  return fr;
}

// ---------- readout
const row = (k, v) => `<div class="r"><span>${k}</span><span>${v}</span></div>`;
const head = (t, tag) => `<h4>${t}<i>${tag}</i></h4>`;
function renderReadout(fr, ms, ty) {
  const rg = fr.regime, d = fr.d, B = S.base;
  const ageMin = B ? (ms - B.ms) / 60000 : 0, ageTxt = Math.abs(ageMin) < 1.5 ? 'exact state at this minute' : 'interpolated from the state at ' + fmtTime(B.ms, 0).slice(0, 16) + ', ' + (Math.abs(ageMin) < 1440 ? nf(Math.abs(ageMin), 0) + ' min' : nf(Math.abs(ageMin) / 1440, Math.abs(ageMin) < 14400 ? 1 : 0) + ' days') + ' away';
  const uni = ty > BIGBANG_Y ? nf((13.787e9 + ty) / 1e9, 3) + ' Gyr' : 'n/a';
  $('roTime').innerHTML = head('Time', 'UT') + row('Date', fmtTime(ms, ty)) + (Math.abs(ty) < 2.5e5 ? row('Julian date (UT)', nf(E.jdOf(ms), 4)) : '') + row('Age of Universe', uni) + row('Zone', rg === 'precision' ? 'Exact ephemeris' : rg === 'modeled' ? 'Modeled' : 'No Earth') + '<small>' + (rg === 'precision' ? (B ? B.src + '. ' + ageTxt : '') + (Math.abs(ty) > 400 ? '. Dates this far from today have a delta-T uncertainty: each hour of error moves Earth about 100,000 km along its orbit. Calendar shown is proleptic Gregorian.' : '') : 'Planet positions are not computed in this zone.') + '</small>';
  if (d) {
    const X = d.rE.map(x => nf(x, 0)), sp = d.sunLoc, eq = d.eqS, va = E.sph(d.eqV);
    $('roHelio').innerHTML = head('Heliocentric ecliptic', 'J2000, Sun-centred') + row('X', X[0] + ' km') + row('Y', X[1] + ' km') + row('Z', X[2] + ' km') + row('Distance', nf(d.r / E.AU, 6) + ' AU') + row('Longitude', deg(sp.lon, 4)) + row('Latitude', deg(sp.lat, 4)) + row('Speed', nf(d.v, 3) + ' km/s') + row('Light time to Sun', nf(d.lightMin, 3) + ' min') + '<small>Source: JPL Horizons, DE441</small>';
    const evc = E.sph(d.eqV);
    $('roEq').innerHTML = head('Equatorial', 'ICRS, Sun to Earth') + row('Right ascension', hms(eq.lon)) + row('Declination', deg(eq.lat, 4)) + row('Moving toward RA', hms(va.lon)) + row('Moving toward Dec', deg(va.lat, 3)) + '<small>Rotated from the ecliptic state by the IAU 2006 obliquity</small>';
    const gp = E.galacticPosition(), vg = d.vGal, vgs = E.sph(vg), vc = d.vCmb, vcs = E.sph(vc), orbit = E.galacticOrbit();
    $('roGal').innerHTML = head('Galactic', 'Milky Way, modeled') + row('Galactocentric X, Y, Z', `${nf(gp.x, 3)}, 0, ${nf(gp.z, 3)} kpc`) + row('Distance from centre', nf(gp.R, 2) + ' \u00b1 ' + E.FRAMES.R0_err + ' kpc') + row('Speed about centre', nf(vgs.r, 1) + ' km/s') + row('Moving toward l, b', `${nf(vgs.lon, 1)}\u00b0, ${nf(vgs.lat, 1)}\u00b0`) + row('Galactic year (circular)', nf(orbit.periodMyr, 0) + ' Myr') + '<small>Constants: R0 8.15 kpc, Theta0 236 km/s (Reid 2019), solar motion (Schoenrich 2010), height 20.8 pc (Bennett and Bovy 2019). Uncertainty about 6 percent.</small>';
    $('roCmb').innerHTML = head('Cosmic microwave background', 'rest frame') + row('Earth speed vs CMB', nf(vcs.r, 2) + ' km/s') + row('Moving toward l, b', `${nf(vcs.lon, 1)}\u00b0, ${nf(vcs.lat, 1)}\u00b0`) + row('Sun alone', '369.82 km/s toward 264.02\u00b0, 48.25\u00b0') + '<small>Planck 2018 dipole plus Earth\'s live orbital velocity.</small>';
    const o = fr.orient, pe = E.sph(o.poleEq), ss = d.subsolar;
    $('roOri').innerHTML = head('Orientation', 'IAU series') + row('Sun is overhead at', `${nf(ss.lat, 2)}\u00b0, ${nf(ss.lon, 2)}\u00b0`) + row('Axial tilt (mean)', deg(o.eps, 4)) + row('Nutation', `${nf(o.nutation.dpsi, 2)}\u2033, ${nf(o.nutation.deps, 2)}\u2033`) + row('Spin axis RA, Dec', `${nf(pe.lon, 2)}\u00b0, ${nf(pe.lat, 2)}\u00b0`) + row('Sidereal angle (GMST)', deg(o.gmst, 3)) + (S.pick ? row('Picked point', `${nf(S.pick.lat, 2)}\u00b0, ${nf(S.pick.lon, 2)}\u00b0`) + row('It moves at', nf(465.1 * Math.cos(S.pick.lat * Math.PI / 180), 0) + ' m/s') : '<small>Click the globe to pick a point on it.</small>');
  } else {
    const t = rg === 'before' ? 'Earth does not exist at this date.' : rg === 'after' ? 'Earth no longer exists at this date.' : 'Not computed outside the ephemeris window.';
    $('roHelio').innerHTML = head('Heliocentric ecliptic', 'J2000') + '<small>' + t + '</small>'; $('roEq').innerHTML = ''; $('roCmb').innerHTML = head('Cosmic microwave background', 'rest frame') + row('Sun alone', '369.82 km/s toward 264.02\u00b0, 48.25\u00b0') + '<small>Held fixed. It will not stay so over gigayears.</small>';
    const orbit = E.galacticOrbit(); const ph = ((ty / orbit.periodMyr / 1e6) % 1 + 1) % 1;
    $('roGal').innerHTML = head('Galactic', 'Milky Way, modeled') + row('Orbit completed', nf(Math.abs(ty) / orbit.periodMyr / 1e6, 2) + ' turns ' + (ty < 0 ? 'ago' : 'ahead')) + '<small>Circular-orbit approximation at 8.15 kpc. Real orbit phase is unknown over this span. Spiral arms and radial migration are ignored.</small>';
    $('roOri').innerHTML = rg === 'modeled' ? head('Orientation', 'modeled') + row('Axial tilt', '22.1 to 24.5\u00b0') + row('Precession period', '25,772 yr') + '<small>Obliquity range with the Moon (Laskar). Phase of spin and season are arbitrary here.</small>' : '';
  }
  S.dd = d;
}
function renderOdo(dt) {
  const d = S.dd; if (d && S.frame && S.frame.regime === 'precision' && S.live) { S.odo.helio += d.v * dt; S.odo.gal += E.norm(d.vGal) * dt; S.odo.cmb += E.norm(d.vCmb) * dt; }
  $('roOdo').innerHTML = head('Distance travelled since you opened this page', 'live') + row('Around the Sun', nf(S.odo.helio, 1) + ' km') + row('Around the Galaxy', nf(S.odo.gal, 1) + ' km') + row('Through the CMB frame', nf(S.odo.cmb, 1) + ' km') + '<small>Speed times elapsed time. Counts only in live mode.</small>';
}
$('roToggle').addEventListener('click', () => { const p = $('readout'); p.classList.toggle('closed'); $('roToggle').setAttribute('aria-expanded', !p.classList.contains('closed')); $('roToggle').querySelector('span').textContent = p.classList.contains('closed') ? '+' : '-'; });
if (innerWidth < 860) { $('readout').classList.add('closed'); $('roToggle').querySelector('span').textContent = '+'; }

// ---------- main loop
let tick = 0, lastRO = 0, lastLedger = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - S.lastT) / 1000); S.lastT = now; tick++;
  advanceTime(dt);
  if (Math.abs(Z.zt - U.logd) > 1e-4) U.logd += (Z.zt - U.logd) * 0.16; else U.logd = Z.zt;
  const ms = S.simMs, ty = S.tyFar != null ? S.tyFar : (ms - T0) / YEAR;
  const rg = E.regime(S.tyFar != null ? T0 + ty * YEAR : ms);
  // fetch policy
  if (S.base) {
    if (rg === 'precision') { const age = Math.abs(ms - S.base.ms), lim = S.live ? 10 * 60000 : Math.max(20 * 60000, Math.abs(S.rate) * 1000 * (S.playing ? 1.0 : 0)); if ((age > lim || S.base.far) && !S.fetching && performance.now() - S.lastFetch > (S.playing && !S.live ? 900 : 350)) fetchState(ms); }
  }
  if (rg === 'precision' && Math.abs(S.rate) <= 2e5) S.spinFrozen = ((ms / 86400000) * 360.98564736629) % 360;
  if (S.base) {
    const fr = buildFrame(ms, ty); S.frame = fr; U.showEarth = rg === 'precision' || rg === 'modeled';
    U.update(fr);
    if (now - lastRO > 100) { lastRO = now; renderReadout(fr, ms, ty); }
    if (now - lastLedger > 500) { lastLedger = now; updateLedgerLive(fr); }
    renderOdo(dt);
    const b = BANNER[rg]; const bn = $('regimeBanner'); bn.className = rg; $('rgName').textContent = b[0]; $('rgText').textContent = b[1]; bn.style.opacity = rg === 'precision' ? 0 : 1;
    $('tDate').textContent = fmtTime(ms, ty);
    const base = S.base, st = rg === 'precision' ? (S.live ? 'LIVE' : 'SCRUBBING') + (S.fetching ? ' - fetching exact state' : '') : rg === 'modeled' ? 'MODELED' : 'NO EARTH';
    $('tState').textContent = st; $('scaleRead').textContent = 'View ' + fmtDist(U.dist); $('imgCap').style.opacity = U.logd < 6.4 && U.photoReady && (!U.focus || U.focus === 'earth' || U.focus === 'moon') ? 0.8 : 0;
    chipSync(); syncSlider();
  }
  requestAnimationFrame(loop);
}

// ---------- ledger
let LEDGER = [];
const STATUS_LABEL = { measured: 'Measured', modelled: 'Modeled', estimate: 'Estimate', event: 'Event or stochastic', bound: 'Bound or limit', hypothesis: 'Hypothesis' };
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function ledgerRow(e) {
  const r = el('article', 'row'); r.id = 'effect-' + e.id; r.dataset.id = e.id;
  const a = el('div'); const h = el('h4'); h.appendChild(document.createTextNode(e.n + '. ' + e.name)); const b = el('span', 'badge st-' + e.status, STATUS_LABEL[e.status]); h.appendChild(b);
  if (e.live) { const t = el('span', 'badge st-computed-live', 'Computed here'); h.appendChild(t); }
  a.appendChild(h); a.appendChild(el('p', 'what', e.what));
  const how = el('p', 'how', 'Acts on: ' + e.tag + '. Basis: ' + e.basis + '.'); a.appendChild(how);
  const m = el('div'); m.appendChild(el('div', 'how', e.scale)); m.style.marginTop = '0';
  const c = el('div'); c.dataset.live = '1';
  if (e.live) e.live.forEach(l => { const w = el('div'); w.style.marginBottom = '12px'; const v = el('div', 'val'); v.dataset.key = l.key; v.dataset.unit = l.unit; w.appendChild(v); w.appendChild(el('div', 'how', l.label)); if (l.unit === 'm/s^2') { const bar = el('div', 'bar'); const i = el('i'); i.dataset.bar = l.key; bar.appendChild(i); w.appendChild(bar); const ax = el('div', 'axis'); ax.innerHTML = '<span>1e-30</span><span>1e-16</span><span>1e-2</span>'; w.appendChild(ax); } c.appendChild(w); });
  else c.appendChild(el('div', 'how', 'No live value. See scale at left, as stated by the census.'));
  const mid = el('div'); mid.appendChild(m); mid.appendChild(c);
  const s = el('div', 'srcl'); s.appendChild(el('span', '', 'Census refs: ' + e.refs));
  (e.sources || []).forEach(x => { const l = el('a', '', x.label); l.href = x.url; l.target = '_blank'; l.rel = 'noopener noreferrer'; s.appendChild(l); });
  r.classList.add('compact'); const tg = el('button', 'rtoggle', 'Details'); tg.type = 'button'; tg.addEventListener('click', () => { r.classList.toggle('open'); tg.textContent = r.classList.contains('open') ? 'Hide' : 'Details'; }); h.appendChild(tg); r.appendChild(a); r.appendChild(mid); r.appendChild(s); return r;
}
async function buildLedger() {
  LEDGER = await (await fetch('data/effects.json')).json();
  const L = $('ledgerList'), R = $('rotList'); let curG = null, cont = null;
  for (const e of LEDGER) {
    const target = e.group === 'B' ? R : L;
    if (target.dataset.last !== e.group) { target.dataset.last = e.group; const g = el('div', 'group' + (target === L ? ' closed' : '')); g.dataset.g = e.group; const hb = el('button', 'ghead'); hb.type = 'button'; hb.appendChild(el('span', 'gname', e.group + '. ' + e.groupName)); hb.appendChild(el('span', 'gmix')); hb.appendChild(el('span', 'gct')); hb.appendChild(el('span', 'gplus', '+')); hb.addEventListener('click', () => g.classList.toggle('closed')); g.appendChild(hb); cont = g; target.appendChild(g); }
    cont.appendChild(ledgerRow(e));
  }
  document.querySelectorAll('.group').forEach(g => { const rows = [...g.querySelectorAll('.row')]; g.querySelector('.gct').textContent = rows.length + ' entries'; const mix = g.querySelector('.gmix'); const cnt = {}; rows.forEach(r => { const e = LEDGER.find(x => x.id === r.dataset.id); cnt[e.status] = (cnt[e.status] || 0) + 1; }); Object.keys(cnt).forEach(k => { const i = el('i', 'st-' + k); i.style.flex = cnt[k]; i.title = STATUS_LABEL[k] + ': ' + cnt[k]; mix.appendChild(i); }); });
  buildDescent();
  const key = $('statusKey'); Object.keys(STATUS_LABEL).forEach(k => { key.appendChild(el('span', 'badge st-' + k, STATUS_LABEL[k])); }); key.appendChild(el('span', 'badge st-computed-live', 'Computed here: a live number calculated on this page'));
  $('lcount').textContent = LEDGER.length + ' entries';
  const srcs = new Map(); LEDGER.forEach(e => (e.sources || []).forEach(s => srcs.set(s.url, s.label))); const sl = $('srcList'); [...srcs].forEach(([u, l]) => { const li = el('li'); const a = el('a', '', l); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.appendChild(a); sl.appendChild(li); });
  [['NASA JPL Horizons system', 'https://ssd-api.jpl.nasa.gov/doc/horizons.html'], ['Natural Earth, 110m land', 'https://www.naturalearthdata.com/'], ['d3-celestial star catalogue (Hipparcos-based)', 'https://github.com/ofrohn/d3-celestial']].forEach(([l, u]) => { const li = el('li'); const a = el('a', '', l); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.appendChild(a); sl.appendChild(li); });
  $('lq').addEventListener('input', () => { const q = $('lq').value.trim().toLowerCase(); let n = 0; document.querySelectorAll('.row').forEach(r => { const e = LEDGER.find(x => x.id === r.dataset.id); const hit = !q || (e.name + ' ' + e.what + ' ' + e.syn + ' ' + e.scale).toLowerCase().includes(q); r.style.display = hit ? '' : 'none'; if (hit) n++; }); $('lcount').textContent = n + ' of ' + LEDGER.length; document.querySelectorAll('.group').forEach(g => { if (q) g.classList.remove('closed'); }); });
  if (location.hash.startsWith('#effect-')) setTimeout(() => flash(location.hash.slice(8)), 600);
}
function flash(id) { const r = $('effect-' + id); if (!r) return; const gg = r.closest('.group'); if (gg) gg.classList.remove('closed'); r.classList.add('open'); const tb = r.querySelector('.rtoggle'); if (tb) tb.textContent = 'Hide'; r.scrollIntoView({ behavior: 'smooth', block: 'center' }); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 2400); }
function updateLedgerLive(fr) {
  const d = fr.d; if (!d) { document.querySelectorAll('.val[data-key]').forEach(v => { if (!v.dataset.k) { v.textContent = 'not computed in this zone'; v.dataset.k = 'x'; v.style.fontSize = '12px'; } }); return; }
  const lv = E.ledgerLive(fr.st, d), o = fr.orient; lv.massloss = 1.4; lv.surfspeed = 465.1; lv.nut = null; lv.prec = 50.29; lv.andromeda = 3.5e-13;
  document.querySelectorAll('.val[data-key]').forEach(v => {
    v.style.fontSize = ''; v.dataset.k = ''; const k = v.dataset.key; let txt = '';
    if (k === 'nut') txt = `${nf(o.nutation.dpsi, 2)}\u2033 longitude, ${nf(o.nutation.deps, 2)}\u2033 obliquity`;
    else if (lv[k] != null) { const x = lv[k], u = v.dataset.unit; txt = (u === 'km' ? nf(x, 0) : u === 'm/s^2' ? sci(x) : nf(x, 3)) + ' '; } 
    if (txt !== v.dataset.t) { v.dataset.t = txt; v.textContent = txt; if (v.dataset.unit) { const s = el('small', '', v.dataset.unit === 'm/s^2' ? 'm/s\u00b2' : v.dataset.unit); v.appendChild(s); } }
    if (v.dataset.unit === 'm/s^2' && lv[k]) { const bar = document.querySelector(`i[data-bar="${k}"]`); if (bar) bar.style.width = Math.max(1, Math.min(100, (Math.log10(lv[k]) + 30) / 28 * 100)) + '%'; }
  });
}

// ---------- suggestion box
const STOP = new Set('the and for with that this from into what does effect force earth gravity about than have has are its our can may will not but one two more less such also very when which their there'.split(' '));
const stem = w => w.replace(/(ing|ed|es|s|al|ic|ation)$/, '').slice(0, 7);
const toks = s => (s.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(w => !STOP.has(w)).map(stem);
function matchEffects(name, desc) {
  const qn = new Set(toks(name)), qa = new Set([...qn, ...toks(desc)]); const out = [];
  for (const e of LEDGER) {
    const nt = new Set([...toks(e.name), ...toks(e.syn)]), wt = new Set(toks(e.what + ' ' + e.scale));
    let nameHit = 0; qn.forEach(t => { if (nt.has(t)) nameHit++; }); let ctx = 0; qa.forEach(t => { if (wt.has(t)) ctx++; });
    const score = (qn.size ? nameHit / qn.size : 0) * 0.8 + Math.min(1, ctx / 6) * 0.2;
    const phrase = name.trim().length > 3 && (e.name.toLowerCase().includes(name.trim().toLowerCase()) || e.syn.toLowerCase().includes(name.trim().toLowerCase()));
    if (score >= 0.34 || phrase) out.push({ e, score: phrase ? Math.max(score, 0.9) : score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}
const sOut = $('sOut');
async function submitIdea(dupOf) {
  const body = { name: $('sName').value.trim().slice(0, 120), description: $('sDesc').value.trim().slice(0, 1500), source_url: $('sSrc').value.trim().slice(0, 300) || null, duplicate_of: dupOf || null };
  sOut.textContent = 'Sending...';
  if ($('sHp').value) { sOut.textContent = 'Thank you. It is in the review queue.'; return; }
  const last = +localStorage.getItem('we_last') || 0; if (Date.now() - last < 45000) { sOut.textContent = 'Please wait a moment before sending another.'; return; }
  try {
    const r = await fetch(SUPA_URL + '/rest/v1/earth_suggestions', { method: 'POST', headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(r.status); localStorage.setItem('we_last', Date.now()); sOut.innerHTML = ''; const c = el('div', 'card'); c.appendChild(el('p', '', 'Thank you. It is in the review queue. A person reads each one, and anything added needs a source.')); sOut.appendChild(c); $('sForm').reset();
  } catch (e) { sOut.textContent = 'Could not send right now. Please try again later.'; }
}
$('sForm').addEventListener('submit', ev => {
  ev.preventDefault(); const name = $('sName').value.trim(), desc = $('sDesc').value.trim(); sOut.innerHTML = '';
  if (name.length < 3 || desc.length < 20) { sOut.textContent = 'Please add a name and a few sentences of description.'; return; }
  const m = matchEffects(name, desc);
  if (m.length && m[0].score >= 0.5) {
    const c = el('div', 'card'); c.appendChild(el('p', '', 'This looks already covered by the ledger:'));
    m.filter(x => x.score >= 0.34).forEach(x => { const b = el('button', 'pick'); b.type = 'button'; b.appendChild(el('b', '', x.e.n + '. ' + x.e.name)); b.appendChild(el('div', '', x.e.what.slice(0, 220) + (x.e.what.length > 220 ? '...' : ''))); b.addEventListener('click', () => { history.replaceState(null, '', '#effect-' + x.e.id); flash(x.e.id); }); c.appendChild(b); });
    const a = el('a', 'btn', 'Open "' + m[0].e.name + '" in the ledger'); a.href = '#effect-' + m[0].e.id; a.addEventListener('click', ev2 => { ev2.preventDefault(); history.replaceState(null, '', '#effect-' + m[0].e.id); flash(m[0].e.id); }); c.appendChild(a);
    const d = el('p', '', ''); d.style.marginTop = '14px'; const bb = el('button', 'pick', 'Mine is different, send it for review'); bb.type = 'button'; bb.addEventListener('click', () => submitIdea(m[0].e.id)); c.appendChild(bb); sOut.appendChild(c); return;
  }
  submitIdea(null);
});

// ---------- boot
async function boot() {
  buildLedger();
  fetchState(Date.now());
  if (window.Lenis && !matchMedia('(prefers-reduced-motion: reduce)').matches) { const lenis = new Lenis({ lerp: 0.1 }); (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0); }
  document.querySelectorAll('.nav a, a[href^="#"]').forEach(a => a.addEventListener('click', ev => { const id = a.getAttribute('href'); if (id.startsWith('#effect-')) return; const t = document.querySelector(id); if (t) { ev.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); } }));
  // intro dive from the Local Group to Earth
  const P = new URLSearchParams(location.search); if (P.has('yaw')) U.noAim = true; if (P.has('nostage')) document.getElementById('stage').style.display = 'none';
  if (P.has('z')) { U.logd = Z.zt = parseFloat(P.get('z')); if (P.has('yaw')) U.yaw = parseFloat(P.get('yaw')); if (P.has('pitch')) U.pitch = parseFloat(P.get('pitch')); if (P.has('ty')) { setTy(parseFloat(P.get('ty'))); S.playing = false; } if (P.has('focus')) U.focus = P.get('focus'); }
  else { U.logd = 21; Z.zt = 21; setTimeout(() => { if (window.gsap) gsap.to(Z, { zt: ZE, duration: 6.5, ease: 'power3.inOut', overwrite: true }); else Z.zt = ZE; }, 700); }
  setTimeout(() => { $('hint').style.opacity = 0; }, 12000);
  requestAnimationFrame(loop);
}
boot();

// ---------- descent: the acceleration rows on one log scale (values taken from the census scale text)
const DESC = [['e001', -2.227], ['e002', -4.479], ['e067', -9.638], ['e077', -10], ['e046', -15.924], ['e047', -16.013], ['e083', -18], ['e068', -19], ['e057', -19.398], ['e049', -20], ['e087', -24.31], ['e054', -26.82]];
function fmtLen(m) { const u = [[1e3, 'km', 1e3], [1, 'm', 1], [1e-3, 'mm', 1e-3], [1e-6, 'micrometre', 1e-6], [1e-9, 'nanometre', 1e-9], [1e-12, 'picometre', 1e-12], [1e-15, 'femtometre', 1e-15]]; for (const [t, n, d] of u) if (m >= t) { const v = m / d; return (v >= 100 ? Math.round(v) : v.toPrecision(2)) + ' ' + n + (n.length > 2 && v >= 1.5 ? 's' : ''); } return m.toExponential(1) + ' m'; }
function buildDescent() {
  const host = $('descent'); if (!host || host.dataset.done) return; host.dataset.done = 1;
  const top = DESC[0][1];
  host.appendChild(el('p', 'dhead', 'The descent: from the Sun\'s pull to the faintest effect, each bar on one logarithmic scale. Bars are positioned by order of magnitude, so a bar half as long is not half the size: each tick is a factor of 10^6. Tap a bar to open its row.'));
  DESC.forEach(([id, ex]) => {
    const e = LEDGER.find(x => x.id === id); if (!e) return;
    const w = Math.max(2, (ex + 30) / 28 * 100), ratio = Math.pow(10, ex - top);
    const d = el('button', 'dstep'); d.type = 'button';
    const hd = el('div', 'dname'); hd.appendChild(el('span', '', e.name.length > 54 ? e.name.slice(0, 52) + '\u2026' : e.name)); hd.appendChild(el('span', 'badge st-' + e.status, STATUS_LABEL[e.status]));
    const bar = el('div', 'dbar'); const i = el('i'); i.style.width = w + '%'; bar.appendChild(i);
    const ev = el('div', 'dval', '10^' + Math.round(ex * 10) / 10 + ' m/s\u00b2');
    const cmp = el('div', 'dcmp', id === 'e001' ? 'Reference: the Sun\'s pull at Earth.' : 'If the Sun\'s pull were the Earth-Sun distance (149.6 million km), this would be ' + fmtLen(1.496e11 * ratio) + '.');
    d.appendChild(hd); d.appendChild(bar); d.appendChild(ev); d.appendChild(cmp);
    d.addEventListener('click', () => flash(id)); host.appendChild(d);
  });
  host.appendChild(el('p', 'dfoot', 'Values are the census scale text for each row (some are order-of-magnitude, marked ~ in the row). Rotation and non-acceleration effects are listed below.'));
}
