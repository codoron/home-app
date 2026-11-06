// הבית שלנו: Cloud Functions that proxy Home Assistant.
// The HA token never leaves the server. Every call checks who the user is
// and which rooms/entities they may see or control.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
setGlobalOptions({ region: 'europe-west1', maxInstances: 5 });

const HA_URL = defineSecret('HA_URL');
const HA_TOKEN = defineSecret('HA_TOKEN');
const SECRETS = { secrets: [HA_URL, HA_TOKEN] };

const SYS = ['co.doron@gmail.com'];

// Domains we show, and the services each one may call.
const SERVICES = {
  light: ['turn_on', 'turn_off', 'toggle'],
  switch: ['turn_on', 'turn_off', 'toggle'],
  input_boolean: ['turn_on', 'turn_off', 'toggle'],
  fan: ['turn_on', 'turn_off', 'toggle'],
  media_player: ['turn_on', 'turn_off', 'toggle', 'volume_up', 'volume_down'],
  cover: ['open_cover', 'close_cover', 'stop_cover'],
  lock: ['lock', 'unlock'],
  script: ['turn_on'],
  scene: ['turn_on'],
  button: ['press'],
  climate: ['turn_on', 'turn_off', 'set_temperature', 'set_hvac_mode'],
  remote: ['send_command', 'turn_on', 'turn_off'],
};
// Keys the TV remote may send (Android TV Remote). Nothing else gets through.
const REMOTE_KEYS = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT', 'DPAD_CENTER', 'BACK', 'HOME', 'MENU',
  'MEDIA_PLAY_PAUSE', 'MEDIA_PLAY', 'MEDIA_PAUSE', 'MEDIA_STOP', 'MEDIA_REWIND', 'MEDIA_FAST_FORWARD',
  'VOLUME_UP', 'VOLUME_DOWN', 'VOLUME_MUTE', 'POWER', 'GUIDE', 'INFO']);
const DEFAULT_CHANNELS = [{ n: '11', name: 'כאן 11' }, { n: '12', name: 'קשת 12' }, { n: '13', name: 'רשת 13' }];
const objId = (e) => e.split('.')[1];
const READ_ONLY = { binary_sensor: ['door', 'window', 'opening', 'garage_door', 'motion', 'occupancy'], sensor: ['temperature', 'humidity'] };
const PARENT_ONLY = ['lock'];

const dom = (e) => e.split('.')[0];

