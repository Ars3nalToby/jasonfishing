/* ======================================================================
   GAME DATA: spots, catchable species, Qld rules, boat hire
   ====================================================================== */
const CHECKED = '15 Oct 2026';
const RULES_SRC = 'https://www.qld.gov.au/recreation/activities/boating-fishing/rec-fishing/rules/limits-tidal';

/* Qld tidal size and possession limits, read from the Qld Government page on CHECKED.
   min/max in cm; bag = possession limit; note = extra rule text. src: 'qld' = from that page,
   'none' = not listed there (game falls back to release). */
const RULES = {
  flathead: { min: 40, max: 75, bag: 5, src: 'qld' },
  bream: { min: 25, bag: 30, note: 'Combined 30 with pikey bream and tarwhine', src: 'qld' },
  snapper: { min: 35, bag: 4, note: '4 per person, max 1 over 70 cm. Closed season applies', src: 'qld' },
  mulloway: { min: 75, bag: 2, src: 'qld' },
  tailor: { min: 35, bag: 20, src: 'qld' },
  mackerel: { min: 75, bag: 1, note: 'East coast: 1 per person. Closed seasons apply', src: 'qld' },
  kingfish: { min: 60, bag: 2, src: 'qld' },
  trevally: { bag: 20, note: 'No size limit. Combined 20 across trevally', src: 'qld' },
  cobia: { min: 75, bag: 2, src: 'qld' },
  jack: { min: 35, bag: 5, src: 'qld' },
  luderick: { min: 30, bag: 10, src: 'qld' },
  mullet: { min: 30, bag: 20, src: 'qld' },
  whiting: { min: 23, bag: 30, note: 'Combined 30 with goldenline and northern whiting', src: 'qld' },
  mahi: { min: 50, bag: 5, src: 'qld' },
  garfish: { bag: 50, note: 'No size limit. Combined 50 across garfish', src: 'qld' },
  groper: { bag: 20, note: 'Not listed by name. General limit of 20 for unlisted tidal species', src: 'qld' },
  greynurse: { noTake: true, note: 'No take. Release immediately', src: 'qld' },
  toadfish: { release: true, note: 'Toxic, not for eating. Not on the limits page', src: 'none' },
  wobbegong: { release: true, note: 'Rules not checked for this game. Released by default', src: 'none' },
  eagleray: { release: true, note: 'Rules not checked for this game. Released by default', src: 'none' },
  shovelnose: { release: true, note: 'Rules not checked for this game. Released by default', src: 'none' }
};

/* Gameplay tuning (approximate, for play): size range cm, pull 0..1, weight factor, where it bites */
const GAME = {
  whiting:   { cm: [18, 36], pull: 0.22, wf: 0.8, zone: 'shallow' },
  bream:     { cm: [18, 38], pull: 0.32, wf: 1.25, zone: 'any' },
  flathead:  { cm: [30, 82], pull: 0.45, wf: 0.75, zone: 'any' },
  tailor:    { cm: [25, 62], pull: 0.52, wf: 0.95, zone: 'any' },
  garfish:   { cm: [20, 35], pull: 0.15, wf: 0.25, zone: 'shallow' },
  mullet:    { cm: [25, 50], pull: 0.36, wf: 1.0, zone: 'any' },
  luderick:  { cm: [22, 42], pull: 0.36, wf: 1.2, zone: 'any' },
  toadfish:  { cm: [10, 22], pull: 0.1, wf: 1.5, zone: 'any' },
  snapper:   { cm: [25, 82], pull: 0.62, wf: 1.35, zone: 'deep' },
  mulloway:  { cm: [50, 120], pull: 0.78, wf: 0.95, zone: 'deep' },
  trevally:  { cm: [35, 90], pull: 0.8, wf: 1.3, zone: 'deep' },
  jack:      { cm: [25, 55], pull: 0.72, wf: 1.3, zone: 'any' },
  groper:    { cm: [30, 80], pull: 0.7, wf: 1.5, zone: 'deep' },
  kingfish:  { cm: [50, 110], pull: 0.95, wf: 1.1, zone: 'boat' },
  mackerel:  { cm: [70, 130], pull: 0.92, wf: 0.75, zone: 'boat' },
  cobia:     { cm: [60, 130], pull: 0.88, wf: 1.0, zone: 'boat' },
  mahi:      { cm: [50, 120], pull: 0.85, wf: 0.8, zone: 'boat' },
  greynurse: { cm: [150, 250], pull: 1.0, wf: 0.7, zone: 'boat' },
  wobbegong: { cm: [80, 160], pull: 0.6, wf: 0.8, zone: 'deep' },
  eagleray:  { cm: [80, 180], pull: 0.82, wf: 1.6, zone: 'deep' },
  shovelnose:{ cm: [60, 140], pull: 0.55, wf: 0.9, zone: 'any' }
};

