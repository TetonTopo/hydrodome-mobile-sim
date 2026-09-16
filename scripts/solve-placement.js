/* Road-snapped tower placement for The Moat site-analysis loop.
 *
 * The threat comes from the WEST, so the line stands on the westernmost
 * through-street that still has the town behind it, towers sit on the road
 * itself, and each tower's arc is trimmed to what it is actually protecting.
 * Everything is scored against the real block-out raster.
 */
const fs = require('fs');
const { readPNG } = require('./png.js');

const REPO = 'C:/Users/dk/cowork/hydrodome-mobile-sim/';
const S = JSON.parse(fs.readFileSync(REPO + 'site.js', 'utf8').replace(/^window\.SITE=/, '').replace(/;\s*$/, ''));
const SW = S.site.width_m, SH = S.site.height_m, MPP = S.site.mpp_raster;
const THROW = S.throw;                                   // 50 m

const img = readPNG(REPO + 'assets/blockout.png');
const RW = img.w, RH = img.h, G = img.data;
const CANOPY=0, WATER=1, BARE=2, PAVE=3, FUEL=4, STRUCT=5, UNK=6;
const PX_M2 = MPP * MPP;

const fy = y => SH - y;                                  // world y-up -> screen-down Y

/* ----------------------------------------------------------- sampling */
function sampleDisc(cx, cY, r, cb){
  const p0x = Math.max(0, ((cx-r)/MPP)|0), p1x = Math.min(RW-1, ((cx+r)/MPP)|0);
  const p0y = Math.max(0, ((cY-r)/MPP)|0), p1y = Math.min(RH-1, ((cY+r)/MPP)|0);
  const r2 = r*r;
  for (let py = p0y; py <= p1y; py++)
    for (let px = p0x; px <= p1x; px++) {
      const wx = (px+0.5)*MPP, wY = (py+0.5)*MPP, dx = wx-cx, dy = wY-cY;
      if (dx*dx + dy*dy > r2) continue;
      cb(G[py*RW+px], wx, wY, dx, dy, py*RW+px);
    }
}
function discStats(cx, cY){
  const n = new Array(8).fill(0);
  let tot = 0, sEast = 0, sAll = 0;
  sampleDisc(cx, cY, THROW, (c, wx, wY, dx) => {
    if (c < 0) return;
    n[c]++; tot++;
    if (c === STRUCT) { sAll++; if (dx > 0) sEast++; }
  });
  if (!tot) return null;
  return { tot, structure_m2: n[STRUCT]*PX_M2, waste: (n[PAVE]+n[WATER]+n[BARE])/tot,
           eastShare: sAll ? sEast/sAll : 0,
           fractions: { canopy:n[CANOPY]/tot, water:n[WATER]/tot, bare:n[BARE]/tot,
                        pavement:n[PAVE]/tot, fine_fuel:n[FUEL]/tot,
                        structure:n[STRUCT]/tot, unknown:n[UNK]/tot } };
}

/* ------------------------------------------------ roads in the corridor */
const CORRIDOR = [40, 250];                              // western streets
const SAMPLE_M = 6;
const roads = new Map();
for (const rd of S.roads) {
  if (rd.cls === 'path' || rd.cls === 'track' || rd.cls === 'steps' || rd.cls === 'footway') continue;
  const name = rd.name || '(unnamed ' + rd.cls + ')';
  for (let i = 1; i < rd.pts.length; i++) {
    const AX = rd.pts[i-1][0], AY = fy(rd.pts[i-1][1]);
    const BX = rd.pts[i][0],   BY = fy(rd.pts[i][1]);
    const len = Math.hypot(BX-AX, BY-AY), steps = Math.max(1, Math.round(len/SAMPLE_M));
    for (let s = 0; s <= steps; s++) {
      const f = s/steps, x = AX+(BX-AX)*f, Y = AY+(BY-AY)*f;
      if (x < CORRIDOR[0] || x > CORRIDOR[1] || Y < 10 || Y > SH-10) continue;
      if (!roads.has(name)) roads.set(name, []);
      const arr = roads.get(name);
      if (arr.length && Math.hypot(arr[arr.length-1].x-x, arr[arr.length-1].Y-Y) < SAMPLE_M*0.6) continue;
      arr.push({ x, Y, road: name, cls: rd.cls });
    }
  }
}

/* ------------- pick the line: westernmost north-south street with a town
   behind it. That is the whole strategic rule for a threat out of the west. */
