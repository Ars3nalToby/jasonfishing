/* ======================================================================
   LIVE CONDITIONS: Open-Meteo weather + marine (tide via sea level).
   Falls back to a simulated day when the network is blocked.
   ====================================================================== */
const LIVE = { source: 'Simulated conditions', wind: null, windFrom: 135, wave: null, temp: null, cloud: 0.3, tide: null, tideRate: null, ok: false, at: 0 };
let TIME_MODE = 'live';
const TIME_HOURS = { dawn: 5.6, noon: 12, dusk: 17.9, night: 21.5 };
function timeNow() {
  const now = new Date();
  if (TIME_MODE === 'live') return now;
  const b = new Date(now.getTime() + 10 * 3600e3); // Brisbane wall clock (no daylight saving)
  const h = TIME_HOURS[TIME_MODE];
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate(), Math.floor(h) - 10, Math.round((h % 1) * 60)));
}
function simulate() {
  const hrs = Date.now() / 3600e3, ph = S.lon * 0.3;
  LIVE.tide = 0.75 * Math.sin(2 * Math.PI * hrs / 12.42 + ph);
  LIVE.tideRate = 0.75 * 2 * Math.PI / 12.42 * Math.cos(2 * Math.PI * hrs / 12.42 + ph);
  LIVE.wind = 11; LIVE.windFrom = 130; LIVE.wave = 0.3 + S.swell * 0.6; LIVE.temp = 25; LIVE.cloud = 0.3;
  LIVE.source = 'Simulated conditions · live feed unavailable here';
  applyLive();
}
async function fetchLive() {
  const spot = S, q = 'latitude=' + spot.lat + '&longitude=' + spot.lon + '&timezone=Australia%2FBrisbane&timeformat=unixtime';
  try {
    const ctl = new AbortController(); setTimeout(() => ctl.abort(), 8000);
    const [a, b] = await Promise.all([
      fetch('https://api.open-meteo.com/v1/forecast?' + q + '&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover&wind_speed_unit=kn', { signal: ctl.signal }).then(r => r.json()),
      fetch('https://marine-api.open-meteo.com/v1/marine?' + q + '&current=wave_height&hourly=sea_level_height_msl&past_days=1&forecast_days=2', { signal: ctl.signal }).then(r => r.json()).catch(() => null)
    ]);
    if (spot !== S || !a || !a.current) throw new Error('no data');
    LIVE.wind = a.current.wind_speed_10m; LIVE.windFrom = a.current.wind_direction_10m; LIVE.temp = a.current.temperature_2m; LIVE.cloud = (a.current.cloud_cover || 0) / 100;
    LIVE.wave = b && b.current && b.current.wave_height != null ? b.current.wave_height : null;
    if (LIVE.wave === null) LIVE.wave = Math.min(1.2, 0.05 + LIVE.wind * 0.035) * (0.5 + S.swell * 0.5); // estimate from wind
    LIVE.tide = null; LIVE.tideRate = null;
    if (b && b.hourly && b.hourly.sea_level_height_msl) {
      const T = b.hourly.time, H = b.hourly.sea_level_height_msl, now = Date.now() / 1000;
      for (let i = 0; i < T.length - 1; i++) if (T[i] <= now && T[i + 1] > now && H[i] != null && H[i + 1] != null) {
        const f = (now - T[i]) / (T[i + 1] - T[i]); LIVE.tide = H[i] + (H[i + 1] - H[i]) * f; LIVE.tideRate = (H[i + 1] - H[i]) / ((T[i + 1] - T[i]) / 3600); break;
      }
    }
    if (LIVE.tide === null) { const hrs = Date.now() / 3600e3; LIVE.tide = 0.75 * Math.sin(2 * Math.PI * hrs / 12.42); LIVE.tideRate = 0.38 * Math.cos(2 * Math.PI * hrs / 12.42); }
    LIVE.ok = true; LIVE.at = Date.now();
    LIVE.source = 'Live · Open-Meteo, updated ' + new Date().toLocaleTimeString('en-AU', { timeZone: 'Australia/Brisbane', hour: 'numeric', minute: '2-digit' });
    applyLive();
  } catch (e) { if (spot === S) simulate(); }
}
function applyLive() {
  const toward = (LIVE.windFrom + 180) * Math.PI / 180;
  W.windDir = Math.atan2(-Math.cos(toward), Math.sin(toward));
  const wave = LIVE.wave === null ? 0.5 : LIVE.wave;
  W.amp = Math.min(1.6, 0.12 + wave * (0.35 + 0.65 * S.swell) + (LIVE.wind || 0) / 60 * 0.3);
  W.cloud = LIVE.cloud;
  W.targetY = Math.max(-1.2, Math.min(1.2, (LIVE.tide || 0) * 0.9));
  if (W.waterY === 0 || Math.abs(W.waterY - W.targetY) > 0.6) W.waterY = W.targetY;
  updateSun(true);
  renderConditions();
}
let sunT = 0;
function updateSun(force) {
  const s = solar(timeNow(), S.lat, S.lon); setSun(s.el, s.az);
}
