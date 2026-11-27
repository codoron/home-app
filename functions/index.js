// הבית שלנו: Cloud Functions that proxy Home Assistant.
// The HA token never leaves the server. Every call checks who the user is
// and which rooms/entities they may see or control.
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { onSchedule } = require('firebase-functions/v2/scheduler');
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
const FAN_RE = /(^|_|\b)fan(_|\b|$)|מאוורר/i;
const AC_RE = /(^|_|\b)(ac|aircon|air_con)(_|\b|$)|מזגן|מיזוג/i;
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
  if (d === 'camera') return true;   // viewed through camSnap, never controlled
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

// Each camera's sibling entities on the same HA device (the ONVIF motion / person sensors). Cached like areas.
const CAM_TPL = "{% set ns = namespace(c=[]) %}{% for s in states.camera %}{% set d = device_id(s.entity_id) %}{% if d %}{% set ns.c = ns.c + [[s.entity_id, device_entities(d)]] %}{% endif %}{% endfor %}{{ ns.c | tojson }}";
let camCache = null, camAt = 0;
async function getCams() {
  if (camCache && Date.now() - camAt < 5 * 60 * 1000) return camCache;
  try {
    let res = await ha('/api/template', { method: 'POST', body: JSON.stringify({ template: CAM_TPL }) });
    if (typeof res === 'string') res = JSON.parse(res);
    camCache = Object.fromEntries(res);
  } catch (e) { camCache = camCache || {}; }
  camAt = Date.now();
  return camCache;
}

// what view() needs from HA and Firestore; started early (in parallel with the member lookup) by the callers
const fetchHouse = () => Promise.all([getAreas(), ha('/api/states'), getCfg(), getCams()]);
async function view(m, pre) {
  const [areas, states, cfg, cams = {}] = await (pre || fetchHouse());
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
  // IR scripts that belong to a TV in the same room: volume, mute, and the screen's own power (the box has its own)
  const VOL = { up: /vol.*up/, down: /vol.*down/, mute: /mute/, power: /tv.*power|screen.*power/ };
  const areaOf = {};
  for (const a of areas) for (const e of a.entities) areaOf[e] = a.id;
  // volume scripts of a TV: the ones in its own room; scripts with no room only for the IR-blaster room
  const volFor = (area, irRoom) => {
    const pool = scripts.filter((e) => areaOf[e] === area);
    const pick = (list) => Object.fromEntries(Object.entries(VOL).map(([k, re]) => [k, list.find((e) => re.test(objId(e)))]).filter(([, v]) => v));
    const own = pick(pool);
    return Object.keys(own).length || !irRoom ? own : pick(scripts.filter((e) => !areaOf[e]));
  };
  const nm = (e) => (byId[e].attributes.friendly_name || objId(e)).toLowerCase();
  const players = Object.keys(byId).filter((e) => dom(e) === 'media_player');
  // 1) same object id or same name
  const link = {};
  for (const id of players) {
    const r = remotes.find((x) => objId(x) === objId(id)) || remotes.find((x) => nm(x) === nm(id));
    if (r) link[id] = r;
  }
  // 2) a TV remote (Android TV Remote: has activities; a Broadlink blaster doesn't) left without a player,
  //    e.g. after its own player was disabled in favour of the Cast one: give it to the best player in its room
  const claimed = new Set(Object.values(link));
  for (const r of remotes) {
    const a = byId[r].attributes;
    if (claimed.has(r) || !areaOf[r] || !('current_activity' in a || 'activity_list' in a)) continue;
    const cands = players.filter((p) => !link[p] && areaOf[p] === areaOf[r] && !/speaker|רמקול|group|קבוצ/i.test(nm(p) + p));
    const score = (p) => (byId[p].attributes.device_class === 'tv' ? 4 : 0) +
      (nm(r).startsWith(nm(p)) || nm(p).startsWith(nm(r)) ? 2 : 0) + (nm(r).includes(nm(p).split(' ')[0]) ? 1 : 0);
    const best = cands.sort((x, y) => score(y) - score(x))[0];
    if (best) { link[best] = r; claimed.add(r); }
  }
  const remoteFor = (id) => link[id];
  const tvRemotes = claimed;
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
    const vol = volFor(areaOf[id], irAreas.has(areaOf[id]));
    for (const [k, sid] of Object.entries(vol)) { entities[id]['vol_' + k] = sid; entities[sid] = slim(byId[sid]); }
  }
  // A camera card carries its own motion / person sensors (same HA device); they are not shown as chips
  for (const id of Object.keys(entities)) {
    if (dom(id) !== 'camera') continue;
    const sib = (cams[id] || []).filter((e) => byId[e] && dom(e) === 'binary_sensor');
    const person = sib.find((e) => /person|people|human|אדם/i.test(e + ' ' + nm(e)));
    const motion = sib.filter((e) => e !== person);
    if (person) { entities[id].cam_person = person; entities[person] = slim(byId[person]); }
    if (motion.length) {
      entities[id].cam_motion = motion;
      for (const e of motion) entities[e] = slim(byId[e]);
    }
  }
  // remote entities are controls behind a TV, never tiles of their own
  for (const a of outAreas) a.entities = a.entities.filter((e) => dom(e) !== 'remote');
  const otherTiles = other.filter((e) => dom(e) !== 'remote');

  return { areas: outAreas, other: otherTiles, entities, allAreas: areas.map((a) => ({ id: a.id, name: a.name })), sharedAreas: cfg.sharedAreas || [],
    channels: Array.isArray(cfg.channels) ? cfg.channels : DEFAULT_CHANNELS };
}