const MIN_RUN = 180, MAX_WANDER = 45, MIN_STRUCT = 120;
let pick = null;
for (const [name, ptsRaw] of roads) {
  const pts = ptsRaw.slice().sort((a,b) => a.Y-b.Y);
  const yRun = pts[pts.length-1].Y - pts[0].Y;
  const xs = pts.map(p => p.x);
  const wander = Math.max(...xs) - Math.min(...xs);
  if (yRun < MIN_RUN || wander > MAX_WANDER) continue;   // must run north-south
  for (const p of pts) Object.assign(p, discStats(p.x, p.Y));
  const useful = pts.filter(p => p.structure_m2 >= MIN_STRUCT && p.eastShare >= 0.55);
  if (useful.length < 8) continue;                       // not enough town behind it
  const meanX = xs.reduce((a,b)=>a+b,0)/xs.length;
  const cand = { name, pts, useful, yRun, meanX,
                 bestStruct: Math.max(...pts.map(p => p.structure_m2)) };
  console.log('line candidate:', name.padEnd(20),
    'run', Math.round(yRun)+' m', ' x~'+Math.round(meanX),
    ' usable pts', useful.length, ' best', Math.round(cand.bestStruct)+' m2');
  if (!pick || meanX < pick.meanX) pick = cand;          // westernmost wins
}
if (!pick) { console.error('no north-south line found in the corridor'); process.exit(1); }
console.log('\nchosen line:', pick.name, '(westernmost through-street with the town behind it)\n');

/* ------------------ place towers along that road: spacing 48-78 m, value =
   structure this tower adds that its neighbour does not already cover, less
   the share of its circle thrown at pavement, water or bare ground. */
const MIN_SEP = 45, MAX_SEP = 70, WASTE_W = 1200;
const line = pick.pts.filter(p => p.structure_m2 >= 60).sort((a,b) => a.Y - b.Y);

// marginal value of standing here, given what the line already wets
const wetted = new Set();
function marginal(p){
  let gain = 0, tot = 0, waste = 0;
  sampleDisc(p.x, p.Y, THROW, (c, wx, wY, dx, dy, idx) => {
    if (c < 0) return;
    tot++;
    if (c === PAVE || c === WATER || c === BARE) waste++;
    if (c === STRUCT && !wetted.has(idx)) gain++;
  });
  return { gain: gain*PX_M2, waste: tot ? waste/tot : 1 };
}
function commit(p){
  sampleDisc(p.x, p.Y, THROW, (c, wx, wY, dx, dy, idx) => { if (c === STRUCT) wetted.add(idx); });
}

// first tower: the best spot in the northern end of the road
const chosen = [];
{
  const head = line.filter(p => p.Y <= line[0].Y + 55);
  let best = head[0];
  for (const p of head) {
    const m = marginal(p), bm = marginal(best);
    if (m.gain - WASTE_W*m.waste > bm.gain - WASTE_W*bm.waste) best = p;
  }
  chosen.push(best); commit(best);
}
// then walk south, each step taking the most new structure per unit waste
for (;;) {
  const last = chosen[chosen.length-1];
  const reach = line.filter(p => p.Y >= last.Y + MIN_SEP && p.Y <= last.Y + MAX_SEP);
  if (!reach.length) break;
  let best = null, bestV = -1e9;
  for (const p of reach) {
    const m = marginal(p);
    const v = m.gain - WASTE_W*m.waste;
    if (v > bestV) { bestV = v; best = p; best.gain = m.gain; }
  }
  if (!best) break;
  chosen.push(best); commit(best);
}
console.log('towers placed:', chosen.length, ' spacing',
  chosen.slice(1).map((t,k) => Math.round(t.Y - chosen[k].Y)).join(', '), 'm');

/* ---------------------------------------------- recommended arc window */
const NS = 36, SEC = 360/NS;
function sectors(t){
  const rows = Array.from({length:NS}, (_,s) => ({ a0:s*SEC, n:new Array(8).fill(0), tot:0 }));
  sampleDisc(t.x, t.Y, THROW, (c, wx, wY, dx, dy) => {
    if (c < 0) return;
    let b = Math.atan2(dx, -dy)*180/Math.PI;             // 0 = north, clockwise
    if (b < 0) b += 360;
    const r = rows[Math.min(NS-1, (b/SEC)|0)];
    r.n[c]++; r.tot++;
  });
  return rows.map(r => ({ a0:r.a0, structure_m2:r.n[STRUCT]*PX_M2,
                          waste: r.tot ? (r.n[PAVE]+r.n[WATER]+r.n[BARE])/r.tot : 0, tot:r.tot }));
}
// A Nelson part-circle gun is set by hand with two reverse stops, so the
// recommendation has to be a setting somebody would actually dial in: at least a
// quadrant, never more than three quarters, keeping ~90% of the structure.
const MIN_SPAN_DEG = 90, MAX_SPAN_DEG = 270, KEEP_STRUCT = 0.90;
function bestArc(rows, total){
  const all = () => { let w=0,t=0; for (const r of rows){ w+=r.waste*r.tot; t+=r.tot; } return t?w/t:0; };
  let best = null;
  const fullWaste = all();
  for (let st = 0; st < NS; st++) {
    let sSum=0, wSum=0, tSum=0;
    for (let L = 1; L <= NS; L++) {
      const r = rows[(st+L-1)%NS];
      sSum += r.structure_m2; wSum += r.waste*r.tot; tSum += r.tot;
      const span = L*SEC;
      if (span > MAX_SPAN_DEG) break;
      if (span < MIN_SPAN_DEG) continue;
      if (total > 0 && sSum < total*KEEP_STRUCT) continue;
      const c = { start:st*SEC, span, structure_capture: total>0 ? sSum/total : 1,
                  waste: tSum?wSum/tSum:0 };
      // least waste first, then the narrowest arc that ties
      if (!best || c.waste < best.waste - 0.005 ||
          (Math.abs(c.waste - best.waste) <= 0.005 && c.span < best.span)) best = c;
      break;                                   // narrowest window from this start
    }
  }
  // nothing satisfies the structure rule inside 270 deg: fall back to the circle
  return best || { start:0, span:360, structure_capture:1, waste:fullWaste };
}

