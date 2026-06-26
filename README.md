# HydroDome — Mobile Deployment Simulator

A browser-based deployment/coverage simulator for the HydroDome **mobile
(trailer-deployed)** wildfire-defense system, by
[Carmanah Wildfire](https://carmanahwildfire.com).

> **Status: v0 starter.** A clean, mobile-correct foundation that replaces the
> archived permanent-system sims in
> [`hydrodome-sim`](https://github.com/TetonTopo/hydrodome-sim). It is a visual
> tool for the slide deck — animated, not a calibrated engineering model.

**Live:** https://tetontopo.github.io/hydrodome-mobile-sim/

## What it shows

Mapped on the pilot site (West Fraser Quesnel sawmill, 52.9974°N / -122.5017°W):

- A **forest-edge deployment** at the wildland-urban interface: the fire
  originates in the forest to the south, the system holds the tree line, and the
  town to the north is defended proactively (not a town being overrun).
- **Two trailers** laid along the interface frontage, together feeding **16
  sprinkler nodes** (8 per trailer) across a wide community-scale wet line —
  each a 6 m tower with a ~55 m wetted footprint.
- **Sequential firing** — each trailer runs **4 of its 8 sprinklers at a time**
  (two interleaved banks, 8 active scene-wide); the active bank cycles on a
  dwell timer while the full frontage stays wet.
- Live **nozzle-pressure (~70 PSI setpoint)**, active flow, trailer-tank
  drawdown, two-pump status, and a ~10% **site-grade / static-lift** note.
- A **smart-water (weather → fire-weather index)** placeholder — future hook,
  shown but not modulating.

## Why a fresh start (not a fork)

The permanent sims bake their assumptions deep into a municipal water-main
hydraulic model and an all-towers-on / zone-rotation firing model. Retrofitting
them is a hydraulic-core rewrite touching ~8 functions per file across three
duplicated lineages. See
[`hydrodome-sim/MIGRATION-NOTES.md`](https://github.com/TetonTopo/hydrodome-sim/blob/main/MIGRATION-NOTES.md)
for the full investigation. The **Quesnel** lineage was the leanest engine and
the named pilot, so it's the reference basis for this rebuild.

## Tech

Single self-contained `index.html` — Leaflet + a small vanilla-JS loop that
drives the firing sequencer and telemetry. No build step.

## Related

- [`hydrodome-mobile-command`](https://github.com/TetonTopo/hydrodome-mobile-command) — mobile SCADA / C2 dashboard.
- [`hydrodome-sim`](https://github.com/TetonTopo/hydrodome-sim) — archived permanent-system sims.

---
HYDRODOME™ Mobile · by Carmanah Wildfire
