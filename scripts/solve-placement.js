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
// only stand where the town is genuinely behind you — that is what makes an
// east-facing sweep worth setting in the first place
const line = pick.pts.filter(p => p.structure_m2 >= 60 && p.eastShare >= 0).sort((a,b) => a.Y - b.Y);

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

// first tower: hold the north end of the run
const chosen = [];
chosen.push(line[0]); commit(line[0]);

// then walk south, each step taking the most new structure per unit waste.
// If the street has a stretch with nothing worth defending behind it, step over it
// rather than ending the line — a real deployment skips a block.
const STRETCH = 115;
for (;;) {
  const last = chosen[chosen.length-1];
  let reach = line.filter(p => p.Y >= last.Y + MIN_SEP && p.Y <= last.Y + MAX_SEP);
  if (!reach.length) reach = line.filter(p => p.Y > last.Y + MAX_SEP && p.Y <= last.Y + STRETCH);
  if (!reach.length) break;
  let best = null, bestV = -1e9;
  for (const p of reach) {
    const m = marginal(p);
    const v = m.gain - WASTE_W*m.waste;
    if (v > bestV) { bestV = v; best = p; }
  }
  if (!best) break;
  chosen.push(best); commit(best);
}
console.log('towers placed:', chosen.length, ' spacing',
  chosen.slice(1).map((t,k) => Math.round(t.Y - chosen[k].Y)).join(', '), 'm');

/* ------------------------------------------------ the sweep, optimised
 * A part-circle gun sweeps one contiguous window between two reverse stops. So the
 * only free variables per tower are where the window starts and how wide it is —
 * and those are worth solving, because the ground inside a 50 m circle is not all
 * worth the same water:
 *
 *   a house            the thing we are here for                 +1.00 / m2
 *   canopy, fine fuel  the fuel that carries fire into it        +0.35 / m2
 *   pavement, water    nothing to protect, water straight down   -0.60 / m2
 *   bare ground        same                                      -0.60 / m2
 *
 * and ground a neighbour already wets is worth a quarter of its value, so the line
 * spreads out instead of everybody pointing at the same block. Windows are solved
 * by coordinate descent: each tower re-picks its best window given what the others
 * currently cover, repeated until nothing moves.
 */
const NS = 36, SEC = 360/NS;
const W_STRUCT = 1.00, W_VEG = 0.35, W_WASTE = -0.60, OVERLAP_KEEP = 0.25;
const SPAN_MIN = 90, SPAN_MAX = 270;                     // real reverse-stop settings

function pixelWorth(c){
  if (c === STRUCT) return W_STRUCT;
  if (c === CANOPY || c === FUEL) return W_VEG;
  if (c === PAVE || c === WATER || c === BARE) return W_WASTE;
  return 0;                                              // unclassified: no opinion
}
function bearingOf(dx, dy){
  let b = Math.atan2(dx, -dy)*180/Math.PI;               // 0 = north, clockwise
  return b < 0 ? b+360 : b;
}
function inWindow(t, wx, wY){
  if (!t.win) return false;
  let rel = bearingOf(wx-t.x, wY-t.Y) - t.win.start;
  if (rel < 0) rel += 360;
  return rel < t.win.span;
}

// every pixel of every tower's disc, bucketed by sector, kept for the whole solve
const discs = chosen.map(t => {
  const px = [];
  sampleDisc(t.x, t.Y, THROW, (c, wx, wY, dx, dy, idx) => {
    if (c < 0) return;
    px.push({ idx, wx, wY, cls: c, worth: pixelWorth(c),
              sec: Math.min(NS-1, (bearingOf(dx, dy)/SEC)|0) });
  });
  return px;
});

function solveWindows(){
  chosen.forEach(t => { t.win = { start: 0, span: 360 }; });   // start from the circle
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let i = 0; i < chosen.length; i++) {
      const t = chosen[i];
      // what each of this tower's sectors is worth right now
      const val = new Array(NS).fill(0);
      for (const p of discs[i]) {
        let others = 0;
        for (let j = 0; j < chosen.length; j++)
          if (j !== i && Math.hypot(p.wx-chosen[j].x, p.wY-chosen[j].Y) <= THROW
              && inWindow(chosen[j], p.wx, p.wY)) others++;
        const share = others ? OVERLAP_KEEP : 1;
        // waste is waste however many towers hit it; only the credit is shared
        val[p.sec] += (p.worth > 0 ? p.worth*share : p.worth) * PX_M2;
      }
      let best = null;
      for (let st = 0; st < NS; st++) {
        let sum = 0;
        for (let L = 1; L <= NS; L++) {
          sum += val[(st+L-1)%NS];
          const span = L*SEC;
          if (span < SPAN_MIN || span > SPAN_MAX) continue;
          if (!best || sum > best.score) best = { start: st*SEC, span, score: sum };
        }
      }
      if (!best) best = { start: 0, span: 180, score: 0 };
      if (!t.win || t.win.start !== best.start || t.win.span !== best.span) moved = true;
      t.win = best;
      t.secVal = val;
    }
    if (!moved) break;
  }
}
solveWindows();

// per-tower report against the window it ended up with
function windowStats(i){
  const t = chosen[i];
  const n = new Array(8).fill(0);
  let tot = 0;
  for (const p of discs[i]) {
    if (!inWindow(t, p.wx, p.wY)) continue;
    n[p.cls]++; tot++;
  }
  return { tot_m2: tot*PX_M2,
           structure_m2: n[STRUCT]*PX_M2,
           veg_m2: (n[CANOPY]+n[FUEL])*PX_M2,
           waste: tot ? (n[PAVE]+n[WATER]+n[BARE])/tot : 0 };
}

