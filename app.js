/* SEASTRONG southern Belize site map. Data: data/sites.js (window.SITES), data/habitat.js (window.HABITAT) */
(function () {
  'use strict';
  const S = window.SITES, H = window.HABITAT;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const C = {
    mangrove: css('--mangrove'), mloss: css('--mloss'), mgain: css('--mgain'), seagrass: css('--seagrass'), coral: css('--coral'),
    tight: css('--tight'), inter: css('--inter'), loose: css('--loose'), disc: css('--disc'), accent: css('--accent'), yellow: css('--accent2')
  };
  const PG = [16.101, -88.809];       // Punta Gorda reference point, back-calculated from km_PG in the scouting data
  const ABALONE = [16.209, -88.625];  // Abalone Caye ranger station, back-calculated from km_Abalone

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function hav(a, b) {
    const R = 6371, t = Math.PI / 180, dLa = (b[0] - a[0]) * t, dLo = (b[1] - a[1]) * t;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmt = (x, n = 5) => Number(x).toFixed(n);
  const gmaps = (la, lo) => `https://www.google.com/maps?q=${fmt(la)},${fmt(lo)}&t=k`;
  function copy(text, btn) {
    const done = () => { if (btn) { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = o), 1200); } };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); }
  }
  window.__copy = copy;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function decode(rings) {
    return rings.map((r) => { const out = []; let x = 0, y = 0; for (let i = 0; i < r.length; i += 2) { x += r[i]; y += r[i + 1]; out.push([y / 1e5, x / 1e5]); } return out; });
  }

  // ---------- map ----------
  const map = L.map('map', { zoomControl: true, minZoom: 8, maxZoom: 19, worldCopyJump: false });
  window.SEASTRONG_MAP = map;
  const AOI = L.latLngBounds([15.95, -89.1], [16.55, -88.0]);
  map.fitBounds(AOI);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  [['hab', 405], ['prot', 415], ['ring', 420], ['labels', 430], ['sitepoly', 440]].forEach(([n, z]) => { map.createPane(n).style.zIndex = z; });
  map.getPane('ring').style.pointerEvents = 'none';
  map.getPane('labels').style.pointerEvents = 'none';
  const habRenderer = L.canvas({ pane: 'hab', padding: 0.4 });
  const protRenderer = L.canvas({ pane: 'prot', padding: 0.4, tolerance: 4 });

  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  // Esri Ocean only has real tiles to zoom 10 over southern Belize; above that the server returns
  // "Map data not yet available" placeholders, so cap the native zoom at 10 and let Leaflet enlarge.
  const OCEAN_Z = 10;
  const basemaps = {
    'Satellite (Esri)': L.tileLayer(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' }),
    'Satellite (Google)': L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains: '0123', maxZoom: 20, maxNativeZoom: 20, attribution: 'Imagery © Google · for viewing only, not for published figures' }),
    'Ocean (Esri)': L.layerGroup([
      L.tileLayer(ESRI + 'Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: OCEAN_Z, attribution: 'Ocean basemap © Esri, Garmin, GEBCO, NOAA NGDC' }),
      L.tileLayer(ESRI + 'Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: OCEAN_Z, pane: 'labels' })
    ]),
    'Streets': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }),
    'None': L.layerGroup()
  };
  // The published web copy (window.SEASTRONG_WEB) leaves Google imagery out: embedding Google tiles in a page
  // other people open goes beyond Google's terms. The local copy keeps it for viewing.
  if (window.SEASTRONG_WEB) delete basemaps['Satellite (Google)'];
  const BM_NOTES = {
    'Satellite (Google)': 'Google imagery is for viewing only. Don’t publish screenshots or figures made with it; switch to Esri for those.',
    'Ocean (Esri)': 'Esri’s ocean map has detail down to about 1:500,000 here (zoom 10); closer in it is enlarged and soft. For depths, turn on Bathymetry under Water clarity & runoff.'
  };
  let bmKey = store.get('seastrong_basemap', 'Satellite (Esri)');
  if (!basemaps[bmKey]) bmKey = 'Satellite (Esri)';
  let currentBase = basemaps[bmKey].addTo(map);
  const bmEl = document.getElementById('bm');
  const bmNote = document.createElement('div'); bmNote.className = 'note'; bmNote.style.marginTop = '6px';
  function setBmNote(k) { bmNote.textContent = BM_NOTES[k] || ''; bmNote.style.display = BM_NOTES[k] ? 'block' : 'none'; }
  Object.keys(basemaps).forEach((k) => {
    const b = document.createElement('button'); b.textContent = k; if (k === bmKey) b.classList.add('on');
    b.onclick = () => {
      map.removeLayer(currentBase); currentBase = basemaps[k].addTo(map); if (currentBase.bringToBack) currentBase.bringToBack();
      bmEl.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); store.set('seastrong_basemap', k); setBmNote(k);
    };
    bmEl.appendChild(b);
  });
  bmEl.after(bmNote); setBmNote(bmKey);

  // ---------- habitat layers ----------
  let habOpacity = 0.7;
  const habLayers = [];
  function habPoly(polys, color, extra) {
    const lyr = L.polygon(polys.map(decode), Object.assign({ renderer: habRenderer, stroke: false, fillColor: color, fillOpacity: habOpacity, interactive: false, smoothFactor: 0.5 }, extra || {}));
    habLayers.push(lyr); return lyr;
  }
  const lazy = (fn) => { let l = null; return () => (l = l || fn()); };
  const LYR = {};
  LYR.seagrass = lazy(() => habPoly(H.seagrass, C.seagrass));
  LYR.coral = lazy(() => habPoly(H.coral, C.coral));
  LYR.mang = lazy(() => L.layerGroup([habPoly(H.gmw.M, C.mangrove), habPoly(H.gmw.G, C.mangrove)]));
  LYR.mchange = lazy(() => L.layerGroup([habPoly(H.gmw.L, C.mloss), habPoly(H.gmw.G, C.mgain)]));
  LYR.conn = lazy(() => {
    const groups = { 1: [], 2: [], 3: [], 4: [] };
    H.coral.forEach((p, i) => groups[H.coralConn[i]].push(p));
    return L.layerGroup([habPoly(groups[4], C.disc), habPoly(groups[3], C.loose), habPoly(groups[2], C.inter), habPoly(groups[1], C.tight)]);
  });
  document.getElementById('habOp').addEventListener('input', (e) => {
    habOpacity = +e.target.value; habLayers.forEach((l) => l.setStyle({ fillOpacity: habOpacity }));
  });

  // ---------- protected areas ----------
  const wdpaStyle = {
    marine: { color: C.accent, weight: 1.8, fill: false },
    notake: { color: '#ffffff', weight: 2, dashArray: '5 4', fill: true, fillColor: '#ffffff', fillOpacity: 0.16 },
    terrestrial: { color: '#ffc83d', weight: 1.4, dashArray: '6 5', fill: false },
    ramsar: { color: '#7fe0c4', weight: 1.4, dashArray: '2 5', fill: false },
    whs: { color: '#b28dff', weight: 1.2, dashArray: '10 6', fill: false }
  };
  function wdpaPopup(p) {
    const title = p.cat === 'notake' ? 'Port Honduras MR: replenishment (no-take) zone' : p.name;
    return `<div class="pp"><h3>${esc(title)}</h3><div class="v">${esc(p.desig_eng)}${p.iso3 !== 'BLZ' ? ' (' + esc(p.iso3) + ')' : ''}</div>
      <div class="k">IUCN category · status year</div><div class="v">${esc(p.iucn_cat)} · ${esc(p.status_yr)}</div>
      <div class="k">Management authority</div><div class="v">${esc(p.mang_auth)}</div>
      <div class="k">Polygon area (this part)</div><div class="v">${p.area_km2.toLocaleString()} km²</div>
      <div class="k">WDPA ID</div><div class="v"><a href="https://www.protectedplanet.net/${p.site_id}" target="_blank" rel="noopener" style="color:var(--accent)">${p.site_id}</a></div></div>`;
  }
  // One empty layer per category; filled from the saved copy (local version) or fetched live from UNEP-WCMC
  // (web version, which must not redistribute WDPA data).
  const WDPA_CATS = ['marine', 'notake', 'terrestrial', 'ramsar', 'whs'];
  const wdpaGroups = {};
  WDPA_CATS.forEach((c) => {
    wdpaGroups[c] = L.geoJSON(null, {
      pane: 'prot', renderer: protRenderer, bubblingMouseEvents: false,
      style: (f) => wdpaStyle[f.properties.cat],
      onEachFeature: (f, l) => l.bindPopup(wdpaPopup(f.properties), { maxWidth: 300 })
    });
  });
  LYR.mpa = () => wdpaGroups.marine; LYR.notake = () => wdpaGroups.notake; LYR.terr = () => wdpaGroups.terrestrial;
  LYR.ramsar = () => wdpaGroups.ramsar; LYR.whs = () => wdpaGroups.whs;
  const WDPA_URL = 'https://data-gis.unep-wcmc.org/server/rest/services/ProtectedSites/The_World_Database_of_Protected_Areas/MapServer/1/query';
  function ringAreaKm2(ring) { let a = 0; for (let i = 1; i < ring.length; i++) a += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1]; return Math.abs(a) / 2 * 111.32 * 111.32 * Math.cos(16.2 * Math.PI / 180); }
  function classifyWdpa(f) { // same rules as the desk analysis: PHMR's four small sub-polygons are its replenishment (no-take) zones
    const p = f.properties, g = f.geometry; if (!g) return null;
    if (/^Specially Protected Area/.test(p.desig_eng || '') || !['BLZ', 'GTM', 'HND'].includes(p.iso3)) return null;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    const area = polys.reduce((s, pl) => s + ringAreaKm2(pl[0]), 0);
    let cat = ['Marine', 'Coastal'].includes(p.realm) ? 'marine' : 'terrestrial';
    if (p.site_id === 220100 && area < 10) cat = 'notake';
    if (/World Heritage/.test(p.desig_eng || '')) cat = 'whs';
    if (/Ramsar/.test(p.desig_eng || '')) cat = 'ramsar';
    return { type: 'Feature', geometry: g, properties: Object.assign({}, p, { cat, area_km2: Math.round(area * 100) / 100 }) };
  }
  function addWdpa(features) { features.forEach((f) => { if (f && wdpaGroups[f.properties.cat]) wdpaGroups[f.properties.cat].addData(f); }); }
  if (S.wdpa) addWdpa(S.wdpa.features);
  else (async () => {
    const qs = new URLSearchParams({ geometry: '-89.25,15.85,-87.95,16.6', geometryType: 'esriGeometryEnvelope', inSR: 4326, outSR: 4326, spatialRel: 'esriSpatialRelIntersects',
      outFields: 'site_id,name,desig_eng,iucn_cat,realm,status_yr,mang_auth,iso3', maxAllowableOffset: 0.0002, geometryPrecision: 5, f: 'geojson' });
    try { const r = await fetch(WDPA_URL + '?' + qs); const d = await r.json(); addWdpa((d.features || []).map(classifyWdpa)); }
    catch (e) { const n = document.getElementById('lyr-prot'); if (n) n.insertAdjacentHTML('beforeend', '<div class="note" style="margin:6px 0 0 26px">Protected-area boundaries couldn’t be loaded from UNEP-WCMC just now. Reload to try again.</div>'); }
  })();

  // ---------- reference ----------
  LYR.labels = lazy(() => L.tileLayer(ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, pane: 'labels', opacity: 0.9 }));
  LYR.rings = lazy(() => L.layerGroup([10, 25, 50].map((km) => {
    const c = L.circle(PG, { radius: km * 1000, pane: 'ring', color: '#ffffff', weight: 1, dashArray: '2 6', fill: false, interactive: false });
    const lab = L.marker([PG[0] + km / 111.2, PG[1]], { interactive: false, icon: L.divIcon({ className: '', html: `<span class="lbl ref" style="position:relative;left:-14px;top:-8px;white-space:nowrap">${km} km</span>` }) });
    return L.layerGroup([c, lab]);
  })));
  LYR.refpts = lazy(() => L.layerGroup([
    refMarker(PG, 'Punta Gorda', 'Reference point for “km from Punta Gorda” in the scouting data (position back-calculated from those distances, ±50 m).'),
    refMarker(ABALONE, 'Abalone Caye ranger station', 'TIDE ranger station. Reference point for “km from Abalone” on seagrass candidates (position back-calculated, ±40 m).')
  ]));
  function refMarker(ll, name, note) {
    const icon = L.divIcon({ className: '', iconSize: [16, 16], iconAnchor: [8, 8], html: '<svg width="16" height="16" viewBox="0 0 16 16"><polygon points="8,1 10,6 15.5,6.2 11.2,9.6 12.8,15 8,11.8 3.2,15 4.8,9.6 0.5,6.2 6,6" fill="#ffd23f" stroke="#111" stroke-width="1"/></svg>' });
    return L.marker(ll, { icon }).bindTooltip(name, { permanent: true, direction: 'right', className: 'lbl ref', offset: [8, 0] })
      .bindPopup(`<div class="pp"><h3>${esc(name)}</h3><div class="v">${esc(note)}</div><div class="k">Coordinates</div><div class="v">${fmt(ll[0], 4)}, ${fmt(ll[1], 4)}</div></div>`);
  }

  // ---------- water clarity, rivers, live imagery ----------
  const WD = window.WATER;
  map.createPane('live').style.zIndex = 250;
  map.createPane('turb').style.zIndex = 408;
  map.createPane('rivers').style.zIndex = 425;
  let season = store.get('seastrong_season', 'nov');
  const SEASON_LABEL = { all: 'All year', dry: 'Dry Feb–May', wet: 'Wet Jun–Oct', nov: 'Nov–Jan' };
  const CLS = [[1, '#1f78c8', 'very clear'], [2, '#3cc0c8', 'clear'], [5, '#e8d25a', 'moderate'], [10, '#f08c28', 'turbid'], [Infinity, '#a0501e', 'plume water']];
  const clsOf = (T) => CLS.find((c) => T < c[0]);
  let turbOpacity = 0.8;
  const turbImg = L.imageOverlay(`data/turbidity/turb_${season}.png`, WD.bounds, { pane: 'turb', opacity: turbOpacity, interactive: false });
  const freqImg = L.imageOverlay(`data/turbidity/freq5_${season}.png`, WD.bounds, { pane: 'turb', opacity: turbOpacity, interactive: false });
  LYR.turb = () => turbImg;
  LYR.freq = () => freqImg;
  LYR.rivers = lazy(() => {
    const g = L.layerGroup();
    L.geoJSON(WD.rivers, {
      pane: 'rivers', interactive: true, bubblingMouseEvents: false,
      style: (f) => f.properties.major ? { color: '#6ec6ff', weight: 2.4, opacity: 0.95 } : f.properties.kind === 'river' ? { color: '#6ec6ff', weight: 1.6, opacity: 0.8 } : { color: '#6ec6ff', weight: 1, opacity: 0.55 },
      onEachFeature: (f, l) => { if (f.properties.name) l.bindTooltip(f.properties.name, { sticky: true }); }
    }).addTo(g);
    const icon = L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 3 L12 3 L7 12 Z" fill="#6ec6ff" stroke="#08243a" stroke-width="1.5"/></svg>' });
    WD.mouths.forEach((m) => {
      L.marker([m.lat, m.lon], { icon, pane: 'markerPane' })
        .bindTooltip(m.name, { permanent: true, direction: 'left', offset: [-6, 0], className: 'lbl riv' + (m.len_km >= 15 || /Sarstoon/.test(m.name) ? '' : ' minor') })
        .bindPopup(() => `<div class="pp"><h3>${esc(m.name)}: mouth</h3><div class="v">Approximate outflow point (from OpenStreetMap), a likely source of freshwater and sediment plumes.</div><div class="k">Coordinates</div><div class="v">${fmt(m.lat, 4)}, ${fmt(m.lon, 4)}</div>${pointClarityHTML(m.lat, m.lon) || ''}</div>`, { maxWidth: 320 }).addTo(g);
    });
    return g;
  });
  document.head.insertAdjacentHTML('beforeend', '<style>.lbl.riv{color:#9ad8ff;font-weight:600}.hide-r .lbl.riv{display:none}.hide-rm .lbl.riv.minor{display:none}</style>');

  // decoded grid for click queries (deflate-compressed uint8 layers)
  let GRID = null;
  (async function loadGrid() {
    try {
      const bin = Uint8Array.from(atob(WD.b64), (c) => c.charCodeAt(0));
      const ds = new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate'));
      GRID = new Uint8Array(await new Response(ds).arrayBuffer());
    } catch (e) { GRID = null; }
  })();
  function utm16(lat, lon) { // WGS84 -> UTM zone 16N
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), d = Math.PI / 180;
    const lam0 = -87 * d, phi = lat * d, lam = lon * d;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lam0);
    const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
    const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
    const y = k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
    return [x, y];
  }
  function gridAt(lat, lon) {
    if (!GRID) return null;
    const g = WD.grid, [x, y] = utm16(lat, lon);
    const c = Math.floor((x - g.x0) / g.res), r = Math.floor((g.y0 - y) / g.res);
    if (r < 0 || c < 0 || r >= g.H || c >= g.W) return null;
    const n = g.W * g.H, i = r * g.W + c, out = {};
    ['all', 'dry', 'wet', 'nov'].forEach((s, k) => {
      const m = GRID[k * n + i], p = GRID[(k + 4) * n + i];
      out[s] = m === 255 ? null : m === 253 ? 'shallow' : { T: 0.1 * Math.pow(10, m / 50), p5: p };
    });
    return out;
  }
  const fT = (T) => (T < 10 ? T.toFixed(1) : T.toFixed(0));
  const chip = (T) => { const c = clsOf(T); return `<span class="clar"><i style="background:${c[1]}"></i>${fT(T)} FNU · ${c[2]}</span>`; };
  function pointClarityHTML(lat, lon) {
    const v = gridAt(lat, lon); if (!v) return '';
    if (v.all === 'shallow') return '<div class="k">Water clarity</div><div class="v">Optically shallow (bright bottom); turbidity not interpretable here.</div>';
    if (!v.all) return '';
    const rows = ['all', 'dry', 'wet', 'nov'].filter((s) => v[s] && v[s] !== 'shallow').map((s) => `<tr><td>${SEASON_LABEL[s]}</td><td>${chip(v[s].T)}</td><td>${v[s].p5}%</td></tr>`).join('');
    return `<div class="k">Water clarity (Sentinel-2, 2020–25)</div><table class="ctab"><tr><th></th><th>median</th><th>&gt;5 FNU</th></tr>${rows}</table>`;
  }
  // per-site clarity from precomputed stats
  function siteStat(key) { return WD.sites[key] || null; }
  function monthlyChart(st) {
    const mo = 'JFMAMJJASOND';
    const bars = st.monthly.map((T, i) => {
      if (T == null) return `<div class="na" title="${mo[i]}: too few clear-sky images (${st.monthly_n[i]})"></div>`;
      const h = Math.max(3, Math.min(46, (Math.log10(T) + 0.7) / (Math.log10(30) + 0.7) * 46));
      return `<div style="height:${h}px;background:${clsOf(T)[1]}" title="${'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[i]}: median ${fT(T)} FNU from ${st.monthly_n[i]} clear-sky images"></div>`;
    }).join('');
    const labs = [...mo].map((m, i) => `<span class="${i === 10 || i === 11 ? 'v' : ''}">${m}</span>`).join('');
    return `<div class="mchart">${bars}</div><div class="mlab">${labs}</div>`;
  }
  function siteClarityHTML(key, opts) {
    const st = siteStat(key); opts = opts || {};
    if (!st || !st.all) return `<div class="k">Water clarity</div><div class="v">${esc((st && st.note) || 'No data')}</div>`;
    const rows = ['all', 'dry', 'wet', 'nov'].filter((s) => st[s]).map((s) => `<tr${s === season ? ' style="font-weight:700"' : ''}><td>${SEASON_LABEL[s]}</td><td>${chip(st[s].med)}</td><td>${Math.round(st[s].p5 * 100)}%</td><td style="color:var(--muted)">${st[s].n}</td></tr>`).join('');
    const mouths = (st.mouths || []).map((m) => `${esc(m[0])} ${m[1]} km`).join(' · ');
    return `<div class="k">Water clarity${opts.label ? ' · ' + esc(opts.label) : ''} (Sentinel-2, 2020–25)</div>
      <table class="ctab"><tr><th></th><th>median turbidity</th><th>days &gt;5 FNU</th><th>n</th></tr>${rows}</table>
      <div class="k">Monthly median (Nov–Dec visit months highlighted)</div>${monthlyChart(st)}
      <div style="font-size:11px;color:var(--muted);margin-top:3px">Sampled ${esc(st.note)}.${opts.extra ? ' ' + opts.extra : ''}</div>
      ${mouths ? `<div class="k">Nearest river mouths</div><div class="v">${mouths}</div>` : ''}`;
  }
  const siteMed = (key) => { const st = siteStat(key); return st && st[season] ? st[season].med : (st && st.all ? st.all.med : null); };

  // live imagery (NASA GIBS)
  const GIBS = [
    ['MODIS_Terra_CorrectedReflectance_TrueColor', 'MODIS Terra true colour (250 m, ~10:30 local)', 9, 'jpg'],
    ['MODIS_Aqua_CorrectedReflectance_TrueColor', 'MODIS Aqua true colour (250 m, ~13:30 local)', 9, 'jpg'],
    ['VIIRS_NOAA20_CorrectedReflectance_TrueColor', 'VIIRS NOAA-20 true colour (375 m)', 9, 'jpg'],
    ['OCI_PACE_True_Color', 'PACE OCI true colour (~1.2 km, daily)', 7, 'jpg'],
    ['OCI_PACE_Chlorophyll_a', 'PACE OCI chlorophyll-a (~1.2 km)', 7, 'png'],
    ['HLS_S30_Nadir_BRDF_Adjusted_Reflectance', 'HLS Sentinel-2 (30 m, overpass days only)', 12, 'png'],
    ['HLS_L30_Nadir_BRDF_Adjusted_Reflectance', 'HLS Landsat (30 m, overpass days only)', 12, 'png']
  ];
  const liveNotes = {
    OCI_PACE_True_Color: 'PACE passes daily. At ~1.2 km it shows lagoon and Gulf of Honduras plumes, not inshore cayes. Data from Mar 2024.',
    OCI_PACE_Chlorophyll_a: 'Standard open-ocean algorithm. In turbid or shallow coastal water, sediment and bottom reflectance inflate chlorophyll, so read it as a plume indicator only.',
    HLS_S30_Nadir_BRDF_Adjusted_Reflectance: 'Only available on Sentinel-2 overpass days (every 2–5 days); step through dates to find one.',
    HLS_L30_Nadir_BRDF_Adjusted_Reflectance: 'Only available on Landsat overpass days; step through dates to find one.'
  };
  const liveSel = document.getElementById('liveProd'), liveDate = document.getElementById('liveDate');
  GIBS.forEach(([id, label]) => { const o = document.createElement('option'); o.value = id; o.textContent = label; liveSel.appendChild(o); });
  const isoDay = (d) => d.toISOString().slice(0, 10);
  const yesterday = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return isoDay(d); };
  liveDate.value = yesterday(); liveDate.max = isoDay(new Date());
  let liveLayer = null;
  function liveUrl() {
    const p = GIBS.find((g) => g[0] === liveSel.value);
    return { url: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${p[0]}/default/${liveDate.value}/GoogleMapsCompatible_Level${p[2]}/{z}/{y}/{x}.${p[3]}`, z: p[2] };
  }
  function refreshLive() {
    document.getElementById('liveNote').textContent = (liveNotes[liveSel.value] || 'Cloud-free areas only. Brown/green coastal water is sediment and tannin-stained river outflow.') + ' Date: ' + liveDate.value + ' (UTC).';
    if (!document.getElementById('liveOn').checked) { if (liveLayer) map.removeLayer(liveLayer); return; }
    const u = liveUrl();
    if (liveLayer) map.removeLayer(liveLayer);
    liveLayer = L.tileLayer(u.url, { pane: 'live', maxNativeZoom: u.z, maxZoom: 19, opacity: +document.getElementById('liveOp').value, attribution: 'NASA EOSDIS GIBS' }).addTo(map);
  }
  document.getElementById('liveOn').addEventListener('change', (e) => { document.getElementById('livePanel').classList.toggle('on', e.target.checked); refreshLive(); });
  liveSel.addEventListener('change', refreshLive); liveDate.addEventListener('change', refreshLive);
  const shiftDay = (n) => { const d = new Date(liveDate.value + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); if (isoDay(d) <= liveDate.max) { liveDate.value = isoDay(d); refreshLive(); } };
  document.getElementById('livePrev').onclick = () => shiftDay(-1);
  document.getElementById('liveNext').onclick = () => shiftDay(1);
  document.getElementById('liveLatest').onclick = () => { liveDate.value = yesterday(); refreshLive(); };
  document.getElementById('liveOp').addEventListener('input', (e) => liveLayer && liveLayer.setOpacity(+e.target.value));
  refreshLive();

  // ---------- bathymetry (regional grid, ~460 m) ----------
  const BA = window.BATHY;
  map.createPane('bathy').style.zIndex = 300;
  map.createPane('iso').style.zIndex = 412;
  const bathyImg = L.imageOverlay('data/bathymetry/bathy.png', BA.bounds, { pane: 'bathy', opacity: 0.8, interactive: false });
  LYR.bathy = () => bathyImg;
  const ISO_STYLE = (d) => d <= 2 ? { color: '#e8fbff', weight: 1, opacity: 0.8, dashArray: '2 3' } : d === 5 || d === 10 || d === 20 ? { color: '#ffffff', weight: 1.6, opacity: 0.95 } : d >= 100 ? { color: '#9ec9ff', weight: 1.1, opacity: 0.7 } : { color: '#d6f2ff', weight: 1, opacity: 0.8 };
  LYR.iso = lazy(() => L.geoJSON(BA.contours, {
    pane: 'iso', bubblingMouseEvents: false, style: (f) => ISO_STYLE(f.properties.depth),
    onEachFeature: (f, l) => l.bindTooltip(`${f.properties.depth} m isobath (regional grid)`, { sticky: true })
  }));
  let BGRID = null;
  try {
    const raw = Uint8Array.from(atob(BA.grid.b64), (c) => c.charCodeAt(0));
    BGRID = new Int16Array(raw.buffer);
  } catch (e) { BGRID = null; }
  function depthAt(lat, lon) { // bilinear on the native grid; returns metres below sea level, or null on land/outside
    if (!BGRID) return null;
    const g = BA.grid, fx = (lon - g.x0) / g.dx - 0.5, fy = (lat - g.y0) / g.dy - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= g.W || y0 + 1 >= g.H) return null;
    const tx = fx - x0, ty = fy - y0, v = (r, c) => BGRID[r * g.W + c];
    const z = (1 - ty) * ((1 - tx) * v(y0, x0) + tx * v(y0, x0 + 1)) + ty * ((1 - tx) * v(y0 + 1, x0) + tx * v(y0 + 1, x0 + 1));
    return z < 0 ? -z : null;
  }
  function depthHTML(lat, lon, label, onReef) {
    const d = depthAt(lat, lon);
    const warn = onReef && d != null && d > 15
      ? '<div style="font-size:11px;color:#ffb36b;margin-top:2px">This node sits on reef mapped by the Allen Coral Atlas, which only maps to about 10–15 m, so the real depth is shallower. The coarse grid is averaging in deeper water nearby.</div>' : '';
    return `<div class="k">${label || 'Regional depth'}</div><div class="v">${d == null ? 'land or shoreline in the coarse grid' : `~${d < 10 ? d.toFixed(1) : Math.round(d)} m`} <span style="color:var(--muted);font-size:11px">(~460 m grid; reef tops and channels aren’t resolved)</span>${warn}</div>`;
  }

  // ---------- AGRRA reef monitoring ----------
  const AG = { benthic: [], health: [], sites23: [], desc: {}, status: '', live: false };
  map.createPane('agrra').style.zIndex = 445;
  const agBenthic = L.layerGroup(), agHealth = L.layerGroup(), ag23 = L.layerGroup();
  LYR.agb = () => agBenthic; LYR.agh = () => agHealth; LYR.ag23 = () => ag23;
  const RHI_COL = { 1: '#d7191c', 2: '#f28e2b', 3: '#f2d33a', 4: '#91cf60', 5: '#1a9641' };
  const RHI_LAB = { 1: 'Critical', 2: 'Poor', 3: 'Fair', 4: 'Good', 5: 'Very good' };
  const ymd = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '—');
  const pct = (x) => (x == null || isNaN(x) ? '—' : (x * 100 < 10 ? (x * 100).toFixed(1) : Math.round(x * 100)) + '%');
  const titleCase = (s) => String(s || '').trim().toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  let healthMode = store.get('seastrong_healthmode', 'bleach');

  function summarizeHealth(p) {
    const t = { healthy: 0, sctld: 0, other_disease: 0, bleached: 0, partialBleached: 0, pale: 0, bothBL: 0, bothPB: 0, bothP: 0, recent_dead: 0 };
    for (const k in p) { if (k.startsWith('ss_')) { const cat = k.split('_').slice(2).join('_'); if (cat in t) t[cat] += +p[k] || 0; } }
    const n = Object.values(t).reduce((a, b) => a + b, 0);
    const f = (x) => (n ? x / n : null);
    return { n, healthy: f(t.healthy), bleach: f(t.bleached + t.partialBleached + t.bothBL + t.bothPB), full: f(t.bleached + t.bothBL),
      pale: f(t.pale + t.bothP), sctld: f(t.sctld + t.bothBL + t.bothPB + t.bothP), other: f(t.other_disease), dead: f(t.recent_dead) };
  }
  // AGRRA uses -999 (and other negatives) for "not measured"; treat those as missing
  function cleanNums(p) { const o = {}; for (const k in p) { const v = p[k]; o[k] = typeof v === 'number' && v < 0 ? null : v; } return o; }
  function buildAgrra(src) {
    AG.desc = src.desc || AG.desc;
    src = Object.assign({}, src, {
      benthic: src.benthic.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: cleanNums(f.properties) })),
      health: src.health.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: cleanNums(f.properties) }))
    });
    // benthic: group repeat surveys by site code
    const bs = {};
    src.benthic.forEach((f) => {
      const p = f.properties, code = String(p.SITECODE || '').trim().replace(/\.$/, '') || (f.geometry.coordinates.join(','));
      (bs[code] = bs[code] || { code, ll: [f.geometry.coordinates[1], f.geometry.coordinates[0]], surveys: [] }).surveys.push(p);
    });
    // Some batches (e.g. Belize-2018C in Port Honduras) were fish-only: no benthic transects, and an RHI built from fish
    // indicators alone. Use the latest survey that has benthic data for colours and summaries.
    AG.benthic = Object.values(bs).map((s) => {
      s.surveys.sort((a, b) => (a.SITEDATE || 0) - (b.SITEDATE || 0));
      s.surveys.forEach((x) => { x._fishOnly = x.LCAVG == null && x.FMAAVG == null; });
      s.latestAny = s.surveys[s.surveys.length - 1];
      s.latest = s.surveys.slice().reverse().find((x) => !x._fishOnly) || s.latestAny;
      s.hasBenthic = !s.latest._fishOnly;
      s.name = s.latestAny.SITENAME || s.code; return s;
    });
    // coral health: drop unapproved, group by ~110 m cell
    const hs = {};
    src.health.filter((f) => f.properties.Approval !== 'No').forEach((f) => {
      const [x, y] = f.geometry.coordinates, key = x.toFixed(3) + ',' + y.toFixed(3), p = f.properties;
      const g = (hs[key] = hs[key] || { key, ll: [y, x], surveys: [] });
      g.surveys.push(Object.assign({ _s: summarizeHealth(p) }, p));
    });
    AG.health = Object.values(hs).map((g) => {
      g.surveys.sort((a, b) => (a.obs_dateTime || 0) - (b.obs_dateTime || 0));
      const names = {}; g.surveys.forEach((s) => { const n = titleCase(s.reef_name); if (n) names[n] = (names[n] || 0) + 1; });
      g.name = Object.entries(names).sort((a, b) => b[1] - a[1]).map((e) => e[0])[0] || 'Unnamed reef';
      const quant = g.surveys.filter((s) => s._s.n >= 10);
      g.latestQ = quant[quant.length - 1] || null; g.latest = g.surveys[g.surveys.length - 1];
      g.colonies = g.surveys.reduce((a, s) => a + s._s.n, 0);
      return g;
    });
    AG.sites23 = src.sites2023 || [];
    drawAgrra();
  }
  function healthColor(g) {
    const s = g.latestQ && g.latestQ._s;
    if (!s) return '#9aa7b4';
    if (healthMode === 'sctld') return s.sctld > 0.05 ? '#6a1b9a' : s.sctld > 0 ? '#ab47bc' : '#2ca25f';
    return s.bleach >= 0.5 ? '#d73027' : s.bleach >= 0.2 ? '#fc8d59' : s.bleach >= 0.05 ? '#fee08b' : '#2ca25f';
  }
  function sparkSVG(points, series, w, h) { // points: [{t, a, b}] values 0–1
    if (points.length < 2) return '';
    const t0 = points[0].t, t1 = points[points.length - 1].t, X = (t) => 4 + (w - 8) * ((t - t0) / Math.max(1, t1 - t0)), Y = (v) => h - 12 - (h - 18) * Math.min(1, v);
    const lines = series.map(([k, col]) => {
      const pts = points.filter((p) => p[k] != null);
      return `<polyline fill="none" stroke="${col}" stroke-width="1.6" points="${pts.map((p) => X(p.t).toFixed(1) + ',' + Y(p[k]).toFixed(1)).join(' ')}"/>` + pts.map((p) => `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p[k]).toFixed(1)}" r="1.8" fill="${col}"/>`).join('');
    }).join('');
    const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
    return `<svg width="${w}" height="${h}" style="display:block;margin-top:4px;background:#0b1724;border-radius:4px">
      <line x1="4" x2="${w - 4}" y1="${Y(0.5)}" y2="${Y(0.5)}" stroke="#22405f" stroke-dasharray="2 3"/><text x="${w - 4}" y="${Y(0.5) - 2}" fill="#8fa6bd" font-size="8" text-anchor="end">50%</text>
      ${lines}<text x="4" y="${h - 2}" fill="#8fa6bd" font-size="9">${y0}</text><text x="${w - 4}" y="${h - 2}" fill="#8fa6bd" font-size="9" text-anchor="end">${y1}</text></svg>`;
  }
  function healthPopup(g) {
    const s = g.latestQ, l = g.latest, d0 = g.surveys[0].obs_dateTime, d1 = l.obs_dateTime;
    const depths = g.surveys.map((x) => +x.obs_depth).filter((x) => x > 0);
    const mpa = l.mpa_name || (l.mpa === 'outside_mpa' ? 'Outside an MPA' : '');
    const resto = { outplant_site: 'Restoration outplant site', nursery_site: 'Coral nursery site' }[l.restoration] || '';
    const pts = g.surveys.filter((x) => x._s.n >= 10).map((x) => ({ t: x.obs_dateTime, a: x._s.bleach, b: x._s.sctld }));
    const rows = g.surveys.slice(-8).reverse().map((x) => `<tr><td>${ymd(x.obs_dateTime)}</td><td>${x._s.n || '<span style="color:var(--muted)">qual.</span>'}</td><td>${pct(x._s.bleach)}</td><td>${pct(x._s.pale)}</td><td>${pct(x._s.sctld)}</td><td>${pct(x._s.dead)}</td><td>${x.obs_depth ? x.obs_depth + ' m' : ''}</td></tr>`).join('');
    return `<div class="pp"><h3>${esc(g.name)}</h3><div class="v" style="color:var(--muted)">AGRRA coral health surveys · ${g.surveys.length} survey${g.surveys.length > 1 ? 's' : ''}, ${ymd(d0).slice(0, 7)} to ${ymd(d1).slice(0, 7)} · ${g.colonies.toLocaleString()} colonies</div>
      ${mpa || resto ? `<div class="v" style="margin-top:4px">${esc([mpa, resto, titleCase(l.reef_type)].filter(Boolean).join(' · '))}</div>` : ''}
      ${depths.length ? `<div class="k">Survey depth (in situ)</div><div class="v">${Math.min(...depths)}${Math.max(...depths) !== Math.min(...depths) ? '–' + Math.max(...depths) : ''} m</div>` : ''}
      ${s ? `<div class="k">Latest quantitative survey · ${ymd(s.obs_dateTime)} · ${s._s.n} colonies</div>
      <table class="ctab"><tr><th>Healthy</th><th>Bleached*</th><th>Pale</th><th>SCTLD</th><th>Other disease</th><th>Recently dead</th></tr>
      <tr><td>${pct(s._s.healthy)}</td><td><b>${pct(s._s.bleach)}</b></td><td>${pct(s._s.pale)}</td><td><b>${pct(s._s.sctld)}</b></td><td>${pct(s._s.other)}</td><td>${pct(s._s.dead)}</td></tr></table>` : '<div class="v" style="margin-top:6px">No quantitative colony counts here (qualitative observations only).</div>'}
      ${pts.length > 1 ? `<div class="k">Over time: <span style="color:#fc8d59">bleached</span> · <span style="color:#ba68c8">SCTLD</span></div>${sparkSVG(pts, [['a', '#fc8d59'], ['b', '#ba68c8']], 280, 70)}` : ''}
      <div class="k">Recent surveys</div><table class="ctab"><tr><th>Date</th><th>n</th><th>Bleach</th><th>Pale</th><th>SCTLD</th><th>Dead</th><th>Depth</th></tr>${rows}</table>
      <div style="font-size:10px;color:var(--muted);margin-top:4px">*Fully plus partially bleached, including colonies that also have SCTLD. Source: AGRRA Coral Health Survey (public layer); contributors include Fragments of Hope.</div>
      ${actions('AGRRA-' + g.key, g.ll[0], g.ll[1]).replace(/<button data-star[^]*?<\/button>/, '')}</div>`;
  }
  function benthicPopup(s) {
    const l = s.latest, dsc = AG.desc[s.code] || {};
    const rows = s.surveys.slice().reverse().map((x) => `<tr><td>${x.SITEYEARMO || ymd(x.SITEDATE).slice(0, 4)}</td><td>${x.LCAVG != null ? x.LCAVG.toFixed(1) + '%' : '—'}</td><td>${x.FMAAVG != null ? x.FMAAVG.toFixed(1) + '%' : '—'}</td><td>${x.RHI ? `<span class="clar"><i style="background:${RHI_COL[x.RHI]}"></i>${x.RHI} ${RHI_LAB[x.RHI]}</span>${x._fishOnly ? ' <span style="color:var(--muted);font-size:10px">fish only</span>' : ''}` : '—'}</td></tr>`).join('');
    const fishNote = !s.hasBenthic ? '<div class="v" style="color:#ffb36b;font-size:12px;margin-top:4px">Fish-only survey: no benthic transects, so this RHI reflects fish biomass only.</div>'
      : s.latestAny !== s.latest ? `<div class="v" style="color:var(--muted);font-size:11px;margin-top:4px">A later fish-only survey (${s.latestAny.SITEYEARMO}) is listed below.</div>` : '';
    const pts = s.surveys.filter((x) => x.LCAVG != null).map((x) => ({ t: x.SITEDATE, a: (x.LCAVG || 0) / 100, b: x.FMAAVG != null ? x.FMAAVG / 100 : null }));
    const descTxt = [dsc.reef_zone, dsc.habitat, dsc.reef_type, dsc.exposure].filter(Boolean).map(esc).join(' · ');
    return `<div class="pp"><h3>${esc(s.name)} <span style="color:var(--muted);font-weight:400;font-size:12px">${esc(s.code)}</span></h3>
      <div class="v" style="color:var(--muted)">AGRRA benthic survey site · ${esc(l.COUNTRYNAM || '')} · ${s.surveys.length} survey${s.surveys.length > 1 ? 's' : ''}</div>
      <div class="k">Latest ${s.hasBenthic ? 'benthic ' : ''}survey · ${ymd(l.SITEDATE)}</div>
      <table class="ctab"><tr><th>Live coral</th><th>Fleshy macroalgae</th><th>Reef Health Index</th></tr>
      <tr><td><b>${l.LCAVG != null ? l.LCAVG.toFixed(1) + '%' : '—'}</b></td><td><b>${l.FMAAVG != null ? l.FMAAVG.toFixed(1) + '%' : '—'}</b></td><td>${l.RHI ? `<span class="clar"><i style="background:${RHI_COL[l.RHI]}"></i>${l.RHI} · ${RHI_LAB[l.RHI]}</span>` : '—'}${l.RHIAVG ? ` <span style="color:var(--muted);font-size:11px">(avg ${l.RHIAVG})</span>` : ''}</td></tr></table>
      <table class="ctab" style="margin-top:4px"><tr><th>Bleached</th><th>Diseased</th><th>Coral recruits</th><th>CCA</th><th>Diadema</th></tr>
      <tr><td>${l.CORALBLCH != null ? l.CORALBLCH.toFixed(1) + '%' : '—'}</td><td>${l.CORALDIS != null ? l.CORALDIS.toFixed(1) + '%' : '—'}</td><td>${l.RECRUITS != null ? (+l.RECRUITS).toFixed(1) + '/m²' : '—'}</td><td>${l.CCA != null ? (+l.CCA).toFixed(1) + '%' : '—'}</td><td>${l.DIADEMA != null ? (+l.DIADEMA).toFixed(2) + '/m²' : '—'}</td></tr></table>
      ${fishNote}
      ${dsc.depth || descTxt ? `<div class="k">Site</div><div class="v">${dsc.depth ? `Survey depth ${dsc.depth} m (2021)` : ''}${dsc.depth && descTxt ? ' · ' : ''}${descTxt}</div>` : ''}
      ${pts.length > 1 ? `<div class="k">Over time: <span style="color:#ff8c1a">live coral</span> · <span style="color:#3ddc6a">macroalgae</span></div>${sparkSVG(pts, [['a', '#ff8c1a'], ['b', '#3ddc6a']], 280, 70)}` : ''}
      <div class="k">All surveys</div><table class="ctab"><tr><th>Year</th><th>Live coral</th><th>Macroalgae</th><th>RHI</th></tr>${rows}</table>
      <div style="font-size:10px;color:var(--muted);margin-top:4px">Reef Health Index combines coral cover, fleshy macroalgae, herbivorous and commercial fish biomass (Healthy Reefs for Healthy People). Public site-level data end in 2021.</div></div>`;
  }
  function drawAgrra() {
    agBenthic.clearLayers(); agHealth.clearLayers(); ag23.clearLayers();
    AG.benthic.forEach((s) => {
      const r = s.hasBenthic ? s.latest.RHI : null;
      L.circleMarker(s.ll, { pane: 'agrra', radius: 6.5, color: '#0b1724', weight: 1.5, fillColor: RHI_COL[r] || '#9aa7b4', fillOpacity: 0.95, bubblingMouseEvents: false })
        .bindPopup(() => benthicPopup(s), { maxWidth: 340 })
        .bindTooltip(s.hasBenthic ? `${s.name}: coral ${s.latest.LCAVG != null ? s.latest.LCAVG.toFixed(0) + '%' : '—'}, RHI ${r || '—'} (${ymd(s.latest.SITEDATE).slice(0, 4)})` : `${s.name}: fish-only survey (${ymd(s.latest.SITEDATE).slice(0, 4)})`, { direction: 'top' }).addTo(agBenthic);
    });
    AG.health.forEach((g) => {
      const rad = 4 + Math.min(5, Math.log10(Math.max(10, g.colonies)) * 1.6);
      L.circleMarker(g.ll, { pane: 'agrra', radius: rad, color: '#ffffff', weight: 1.2, fillColor: healthColor(g), fillOpacity: 0.9, bubblingMouseEvents: false })
        .bindPopup(() => healthPopup(g), { maxWidth: 360 })
        .bindTooltip(`${g.name}: ${g.latestQ ? (healthMode === 'sctld' ? 'SCTLD ' + pct(g.latestQ._s.sctld) : 'bleached ' + pct(g.latestQ._s.bleach)) + ' (' + ymd(g.latestQ.obs_dateTime).slice(0, 7) + ')' : 'qualitative only'}`, { direction: 'top' }).addTo(agHealth);
    });
    AG.sites23.forEach((f) => {
      const p = f.properties, ll = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
      L.circleMarker(ll, { pane: 'agrra', radius: 5, color: '#ffffff', weight: 2, fill: false, dashArray: '2 2', bubblingMouseEvents: false })
        .bindPopup(`<div class="pp"><h3>${esc(p.Name || p.Code || 'AGRRA site')}</h3><div class="v" style="color:var(--muted)">AGRRA Belize 2023 survey site ${esc(p.Code || '')}</div>
          <div class="k">Reef</div><div class="v">${esc([p.Reef_Zone, p.Reef_Habitat, p.Reef_Type, p.Reef_Inclination].filter((x) => x && x !== 'Unknown').join(' · ') || '—')}</div>
          <div class="k">Transects</div><div class="v">benthic ${p.Benthic_Transects || 0} · coral ${p.Coral_Transects || 0} · fish ${p.Fish_Transects || 0}</div>
          <div class="v" style="margin-top:6px;color:var(--muted);font-size:11px">2023 results aren’t in the public layers yet.</div></div>`, { maxWidth: 300 }).addTo(ag23);
    });
    const nH = AG.health.reduce((a, g) => a + g.surveys.length, 0), nC = AG.health.reduce((a, g) => a + g.colonies, 0);
    const nB = AG.benthic.reduce((a, s) => a + s.surveys.length, 0);
    const nF = AG.benthic.reduce((a, s) => a + s.surveys.filter((x) => x._fishOnly).length, 0);
    const el = document.getElementById('agStatus');
    if (!el) return;
    if (!AG.live && !window.AGRRA) { el.textContent = AG.status ? 'AGRRA data couldn’t be loaded just now (' + AG.status + '). Reload to try again.' : 'Loading AGRRA data…'; return; }
    el.innerHTML = `${AG.live ? '<b style="color:#7ee0a0">Live</b> from AGRRA, fetched ' + new Date().toLocaleString() : 'Saved copy from ' + window.AGRRA.retrieved + (AG.status ? ' (' + esc(AG.status) + ')' : '')}.<br>Benthic: ${nB} surveys at ${AG.benthic.length} sites (${nF} fish-only). Coral health: ${nH} approved surveys at ${AG.health.length} locations, ${nC.toLocaleString()} colonies.`;
  }
  // Built from AGRRA's 2021 RHI sites (depth) and Belize 2023 survey layer (reef descriptors)
  function buildDesc(rhi21, s23) {
    const desc = {};
    (rhi21 || []).forEach((f) => { const p = f.properties, c = String(p.SiteCode || '').trim().replace(/\.$/, ''); if (!c) return;
      desc[c] = Object.assign(desc[c] || {}, p.SiteDepth > 0 ? { depth: p.SiteDepth } : {}, p.SubregionN ? { subregion: p.SubregionN } : {}); });
    (s23 || []).forEach((f) => { const p = f.properties, c = String(p.Code || '').trim(); if (!c) return;
      const o = { reef_type: p.Reef_Type, reef_zone: p.Reef_Zone, habitat: p.Reef_Habitat, exposure: p.Reef_Exposure, inclination: p.Reef_Inclination, subregion: p.Subregion };
      Object.keys(o).forEach((k) => { if (!o[k] || ['Unknown', 'Other', ' '].includes(o[k])) delete o[k]; });
      desc[c] = Object.assign(desc[c] || {}, o); });
    return desc;
  }
  function nearestAgrra(lat, lon) {
    let b = null, h = null;
    AG.benthic.forEach((s) => { if (!s.hasBenthic) return; const d = hav([lat, lon], s.ll); if (!b || d < b.d) b = { s, d }; });
    AG.health.forEach((g) => { const d = hav([lat, lon], g.ll); if (!h || d < h.d) h = { g, d }; });
    return { b, h };
  }
  function agrraNearHTML(lat, lon) {
    if (!AG.benthic.length && !AG.health.length) return '';
    const { b, h } = nearestAgrra(lat, lon), lim = 10;
    const bt = b && b.d <= lim ? `${esc(b.s.name)} (${b.d.toFixed(1)} km): coral ${b.s.latest.LCAVG != null ? b.s.latest.LCAVG.toFixed(0) + '%' : '—'}, macroalgae ${b.s.latest.FMAAVG != null ? b.s.latest.FMAAVG.toFixed(0) + '%' : '—'}, RHI ${b.s.latest.RHI ? b.s.latest.RHI + ' ' + RHI_LAB[b.s.latest.RHI] : '—'} (${ymd(b.s.latest.SITEDATE).slice(0, 4)})` : 'none within 10 km';
    const q = h && h.g.latestQ;
    const ht = h && h.d <= lim ? `${esc(h.g.name)} (${h.d.toFixed(1)} km): ${q ? `bleached ${pct(q._s.bleach)}, SCTLD ${pct(q._s.sctld)} (${ymd(q.obs_dateTime)})` : 'qualitative only'}` : 'none within 10 km';
    return `<div class="k">Nearest reef monitoring (AGRRA)</div><div class="v" style="font-size:12px">Benthic: ${bt}<br>Coral health: ${ht}</div>`;
  }
  // AGRRA public services. The local copy ships a saved snapshot (data/agrra.js) as a fallback;
  // the web copy has no snapshot and always loads live, so AGRRA data aren't redistributed.
  const AGB = 'https://services8.arcgis.com/C2yYpahRgrVlBqfg/arcgis/rest/services/';
  const AG_CONF = { bbox: [-89.25, 15.85, -87.95, 16.6], services: { benthic: AGB + 'BaseBySite/FeatureServer/0', health: AGB + 'Coral_Health_Survey_mapping/FeatureServer/0', sites2023: AGB + 'BelizeSurvey/FeatureServer/0', rhi2021: AGB + 'RHI_Sites_2021P/FeatureServer/0' } };
  if (window.AGRRA) buildAgrra(window.AGRRA); else drawAgrra();
  (async function liveAgrra() {
    const bb = AG_CONF.bbox.join(',');
    const q = (url, extra) => `${url}/query?where=1%3D1&geometry=${bb}&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&f=geojson${extra || ''}`;
    const get = async (u) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), 20000); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); } finally { clearTimeout(t); } };
    const S_ = AG_CONF.services;
    try {
      const [b, h1, s23, r21] = await Promise.all([get(q(S_.benthic)), get(q(S_.health, '&resultRecordCount=2000')), get(q(S_.sites2023)).catch(() => ({})), get(q(S_.rhi2021)).catch(() => ({}))]);
      if (!b.features || !h1.features || !b.features.length || !h1.features.length) throw new Error('empty response');
      AG.live = true;
      const s23f = s23.features || (window.AGRRA && window.AGRRA.sites2023) || [];
      const desc = r21.features ? buildDesc(r21.features, s23f) : (window.AGRRA && window.AGRRA.desc) || {};
      buildAgrra({ benthic: b.features, health: h1.features, sites2023: s23f, desc });
    } catch (e) { AG.status = window.AGRRA ? 'live refresh unavailable' : 'no connection to AGRRA'; drawAgrra(); }
  })();

  // ---------- candidate sites ----------
  const registry = [];   // {id,type,name,sub,prot,protLabel,lat,lon,bounds,open()}
  const NODE_COL = { mangrove: C.mangrove, seagrass: C.seagrass, reef: C.coral };
  const CONN_COL = { '1': C.tight, '2': C.inter, '3': C.loose, '4': C.disc };
  function nodeIcon(node) {
    const f = NODE_COL[node], s = 'stroke="#fff" stroke-width="2"';
    const shape = node === 'mangrove' ? `<polygon points="9,2 16,15 2,15" fill="${f}" ${s}/>` : node === 'seagrass' ? `<rect x="3" y="3" width="12" height="12" fill="${f}" ${s}/>` : `<circle cx="9" cy="9" r="6.5" fill="${f}" ${s}/>`;
    return L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9], html: `<svg width="18" height="18" viewBox="0 0 18 18">${shape}</svg>` });
  }
  const assessCol = (a) => /priority/i.test(a) ? '#ff3b30' : /classification shift/i.test(a) ? '#ffcc00' : /tenure/i.test(a) ? '#c9a7ff' : '#8fa6bd';
  const assessShort = (a) => /priority/i.test(a) ? 'Priority: seaward-fringe loss' : /classification shift/i.test(a) ? 'Verify: likely classification shift' : /tenure/i.test(a) ? 'Verify: tenure unknown' : 'Remote: border area';
  function diamond(fill, stroke, size) {
    const h = size / 2;
    return L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [h, h], html: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><polygon points="${h},1 ${size - 1},${h} ${h},${size - 1} 1,${h}" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>` });
  }
  function protClassC(p) { return /no-take/i.test(p) ? 'notake' : /unprotected/i.test(p) ? 'none' : 'mpa'; }

  function actions(id, la, lo) {
    return `<div class="acts"><button onclick="__copy('${fmt(la)}, ${fmt(lo)}', this)">Copy coords</button>
      <a href="${gmaps(la, lo)}" target="_blank" rel="noopener">Google Maps</a>
      <button data-star="${id}" onclick="__star('${id}', this)">${isShort(id) ? '★ Shortlisted' : '☆ Shortlist'}</button></div>`;
  }

  // Corridors
  const wpByC = {};
  S.corridor_waypoints.features.forEach((f) => { (wpByC[f.properties.corridor] = wpByC[f.properties.corridor] || []).push(f); });
  const corridorGroup = L.layerGroup();
  S.corridor_transects.features.forEach((t) => {
    const cid = t.properties.corridor, wps = wpByC[cid];
    const parts = wps[0].properties.Description.split(' | ');
    const protection = parts[1], connTxt = parts[2], connCls = connTxt.charAt(0);
    const coords = t.geometry.coordinates.map((c) => [c[1], c[0]]);
    let len = 0; for (let i = 1; i < coords.length; i++) len += hav(coords[i - 1], coords[i]);
    const reef = wps.find((w) => w.properties.node === 'reef');
    const rl = [reef.properties.lat, reef.properties.lon];
    const nodeRows = wps.map((w) => `<tr><td style="padding-right:8px;text-transform:capitalize">${w.properties.node}</td><td style="font-family:ui-monospace,Consolas,monospace;font-size:12px">${fmt(w.properties.lat)}, ${fmt(w.properties.lon)}</td></tr>`).join('');
    const popup = () => `<div class="pp"><h3>${cid} · ${esc(t.properties.name)}</h3>
      <div class="k">Protection</div><div class="v">${esc(protection)}</div>
      <div class="k">Reef–mangrove connectivity</div><div class="v"><span class="sw" style="background:${CONN_COL[connCls]};width:10px;height:10px;display:inline-block;margin-right:5px"></span>${esc(connTxt.slice(2))}</div>
      <div class="k">Transect length · reef node from Punta Gorda</div><div class="v">${len.toFixed(2)} km · ${hav(PG, rl).toFixed(1)} km</div>
      <div class="k">Nodes</div><table class="v" style="border-collapse:collapse">${nodeRows}</table>
      ${siteClarityHTML(cid + '-reef', { label: 'reef node' })}
      ${depthHTML(rl[0], rl[1], 'Regional depth at reef node', true)}
      ${agrraNearHTML(rl[0], rl[1])}
      ${siteStat(cid + '-seagrass') && siteStat(cid + '-seagrass').all ? `<div class="k">Seagrass node · ${SEASON_LABEL[season]}</div><div class="v">${chip((siteStat(cid + '-seagrass')[season] || siteStat(cid + '-seagrass').all).med)}</div>` : ''}
      ${actions(cid, rl[0], rl[1])}</div>`;
    const casing = L.polyline(coords, { color: '#0b1724', weight: 6, opacity: 0.7, interactive: false });
    const line = L.polyline(coords, { color: '#ffffff', weight: 3, bubblingMouseEvents: false }).bindPopup(popup, { maxWidth: 320 });
    const markers = wps.map((w) => L.marker([w.properties.lat, w.properties.lon], { icon: nodeIcon(w.properties.node), riseOnHover: true })
      .bindPopup(popup, { maxWidth: 320 }).bindTooltip(`${cid} ${w.properties.node}`, { direction: 'top', offset: [0, -8] }));
    const label = L.marker(rl, { icon: L.divIcon({ className: '', iconSize: [0, 0] }), interactive: false })
      .bindTooltip(cid, { permanent: true, direction: 'right', offset: [10, 0], className: 'lbl c' });
    const g = L.layerGroup([casing, line, ...markers, label]).addTo(corridorGroup);
    registry.push({
      id: cid, stat: cid + '-reef', type: 'C', name: t.properties.name, sub: `Corridor · ${connTxt.slice(2)}`, prot: protClassC(protection), protLabel: protection,
      lat: rl[0], lon: rl[1], bounds: L.latLngBounds(coords).pad(0.6), open: () => markers[2] ? markers.find((m, i) => wps[i].properties.node === 'reef').openPopup() : line.openPopup(),
      nodes: wps.map((w) => ({ node: w.properties.node, lat: w.properties.lat, lon: w.properties.lon })), notes: `Connectivity ${connTxt.slice(2)}; transect ${len.toFixed(2)} km`
    });
  });
  LYR.corr1 = () => corridorGroup;

  // ---------- revised, clarity-screened corridors R1–Rn ----------
  const RV = window.REVISED;
  const revGroup = L.layerGroup();
  const REGION_COL = { 'Central Port Honduras': '#ffd23f', 'Inshore near Punta Gorda': '#ffb36b', 'Sapodilla Cayes': '#7ee0ff', 'Northern lagoon (Placencia base)': '#c3a6ff' };
  const SC_LABEL = { clarity: 'Water clarity (40%)', habitat: 'Habitat extent (20%)', connectivity: 'Connectivity (15%)', access: 'Access from Punta Gorda (15%)', river: 'Distance from river mouths (10%)' };
  function bigNodeIcon(node, rid) {
    const f = NODE_COL[node], s = 'stroke="#fff" stroke-width="2.5"';
    const shape = node === 'mangrove' ? `<polygon points="11,2 20,19 2,19" fill="${f}" ${s}/>` : node === 'seagrass' ? `<rect x="3" y="3" width="16" height="16" rx="2" fill="${f}" ${s}/>` : `<circle cx="11" cy="11" r="8.5" fill="${f}" ${s}/>`;
    return L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11], html: `<svg width="22" height="22" viewBox="0 0 22 22">${shape}</svg>` });
  }
  const nodeName = { mangrove: 'Mangrove', seagrass: 'Seagrass', reef: 'Coral' };
  RV.sites.forEach((s) => {
    WD.sites[s.id + '-reef'] = s.stat_reef; WD.sites[s.id + '-seagrass'] = s.stat_sg;
    const pts = { mangrove: s.mangrove, seagrass: s.seagrass, reef: s.reef };
    const bars = Object.entries(s.sc).map(([k, v]) => `<tr><td>${SC_LABEL[k]}</td><td style="width:90px"><div style="height:7px;border-radius:3px;background:linear-gradient(90deg,${C.yellow} ${v * 100}%,#22405f ${v * 100}%)"></div></td><td>${v.toFixed(2)}</td></tr>`).join('');
    const nodeRows = ['mangrove', 'seagrass', 'reef'].map((n) => {
      const st = n === 'reef' ? s.stat_reef : n === 'seagrass' ? s.stat_sg : null;
      const v = st && (st[season] || st.all);
      return `<tr><td>${nodeName[n]}</td><td style="font-family:ui-monospace,Consolas,monospace;font-size:12px">${fmt(pts[n][0])}, ${fmt(pts[n][1])}</td><td>${v ? chip(v.med) : '<span style="color:var(--muted);font-size:11px">intertidal</span>'}</td></tr>`;
    }).join('');
    const popup = () => `<div class="pp"><h3>${s.id} · ${esc(s.near)} area</h3>
      <div class="v" style="color:${REGION_COL[s.region]}">${esc(s.region)}</div>
      <div class="k">Suitability score</div><div class="v"><b style="font-size:16px">${s.total.toFixed(2)}</b> / 1 <span style="color:var(--muted);font-size:11px">(clarity-weighted, see About)</span></div>
      <table class="ctab">${bars}</table>
      <div class="k">Protection · connectivity</div><div class="v">${esc(s.prot)} · ${esc(s.conn)} (reef–mangrove ${s.drm.toFixed(2)} km)</div>
      <div class="k">Nodes · ${SEASON_LABEL[season]} median turbidity</div><table class="ctab">${nodeRows}</table>
      <div class="k">Habitat in reach</div><div class="v">${s.coral_ha} ha coral/algae within 400 m of the coral node · ${s.sg_ha} ha seagrass within 300 m of the seagrass node · ${s.mang_ha} ha mangrove within 500 m${/v4\.1/.test(s.msrc) ? ' <span style="color:var(--muted);font-size:11px">(mangrove from the v4.1 scouting point; not in GMW v3)</span>' : ''}</div>
      <div class="k">Access</div><div class="v">${s.dpg} km from Punta Gorda · ${s.dab} km from Abalone Caye ranger stn</div>
      ${siteClarityHTML(s.id + '-reef', { label: 'coral node' })}
      ${depthHTML(s.reef[0], s.reef[1], 'Regional depth at coral node', true)}
      ${agrraNearHTML(s.reef[0], s.reef[1])}
      ${actions(s.id, s.reef[0], s.reef[1])}</div>`;
    const ll = ['mangrove', 'seagrass', 'reef'].map((n) => pts[n]);
    // site-area halo so the three nodes read as one site
    const b = L.latLngBounds(ll), ctr = b.getCenter();
    const rad = Math.max(...ll.map((p) => map.distance(ctr, p))) + 120;
    const halo = L.circle(ctr, { radius: rad, color: REGION_COL[s.region], weight: 1.5, dashArray: '4 4', fillColor: REGION_COL[s.region], fillOpacity: 0.06, interactive: false });
    const casing = L.polyline(ll, { color: '#0b1724', weight: 6, opacity: 0.7, interactive: false });
    const line = L.polyline(ll, { color: REGION_COL[s.region], weight: 3, bubblingMouseEvents: false }).bindPopup(popup, { maxWidth: 340 });
    const markers = ['mangrove', 'seagrass', 'reef'].map((n) => L.marker(pts[n], { icon: bigNodeIcon(n), riseOnHover: true, zIndexOffset: n === 'mangrove' ? 300 : n === 'seagrass' ? 200 : 100 })
      .bindPopup(popup, { maxWidth: 340 }).bindTooltip(`${s.id} ${nodeName[n].toLowerCase()} node`, { direction: 'top', offset: [0, -10] }));
    const label = L.marker(s.reef, { icon: L.divIcon({ className: '', iconSize: [0, 0] }), interactive: false })
      .bindTooltip(s.id, { permanent: true, direction: 'right', offset: [12, 0], className: 'lbl rv' });
    L.layerGroup([halo, casing, line, ...markers, label]).addTo(revGroup);
    registry.push({
      id: s.id, stat: s.id + '-reef', type: 'R', score: s.total, name: `${s.near} area`, sub: `${s.region} · ${s.conn} · score ${s.total.toFixed(2)}`,
      prot: /no-take/i.test(s.prot) ? 'notake' : s.prot === 'unprotected' ? 'none' : 'mpa', protLabel: s.prot, lat: s.reef[0], lon: s.reef[1],
      bounds: L.latLngBounds(ll).pad(0.6), open: () => markers[2].openPopup(), search: s.region + ' ' + s.near,
      nodes: ['mangrove', 'seagrass', 'reef'].map((n) => ({ node: n, lat: pts[n][0], lon: pts[n][1] })),
      notes: `Clarity-screened corridor; score ${s.total}; ${s.conn}; coral ${s.coral_ha} ha, seagrass ${s.sg_ha} ha, mangrove ${s.mang_ha} ha in reach`
    });
  });
  LYR.rcorr = () => revGroup;
  document.head.insertAdjacentHTML('beforeend', '<style>.lbl.rv{color:#0b1724;background:#ffd23f;font-size:12px}</style>');

  // Mangrove plot candidates
  const mangGroup = L.layerGroup();
  S.mangrove_loss_candidates.features.forEach((f) => {
    const p = f.properties, col = assessCol(p.assessment);
    const popup = () => `<div class="pp"><h3>${p.Name} · mangrove plot candidate</h3>
      <div class="k">Assessment</div><div class="v">${esc(p.assessment)}</div>
      <div class="k">Apparent loss 2015→2025 (GMW v4.1)</div><div class="v">${p.ha} ha</div>
      <div class="k">Protected area / tenure</div><div class="v">${esc(p.protected_area)}</div>
      <div class="k">From Punta Gorda</div><div class="v">${p.km_PG} km (straight line)</div>
      <div class="k">Centroid</div><div class="v" style="font-family:ui-monospace,Consolas,monospace;font-size:12px">${fmt(p.lat)}, ${fmt(p.lon)}</div>
      ${siteClarityHTML(p.Name, { label: 'adjacent water', extra: 'For mangrove plots, turbid water also means sediment supply, which helps seedlings establish. It only limits diving where the plot is reached by water.' })}
      ${actions(p.Name, p.lat, p.lon)}</div>`;
    const poly = L.geoJSON(f, { pane: 'sitepoly', style: { color: col, weight: 2, fillColor: col, fillOpacity: 0.35 }, bubblingMouseEvents: false });
    poly.bindPopup(popup, { maxWidth: 320 });
    const mk = L.marker([p.lat, p.lon], { icon: diamond(col, '#111', 16), riseOnHover: true }).bindPopup(popup, { maxWidth: 320 })
      .bindTooltip(p.Name, { permanent: true, direction: 'right', offset: [8, 0], className: 'lbl m' });
    L.layerGroup([poly, mk]).addTo(mangGroup);
    const prot = /^none/i.test(p.protected_area) ? 'none' : 'terr';
    registry.push({ id: p.Name, stat: p.Name, type: 'M', name: assessShort(p.assessment), sub: `${p.ha} ha · ${p.protected_area.split(';')[0]}`, prot, protLabel: p.protected_area,
      lat: p.lat, lon: p.lon, bounds: poly.getBounds().pad(2.5), open: () => mk.openPopup(), notes: `${p.assessment}; ${p.ha} ha apparent loss 2015-2025 (GMW v4.1)`, search: p.assessment + ' ' + p.protected_area });
  });
  LYR.mcand = () => mangGroup;

  // Seagrass plot candidates
  const sgGroup = L.layerGroup();
  S.seagrass_gap_candidates.features.forEach((f) => {
    const p = f.properties, nt = /no-take/i.test(p.zone), col = nt ? '#00e5ff' : '#ffffff';
    const popup = () => `<div class="pp"><h3>${p.Name} · seagrass plot candidate</h3>
      <div class="k">Bare patch inside seagrass</div><div class="v">${p.ha} ha · ${(p.sg_frac_ring * 100).toFixed(0)}% of surrounding ring is seagrass</div>
      <div class="k">Zone</div><div class="v">${esc(p.zone === 'PHMR' ? 'PHMR general use' : p.zone)}</div>
      <div class="k">Distance</div><div class="v">${p.km_Abalone} km from Abalone Caye ranger stn · ${p.km_PG} km from Punta Gorda</div>
      <div class="k">Centroid</div><div class="v" style="font-family:ui-monospace,Consolas,monospace;font-size:12px">${fmt(p.lat)}, ${fmt(p.lon)}</div>
      ${siteClarityHTML(p.Name, { extra: 'The bare sand in the gap reflects light and may inflate the reading at this shallow site.' })}
      ${actions(p.Name, p.lat, p.lon)}</div>`;
    const poly = L.geoJSON(f, { pane: 'sitepoly', style: { color: col, weight: 2, fillColor: '#f2e3b3', fillOpacity: 0.5 }, bubblingMouseEvents: false });
    poly.bindPopup(popup, { maxWidth: 320 });
    const mk = L.marker([p.lat, p.lon], { icon: diamond('rgba(11,23,36,.6)', col, 14), riseOnHover: true }).bindPopup(popup, { maxWidth: 320 })
      .bindTooltip(p.Name, { permanent: true, direction: 'left', offset: [-7, 0], className: 'lbl s' });
    L.layerGroup([poly, mk]).addTo(sgGroup);
    registry.push({ id: p.Name, stat: p.Name, type: 'S', name: `Bare patch ${p.ha} ha in seagrass`, sub: `${p.km_Abalone} km from Abalone · ${p.zone === 'PHMR' ? 'PHMR general use' : p.zone}`,
      prot: nt ? 'notake' : 'mpa', protLabel: p.zone === 'PHMR' ? 'PHMR general use' : p.zone, lat: p.lat, lon: p.lon, bounds: poly.getBounds().pad(8),
      open: () => mk.openPopup(), notes: `Bare patch ${p.ha} ha; ${(p.sg_frac_ring * 100).toFixed(0)}% seagrass in surrounding ring; ${p.km_Abalone} km from Abalone Caye` });
  });
  LYR.scand = () => sgGroup;

  // ---------- layer list UI ----------
  const sw = (bg, extra) => `<span class="sw" style="background:${bg};${extra || ''}"></span>`;
  const DEF = {
    'lyr-sites': [
      ['rcorr', false, 'Clarity-screened sites R1–R13', 'Each site: mangrove ▲, seagrass ■, coral ● nodes inside a dashed site circle', sw('#ffd23f', 'height:3px'), `<span>${sw(C.mangrove)}mangrove</span><span>${sw(C.seagrass)}seagrass</span><span>${sw(C.coral)}coral</span><br><span>${sw('#ffd23f')}central PHMR</span><span>${sw('#ffb36b')}inshore</span><span>${sw('#7ee0ff')}Sapodilla</span><span>${sw('#c3a6ff')}north lagoon</span>`],
      ['corr1', false, 'Original corridors C1–C11', 'First scouting pass, before clarity screening', sw('#fff', 'height:3px')],
      ['mcand', false, 'Mangrove plot candidates M1–M12', 'Apparent 2015→2025 loss patches', sw('#ff3b30', 'transform:rotate(45deg);width:11px;height:11px'), `<span>${sw('#ff3b30')}priority</span><span>${sw('#ffcc00')}verify: ecotone</span><span>${sw('#c9a7ff')}verify: tenure</span><span>${sw('#8fa6bd')}remote</span>`],
      ['scand', false, 'Seagrass plot candidates S1–S10', 'Bare patches within seagrass', sw('transparent', 'border:2px solid #fff;transform:rotate(45deg);width:10px;height:10px'), `<span>${sw('#00e5ff')}no-take zone</span><span>${sw('#fff')}general use</span>`]
    ],
    'lyr-hab': [
      ['seagrass', false, 'Seagrass', 'Allen Coral Atlas benthic', sw(C.seagrass)],
      ['coral', false, 'Coral/Algae hard bottom', 'Allen Coral Atlas benthic', sw(C.coral)],
      ['conn', false, 'Reef–mangrove connectivity', 'Coral/Algae coloured by distance to nearest mangrove', sw(`linear-gradient(90deg,${C.tight},${C.inter},${C.loose},${C.disc})`), `<span>${sw(C.tight)}&lt;1 km</span><span>${sw(C.inter)}1–5</span><span>${sw(C.loose)}5–15</span><span>${sw(C.disc)}&gt;15 km</span>`],
      ['mang', false, 'Mangrove extent 2020', 'Global Mangrove Watch v3', sw(C.mangrove)],
      ['mchange', false, 'Mangrove change 2010→2020', 'GMW v3: loss and gain', sw(`linear-gradient(90deg,${C.mloss} 50%,${C.mgain} 50%)`), `<span>${sw(C.mloss)}loss</span><span>${sw(C.mgain)}gain</span>`]
    ],
    'lyr-water': [
      ['rivers', false, 'Rivers, creeks and mouths', 'OpenStreetMap · ▼ = mouth', sw('#6ec6ff', 'height:3px')],
      ['turb', false, 'Median turbidity (sea)', 'Sentinel-2 2020–25, 120 m · uses season and opacity below', sw('linear-gradient(90deg,#10408c,#28b9c8,#f0dc5a,#f59628,#6e3214)')],
      ['freq', false, 'How often it’s murky (sea)', 'Share of clear-sky days above 5 FNU · uses season and opacity below', sw('linear-gradient(90deg,rgba(255,230,150,.4),#f06420,#78002a)')]
    ],
    'lyr-depth': [
      ['bathy', false, 'Bathymetry (colour)', 'Regional depth grid, ~460 m cells · NOAA NCEI DEM mosaic', sw('linear-gradient(90deg,#d6f4fa,#58b6de,#1c58a0,#051234)')],
      ['iso', false, 'Depth contours', '2, 5, 10, 15, 20, 30, 50, 100, 200, 500, 1000 m · hover for depth', sw('transparent', 'border-top:2px solid #fff;height:6px;border-radius:0')]
    ],
    'lyr-agrra': [
      ['agh', false, 'Coral health surveys', 'Bleaching and disease, 2017–2026 · colour = latest survey', sw('#fc8d59', 'border-radius:50%;width:11px;height:11px;border:1.5px solid #fff'), `<span id="hlLegend"></span>`],
      ['agb', false, 'Benthic surveys (Reef Health Index)', 'Live coral, macroalgae, RHI · 2011–2021', sw('#f2d33a', 'border-radius:50%;width:11px;height:11px;border:1.5px solid #0b1724'), Object.entries({ 1: 'critical', 2: 'poor', 3: 'fair', 4: 'good', 5: 'very good' }).map(([k, v]) => `<span>${sw(RHI_COL[k], 'border-radius:50%')}${v}</span>`).join('') + `<span>${sw('#9aa7b4', 'border-radius:50%')}fish-only survey</span>`],
      ['ag23', false, '2023 survey sites (results pending)', 'Site descriptions only', sw('transparent', 'border-radius:50%;width:10px;height:10px;border:2px dashed #fff')]
    ],
    'lyr-prot': [
      ['mpa', false, 'Marine reserves', 'Port Honduras, Sapodilla Cayes, Gladden Spit, HPMAs, etc.', sw('transparent', `border:2px solid ${C.accent}`)],
      ['notake', false, 'PHMR replenishment (no-take) zones', 'Four WDPA sub-polygons of Port Honduras MR', sw('rgba(255,255,255,.25)', 'border:2px dashed #fff')],
      ['terr', false, 'Terrestrial protected areas', 'Paynes Creek NP, TIDE Private Reserve, Sarstoon-Temash…', sw('transparent', 'border:2px dashed #ffc83d')],
      ['ramsar', false, 'Ramsar sites', '', sw('transparent', 'border:2px dotted #7fe0c4')],
      ['whs', false, 'Belize Barrier Reef WHS', 'World Heritage Site serial property', sw('transparent', 'border:2px dashed #b28dff')]
    ],
    'lyr-ref': [
      ['refpts', true, 'Reference points', 'Punta Gorda and Abalone Caye ranger station', sw('#ffd23f', 'border-radius:50%;width:11px;height:11px')],
      ['rings', true, 'Distance from Punta Gorda', '10 / 25 / 50 km rings', sw('transparent', 'border:1px dashed #fff;border-radius:50%;width:12px;height:12px')],
      ['labels', false, 'Place names', 'Esri reference overlay', sw('transparent', 'border:1px solid #888')]
    ]
  };
  const saved = store.get('seastrong_layers_v2', {});
  const cbByKey = {};
  Object.entries(DEF).forEach(([el, rows]) => {
    const host = document.getElementById(el);
    rows.forEach(([key, on, title, sub, swatch, legend]) => {
      const isOn = key in saved ? saved[key] : on;
      const wrap = document.createElement('div');
      wrap.innerHTML = `<label class="row"><input type="checkbox" ${isOn ? 'checked' : ''}>${swatch}<span class="t">${title}${sub ? `<small>${sub}</small>` : ''}</span></label>${legend ? `<div class="sub">${legend}</div>` : ''}`;
      const cb = wrap.querySelector('input');
      cbByKey[key] = cb;
      const apply = () => { const l = LYR[key](); if (cb.checked) l.addTo(map); else map.removeLayer(l); saved[key] = cb.checked; store.set('seastrong_layers_v2', saved); if (key === 'turb' || key === 'freq') updateClarityControls(); };
      cb.addEventListener('change', apply);
      if (isOn) LYR[key]().addTo(map);
      host.appendChild(wrap);
    });
  });

  // season chips, clarity legend, opacity
  function renderTurbLegend() {
    const ticks = [0.3, 1, 2, 5, 10, 30], lo = Math.log10(0.3), hi = Math.log10(30);
    const grad = 'linear-gradient(90deg,#10408c 0%,#1678be 18%,#28b9c8 30%,#82d78c 41%,#f0dc5a 53%,#f59628 65%,#be501e 80%,#6e3214 100%)';
    document.getElementById('turbLegend').innerHTML =
      `<div>Median turbidity, FNU · <b style="color:var(--text)">${SEASON_LABEL[season]}</b></div><div class="bar" style="background:${grad}"></div>
       <div class="ticks">${ticks.map((t) => `<span>${t}</span>`).join('')}</div>
       <div style="margin-top:3px">&lt;1 very clear · 1–2 clear · 2–5 moderate · 5–10 turbid · &gt;10 plume. <span style="display:inline-block;width:10px;height:10px;background:#c8c8c8;vertical-align:middle;border-radius:2px"></span> optically shallow (bright bottom, excluded)</div>
       <div style="margin-top:6px">How often murky: <span style="display:inline-block;width:90px;height:8px;vertical-align:middle;border-radius:2px;background:linear-gradient(90deg,rgba(255,230,150,.35),#ffb43c 30%,#f06420 50%,#c81e1e 70%,#78002a)"></span> 5% → 80%+ of clear-sky days</div>`;
  }
  function setSeason(s) {
    season = s; store.set('seastrong_season', s);
    turbImg.setUrl(`data/turbidity/turb_${s}.png`); freqImg.setUrl(`data/turbidity/freq5_${s}.png`);
    document.querySelectorAll('#seasonChips button').forEach((b) => b.classList.toggle('on', b.dataset.s === s));
    renderTurbLegend(); renderList && renderList();
  }
  // The season chips and opacity slider only drive the two sea-clarity layers.
  // Dim them while both layers are off, and switch on median turbidity if someone uses them anyway.
  function clarityOn() { return cbByKey.turb.checked || cbByKey.freq.checked; }
  function ensureClarity() { if (!clarityOn()) { cbByKey.turb.checked = true; cbByKey.turb.dispatchEvent(new Event('change')); } }
  function updateClarityControls() {
    const on = clarityOn();
    ['seasonChips', 'turbLegend'].forEach((id) => (document.getElementById(id).style.opacity = on ? 1 : 0.45));
    document.getElementById('turbOp').closest('.slider').style.opacity = on ? 1 : 0.45;
    let hint = document.getElementById('clarHint');
    if (!hint) { hint = document.createElement('div'); hint.id = 'clarHint'; hint.className = 'note'; hint.style.margin = '6px 0 0 26px'; document.getElementById('seasonChips').before(hint); }
    hint.textContent = 'Season and opacity apply to the two sea-clarity layers above. Tick one to see them, or pick a season to switch median turbidity on.';
    hint.style.display = on ? 'none' : 'block';
  }
  document.querySelectorAll('#seasonChips button').forEach((b) => (b.onclick = () => { ensureClarity(); setSeason(b.dataset.s); }));
  document.getElementById('turbOp').addEventListener('input', (e) => { ensureClarity(); turbOpacity = +e.target.value; turbImg.setOpacity(turbOpacity); freqImg.setOpacity(turbOpacity); });
  updateClarityControls();

  // coral-health colour mode
  function renderHealthLegend() {
    const L1 = healthMode === 'sctld'
      ? [['#2ca25f', 'none'], ['#ab47bc', '≤5%'], ['#6a1b9a', '>5% of colonies'], ['#9aa7b4', 'qualitative only']]
      : [['#2ca25f', '<5%'], ['#fee08b', '5–20%'], ['#fc8d59', '20–50%'], ['#d73027', '≥50% bleached'], ['#9aa7b4', 'qualitative only']];
    const el = document.getElementById('hlLegend');
    if (el) el.innerHTML = L1.map(([c, t]) => `<span>${sw(c, 'border-radius:50%')}${t}</span>`).join('');
    document.querySelectorAll('#healthChips button').forEach((b) => b.classList.toggle('on', b.dataset.m === healthMode));
  }
  document.querySelectorAll('#healthChips button').forEach((b) => (b.onclick = () => {
    healthMode = b.dataset.m; store.set('seastrong_healthmode', healthMode); renderHealthLegend(); drawAgrra();
    if (!cbByKey.agh.checked) { cbByKey.agh.checked = true; cbByKey.agh.dispatchEvent(new Event('change')); }
  }));
  renderHealthLegend();

  // zoom-dependent labels
  function labelZoom() {
    const z = map.getZoom(), el = map.getContainer();
    el.classList.toggle('hide-r', z < 9); el.classList.toggle('hide-rm', z < 11);
    el.classList.toggle('hide-s', z < 12); el.classList.toggle('hide-m', z < 11); el.classList.toggle('hide-c', z < 9);
  }
  const st = document.createElement('style');
  st.textContent = '.hide-s .lbl.s{display:none}.hide-m .lbl.m{display:none}.hide-c .lbl.c{display:none}';
  document.head.appendChild(st);
  map.on('zoomend', labelZoom); labelZoom();

  // zoom presets
  const zb = (b) => () => map.flyToBounds(b, { duration: 0.8 });
  document.getElementById('zAll').onclick = zb(AOI);
  document.getElementById('zPH').onclick = zb(L.latLngBounds([16.10, -88.80], [16.27, -88.50]));
  document.getElementById('zOff').onclick = zb(L.latLngBounds([16.03, -88.40], [16.50, -88.05]));
  document.getElementById('zMang').onclick = zb(L.latLngBounds([16.23, -88.73], [16.31, -88.56]));
  document.getElementById('zCentral').onclick = zb(L.latLngBounds([16.14, -88.68], [16.23, -88.49]));

  // coordinates readout and click-identify
  const coordEl = document.getElementById('coord');
  map.on('mousemove', (e) => { coordEl.textContent = `${fmt(e.latlng.lat)}, ${fmt(e.latlng.lng)}`; });
  map.on('click', (e) => {
    const ll = [e.latlng.lat, e.latlng.lng];
    let best = null; registry.forEach((r) => { const d = hav(ll, [r.lat, r.lon]); if (!best || d < best.d) best = { r, d }; });
    L.popup({ maxWidth: 280 }).setLatLng(e.latlng).setContent(`<div class="pp"><div class="k" style="margin-top:0">Point</div>
      <div class="v" style="font-family:ui-monospace,Consolas,monospace">${fmt(ll[0])}, ${fmt(ll[1])}</div>
      <div class="k">From Punta Gorda · Abalone Caye</div><div class="v">${hav(PG, ll).toFixed(1)} km · ${hav(ABALONE, ll).toFixed(1)} km</div>
      <div class="k">Nearest candidate site</div><div class="v">${best.r.id} (${best.d.toFixed(2)} km)</div>
      ${depthHTML(ll[0], ll[1])}
      ${pointClarityHTML(ll[0], ll[1])}
      <div class="acts"><button onclick="__copy('${fmt(ll[0])}, ${fmt(ll[1])}', this)">Copy coords</button><a href="${gmaps(ll[0], ll[1])}" target="_blank" rel="noopener">Google Maps</a></div></div>`).openOn(map);
  });

  // ---------- tabs ----------
  document.querySelectorAll('nav.tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('nav.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + b.dataset.tab));
  }));
  const side = document.getElementById('side');
  document.getElementById('toggleSide').onclick = () => side.classList.toggle('open');

  // ---------- site list ----------
  let typeF = 'all';
  const ensureVisible = (t) => {
    const key = { R: 'rcorr', C: 'corr1', M: 'mcand', S: 'scand' }[t];
    const cb = cbByKey[key];
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
  };
  function goTo(r) {
    ensureVisible(r.type);
    if (window.innerWidth <= 760) side.classList.remove('open');
    map.flyToBounds(r.bounds, { maxZoom: r.type === 'R' ? 16 : 15, duration: 0.8 });
    map.once('moveend', () => r.open());
  }
  const protBadge = (r) => r.prot === 'notake' ? '<span class="badge nt">no-take</span>' : r.prot === 'none' ? '<span class="badge un">unprotected</span>' : `<span class="badge">${esc(r.protLabel.split(';')[0].replace(' Wetland of International Importance (Ramsar Site)', ''))}</span>`;
  function renderList() {
    const q = document.getElementById('q').value.trim().toLowerCase(), pf = document.getElementById('protSel').value;
    const cf = document.getElementById('clarSel').value, so = document.getElementById('sortSel').value;
    const host = document.getElementById('siteList'); host.innerHTML = '';
    const order = { R: 0, C: 1, M: 2, S: 3 };
    const medOf = (r) => siteMed(r.stat);
    registry.filter((r) => (typeF === 'all' || r.type === typeF)
      && (!pf || r.prot === pf || (pf === 'mpa' && r.prot === 'notake'))
      && (!cf || (medOf(r) != null && (cf === 'turbid' ? medOf(r) >= 5 : medOf(r) < +cf)))
      && (!q || (r.id + ' ' + r.name + ' ' + r.sub + ' ' + r.protLabel + ' ' + (r.search || '')).toLowerCase().includes(q)))
      .sort((a, b) => so === 'score' ? (b.score ?? -1) - (a.score ?? -1) : so === 'clar' ? (medOf(a) ?? 99) - (medOf(b) ?? 99) : so === 'pg' ? hav(PG, [a.lat, a.lon]) - hav(PG, [b.lat, b.lon]) : order[a.type] - order[b.type] || (+a.id.slice(1)) - (+b.id.slice(1)))
      .forEach((r) => {
        const d = document.createElement('div'); d.className = 'site';
        const m = medOf(r), cl = m != null ? `<span class="clar" title="Median turbidity, ${SEASON_LABEL[season]}${r.type === 'C' ? ' (reef node)' : ''}"><i style="background:${clsOf(m)[1]}"></i>${fT(m)} FNU</span>` : '<span class="clar" title="No reliable water pixels nearby">no clarity data</span>';
        d.innerHTML = `<span class="id">${r.id}</span><span class="nm">${esc(r.name)}<small>${esc(r.sub)}</small>${protBadge(r)}${cl}</span><button class="star ${isShort(r.id) ? 'on' : ''}" title="Shortlist">${isShort(r.id) ? '★' : '☆'}</button>`;
        d.onclick = (e) => { if (e.target.classList.contains('star')) { toggleShort(r.id); return; } goTo(r); };
        host.appendChild(d);
      });
    if (!host.children.length) host.innerHTML = '<p style="color:var(--muted)">No sites match.</p>';
  }
  document.getElementById('q').addEventListener('input', renderList);
  document.getElementById('protSel').addEventListener('change', renderList);
  document.getElementById('clarSel').addEventListener('change', renderList);
  document.getElementById('sortSel').addEventListener('change', renderList);
  document.querySelectorAll('#typeChips button').forEach((b) => b.onclick = () => {
    typeF = b.dataset.t; document.querySelectorAll('#typeChips button').forEach((x) => x.classList.toggle('on', x === b)); renderList();
  });

  // ---------- shortlist ----------
  let short = store.get('seastrong_shortlist_v1', {});
  function isShort(id) { return Object.prototype.hasOwnProperty.call(short, id); }
  function toggleShort(id) {
    if (isShort(id)) delete short[id]; else short[id] = { notes: '', added: new Date().toISOString().slice(0, 10) };
    store.set('seastrong_shortlist_v1', short); refreshShort();
  }
  window.__star = (id, btn) => { toggleShort(id); if (btn) btn.textContent = isShort(id) ? '★ Shortlisted' : '☆ Shortlist'; };
  function refreshShort() {
    const ids = Object.keys(short), cnt = document.getElementById('slCount');
    cnt.hidden = !ids.length; cnt.textContent = ids.length;
    renderList();
    const host = document.getElementById('shortList'); host.innerHTML = '';
    if (!ids.length) { host.innerHTML = '<p style="color:var(--muted);margin-top:12px">Nothing shortlisted yet.</p>'; return; }
    registry.filter((r) => isShort(r.id)).forEach((r) => {
      const d = document.createElement('div'); d.className = 'sl';
      d.innerHTML = `<div style="display:flex;gap:8px;align-items:flex-start"><span class="id" style="font-weight:700;color:var(--accent2);min-width:34px">${r.id}</span><span style="flex:1;cursor:pointer">${esc(r.name)}<br><small style="color:var(--muted)">${esc(r.sub)}</small></span><button class="star on" title="Remove">★</button></div><textarea placeholder="Field notes: access, depth, substrate, partner input…">${esc(short[r.id].notes)}</textarea>`;
      d.querySelector('.star').onclick = () => toggleShort(r.id);
      d.querySelector('span[style*="cursor"]').onclick = () => goTo(r);
      d.querySelector('textarea').addEventListener('input', (e) => { short[r.id].notes = e.target.value; store.set('seastrong_shortlist_v1', short); });
      host.appendChild(d);
    });
  }
  const ecoName = { mangrove: 'Mangrove', seagrass: 'Seagrass', reef: 'Coral' };
  function areaOf(protLabel) {
    if (/PHMR/i.test(protLabel)) return 'Port Honduras Marine Reserve';
    if (/Sapodilla/i.test(protLabel)) return 'Sapodilla Cayes Marine Reserve';
    return protLabel.split(';')[0];
  }
  function download(name, text, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  document.getElementById('expCsv').onclick = () => {
    const rows = [['Scouting ID', 'Ecosystem', 'Site name', 'Area / reserve', 'Latitude (decimal °, WGS84)', 'Longitude (decimal °, WGS84)', 'Protection status & zone', 'Scouting notes',
      'Turbidity median FNU: all year', 'Dry Feb-May', 'Wet Jun-Oct', 'Nov-Jan', '% clear-sky days >5 FNU (all year)', 'Nearest river mouth', 'Field notes', 'Map link']];
    const clar = (key) => {
      const st = siteStat(key);
      if (!st || !st.all) return ['', '', '', '', '', st && st.mouths ? st.mouths.map((m) => `${m[0]} ${m[1]} km`).join('; ') : ''];
      return [st.all.med, st.dry ? st.dry.med : '', st.wet ? st.wet.med : '', st.nov ? st.nov.med : '', Math.round(st.all.p5 * 100), (st.mouths || []).map((m) => `${m[0]} ${m[1]} km`).join('; ')];
    };
    registry.filter((r) => isShort(r.id)).forEach((r) => {
      const n = short[r.id].notes;
      if (r.type === 'R') r.nodes.forEach((nd) => rows.push([`${r.id}-${nd.node}`, ecoName[nd.node], `${r.id} ${nd.node} node: ${r.name}`, r.protLabel, fmt(nd.lat), fmt(nd.lon), r.protLabel, r.notes, ...clar(`${r.id}-${nd.node === 'mangrove' ? 'seagrass' : nd.node}`), n, gmaps(nd.lat, nd.lon)]));
      else if (r.type === 'C') r.nodes.forEach((nd) => rows.push([`${r.id}-${nd.node}`, ecoName[nd.node], `${r.id} ${nd.node} node: ${r.name}`, areaOf(r.protLabel), fmt(nd.lat), fmt(nd.lon), r.protLabel, r.notes, ...clar(`${r.id}-${nd.node === 'mangrove' ? 'seagrass' : nd.node}`), n, gmaps(nd.lat, nd.lon)]));
      else rows.push([r.id, r.type === 'M' ? 'Mangrove' : 'Seagrass', `${r.id}: ${r.name}`, areaOf(r.protLabel), fmt(r.lat), fmt(r.lon), r.protLabel, r.notes, ...clar(r.stat), n, gmaps(r.lat, r.lon)]);
    });
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download('seastrong_shortlist.csv', '﻿' + csv, 'text/csv');
  };
  document.getElementById('expGeo').onclick = () => {
    const feats = registry.filter((r) => isShort(r.id)).map((r) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lon, r.lat] }, properties: { id: r.id, type: r.type, name: r.name, protection: r.protLabel, scouting_notes: r.notes, field_notes: short[r.id].notes } }));
    download('seastrong_shortlist.geojson', JSON.stringify({ type: 'FeatureCollection', features: feats }, null, 1), 'application/geo+json');
  };
  document.getElementById('zShort').onclick = () => {
    const pts = registry.filter((r) => isShort(r.id)).map((r) => [r.lat, r.lon]);
    if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 14 });
  };
  document.getElementById('clrShort').onclick = () => { if (confirm('Clear the shortlist and its notes?')) { short = {}; store.set('seastrong_shortlist_v1', short); refreshShort(); } };
  map.on('popupopen', (e) => { // keep star buttons in popups in sync
    e.popup.getElement().querySelectorAll('[data-star]').forEach((b) => { b.textContent = isShort(b.dataset.star) ? '★ Shortlisted' : '☆ Shortlist'; });
  });

  // ---------- figures ----------
  const FIGS = [
    ['01_overview', 'Overview: mangrove, seagrass and reef habitat with protected areas'],
    ['02_connectivity_corridors', 'Reef–mangrove connectivity and the 11 candidate corridors'],
    ['03_PHMR_zoom', 'Port Honduras and Punta Gorda: corridors C1–C7'],
    ['04_offshore_zoom', 'Offshore cayes: corridors C8–C11'],
    ['05_mangrove_change_restoration', 'Mangrove change 2015–2025 and restoration plot candidates']
  ];
  const lb = document.getElementById('lightbox');
  lb.onclick = () => (lb.style.display = 'none');
  FIGS.forEach(([f, cap]) => {
    const d = document.createElement('div'); d.className = 'fig';
    d.innerHTML = `<img loading="lazy" src="figures/${f}_thumb.jpg" alt="${esc(cap)}"><div>${esc(cap)}</div>`;
    d.onclick = () => { lb.querySelector('img').src = `figures/${f}.jpg`; lb.style.display = 'flex'; };
    document.getElementById('figList').appendChild(d);
  });

  refreshShort();
  setSeason(season);
})();