async function ha(path, opts = {}) {
  const base = HA_URL.value().trim().replace(/\/+$/, '');
  let r;
  try {
    r = await fetch(base + path, {
      ...opts,
      headers: { Authorization: 'Bearer ' + HA_TOKEN.value().trim(), 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
  } catch (e) {
    throw new HttpsError('unavailable', 'הבית לא עונה כרגע');
  }
  if (!r.ok) throw new HttpsError('unavailable', 'הבית החזיר שגיאה ' + r.status);
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
}

// Areas and their entities, via a template (REST has no areas endpoint). Cached briefly.
const TPL = "{% set ns = namespace(a=[]) %}{% for a in areas() %}{% set ns.a = ns.a + [{'id': a, 'name': area_name(a), 'entities': area_entities(a)}] %}{% endfor %}{{ ns.a | tojson }}";
let areaCache = null, areaAt = 0;
async function getAreas() {
  if (areaCache && Date.now() - areaAt < 5 * 60 * 1000) return areaCache;
  let res = await ha('/api/template', { method: 'POST', body: JSON.stringify({ template: TPL }) });
  if (typeof res === 'string') res = JSON.parse(res);
  areaCache = res; areaAt = Date.now();
  return res;
}

async function getMember(req) {
  const t = req.auth && req.auth.token;
  if (!t || !t.email || !t.email_verified) throw new HttpsError('unauthenticated', 'צריך להתחבר');
  const email = t.email.toLowerCase();
  const ref = db.doc('members/' + email);
  const snap = await ref.get();
  if (snap.exists) {
    const d = snap.data();
    // mark that this member has joined (at most once an hour)
    if (!d.lastSeen || Date.now() - d.lastSeen > 3600 * 1000) ref.update({ lastSeen: Date.now() }).catch(() => {});
    return { email, ...d };
  }
  if (SYS.includes(email)) {
    const m = { name: t.name || 'מנהל', role: 'parent', admin: true, room: null, favorites: [], created: Date.now(), lastSeen: Date.now() };
    await ref.set(m);
    return { email, ...m };
  }
  throw new HttpsError('permission-denied', 'not-member');
}

function shown(s) {
  const d = dom(s.entity_id);
  if (SERVICES[d]) return true;
  if (READ_ONLY[d]) return READ_ONLY[d].includes(s.attributes.device_class);
  return false;
}

function slim(s) {
  const a = s.attributes || {};
  const o = { id: s.entity_id, name: a.friendly_name || s.entity_id, state: s.state };
  for (const k of ['device_class', 'unit_of_measurement', 'brightness', 'current_position', 'temperature',
    'current_temperature', 'hvac_modes', 'min_temp', 'max_temp', 'target_temp_step', 'assumed_state', 'supported_features']) {
    if (a[k] !== undefined) o[k] = a[k];
  }
  return o;
}

// Builds what this member may see: { areas:[{id,name,entities}], other:[ids], entities:{id:slim} }
let cfgCache = null, cfgAt = 0;
async function getCfg() {
  if (cfgCache && Date.now() - cfgAt < 60 * 1000) return cfgCache;
  const snap = await db.doc('config/app').get();
  cfgCache = snap.exists ? snap.data() : {}; cfgAt = Date.now();
  return cfgCache;
}

async function view(m) {
  const [areas, states, cfg] = await Promise.all([getAreas(), ha('/api/states'), getCfg()]);
  // the shared living-room tablet controls the whole house, like a parent
  const parent = m.role === 'parent' || m.role === 'tablet';
  const byId = {};
  for (const s of states) if (shown(s)) byId[s.entity_id] = s;
  const okEntity = (e) => byId[e] && (parent || !PARENT_ONLY.includes(dom(e)));

  const allowed = parent ? null : new Set([m.room, ...(cfg.sharedAreas || []), ...(m.extraAreas || [])].filter(Boolean));
  const outAreas = areas
    .filter((a) => !allowed || allowed.has(a.id))
    .map((a) => ({ id: a.id, name: a.name, entities: a.entities.filter(okEntity) }));
  const assigned = new Set(areas.flatMap((a) => a.entities));
  const other = parent ? Object.keys(byId).filter((e) => !assigned.has(e) && SERVICES[dom(e)]) : [];

  const entities = {};
  for (const a of outAreas) for (const e of a.entities) entities[e] = slim(byId[e]);
  for (const e of other) entities[e] = slim(byId[e]);

  // A TV player gets its remote (same device name) and the Broadlink TV volume scripts.
  // Whoever may use the player may use these too, even if they sit outside their rooms.
  const remotes = Object.keys(byId).filter((e) => dom(e) === 'remote');
  const scripts = Object.keys(byId).filter((e) => dom(e) === 'script');
  const findScript = (re) => scripts.find((e) => re.test(objId(e)));
  const vol = { up: findScript(/tv.*vol.*up|vol.*up/), down: findScript(/tv.*vol.*down|vol.*down/), mute: findScript(/tv.*mute|mute/) };
  const areaOf = {};
  for (const a of areas) for (const e of a.entities) areaOf[e] = a.id;
  const remoteFor = (id) => {
    const name = (byId[id].attributes.friendly_name || '').toLowerCase();
    return remotes.find((x) => objId(x) === objId(id)) || remotes.find((x) => (byId[x].attributes.friendly_name || '').toLowerCase() === name);
  };
  const tvRemotes = new Set(Object.keys(byId).filter((e) => dom(e) === 'media_player').map(remoteFor).filter(Boolean));
  // IR blasters (Broadlink) are the remotes that belong to no TV. Their volume scripts only make sense
  // for a TV in the same room; if no blaster has a room, assume the living room.
  let irAreas = new Set(remotes.filter((r) => !tvRemotes.has(r) && areaOf[r]).map((r) => areaOf[r]));
  if (!irAreas.size) irAreas = new Set(areas.filter((a) => /living|סלון/i.test(a.name + ' ' + a.id)).map((a) => a.id));
  for (const id of Object.keys(entities)) {
    if (dom(id) !== 'media_player') continue;
    const r = remoteFor(id);
    if (!r) continue;
    entities[id].remote = r;
    entities[r] = slim(byId[r]);
    if (!irAreas.has(areaOf[id])) continue;
    for (const k of ['up', 'down', 'mute']) if (vol[k]) { entities[id]['vol_' + k] = vol[k]; entities[vol[k]] = slim(byId[vol[k]]); }
  }
  // remote entities are controls behind a TV, never tiles of their own
  for (const a of outAreas) a.entities = a.entities.filter((e) => dom(e) !== 'remote');
  const otherTiles = other.filter((e) => dom(e) !== 'remote');

  return { areas: outAreas, other: otherTiles, entities, allAreas: areas.map((a) => ({ id: a.id, name: a.name })), sharedAreas: cfg.sharedAreas || [],
    channels: Array.isArray(cfg.channels) ? cfg.channels : DEFAULT_CHANNELS };
}

exports.haStates = onCall(SECRETS, async (req) => {
  const m = await getMember(req);
  const v = await view(m);
  return {
    me: { email: m.email, name: m.name, role: m.role, room: m.room || null, favorites: m.favorites || [], admin: !!m.admin || SYS.includes(m.email) },
    ...v,
  };
});

exports.haCall = onCall(SECRETS, async (req) => {
  const m = await getMember(req);
  const calls = (req.data && req.data.calls) || [];
  if (!Array.isArray(calls) || !calls.length || calls.length > 80) throw new HttpsError('invalid-argument', 'bad calls');
  const v = await view(m);

  const groups = {};
  for (const c of calls) {
    const e = String(c.e || ''), s = String(c.s || ''), d = dom(e);
    if (!v.entities[e]) throw new HttpsError('permission-denied', 'אין הרשאה ל־' + e);
    if (!(SERVICES[d] || []).includes(s)) throw new HttpsError('invalid-argument', 'פעולה לא מותרת');
    const data = {};
    if (s === 'set_temperature') {
      const t = Number(c.data && c.data.temperature);
      if (!(t >= 10 && t <= 35)) throw new HttpsError('invalid-argument', 'טמפרטורה לא תקינה');
      data.temperature = t;
    }
    if (s === 'set_hvac_mode') data.hvac_mode = String((c.data && c.data.hvac_mode) || '').slice(0, 20);
    if (s === 'send_command') {
      const cmd = c.data && c.data.command;
      const list = (Array.isArray(cmd) ? cmd : [cmd]).map(String);
      if (!list.length || list.length > 6 || !list.every((k) => REMOTE_KEYS.has(k))) throw new HttpsError('invalid-argument', 'מקש לא מוכר');
      data.command = list;
      if (list.length > 1) data.delay_secs = 0.3;
    }
    const key = d + '/' + s + '/' + JSON.stringify(data);
    (groups[key] = groups[key] || { d, s, data, ids: [] }).ids.push(e);
  }
  for (const g of Object.values(groups)) {
    await ha(`/api/services/${g.d}/${g.s}`, { method: 'POST', body: JSON.stringify({ entity_id: g.ids, ...g.data }) });
  }
  return { ok: true };
});