exports.haStates = onCall(SECRETS, async (req) => {
  const t0 = Date.now();
  // HA and Firestore in parallel with the member lookup (signed-in callers only)
  const pre = req.auth ? fetchHouse() : null;
  if (pre) pre.catch(() => {});
  const runP = db.doc('config/runs').get();
  const m = await getMember(req);
  const [v, runSnap] = await Promise.all([view(m, pre), runP]);
  if (Date.now() - t0 > 2500) console.log('haStates slow', Date.now() - t0, 'ms');
  const runs = {};
  for (const [k, r] of Object.entries(runSnap.exists ? runSnap.data() : {})) {
    const id = k.replace(/__/, '.');
    if (v.entities[id]) runs[id] = r;
  }
  v.runs = runs;
  return {
    me: { email: m.email, name: m.name, role: m.role, room: m.room || null, favorites: m.favorites || [], layout: m.layout || {}, admin: !!m.admin || SYS.includes(m.email) },
    ...v,
  };
});

// Validates calls against what this member may do (same rules for the app and for WhatsApp) and runs them.
async function runCalls(m, v, calls) {
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
  // IR air conditioners and fans report no state: remember the last command sent, for everyone to see
  const runs = {};
  for (const c of calls) {
    const e = String(c.e);
    const txt = objId(e) + ' ' + ((v.entities[e] || {}).name || '');
    if (dom(e) === 'script' && (AC_RE.test(txt) || (FAN_RE.test(txt) && !/light|אור|תאורה|מנורה/i.test(txt)))) runs[e.replace(/\./g, '__')] = { at: Date.now(), by: m.name || m.email };
  }
  if (Object.keys(runs).length) await db.doc('config/runs').set(runs, { merge: true }).catch(() => {});
}

exports.haCall = onCall(SECRETS, async (req) => {
  const m = await getMember(req);
  const calls = (req.data && req.data.calls) || [];
  if (!Array.isArray(calls) || !calls.length || calls.length > 80) throw new HttpsError('invalid-argument', 'bad calls');
  const v = await view(m);
  await runCalls(m, v, calls);
  return { ok: true };
});

// A camera picture, for whoever may see that camera in the app. The HA token stays here.
// live: the full-screen view asks about once a second, so who-may-see-what is cached per instance for a minute.
const camPerm = new Map();   // email -> { at, cams: Set, role }
async function camAccess(req, id) {
  const email = req.auth && req.auth.token && req.auth.token.email && req.auth.token.email.toLowerCase();
  const c = email && camPerm.get(email);
  if (c && Date.now() - c.at < 60 * 1000) return { see: c.cams.has(id), role: c.role };
  const pre = fetchHouse(); pre.catch(() => {});
  const m = await getMember(req);
  const v = await view(m, pre);
  const cams = new Set(Object.keys(v.entities).filter((e) => dom(e) === 'camera'));
  camPerm.set(m.email, { at: Date.now(), cams, role: m.role });
  return { see: cams.has(id), role: m.role };
}
const camAllowed = async (req, id) => (await camAccess(req, id)).see;

