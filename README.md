# Saltline SEQ

A first-person 3D fishing game set on four south-east Queensland spots: Shorncliffe Pier, Woody Point Jetty, The Spit Seaway and Mooloolaba Spit.

- Walk the pier, cast a float, strike on the bite and fight the fish with a line-tension meter.
- 21 catchable species plus reef fish to spot, drawn with the procedural fish engine from SEQ Aquarium.
- Every catch is checked against Queensland tidal size and possession limits (checked 15 Oct 2026).
- Live wind, waves, air temperature, cloud and tide from Open-Meteo, with a simulated fallback.
- Take the hire tinnie out to deeper water for kingfish, mackerel, cobia and mahi-mahi.
- Boat hire panel with advertised self-drive hire prices near each spot, each with its source and check date.

## Run

Static site, no build step needed to serve: open `index.html`. To rebuild after editing `src/`:

```
node build.js
```

## Deploy on Vercel

Import this repo in Vercel. Framework preset: Other. No build command, output directory is the repo root.

## Data notes

Boat hire companies do not publish a live price feed. Prices are advertised rates, each labelled with where and when they were checked; update `HIRE` in `src/03_data.js`. Fishing rules come from the Queensland Government tidal limits page; update `RULES` when they change. Place geometry is stylised, not surveyed.