/* --------------------------------------------------- overlap: circle vs arc */
function inArc(t, wx, wY){
  let b = Math.atan2(wx-t.x, -(wY-t.Y))*180/Math.PI;
  if (b < 0) b += 360;
  let rel = b - t.arc.start;
  if (rel < 0) rel += 360;
  return rel <= t.arc.span;
}
function overlapShare(useArc){
  const once = new Set(), twice = new Set();
  for (const t of chosen)
    sampleDisc(t.x, t.Y, THROW, (c, wx, wY, dx, dy, idx) => {
      if (useArc && !inArc(t, wx, wY)) return;
      if (once.has(idx)) twice.add(idx); else once.add(idx);
    });
  return { share: twice.size/Math.max(1, once.size), area: once.size*PX_M2 };
}

/* ------------------------------------------------------------- assemble */
const towers = chosen.map((t, i) => {
  const rows = sectors(t);
  const arc = bestArc(rows, t.structure_m2);
  t.arc = arc;
  let nb = 0;
  for (const b of S.buildings) {
    const r = b.pts; let cx=0, cY=0;
    for (let j=0;j<r.length-1;j++){ cx += r[j][0]; cY += fy(r[j][1]); }
    const n = Math.max(1, r.length-1);
    if (Math.hypot(cx/n - t.x, cY/n - t.Y) <= THROW) nb++;
  }
  return {
    id: i+1, x: +t.x.toFixed(1), y: +(SH - t.Y).toFixed(1), road: t.road,
    structure_m2: Math.round(t.structure_m2), structures: nb,
    waste_full: +t.waste.toFixed(3), waste_arc: +arc.waste.toFixed(3),
    arc: { start: arc.start, span: arc.span, structure_capture: +arc.structure_capture.toFixed(3) },
    fractions: Object.fromEntries(Object.entries(t.fractions).map(([k,v]) => [k, +v.toFixed(3)])),
    sectors: rows.map(r => ({ a0:r.a0, s:Math.round(r.structure_m2), w:+r.waste.toFixed(2) }))
  };
});

const ovC = overlapShare(false), ovA = overlapShare(true);
console.log('\n  id  road                 x      y    struct m2 bldgs  waste   arc         keep   waste(arc)');
for (const t of towers)
  console.log('  T'+String(t.id).padEnd(3), t.road.padEnd(18),
    String(t.x).padStart(6), String(t.y).padStart(7),
    String(t.structure_m2).padStart(8), String(t.structures).padStart(5),
    t.waste_full.toFixed(2).padStart(7),
    (t.arc.start+'\u00b0/'+t.arc.span+'\u00b0').padStart(11),
    ((t.arc.structure_capture*100).toFixed(0)+'%').padStart(6),
    t.waste_arc.toFixed(2).padStart(10));

const mf = towers.reduce((a,t)=>a+t.waste_full,0)/towers.length;
const ma = towers.reduce((a,t)=>a+t.waste_arc,0)/towers.length;
let covered = 0; { const seen = new Set();
  for (const t of chosen) sampleDisc(t.x, t.Y, THROW, (c,wx,wY,dx,dy,idx)=>{ if(c===STRUCT) seen.add(idx); });
  covered = Math.round(seen.size*PX_M2); }

console.log('\nmean wasted share   full circle', mf.toFixed(3), '  recommended arc', ma.toFixed(3));
console.log('double-covered ground (circles)', (ovC.share*100).toFixed(0)+'%');
console.log('sprayed area   circles', Math.round(ovC.area), 'm2  ->  arcs', Math.round(ovA.area), 'm2  (', Math.round((1-ovA.area/ovC.area)*100)+'% less )');
console.log('structure covered', covered, 'm2');

fs.writeFileSync(__dirname + '/placement.json', JSON.stringify({
  towers,
  line_road: pick.name,
  line_geom: S.roads.filter(rd => (rd.name || '') === pick.name)
                    .map(rd => rd.pts.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)])),
  sprayed_circles_m2: Math.round(ovC.area),
  sprayed_arcs_m2: Math.round(ovA.area),
  threat: { from_deg: 270, label: 'west' },
  overlap_circles: +ovC.share.toFixed(3),
  overlap_arcs: +ovA.share.toFixed(3),
  structure_covered_m2: covered,
  mean_waste_full: +mf.toFixed(3),
  mean_waste_arc: +ma.toFixed(3)
}, null, 1));
console.log('\nwrote placement.json');
