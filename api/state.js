'use strict';
const BODIES = {earth:'399',moon:'301',mercury:'199',venus:'299',mars:'4',jupiter:'5',saturn:'6',uranus:'7',neptune:'8',pluto:'9'};
const BASE = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const GROUPS = {a:['earth','moon','mercury','venus','mars'],b:['jupiter','saturn','uranus','neptune','pluto']};
const cache = new Map();
function jdOf(ms){return ms/86400000+2440587.5;}
function parse(txt){
  const a = txt.indexOf('$$SOE'), b = txt.indexOf('$$EOE');
  if(a<0||b<0) return null;
  const line = txt.slice(a+5,b).trim().split('\n')[0].split(',').map(s=>s.trim());
  const v = line.slice(2,8).map(Number);
  return v.every(Number.isFinite)?v:null;
}
async function one(cmd,t0,t1){
  const q = new URLSearchParams({format:'json',COMMAND:`'${cmd}'`,MAKE_EPHEM:"'YES'",EPHEM_TYPE:"'VECTORS'",CENTER:"'500@10'",START_TIME:`'${t0}'`,STOP_TIME:`'${t1}'`,STEP_SIZE:"'1m'",VEC_TABLE:"'2'",OUT_UNITS:"'KM-S'",REF_PLANE:"'ECLIPTIC'",CSV_FORMAT:"'YES'"});
  const ctl = new AbortController(); const to = setTimeout(()=>ctl.abort(),8000);
  try{
    const r = await fetch(BASE+'?'+q.toString(),{signal:ctl.signal});
    const j = await r.json();
    return parse(j.result||'');
  }catch(e){console.error("ERR",cmd,e.message);return null;}finally{clearTimeout(to);}
}
module.exports = async (req,res)=>{
  res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=300');
  res.setHeader('X-Content-Type-Options','nosniff');
  let when = new Date();
  const p = req.query && req.query.t;
  if(p!==undefined){
    if(!/^-?\d{1,14}$/.test(String(p))){res.status(400).json({error:'bad t'});return;}
    const ms = Number(p);
    // Horizons DE441 window roughly years -13000..17000; refuse outside
    const j = jdOf(ms);
    if(!(j>=100&&j<=5373000)){res.status(400).json({error:'outside served window'});return;}
    when = new Date(ms);
  }
  when = new Date(Math.floor(when.getTime()/60000)*60000);
  if(!isFinite(when.getTime())){res.status(400).json({error:'bad t'});return;}
  const g = (req.query&&req.query.g)==='b'?'b':'a';
  const key = g+when.getTime();
  if(cache.has(key)){res.status(200).json(cache.get(key));return;}
  const j0 = jdOf(when.getTime());
  const t0 = 'JD '+j0.toFixed(6), t1 = 'JD '+(j0+1/1440).toFixed(6);
  const names = GROUPS[g];
  const vals = new Array(names.length).fill(null);
  let idx = 0;
  async function worker(){ while(idx<names.length){ const i=idx++; let r=null; for(let k=0;k<4&&!r;k++){ if(k) await new Promise(z=>setTimeout(z,500*k)); r=await one(BODIES[names[i]],t0,t1);} vals[i]=r; } }
  await Promise.all([worker(),worker()]);
  const out = {source:'JPL Horizons API, DE441 (ssd.jpl.nasa.gov)',frame:'ecliptic J2000, Sun-centred (500@10)',units:'km, km/s',utc:when.toISOString(),bodies:{}};
  names.forEach((n,i)=>{ if(vals[i]) out.bodies[n]=vals[i]; });
  if(g==='a'&&!out.bodies.earth){res.status(502).json({error:'upstream'});return;}
  if(cache.size>200) cache.clear();
  cache.set(key,out);
  res.status(200).json(out);
};
