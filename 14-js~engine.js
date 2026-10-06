// Where Earth is - physics engine. Pure functions, no DOM. Units: km, km/s unless noted.
export const AU = 149597870.7, DEG = Math.PI / 180, C_KMS = 299792.458, G = 6.6743e-11;
export const EPS0 = (84381.406 / 3600) * DEG; // mean obliquity J2000, IAU 2006
// GM in km^3/s^2, DE440 (Park et al. 2021). Planet entries are system barycentres where Horizons gives barycentres.
export const GM = { sun: 132712440041.93938, mercury: 22031.868551, venus: 324858.592, earth: 398600.435436, moon: 4902.800118, mars: 42828.375816, jupiter: 126712764.8, saturn: 37940585.2, uranus: 5794556.4, neptune: 6836527.1, pluto: 975.5 };
export const R_EARTH = 6371.0084, M_EARTH = 5.9722e24, R_SUN = 695700, L_SUN = 3.828e26;
export const BODY_LIST = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'];

// ---- vectors / matrices
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = a => Math.hypot(a[0], a[1], a[2]);
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const mvec = (M, v) => [dot(M[0], v), dot(M[1], v), dot(M[2], v)];
export const mmul = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
export const tr = M => [[M[0][0], M[1][0], M[2][0]], [M[0][1], M[1][1], M[2][1]], [M[0][2], M[1][2], M[2][2]]];
export const Rz = a => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
export const Rx = a => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
// ecliptic J2000 <-> equatorial J2000 (ICRS to ~20 mas)
export const eclToEq = v => mvec(Rx(EPS0), v);
export const eqToEcl = v => mvec(Rx(-EPS0), v);
// ICRS -> Galactic (Hipparcos/ESA 1997 matrix)
const A_G = [[-0.0548755604162154, -0.8734370902348850, -0.4838350155487132], [0.4941094278755837, -0.4448296299600112, 0.7469822444972189], [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669]];
export const eqToGal = v => mvec(A_G, v);
export const galToEq = v => mvec(tr(A_G), v);
export const eclToGal = v => eqToGal(eclToEq(v));
export const galToEcl = v => eqToEcl(galToEq(v));
export const sph = v => { const r = norm(v); return { r, lon: ((Math.atan2(v[1], v[0]) / DEG) % 360 + 360) % 360, lat: Math.asin(v[2] / r) / DEG }; };
export const fromSph = (lonDeg, latDeg, r = 1) => [r * Math.cos(latDeg * DEG) * Math.cos(lonDeg * DEG), r * Math.cos(latDeg * DEG) * Math.sin(lonDeg * DEG), r * Math.sin(latDeg * DEG)];
// ecliptic (x,y,z) -> three.js world (x, z, -y)
export const toThree = v => [v[0], v[2], -v[1]];

// ---- time
export const jdOf = ms => ms / 86400000 + 2440587.5;
export const msOf = jd => (jd - 2440587.5) * 86400000;
export const centuries = ms => (jdOf(ms) - 2451545) / 36525;
export const YEAR_MS = 365.25 * 86400000;
// Precision zone as served by this site (Horizons DE441 window, JD 100..5373000)
export const PRECISION = { lo: msOf(100), hi: msOf(5373000) };
export const EARTH_FORMS_MS = -4.54e9 * YEAR_MS;      // Earth's age 4.54 +/- 0.05 Gyr (Dalrymple 2001)
export const RED_GIANT_MS = 7.59e9 * YEAR_MS;         // Schroder & Smith 2008: engulfment ~7.59 Gyr from now
export function regime(ms) {
  if (ms >= PRECISION.lo && ms <= PRECISION.hi) return 'precision';
  if (ms >= EARTH_FORMS_MS && ms <= RED_GIANT_MS) return 'modeled';
  return ms < EARTH_FORMS_MS ? 'before' : 'after';
}

