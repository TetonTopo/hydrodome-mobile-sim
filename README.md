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

The copy on screen stays general on purpose: no counts, no street names, no site
name except in the footer. The picture carries the detail.

| | Beat | What is on screen |
|---|---|---|
| — | The site | Esri ortho of the deployment area |
| 01 | Open data | 205 ML building footprints and 53 OSM ways draw in |
| 02 | Block-out | classified raster wipes across: structure, pavement, water, canopy, fine fuel, bare |
| 03 | The threat | the wildland band and the fire pushing out of the west |
| 04 | The line | the street highlights, five stations drop **on the road** |
| 05 | Coverage | 50 m circles bloom, covered structures light up |
| 06 | Ranking | rank badges; supply drops and the lowest-ranked towers shed |
| 07 | The sweep | every sector scored, then the stops close onto the ground worth wetting |
| 08 | The wet line | two towers at a time on rotation, the wetted corridor builds up |

## How the placement is decided

Not hand-drawn. `scripts/solve-placement.js` reads the block-out PNG and the road
network and writes the result into `site.js`. The rules, in order:

1. **The threat sets the geometry.** Fire out of the west means the line goes
   between the wildland and the town.
2. **Stand on a road.** Candidate positions are sampled every 6 m along the real
   OSM road centrelines — towers land on the street, not in back yards.
3. **Pick the street.** The westernmost north-south through-street with enough of
   the town behind it; the runner-up sits a block further east.
4. **Space by marginal coverage.** Walking south, each station takes the spot that
   adds the most *new* structure per unit of wasted circle, at 45–70 m. That is
   what stops the circles overlapping where they do not need to.
5. **Solve the sweep.** A part-circle gun sweeps one contiguous window between two
   reverse stops, so the free variables per tower are where it starts and how wide
   it is — and they are worth solving, because the ground inside a circle is not
   all worth the same water:

   | | per m² |
   |---|---|
   | a house — the thing we are here for | **+1.00** |
   | canopy and fine fuel — what carries fire into it | **+0.35** |
   | pavement, open water, bare ground — nothing to protect | **−0.60** |

   Ground a neighbour already wets is worth a quarter of its value, so the line
   spreads out instead of everybody pointing at the same block. Windows are solved
   by coordinate descent — each tower re-picks its best window given what the others
   currently cover — until nothing moves. Spans land between 90° and 270°, what two
   reverse stops can actually be set to.

Against the same five towers spraying full circles:

| | full circles | optimised sweeps |
|---|---|---|
| ground wetted | 32,010 m² | **25,521 m²** (20% less) |
| structure in it | 1,797 m² | 1,593 m² (**89% kept**) |
| vegetation in it | 20,215 m² | 18,412 m² (**91% kept**) |
| pavement / open ground | 9,120 m² | 4,808 m² (**47% dropped**) |
| wasted share | 28% | **19%** |
| double-covered | 23% | **2%** |

The loop shows the scoring before the cut: a ring of 10° sectors around each
circle, green where the ground is worth wetting and red where it is not, and then
the stops close onto the green.

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

`window.__moat` exposes `seek(seconds)`, `step(seconds)`, `play()`, `restart()`
and `now()` for checking a particular beat. It is inert otherwise.

**Embedding.** `?chrome=0` hides the brand lockup and footer so a slide can carry
the title. The film also listens for `postMessage({moat:'restart'})`, which the
deck fires on `slidechanged` so returning to the slide starts the loop from the
top instead of dropping you mid-way through.