/* Four real SEQ spots. Coordinates are approximate (used for live weather only).
   bite weights are game balance, informed by what is commonly caught there. */
const SPOTS = [
  {
    id: 'shorncliffe', name: 'Shorncliffe Pier', region: 'Brisbane', lat: -27.328, lon: 153.088,
    blurb: 'Long timber pier on Bramble Bay, lined with Norfolk pines. Calm water, bream and whiting country.',
    pier: { len: 120, w: 3.4, h: 2.6, head: [16, 9] }, cliff: { z: -70, h: 9, col: [176, 120, 82] }, trees: 'norfolk',
    horizon: 'moreton', water: { shallow: [0.36, 0.66, 0.6], deep: [0.1, 0.33, 0.38], k: 0.42 }, swell: 0.35,
    bites: { bream: 30, whiting: 22, flathead: 14, toadfish: 14, tailor: 8, garfish: 8, mullet: 8, snapper: 4, mulloway: 3, shovelnose: 3, eagleray: 2, jack: 2, trevally: 2, kingfish: 1, cobia: 1, mackerel: 1 },
    seen: ['mullet', 'garfish', 'bream', 'whiting']
  },
  {
    id: 'woodypoint', name: 'Woody Point Jetty', region: 'Moreton Bay', lat: -27.262, lon: 153.106,
    blurb: 'Redcliffe Peninsula jetty with red cliffs behind. Deeper water at the head brings snapper and tailor.',
    pier: { len: 95, w: 3.2, h: 2.9, head: [22, 10] }, cliff: { z: 55, h: 14, col: [168, 92, 58] }, trees: 'mixed',
    horizon: 'moreton', water: { shallow: [0.3, 0.64, 0.62], deep: [0.07, 0.3, 0.4], k: 0.36 }, swell: 0.45,
    bites: { bream: 22, tailor: 14, flathead: 12, whiting: 12, snapper: 9, toadfish: 9, mulloway: 4, luderick: 5, garfish: 5, eagleray: 3, shovelnose: 3, trevally: 4, cobia: 2, kingfish: 2, mackerel: 2, greynurse: 1 },
    seen: ['bream', 'luderick', 'garfish', 'tailor']
  },
  {
    id: 'spit', name: 'The Spit Seaway', region: 'Gold Coast', lat: -27.94, lon: 153.427,
    blurb: 'Rock wall and jetty beside the Gold Coast Seaway, Surfers skyline to the south. Fast, clear water.',
    pier: { len: 70, w: 3.0, h: 2.4, head: [12, 8] }, wall: { z: 34, len: 220 }, trees: 'pandanus', skyline: true,
    horizon: 'ocean', water: { shallow: [0.24, 0.72, 0.7], deep: [0.04, 0.3, 0.46], k: 0.24 }, swell: 0.8,
    bites: { tailor: 18, bream: 16, trevally: 12, luderick: 12, flathead: 10, whiting: 8, mulloway: 6, groper: 5, kingfish: 4, jack: 3, snapper: 3, wobbegong: 2, mackerel: 2, mahi: 2, cobia: 2, greynurse: 2 },
    seen: ['luderick', 'trevally', 'butterflyfish', 'moorishidol', 'bream']
  },
  {
    id: 'mooloolaba', name: 'Mooloolaba Spit', region: 'Sunshine Coast', lat: -26.683, lon: 153.133,
    blurb: 'Sandy spit and river-mouth rock wall facing open ocean. Clearest water of the four.',
    pier: { len: 60, w: 3.0, h: 2.3, head: [10, 7] }, wall: { z: -38, len: 180 }, trees: 'palm', glasshouse: true,
    horizon: 'ocean', water: { shallow: [0.22, 0.74, 0.72], deep: [0.03, 0.3, 0.5], k: 0.2 }, swell: 0.95,
    bites: { whiting: 18, tailor: 16, bream: 14, trevally: 10, flathead: 9, snapper: 8, groper: 5, luderick: 6, mulloway: 4, mahi: 4, mackerel: 3, kingfish: 3, cobia: 2, wobbegong: 2, eagleray: 2 },
    seen: ['butterflyfish', 'moorishidol', 'trevally', 'whiting']
  }
];

