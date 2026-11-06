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
};
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
  return { areas: outAreas, other, entities, allAreas: areas.map((a) => ({ id: a.id, name: a.name })), sharedAreas: cfg.sharedAreas || [] };
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
    const key = d + '/' + s + '/' + JSON.stringify(data);
    (groups[key] = groups[key] || { d, s, data, ids: [] }).ids.push(e);
  }
  for (const g of Object.values(groups)) {
    await ha(`/api/services/${g.d}/${g.s}`, { method: 'POST', body: JSON.stringify({ entity_id: g.ids, ...g.data }) });
  }
  return { ok: true };
});