// ---- Earth orientation
export function gmstDeg(ms) { const d = jdOf(ms) - 2451545, T = d / 36525; return ((280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T * T * T / 38710000) % 360 + 360) % 360; }
export function obliquityDeg(T) { return (84381.406 - 46.836769 * T - 0.0001831 * T * T + 0.0020034 * T * T * T) / 3600; }
export function nutation(T) {
  const O = (125.04452 - 1934.136261 * T) * DEG, L = (280.4665 + 36000.7698 * T) * DEG, Lm = (218.3165 + 481267.8813 * T) * DEG;
  const dpsi = -17.1996 * Math.sin(O) - 1.3187 * Math.sin(2 * L) - 0.2274 * Math.sin(2 * Lm) + 0.2062 * Math.sin(2 * O);
  const deps = 9.2025 * Math.cos(O) + 0.5736 * Math.cos(2 * L) + 0.0977 * Math.cos(2 * Lm) - 0.0895 * Math.cos(2 * O);
  return { dpsi, deps }; // arcsec
}
export function precessionMatrix(T) { // J2000 mean equator -> mean equator of date (IAU 1976 angles)
  const as = DEG / 3600;
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * as, z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * as, th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * as;
  const cz = Math.cos(zeta), sz = Math.sin(zeta), cZ = Math.cos(z), sZ = Math.sin(z), ct = Math.cos(th), st = Math.sin(th);
  return [[cz * ct * cZ - sz * sZ, -sz * ct * cZ - cz * sZ, -st * cZ], [cz * ct * sZ + sz * cZ, -sz * ct * sZ + cz * cZ, -st * sZ], [cz * st, -sz * st, ct]];
}
// Orientation of Earth's body frame in ecliptic J2000 axes (columns = body x,y,z in ecl). Valid to a few arcmin within a few centuries of J2000.
export function earthOrientation(ms) {
  const T = centuries(ms), P = precessionMatrix(T), nu = nutation(T);
  const eps = obliquityDeg(T), gast = gmstDeg(ms) + (nu.dpsi / 3600) * Math.cos(eps * DEG);
  const Rbody = mmul(tr(P), Rz(gast * DEG));       // body -> J2000 equatorial
  const Recl = mmul(Rx(-EPS0), Rbody);              // body -> J2000 ecliptic
  const pole = mvec(Recl, [0, 0, 1]);
  const poleEq = mvec(tr(P), [0, 0, 1]);
  return { T, R: Recl, pole, poleEq, eps, nutation: nu, gmst: gmstDeg(ms), gast: ((gast % 360) + 360) % 360 };
}
export function sunDirFromEarth(earthPos) { const r = norm(earthPos); return [-earthPos[0] / r, -earthPos[1] / r, -earthPos[2] / r]; }
// Sub-solar point (lat, lon east) from the Sun direction in ecliptic J2000 and the orientation
export function subsolar(sunDirEcl, orient) {
  const local = mvec(tr(orient.R), sunDirEcl); // into body frame
  return { lat: Math.asin(local[2]) / DEG, lon: ((Math.atan2(local[1], local[0]) / DEG + 540) % 360) - 180 };
}

// ---- two-body elements and propagation
export function elements(r, v, mu) {
  const rn = norm(r), h = cross(r, v), hn = norm(h), vv = dot(v, v);
  const ev = sub(mul(cross(v, h), 1 / mu), mul(r, 1 / rn)), e = norm(ev), a = 1 / (2 / rn - vv / mu);
  const inc = Math.acos(h[2] / hn), nvec = [-h[1], h[0], 0], nn = norm(nvec);
  let Om = nn > 1e-12 ? Math.acos(nvec[0] / nn) : 0; if (nvec[1] < 0) Om = 2 * Math.PI - Om;
  let w = nn > 1e-12 && e > 1e-12 ? Math.acos(Math.max(-1, Math.min(1, dot(nvec, ev) / (nn * e)))) : 0; if (ev[2] < 0) w = 2 * Math.PI - w;
  let nu = Math.acos(Math.max(-1, Math.min(1, dot(ev, r) / (e * rn)))); if (dot(r, v) < 0) nu = 2 * Math.PI - nu;
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2)), M = E - e * Math.sin(E), n = Math.sqrt(mu / Math.abs(a ** 3));
  return { a, e, inc, Om, w, nu, M, n, mu, period: 2 * Math.PI / n, peri: a * (1 - e), apo: a * (1 + e) };
}
function perifocalToEcl(el) {
  const cO = Math.cos(el.Om), sO = Math.sin(el.Om), ci = Math.cos(el.inc), si = Math.sin(el.inc), cw = Math.cos(el.w), sw = Math.sin(el.w);
  return [[cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci, 0], [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci, 0], [sw * si, cw * si, 0]];
}
export function orbitPoints(el, n = 256) {
  const Q = perifocalToEcl(el), p = el.a * (1 - el.e * el.e), pts = [];
  for (let k = 0; k <= n; k++) { const nu = (k / n) * 2 * Math.PI, r = p / (1 + el.e * Math.cos(nu)), x = r * Math.cos(nu), y = r * Math.sin(nu); pts.push([Q[0][0] * x + Q[0][1] * y, Q[1][0] * x + Q[1][1] * y, Q[2][0] * x + Q[2][1] * y]); }
  return pts;
}
export function propagate(el, dtSec) { // returns position, velocity (ecliptic) after dtSec
  let M = el.M + el.n * dtSec; M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let E = el.e < 0.8 ? M : Math.PI; for (let i = 0; i < 40; i++) E -= (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
  const Q = perifocalToEcl(el), a = el.a, e = el.e, x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E), r = a * (1 - e * Math.cos(E));
  const f = Math.sqrt(el.mu * a) / r, vx = -f * Math.sin(E), vy = f * Math.sqrt(1 - e * e) * Math.cos(E);
  return { pos: [Q[0][0] * x + Q[0][1] * y, Q[1][0] * x + Q[1][1] * y, Q[2][0] * x + Q[2][1] * y], vel: [Q[0][0] * vx + Q[0][1] * vy, Q[1][0] * vx + Q[1][1] * vy, Q[2][0] * vx + Q[2][1] * vy] };
}