/* Boat hire, checked on CHECKED from operator sites and booking listings. lat/lon approximate. */
const HIRE = [
  { name: 'Bills Boat Hire', place: 'Golden Beach, Caloundra', lat: -26.818, lon: 153.121, licence: false,
    boat: 'Half cabin, 6 people', prices: [['1 hr', 140], ['2 hr', 200], ['3 hr', 275], ['4 hr', 325], ['6 hr', 445]],
    extra: 'Rods for hire. Fishing kayak $20 per hour. 15% public holiday surcharge.',
    via: 'Operator site', url: 'https://billsboathire.com.au/' },
  { name: 'Jetty 17 Boat Hire', place: 'Noosaville', lat: -26.394, lon: 153.077, licence: false,
    boat: 'Polycraft runabout, up to 5', prices: [['1 hr', 60], ['2 hr', 90]],
    extra: 'Hirer must be 21+. Price from a resold booking listing.',
    via: 'Air NZ activity listing', url: 'https://www.airnewzealand.com/activity-deals/noosa-mooloolaba-sunshine-coast/activity/noosa-boat-hire-1-or-2-hour-hire-jetty-17-boat-and-kayak-hire/4908' },
  { name: 'Clontarf fishing boat', place: 'Clontarf, Redcliffe', lat: -27.252, lon: 153.08, licence: true,
    boat: '4.2 m boat with sounder, up to 4', prices: [['6 hr', 199]],
    extra: 'Sheltered waters only. Operator not named on the listing.',
    via: 'Adrenaline listing', url: 'https://www.adrenaline.com.au/fishing/brisbane/half-day-boat-hire-6-hours/' },
  { name: 'Half Cabin Boat Hire', place: 'Paradise Point, Gold Coast', lat: -27.887, lon: 153.397, licence: false,
    boat: 'Self-drive half cabin', prices: [['Half day', 220], ['Full day', 350]],
    extra: 'Includes a tank of fuel, GST and insurance.',
    via: 'Air NZ activity listing', url: 'https://www.airnewzealand.com/activity-deals/gold-coast/activity/half-cabin-boat-hire/6586' },
  { name: 'Electric picnic boat', place: 'Surfers Paradise', lat: -27.99, lon: 153.425, licence: false,
    boat: '18 ft electric Duffy', prices: [['1 hr', 165]],
    extra: 'Cruising boat; fishing is not mentioned on the listing.',
    via: 'Adrenaline listing', url: 'https://adrenaline.com.au/gold-coast/cruises/boat-hire-bbq-boat-for-10' },
  { name: 'Boating Planet', place: 'Newport, Redcliffe', lat: -27.209, lon: 153.093, licence: true,
    boat: '6-seat bowrider with fish finder', prices: [],
    extra: 'Day to month hire. Fishing gear optional extra. No public rates.',
    via: 'Operator site', url: 'https://boatingplanet.com.au/' },
  { name: 'Broadwater Escapes', place: 'Southport, Gold Coast', lat: -27.963, lon: 153.414, licence: true,
    boat: '2024 pontoons and bowriders', prices: [],
    extra: 'Licensed drivers only. Rates on the booking page.',
    via: 'Operator site', url: 'https://www.broadwaterescapes.com.au/' },
  { name: 'Boab Boats', place: 'Ningi, Bribie Island', lat: -27.07, lon: 153.14, licence: false,
    boat: 'Centre cab, tinnies, jet ski', prices: [],
    extra: 'No prices published in the directory listing.',
    via: 'Moreton Bay directory', url: 'https://www.visitmoretonbayregion.com.au/directory/boab-boat-hire-bribie-island' }
];

function kmBetween(a, b, c, d) {
  const R = 6371, r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