exports.camSnap = onCall({ ...SECRETS, memory: '512MiB' }, async (req) => {
  const id = String((req.data && req.data.id) || '');
  if (!/^camera\.[a-z0-9_]{1,80}$/.test(id)) throw new HttpsError('invalid-argument', 'מצלמה לא מוכרת');
  if (!(await camAllowed(req, id))) throw new HttpsError('permission-denied', 'אין הרשאה למצלמה');
  // live: 1280 wide; 'full': the camera's own 2K picture (zoomed in); otherwise a small still for the tile
  const q = req.data.live === 'full' ? '' : `?width=${req.data.live ? 1280 : 480}`;
  const base = HA_URL.value().trim().replace(/\/+$/, '');
  let r;
  try {
    r = await fetch(`${base}/api/camera_proxy/${id}${q}`, {
      headers: { Authorization: 'Bearer ' + HA_TOKEN.value().trim() },
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) { throw new HttpsError('unavailable', 'המצלמה לא עונה כרגע'); }
  if (!r.ok) throw new HttpsError('unavailable', 'המצלמה החזירה שגיאה ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return { type: r.headers.get('content-type') || 'image/jpeg', img: buf.toString('base64'), at: Date.now() };
});

// Turning a camera left / right (ONVIF PTZ through HA). Everyone who sees the camera may watch,
// only parents and the shared tablet may turn it. One call = one short move (HA stops it after `continuous_duration`).
exports.camPtz = onCall(SECRETS, async (req) => {
  const id = String((req.data && req.data.id) || '');
  const pan = String(req.data.pan || '');
  if (!/^camera\.[a-z0-9_]{1,80}$/.test(id) || !['LEFT', 'RIGHT'].includes(pan)) throw new HttpsError('invalid-argument', 'פעולה לא מוכרת');
  const a = await camAccess(req, id);
  if (!a.see) throw new HttpsError('permission-denied', 'אין הרשאה למצלמה');
  if (!['parent', 'tablet'].includes(a.role)) throw new HttpsError('permission-denied', 'רק הורים מסובבים את המצלמה');
  const dur = Math.min(1.5, Math.max(0.2, Number(req.data.duration) || 0.5));
  await ha('/api/services/onvif/ptz', { method: 'POST', body: JSON.stringify({ entity_id: id, pan, move_mode: 'ContinuousMove', continuous_duration: dur }) });
  return { ok: true };
});

const bot = require('./whatsapp')({ ha, view, fetchHouse, getCfg, runCalls, db, dom, objId, getMember, SERVICES, HA_URL, HA_TOKEN });
exports.whatsapp = bot.whatsapp;
exports.voice = bot.voice;
exports.reminderOps = bot.reminderOps;   // add / edit / cancel reminders from the app

// House alerts (main door left open): HA → homeEvent → push + WhatsApp to the family
const alerts = require('./alerts')({ ha, db, getMember, getCfg, HA_URL, HA_TOKEN, WA_TOKEN: require('./whatsapp').WA_TOKEN });
exports.homeEvent = alerts.homeEvent;
exports.pushToken = alerts.pushToken;    // a phone turned push on / off

// Spoken reminders (set by voice in the app): every minute, speak the due ones on their Google speaker via HA TTS.
// TTS engine: config/app.ttsEntity / ttsLanguage override; otherwise Nabu Casa cloud (he-IL), else the first tts.* entity.
exports.reminders = onSchedule({ schedule: 'every 1 minutes', timeZone: 'Asia/Jerusalem', secrets: [HA_URL, HA_TOKEN], retryCount: 0, timeoutSeconds: 120 }, async () => {
  // single-field query (no composite index needed); few reminders are ever pending
  const pend = await db.collection('reminders').where('status', '==', 'pending').get();
  const due = { docs: pend.docs.filter((d) => d.data().at <= Date.now()).slice(0, 20) };
  if (!due.docs.length) return;
  const cfg = await getCfg();
  let tts = cfg.ttsEntity, lang = cfg.ttsLanguage;
  if (!tts) {
    const states = await ha('/api/states');
    const ids = states.map((s) => s.entity_id).filter((e) => dom(e) === 'tts');
    tts = ids.find((e) => /cloud/.test(e)) || ids.find((e) => /google/.test(e)) || ids[0];
  }
  if (!lang) lang = /google_translate/.test(tts || '') ? 'iw' : 'he-IL';
  for (const d of due.docs) {
    const r = d.data();
    // claim it, so an overlapping run won't speak it twice
    const claimed = await db.runTransaction(async (tx) => {
      const cur = await tx.get(d.ref);
      // cancelled (deleted) or moved later in the meantime
      if (!cur.exists || cur.data().status !== 'pending' || cur.data().at > Date.now()) return false;
      tx.update(d.ref, { status: 'sending' }); return true;
    });
    if (!claimed) continue;
    // only a Hebrew first name: an English or hyphenated full name comes out garbled in Hebrew TTS
    const first = String(r.name || '').trim().split(/\s+/)[0].replace(/[-–־].*$/, '');
    const text = String(r.text || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
    const message = (/[\u0590-\u05FF]/.test(first) ? `תזכורת ל${first}. ` : 'תזכורת. ') + text;
    try {
      if (!tts) throw new Error('no tts entity in Home Assistant');
      await ha('/api/services/tts/speak', { method: 'POST', body: JSON.stringify({ entity_id: tts, media_player_entity_id: r.speaker, message, language: lang }) });
      await d.ref.update({ status: 'done', doneAt: Date.now() });
      console.log('reminder spoken', r.speaker, r.text.slice(0, 40));
    } catch (e) {
      const tries = (r.tries || 0) + 1;
      // a short HA outage: try again next minute, up to 3 times
      await d.ref.update(tries < 3 ? { status: 'pending', tries, error: e.message } : { status: 'failed', tries, error: e.message });
      console.error('reminder failed', d.id, e.message);
    }
  }
});
