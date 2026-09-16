# The Moat — Site Analysis

A passive, looping **site-identification and tower-placement film** for the
[Carmanah Wildfire](https://carmanahwildfire.com) pitch deck. It is a background
visual: no buttons, no clicking, nothing to explain. Somebody talks over it.

**Live:** https://tetontopo.github.io/hydrodome-mobile-sim/

> Replaces the interactive deployment/fire-spread simulator that used to live
> here (Penticton, 16 nodes, ignite button). The URL is unchanged so the deck
> embed keeps working.

## The loop

~88 seconds, seamless, then it starts over. The camera opens wide on the site
and pans west onto the line as the threat appears.

| | Beat | What is on screen |
|---|---|---|
| — | The site | Esri ortho of the deployment area |
| 01 | Open data | 205 ML building footprints and 53 OSM ways draw in |
| 02 | Block-out | classified raster wipes across: structure, pavement, water, canopy, fine fuel, bare |
| 03 | The threat | the wildland band and the fire pushing out of the west |
| 04 | The line | Considine Avenue highlights, five stations drop **on the road** |
| 05 | Coverage | 50 m circles bloom, covered structures light up |
| 06 | Ranking | rank badges; supply drops and the lowest-ranked towers shed |
| 07 | Arc window | circles collapse to the recommended arc; 46% less ground sprayed |
| 08 | The wet line | two towers at a time on rotation, the wetted corridor builds up |

## How the placement is decided

Not hand-drawn. `scripts/` in the commit history has the solver; the result is
baked into `site.js`. The rules, in order:

1. **The threat sets the geometry.** Fire out of the west means the line goes
   between the wildland and the town.
2. **Stand on a road.** Candidate positions are sampled every 6 m along the real
   OSM road centrelines — towers land on the street, not in back yards.
3. **Pick the street.** The westernmost north-south through-street with enough
   of the town behind it. Here that is **Considine Avenue** (274 m run, 25
   usable stations); Elkington Avenue is the runner-up and sits further east.
4. **Space by marginal coverage.** Walking south, each station takes the spot
   that adds the most *new* structure per unit of wasted circle, at 45–70 m.
   That is what stops the circles overlapping where they do not need to —
   the five chosen stations land 47–68 m apart with 27% double-covered ground.
5. **Trim the arc.** Each tower's 36 × 10° sector table is scored against the
   block-out; the recommendation is the least-wasteful window that still keeps
   90% of the structure, constrained to **90°–270°** because a Nelson part-circle
   gun is set by hand with two reverse stops and nobody dials in a 30° sliver.

Result: mean wasted share **29.5% → 24.4%**, and **46% less ground sprayed**
(30,923 m² of circles → 16,662 m² of arcs) for the same structure covered.

"Waste" is pavement, open water and bare ground. Vegetation is neither rewarded
nor punished at the placement stage — that is the doctrine from the block-out
write-up, not an accident.

## Where the data comes from

Everything is real, from the **Moat Block-Out v0** demo (Sept 2026, RadGeo for
Carmanah) — the site-analysis page shown at the Sept 8 engineering meeting.

- `assets/imagery.jpg` — Esri World Imagery, 0.39 m, over the Maple Bay box
- `assets/blockout.png` — the block-out raster at 0.79 m, 4-bit indexed, one
  palette entry per class
- `site.js` — 205 Microsoft ML footprints with heights, 53 OSM ways, water,
  parks, the chosen road, and the five towers with their sector tables

Site is **Maple Bay, North Cowichan BC** (953 × 891 m). It is a demo site chosen
for houses, streets, shoreline and treed lots — **not a client site**.

The wildland band off the west edge of the imagery is an **annotation**, not
terrain: the site box is a crop, and the band is where the threat label and
arrows live.

The camera-coverage-check and thermal-hotspot steps from the original demo are
**not** included here, because they were simulated and a background loop has no
room to say so.

## Conventions

The Moat is a **line** of towers — not a ring, a perimeter loop or an enclosure.
Per-tower coverage is still a "circle".

## Local preview

```
npx serve -l 4178 .
```

Or use the `mobile-sim` config in `../.claude/launch.json`.

`window.__moat` exposes `seek(seconds)`, `step(seconds)` and `play()` for
checking a particular beat. It is inert otherwise.