// ---- larger frames (constants with uncertainty; see effects/frames notes on the page)
export const FRAMES = {
  R0_kpc: 8.15, R0_err: 0.15, Theta0: 236, Theta0_err: 7,             // Reid et al. 2019
  solarU: 11.1, solarV: 12.24, solarW: 7.25,                          // Schoenrich, Binney & Dehnen 2010
  zSun_pc: 20.8,                                                      // Bennett & Bovy 2019
  cmbSpeed: 369.82, cmbL: 264.021, cmbB: 48.253,                      // Planck 2018 dipole, Sun relative to CMB
};
// Sun/Earth velocity in galactic Cartesian (U toward GC, V toward rotation, W toward NGP), relative to Galactic centre
export function velGalactocentric(vEarthHelioEcl) {
  const sun = [FRAMES.solarU, FRAMES.Theta0 + FRAMES.solarV, FRAMES.solarW];
  return add(sun, eclToGal(vEarthHelioEcl));
}
export function velCMB(vEarthHelioEcl) {
  const sun = fromSph(FRAMES.cmbL, FRAMES.cmbB, FRAMES.cmbSpeed);
  return add(sun, eclToGal(vEarthHelioEcl));
}
export function galacticPosition() { // Sun/Earth in galactocentric Cartesian, kpc (x from GC toward Sun's side is negative)
  const R = FRAMES.R0_kpc; return { x: -R, y: 0, z: FRAMES.zSun_pc / 1000, R };
}
export function galacticOrbit() {
  const R = FRAMES.R0_kpc * 3.0856775814914e16 /*km per kpc*/, v = FRAMES.Theta0 + FRAMES.solarV, period = 2 * Math.PI * R / v; // s (circular approx)
  return { periodMyr: period / (365.25 * 86400 * 1e6), vCirc: v };
}

