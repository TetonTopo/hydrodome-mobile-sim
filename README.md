# The Moat — Site Analysis

A passive, looping **site-identification and tower-placement film** for the
[Carmanah Wildfire](https://carmanahwildfire.com) pitch deck. It is a background
visual: no buttons, no clicking, nothing to explain. Somebody talks over it.

**Live:** https://tetontopo.github.io/hydrodome-mobile-sim/

> Replaces the interactive deployment/fire-spread simulator that used to live
> here (Penticton, 16 nodes, ignite button). The URL is unchanged so the deck
> embed on the "virtual model" slide keeps working.

## The loop

~82 seconds, seamless, then it starts over. Camera opens wide on the site and
pushes in to the line, drifting down it from T1 to T10.

| | Beat | What is on screen |
|---|---|---|
| — | The site | Esri ortho of the deployment area |
| 01 | Open data | 205 ML building footprints and 53 OSM ways draw in |
| 02 | Block-out | classified raster wipes across: structure, pavement, water, canopy, fine fuel, bare |
| 03 | The line | fire line draws along the forest edge, ten stations drop at 40 m |
| 04 | Coverage | 50 m circles bloom, covered structures light up |
| 05 | Ranking | rank badges; supply drops 10 → 6 and the lowest-ranked towers shed |
| 06 | Arc window | circles collapse to the recommended arc; wasted share 23% → 16% |
| 07 | The wet line | two of ten firing on rotation, the wetted corridor builds up |

## Where the data comes from

Everything is real, from the **Moat Block-Out v0** demo (Sept 2026, RadGeo for
Carmanah) — the site-analysis page shown at the Sept 8 engineering meeting.

- `assets/imagery.jpg` — Esri World Imagery, 0.39 m, over the Maple Bay box
- `assets/blockout.png` — the rule-based block-out raster at 0.79 m
- `site.js` — 205 Microsoft ML footprints with heights, 53 OSM ways, water,
  parks, the hand-drawn fire line, and the 10 ranked tower candidates with
  their 36 × 10° sector tables

Site is **Maple Bay, North Cowichan BC** (953 × 891 m). It is a demo site chosen
for houses, streets, shoreline and treed lots — **not a client site**.

Tower ranking is the demo's rule, unchanged: **structure covered first** (m² of
footprint inside the circle), **least waste second** (share of the circle that is
bare ground, pavement or water). Vegetation is neither rewarded nor punished.

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