/* ----------------------------------------- what the circles vs the sweeps cost */
function ground(useWindow){
  const once = new Set(), twice = new Set(), byCls = new Array(8).fill(0);
  chosen.forEach((t, i) => {
    for (const p of discs[i]) {
      if (useWindow && !inWindow(t, p.wx, p.wY)) continue;
      if (once.has(p.idx)) { twice.add(p.idx); continue; }
      once.add(p.idx); byCls[p.cls]++;
    }
  });
  return { area: once.size*PX_M2, overlap: twice.size/Math.max(1, once.size),
           structure: byCls[STRUCT]*PX_M2,
           veg: (byCls[CANOPY]+byCls[FUEL])*PX_M2,
           waste: (byCls[PAVE]+byCls[WATER]+byCls[BARE])*PX_M2 };
}
const gC = ground(false), gW = ground(true);

/* ------------------------------------------------------------- assemble */
const towers = chosen.map((t, i) => {
  const st = windowStats(i);
  let nb = 0;
  for (const b of S.buildings) {
    const r = b.pts; let cx=0, cY=0;
    for (let j=0;j<r.length-1;j++){ cx += r[j][0]; cY += fy(r[j][1]); }
    const n = Math.max(1, r.length-1);
    if (Math.hypot(cx/n - t.x, cY/n - t.Y) <= THROW) nb++;
  }
  // sector worth, normalised, so the page can draw why the window sits where it does
  const peak = Math.max(1, ...t.secVal.map(Math.abs));
  return {
    id: i+1, x: +t.x.toFixed(1), y: +(SH - t.Y).toFixed(1), road: t.road,
    structure_m2: Math.round(t.structure_m2), structures: nb,
    waste_full: +t.waste.toFixed(3), waste_arc: +st.waste.toFixed(3),
    arc: { start: t.win.start, span: t.win.span },
    kept: { structure_m2: Math.round(st.structure_m2), veg_m2: Math.round(st.veg_m2),
            area_m2: Math.round(st.tot_m2) },
    fractions: Object.fromEntries(Object.entries(t.fractions).map(([k,v]) => [k, +v.toFixed(3)])),
    sectors: t.secVal.map((v, k) => ({ a0: k*SEC, v: +(v/peak).toFixed(3) }))
  };
});

console.log('');
console.log('  id   x      y     window        ground   structure    veg    waste');
for (const t of towers)
  console.log('  T'+String(t.id).padEnd(3),
    String(t.x).padStart(5), String(t.y).padStart(6),
    (t.arc.start+'° +'+t.arc.span+'°').padStart(12),
    (t.kept.area_m2+' m2').padStart(10),
    (t.kept.structure_m2+' m2').padStart(10),
    (t.kept.veg_m2+' m2').padStart(9),
    (Math.round(t.waste_arc*100)+'%').padStart(7));

const pct = (x,y) => Math.round(x/y*100);
console.log('');
console.log('                 full circles      optimised sweeps');
console.log('ground wetted  ', String(Math.round(gC.area)+' m2').padEnd(18),
            Math.round(gW.area)+' m2  (' + pct(gC.area-gW.area, gC.area) + '% less)');
console.log('  structure    ', String(Math.round(gC.structure)+' m2').padEnd(18),
            Math.round(gW.structure)+' m2  (' + pct(gW.structure, gC.structure) + '% kept)');
console.log('  vegetation   ', String(Math.round(gC.veg)+' m2').padEnd(18),
            Math.round(gW.veg)+' m2  (' + pct(gW.veg, gC.veg) + '% kept)');
console.log('  pavement/open', String(Math.round(gC.waste)+' m2').padEnd(18),
            Math.round(gW.waste)+' m2  (' + pct(gC.waste-gW.waste, gC.waste) + '% dropped)');
console.log('wasted share   ', String(pct(gC.waste, gC.area)+'%').padEnd(18), pct(gW.waste, gW.area)+'%');
console.log('double-covered ', String(pct(gC.overlap*100,100)+'%').padEnd(18), pct(gW.overlap*100,100)+'%');

const mf = gC.waste/gC.area, ma = gW.waste/gW.area;
fs.writeFileSync(__dirname + '/placement.json', JSON.stringify({
  towers,
  line_road: pick.name,
  line_geom: S.roads.filter(rd => (rd.name || '') === pick.name)
                    .map(rd => rd.pts.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)])),
  threat: { from_deg: 270, label: 'west' },
  sprayed_circles_m2: Math.round(gC.area),
  sprayed_arcs_m2: Math.round(gW.area),
  overlap_circles: +gC.overlap.toFixed(3),
  overlap_arcs: +gW.overlap.toFixed(3),
  structure_circles_m2: Math.round(gC.structure),
  structure_arcs_m2: Math.round(gW.structure),
  veg_circles_m2: Math.round(gC.veg),
  veg_arcs_m2: Math.round(gW.veg),
  waste_circles_m2: Math.round(gC.waste),
  waste_arcs_m2: Math.round(gW.waste),
  structure_covered_m2: Math.round(gC.structure),
  mean_waste_full: +mf.toFixed(3),
  mean_waste_arc: +ma.toFixed(3),
  efficiency_gain: +((gW.structure/gW.area)/(gC.structure/gC.area)).toFixed(2)
}, null, 1));
console.log('');
console.log('wrote placement.json');