// ---- state -> derived quantities
export function derive(state, ms) {
  const B = state.bodies, e = B.earth; if (!e) return null;
  const rE = e.slice(0, 3), vE = e.slice(3, 6), r = norm(rE), v = norm(vE);
  const el = elements(rE, vE, GM.sun + GM.earth);
  const orient = earthOrientation(ms), sunDir = sunDirFromEarth(rE);
  const vGal = velGalactocentric(vE), vCmb = velCMB(vE);
  const eq = eclToEq(rE), eqV = eclToEq(vE);
  const sunLoc = sph(rE), eqS = sph(eq);
  // barycentre of the Sun relative to the Sun's centre from available bodies (planet system barycentres)
  let num = [0, 0, 0], tot = GM.sun; for (const k of BODY_LIST) { if (k === 'earth') continue; if (B[k]) { num = add(num, mul(B[k].slice(0, 3), GM[k])); tot += GM[k]; } }
  num = add(num, mul(rE, GM.earth + GM.moon)); tot += GM.moon + GM.earth;
  const bary = mul(num, 1 / tot); // SSB position relative to Sun centre (ecliptic), km
  let moonRel = null, emOffset = null; if (B.moon) { moonRel = sub(B.moon.slice(0, 3), rE); emOffset = norm(moonRel) * GM.moon / (GM.earth + GM.moon); }
  return { rE, vE, r, v, el, orient, sunDir, vGal, vCmb, eq, eqV, sunLoc, eqS, bary, baryDist: norm(bary), moonRel, emOffset, subsolar: subsolar(sunDir, orient), lightMin: r / C_KMS / 60 };
}
// ---- ledger live values (m/s^2 unless said)
export function ledgerLive(state, d) {
  const B = state.bodies, out = {}, rE = d.rE;
  out.grav_sun = GM.sun / d.r ** 2 * 1e3;
  for (const k of BODY_LIST) { if (k === 'earth' || !B[k]) continue; const dist = norm(sub(B[k].slice(0, 3), rE)); out['grav_' + k] = GM[k] / dist ** 2 * 1e3; out['dist_' + k] = dist; }
  if (d.moonRel) { out.grav_moon = GM.moon / norm(d.moonRel) ** 2 * 1e3; out.dist_moon = norm(d.moonRel); out.em_offset = d.emOffset; }
  out.sun_bary = d.baryDist;
  const flux = L_SUN / (4 * Math.PI * (d.r * 1e3) ** 2);
  out.srp = flux * Math.PI * (R_EARTH * 1e3) ** 2 / (M_EARTH * 299792458);
  out.pr_drag = out.srp * d.v / C_KMS;
  out.cmb_drag = (4 / 3) * 4.17e-14 * Math.PI * (R_EARTH * 1e3) ** 2 * (norm(d.vCmb) / C_KMS) / M_EARTH;
  const mu = GM.sun, a = d.el.a, ecc = d.el.e, n = d.el.n;
  out.gr_peri = (6 * Math.PI * mu / (299792.458 ** 2 * a * (1 - ecc * ecc))) * (36525 * 86400 / (2 * Math.PI / n)) / DEG * 3600; // arcsec per century (osculating)
  out.geodetic = 1.5 * (mu / (C_KMS ** 2 * d.r)) * n * (365.25 * 86400) / DEG * 3.6e6; // mas/yr
  out.gal_accel = (FRAMES.Theta0 * 1e3) ** 2 / (FRAMES.R0_kpc * 3.0856775814914e19);
  out.light_min = d.lightMin;
  return out;
}
// Distance travelled per second in each frame, km/s
export function speeds(d) { return { helio: d.v, gal: norm(d.vGal), cmb: norm(d.vCmb) }; }

// ---- cosmic-scale anchors (l, b degrees; distance kpc). Sources listed on the page.
export const ANCHORS = [
  { id: 'gc', name: 'Galactic centre (Sgr A*)', l: 359.944, b: -0.046, d: 8.15, kind: 'gal' },
  { id: 'lmc', name: 'Large Magellanic Cloud', l: 280.47, b: -32.89, d: 49.6, kind: 'lg' },
  { id: 'smc', name: 'Small Magellanic Cloud', l: 302.8, b: -44.3, d: 62, kind: 'lg' },
  { id: 'm31', name: 'Andromeda (M31)', l: 121.17, b: -21.57, d: 770, kind: 'lg' },
  { id: 'm33', name: 'Triangulum (M33)', l: 133.61, b: -31.33, d: 900, kind: 'lg' },
  { id: 'virgo', name: 'Virgo Cluster', l: 283.78, b: 74.49, d: 16500, kind: 'cl' },
  { id: 'norma', name: 'Norma Cluster (Great Attractor region)', l: 325.3, b: -7.2, d: 70000, kind: 'cl' },
  { id: 'shapley', name: 'Shapley Concentration', l: 312, b: 31, d: 200000, kind: 'cl' },
];
export function anchorEcl(a) { return galToEcl(fromSph(a.l, a.b, a.d)); } // kpc, ecliptic axes, Sun-centred

// ---- modeled orientation outside the series range: cone precession, constant mean obliquity, arbitrary spin phase
export function earthOrientationModeled(yearsFromJ2000, spinDeg) {
  const eps = 23.44 * DEG, lon = (90 - 360 * yearsFromJ2000 / 25772) * DEG;
  const z = [Math.sin(eps) * Math.cos(lon), Math.sin(eps) * Math.sin(lon), Math.cos(eps)];
  let x0 = cross([0, 0, 1], z); const n = norm(x0); x0 = mul(x0, 1 / n);
  const y0 = cross(z, x0), c = Math.cos(spinDeg * DEG), s = Math.sin(spinDeg * DEG);
  const x = add(mul(x0, c), mul(y0, s)), y = add(mul(y0, c), mul(x0, -s));
  const R = [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
  return { R, pole: z, eps: 23.44, modeled: true };
}
