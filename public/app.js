import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, arrayUnion, arrayRemove, query, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { firebaseConfig, AREA_NAMES, OWNER_EMAILS } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const fns = getFunctions(app, 'europe-west1');
const haStates = httpsCallable(fns, 'haStates', { timeout: 25000 });
const haCall = httpsCallable(fns, 'haCall', { timeout: 30000 });
const voiceFn = httpsCallable(fns, 'voice', { timeout: 70000 });
const remOps = httpsCallable(fns, 'reminderOps', { timeout: 30000 });
const pushTokenFn = httpsCallable(fns, 'pushToken', { timeout: 20000 });
const camSnapFn = httpsCallable(fns, 'camSnap', { timeout: 15000 });

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dom = (e) => e.split('.')[0];

const S = { user: null, data: null, tab: null, busy: new Set(), members: [], ok: true, unsubMembers: null };

/* ---------- icons ---------- */
const P = {
  bulb: 'M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2zM9 20h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z',
  blind: 'M3 3h18v2h-1v12h-7v2.3a2 2 0 1 1-2 0V17H4V5H3zm3 2v2h12V5zm0 4v2h12V9zm0 4v2h12v-2z',
  lock: 'M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3z',
  unlock: 'M12 2a5 5 0 0 0-5 5h2a3 3 0 0 1 6 0v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5z',
  play: 'M8 5v14l11-7z',
  snow: 'M11 2h2v4.6l2.8-1.6 1 1.7L13 9v2h2l2.3-3.8 1.7 1-1.6 2.8H22v2h-4.6l1.6 2.8-1.7 1L15 13h-2v2l3.8 2.3-1 1.7-2.8-1.6V22h-2v-4.6l-2.8 1.6-1-1.7L11 15v-2H9l-2.3 3.8-1.7-1L6.6 13H2v-2h4.6L5 8.2l1.7-1L9 11h2V9L7.2 6.7l1-1.7L11 6.6z',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4zM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1zM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1z',
  tv: 'M3 5h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7v2h3v2H7v-2h3v-2H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  power: 'M11 2h2v10h-2zm-4.2 3.3 1.4 1.4A6 6 0 1 0 15.8 6.7l1.4-1.4A8 8 0 1 1 6.8 5.3z',
  door: 'M5 2h14v20h-2V4H7v18H5zm9 9a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
  temp: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z',
  fan: 'M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm1-9c4 0 5 3 3 6l-2 3 4-1c3-1 6 0 6 4 0 3-3 3-6 2l-4-2 1 4c1 3 0 6-4 6-3 0-3-3-2-6l2-4-4 1c-3 1-6 0-6-4 0-3 3-3 6-2l4 2-1-4c-1-3 0-5 3-5z',
  star: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z',
  up: 'M12 7l7 8H5z', down: 'M12 17 5 9h14z', stop: 'M7 7h10v10H7z',
  minus: 'M5 11h14v2H5z', plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  back: 'M10 6l-6 6 6 6 1.4-1.4L7.8 13H20v-2H7.8l3.6-3.6z',
  awning: 'M3 3h18v4l-2 4h-2l-2-4-2 4h-2L9 7l-2 4H5L3 7zm1 10h2v8H4zm14 0h2v8h-2z',
  speaker: 'M7 2h10a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm5 2.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z',
  plug: 'M9 2h2v5H9zm4 0h2v5h-2zM6 7h12v4a6 6 0 0 1-5 5.9V22h-2v-5.1A6 6 0 0 1 6 11z',
  flame: 'M12 2s6 5 6 11a6 6 0 0 1-12 0c0-3 2-5 2-5s0 3 2 4c0-5 2-10 2-10z',
  fridge: 'M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm1 2v5h10V4zm0 7v9h10v-9zM8 5h2v3H8zm0 7h2v4H8z',
  motion: 'M13 4a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM9.8 7.4 7 8.9V13H5V7.7L10.5 5c.9-.4 2-.1 2.5.8l1 2c.7 1.4 2.1 2.2 3.6 2.2H19v2h-1.4a6.3 6.3 0 0 1-4.3-1.7l-.7 3.3L15 15.2V22h-2v-5.6l-2.4-2.1L9.3 22H7.2z',
  right: 'M9 5l8 7-8 7z', left: 'M15 5 7 12l8 7z',
  bell: 'M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.8V3a1.5 1.5 0 0 0-3 0v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1z',
  pencil: 'M3 17.2V21h3.8L17.8 10 14 6.2zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0L15.2 5 19 8.8z',
  mute: 'M3 9h4l5-4v14l-5-4H3zm13.6 0L15 10.6 16.4 12 15 13.4 16.6 15l1.4-1.4 1.4 1.4 1.6-1.6-1.4-1.4L21 10.6 19.4 9 18 10.4z',
  home: 'M12 3 3 10v10a1 1 0 0 0 1 1h5v-6h6v6h5a1 1 0 0 0 1-1V10z',
  drag: 'M7 4h3v3H7zm7 0h3v3h-3zM7 10.5h3v3H7zm7 0h3v3h-3zM7 17h3v3H7zm7 0h3v3h-3z',
  moon: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
  cam: 'M4 7h3l1.5-2h7L17 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm8 2.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
};
const svg = (k) => `<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="${P[k] || P.power}"/></svg>`;

// Icon by what the device does: its name says more than its HA domain
// (a Sonoff "switch" can be a light, a script can drive the AC or the TV).
function iconFor(e) {
  const d = dom(e.id), n = (e.name + ' ' + e.id).toLowerCase();
  const lamp = /light|lamp|led|spot|אור|תאורה|מנורה|ספוט|נברשת/.test(n);
  if (d === 'light' || (lamp && /\bfan\b|מאוורר/.test(n) && d !== 'fan')) return 'bulb';
  if (d === 'lock') return e.state === 'unlocked' ? 'unlock' : 'lock';
  if (d === 'camera') return 'cam';
  if (d === 'binary_sensor') return ['motion', 'occupancy'].includes(e.device_class) ? 'motion' : 'door';
  if (d === 'sensor') return /fridge|refrigerator|מקרר|freezer|מקפיא/.test(n) ? 'fridge' : 'temp';
  if (d === 'climate' || /\bac\b|ac_|aircon|air con|מזגן|מיזוג/.test(n)) return /heat|חימום/.test(n) ? 'sun' : 'snow';
  if (/\btv\b|tv_|television|טלוויזיה|\byes\b|netflix|apple tv|chromecast/.test(n)) return 'tv';
  if (/speaker|sonos|soundbar|רמקול|homepod|nest audio/.test(n)) return 'speaker';
  if (d === 'media_player') return 'tv';
  if (/sunshade|awning|pergola|סוכך|פרגולה|הצללה/.test(n)) return 'awning';
  if (d === 'cover' || /shutter|blind|curtain|תריס|וילון/.test(n)) return 'blind';
  if (d === 'fan' || /\bfan\b|מאוורר/.test(n)) return 'fan';
  if (/boiler|water heater|דוד/.test(n)) return 'flame';
  if (d === 'light' || /light|lamp|led|spot|אור|תאורה|מנורה|ספוט|נברשת/.test(n)) return 'bulb';
  if (/plug|socket|outlet|שקע/.test(n)) return 'plug';
  if (/fridge|מקרר/.test(n)) return 'fridge';
  if (d === 'script' || d === 'scene' || d === 'button') return 'play';
  return 'power';
}

/* ---------- state helpers ---------- */
const TOGGLE = ['light', 'switch', 'input_boolean', 'fan', 'media_player'];
const RUN = ['script', 'scene', 'button'];
const SENSOR = ['sensor', 'binary_sensor'];

function stateText(e) {
  const d = dom(e.id), s = e.state;
  if (s === 'unavailable' || s === 'unknown') return 'לא זמין';
  if (e.remote) return (s === 'off' || s === 'standby' ? 'כבוי' : 'דולק') + ' · שלט';
  if (d === 'camera') return camState(e).text;
  if (TOGGLE.includes(d)) return s === 'off' ? 'כבוי' : 'דולק';
  if (d === 'cover') {
    const t = { open: 'פתוח', closed: 'סגור', opening: 'נפתח…', closing: 'נסגר…' }[s] || s;
    return e.current_position != null && s === 'open' && e.current_position < 100 ? `פתוח ${e.current_position}%` : t;
  }
  if (d === 'lock') return { locked: 'נעול', unlocked: 'פתוח', locking: 'ננעל…', unlocking: 'נפתח…', jammed: 'תקוע!', open: 'פתוח' }[s] || s;
  if (d === 'climate') return s === 'off' ? 'כבוי' : ({ cool: 'קירור', heat: 'חימום', fan_only: 'מאוורר', dry: 'ייבוש', auto: 'אוטומטי', heat_cool: 'אוטומטי' }[s] || s);
  if (d === 'binary_sensor') {
    if (['motion', 'occupancy'].includes(e.device_class)) return s === 'on' ? 'יש תנועה' : 'שקט';
    return s === 'on' ? 'פתוח' : 'סגור';
  }
  if (d === 'sensor') return `${s}${e.unit_of_measurement || ''}`;
  if (RUN.includes(d)) return 'הפעלה';
  return s;
}

const isOn = (e) => TOGGLE.includes(dom(e.id)) ? e.state !== 'off' && e.state !== 'unavailable' && e.state !== 'unknown'
  : dom(e.id) === 'climate' ? e.state !== 'off' && e.state !== 'unavailable' : false;

const areaName = (a) => AREA_NAMES[a.name] || a.name;
const ent = (id) => S.data && S.data.entities[id];
const myFavs = () => (S.data && S.data.me.favorites) || [];
const favOk = (id) => (id.startsWith('group:') ? !!findGroup(id) : !!ent(id));

/* ---------- tiles ---------- */
function tile(id, opts = {}) {
  if (id.startsWith('group:')) { const g = findGroup(id); if (!g) return ''; opts_where = true; const h = groupTile(g); opts_where = false; return h; }
  const e = ent(id);
  if (!e) return '';
  const d = dom(id);
  const na = e.state === 'unavailable' || e.state === 'unknown';
  const fav = myFavs().includes(id);
  const cls = ['tile'];
  if (isOn(e)) cls.push('on');
  if (d === 'cover' && e.state === 'open') cls.push('open');
  if (d === 'lock' && e.state !== 'locked') cls.push('alert');
  if (d === 'climate' || (RUN.includes(d) && /snow|sun/.test(iconFor(e)))) cls.push('cool');
  if (S.busy.has(id)) cls.push('busy');
  if (na) cls.push('na');
  const star = opts.noFav || SENSOR.includes(d) ? '' :
    `<button class="fav ${fav ? 'is' : ''}" data-fav="${esc(id)}" aria-label="${fav ? 'הסרה מהמועדפים' : 'הוספה למועדפים'}">${svg('star')}</button>`;
  const head = `<div class="ic">${svg(iconFor(e))}</div>`;
  const label = `<div><div class="nm">${esc(e.name)}</div><div class="st">${esc(stateText(e))}</div></div>`;

  if (d === 'cover') {
    const f = e.supported_features ?? 11;
    const b = [];
    if (f & 1) b.push(`<button data-act="${esc(id)}" data-s="open_cover" aria-label="פתיחה">${svg('up')}</button>`);
    if (f & 8) b.push(`<button data-act="${esc(id)}" data-s="stop_cover" aria-label="עצירה">${svg('stop')}</button>`);
    if (f & 2) b.push(`<button data-act="${esc(id)}" data-s="close_cover" aria-label="סגירה">${svg('down')}</button>`);
    return `<div class="${cls.join(' ')}" data-key="${esc(id)}">${star}${head}${label}<div class="ctl">${b.join('')}</div></div>`;
  }
  if (d === 'climate') {
    const t = e.temperature ?? '–';
    return `<div class="${cls.join(' ')}" data-key="${esc(id)}">${star}${head}${label}
      <div class="ctl">
        <button data-temp="${esc(id)}" data-delta="-1" aria-label="פחות">${svg('minus')}</button>
        <div class="temp">${esc(t)}°</div>
        <button data-temp="${esc(id)}" data-delta="1" aria-label="יותר">${svg('plus')}</button>
        <button data-act="${esc(id)}" data-s="${e.state === 'off' ? 'turn_on' : 'turn_off'}" aria-label="הפעלה">${svg('power')}</button>
      </div></div>`;
  }
  if (d === 'camera') return camTile(e, star, opts);
  if (SENSOR.includes(d)) return '';
  return `<div class="${cls.join(' ')}" data-key="${esc(id)}" data-tap="${esc(id)}" role="button" tabindex="0">${star}${head}${label}</div>`;
}

function sensorChips(ids) {
  const own = camSensors();
  const chips = ids.map(ent).filter((e) => e && SENSOR.includes(dom(e.id)) && e.state !== 'unavailable' && !own.has(e.id)).map((e) => {
    const alert = dom(e.id) === 'binary_sensor' && e.state === 'on' && !['motion', 'occupancy'].includes(e.device_class);
    return `<span class="chip ${alert ? 'alert' : ''}">${esc(e.name)}: ${esc(stateText(e))}</span>`;
  });
  return chips.length ? `<div class="chips">${chips.join('')}</div>` : '';
}

const grid = (ids, opts) => {
  const t = ids.map((id) => tile(id, opts)).join('');
  return t ? `<div class="grid">${t}</div>` : '';
};

/* ---------- views ---------- */
function allControllable() {
  const ids = new Set();
  for (const a of S.data.areas) a.entities.forEach((e) => ids.add(e));
  S.data.other.forEach((e) => ids.add(e));
  return [...ids].filter(ent);
}

function quickActions(scopeIds, inRoom) {
  const lightsOn = scopeIds.filter((id) => dom(id) === 'light' && ent(id).state !== 'off');
  const covers = scopeIds.filter((id) => dom(id) === 'cover' && ((ent(id).supported_features ?? 2) & 2));
  const btn = (k, icon, text) => `<button data-quick="${k}" data-scope="${inRoom ? esc(S.room || '') : ''}">${svg(icon)}<span>${text}</span></button>`;
  const all = inRoom ? '' : 'כל ';
  const b = [];
  if (scopeIds.some((id) => dom(id) === 'light')) b.push(btn('lights-off', 'moon', lightsOn.length ? `כיבוי ${all}האורות (${lightsOn.length})` : `כיבוי ${all}האורות`));
  if (covers.length) b.push(btn('covers-close', 'down', `סגירת ${all}התריסים`));
  if (covers.length) b.push(btn('covers-open', 'up', `פתיחת ${all}התריסים`));
  return b.length ? `<div class="quick">${b.join('')}</div>` : '';
}

function viewMine() {
  const me = S.data.me;
  if (isTablet()) {
    const favs = myFavs().filter(favOk);
    return `<h2>המועדפים של הבית</h2>` + quickActions(allControllable()) +
      (favs.length ? sortGrid('fav', favs.map((id) => tile(id)).join('')) : `<div class="hint" style="margin-top:14px">אין עדיין מועדפים. לחצו על ☆ בפינה של מכשיר בכל חדר כדי להוסיף אותו לכאן.</div>`) +
      viewReminders();
  }
  const room = S.data.areas.find((a) => a.id === me.room) || null;
  const favs = myFavs().filter(favOk);
  let h = `<h2>שלום, ${esc(me.name.split(' ')[0])}</h2>`;
  h += pushCard(true);
  h += quickActions(allControllable());

  h += `<div class="sec-head"><h3>המועדפים שלי</h3>${favs.length > 1 ? editBtn('fav') : ''}</div>`;
  h += favs.length ? sortGrid('fav', favs.map((id) => tile(id)).join('')) : `<div class="hint">אין עדיין מועדפים. לחצו על ☆ בפינה של כל מכשיר כדי להוסיף אותו לכאן.</div>`;
  h += viewReminders();

  if (room) {
    const canChange = me.role === 'parent';
    h += `<div class="sec-head"><h3><span class="h-ic sm">${roomIcon(room)}</span>${esc(areaName(room))} <span class="count">החדר שלי</span></h3>${canChange ? '<button class="link" data-pickroom>החלפת חדר</button>' : ''}</div>`;
    h += sensorChips(room.entities);
    h += roomGrid(room.id, room.entities) || `<div class="hint">אין עדיין מכשירים בחדר הזה.</div>`;
  } else {
    h += `<h3>איזה חדר שלך?</h3>`;
    h += roomPicker(S.data.allAreas);
    if (me.role !== 'parent') h += `<p class="hint">שימו לב: אפשר לבחור פעם אחת. אחר כך רק הורה יכול להחליף.</p>`;
  }
  return h;
}

function roomPicker(list, sel) {
  return `<div class="rooms-pick">${list.map((a) => `<button data-room="${esc(a.id)}" class="${a.id === sel ? 'sel' : ''}"><span class="h-ic sm">${roomIcon(a)}</span>${esc(areaName(a))}</button>`).join('')}</div>`;
}

const ROOM_IC = {
  sofa: 'M4 10V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3a2 2 0 0 0-2 2v2H6v-2a2 2 0 0 0-2-2zm-2 2a2 2 0 0 1 4 0v4h12v-4a2 2 0 0 1 4 0v6a1 1 0 0 1-1 1h-1v1h-2v-1H6v1H4v-1H3a1 1 0 0 1-1-1z',
  bed: 'M3 5h2v7h6V8h7a4 4 0 0 1 4 4v7h-2v-3H5v3H3zm5 3.5A2.5 2.5 0 1 1 8 13.5a2.5 2.5 0 0 1 0-5z',
  pot: 'M5 9h14v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM3 9h2v2H3zm16 0h2v2h-2zM8 4h2v3H8zm6 0h2v3h-2zM11 3h2v4h-2z',
  drop: 'M12 2c3 4.5 7 8.5 7 13a7 7 0 0 1-14 0c0-4.5 4-8.5 7-13z',
  door: 'M5 2h14v20h-2V4H7v18H5zm9 9a1 1 0 1 1 0 2 1 1 0 0 1 0-2z',
  leaf: 'M20 3C10 3 4 8 4 15c0 2 .5 3.5 1.2 4.6L3 22l1.4 1.4 2.3-2.3C7.8 21.7 9.4 22 11 22c6 0 10-6 9-19zM9 17c2-4 5-7 9-9-3 3-6 6-9 9z',
  game: 'M7 7h10a5 5 0 0 1 4.9 6l-.8 4a2.6 2.6 0 0 1-4.6 1L14.7 16H9.3l-1.8 2a2.6 2.6 0 0 1-4.6-1l-.8-4A5 5 0 0 1 7 7zm0 3v2H5v2h2v2h2v-2h2v-2H9v-2zm9 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm2 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  box: 'M3 7l9-5 9 5v10l-9 5-9-5zm2 1.7v7.1l6 3.4v-7.1zm14 0-6 3.4v7.1l6-3.4zM12 4.3 6.1 7.6 12 10.9l5.9-3.3z',
  table: 'M2 8h20v2h-2v10h-2v-6H6v6H4V10H2z',
  home: 'M12 3 3 10v10a1 1 0 0 0 1 1h5v-6h6v6h5a1 1 0 0 0 1-1V10z',
  bath: 'M4 12V5a3 3 0 0 1 5.8-1.1l-1.9.7A1 1 0 0 0 6 5v7h16v2a6 6 0 0 1-3 5.2V21h-2v-1H7v1H5v-1.8A6 6 0 0 1 2 14v-2z',
  toilet: 'M6 2h5v8h8v2a7 7 0 0 1-4 6.3V22H8v-4.3A7 7 0 0 1 4 12v-2h2z',
  kid: 'M12 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM8 9h8l3 5-1.7 1L15 11.5V22h-2v-6h-2v6H9V11.5L6.7 15 5 14z',
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6z',
};
function roomIconKey(a) {
  const n = (a.name + ' ' + a.id + ' ' + areaName(a)).toLowerCase();
  if (/living|סלון/.test(n)) return 'sofa';
  if (/kitchen|מטבח/.test(n)) return 'pot';
  if (/dining|אוכל/.test(n)) return 'table';
  if (/restroom|toilet|wc|שירותים/.test(n)) return 'toilet';
  if (/bath|shower|אמבט|מקלחת/.test(n)) return 'bath';
  if (/entr|hall|כניסה|מסדרון|מבואה/.test(n)) return 'door';
  if (/garden|yard|balcony|גינה|מרפסת|חצר/.test(n)) return 'leaf';
  if (/gam|play|משחק/.test(n)) return 'game';
  if (/storage|laundry|מחסן|כביסה/.test(n)) return 'box';
  if (/master|parent|הורים/.test(n)) return 'bed';
  if (/'s room|של /.test(n)) return 'kid';
  if (/bed|room|חדר/.test(n)) return 'bed';
  return 'home';
}
function roomIcon(a) {
  return `<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="${ROOM_IC[roomIconKey(a)]}"/></svg>`;
}

function roomSummary(ids) {
  const es = ids.map(ent).filter(Boolean);
  const lights = es.filter((e) => TOGGLE.includes(dom(e.id)) && isOn(e)).length;
  const open = es.filter((e) => dom(e.id) === 'cover' && e.state === 'open').length;
  const unlocked = es.some((e) => dom(e.id) === 'lock' && e.state !== 'locked');
  const doorOpen = es.some((e) => dom(e.id) === 'binary_sensor' && e.state === 'on' && !['motion', 'occupancy'].includes(e.device_class));
  const temp = es.find((e) => dom(e.id) === 'sensor' && e.device_class === 'temperature' && !isNaN(parseFloat(e.state)));
  const parts = [];
  if (lights) parts.push(lights === 1 ? 'מכשיר אחד דולק' : `${lights} דולקים`);
  if (open) parts.push(open === 1 ? 'תריס פתוח' : `${open} תריסים פתוחים`);
  const person = es.some((e) => dom(e.id) === 'camera' && camState(e).person);
  if (person) parts.push('זוהה אדם במצלמה');
  if (unlocked) parts.push('הדלת לא נעולה');
  else if (doorOpen) parts.push('דלת פתוחה');
  return { text: parts.join(' · ') || 'הכול כבוי', on: lights > 0, alert: unlocked || doorOpen || person, temp: temp ? `${Math.round(parseFloat(temp.state) * 10) / 10}°` : '' };
}

function roomById(id) {
  if (id === '_other') return { id: '_other', name: 'פעולות נוספות', entities: S.data.other };
  return S.data.areas.find((a) => a.id === id);
}

function viewRooms() {
  const room = S.room && roomById(S.room);
  if (room) return viewRoom(room);
  S.room = null;
  const mine = S.data.me.room;
  const areas = ordered(S.data.areas.filter((a) => a.entities.length).sort((a, b) => (b.id === mine) - (a.id === mine)), layoutOf('rooms'), (a) => a.id);
  let h = isTablet() ? homeStatus() : `<div class="sec-head"><h2>הבית</h2>${editBtn('rooms')}</div>`;
  h += quickActions(allControllable());
  if (isTablet()) {
    // the tablet has no menu: shared favorites sit on the house screen itself
    const favs = myFavs().filter(favOk);
    if (favs.length) h += `<div class="sec-head"><h3>מועדפים</h3>${favs.length > 1 ? editBtn('fav') : ''}</div>` + sortGrid('fav', favs.map((id) => tile(id)).join(''));
    h += `<div class="sec-head"><h3>חדרים</h3>${editBtn('rooms')}</div>`;
  }
  const cards = [];
  for (const a of areas) {
    const sum = roomSummary(a.entities);
    const gr = groupRoom(a.id, a.entities);
    const n = gr.groups.length + gr.tiles.length;
    cards.push([a.id, `<button class="room-card ${sum.on ? 'on' : ''} ${sum.alert ? 'alert' : ''}" data-key="${esc(a.id)}" data-open="${esc(a.id)}">
      <div class="rc-top"><span class="rc-ic">${roomIcon(a)}</span>${sum.temp ? `<span class="rc-temp">${esc(sum.temp)}</span>` : ''}${a.id === mine ? '<span class="rc-mine">שלי</span>' : ''}</div>
      <div class="rc-name">${esc(areaName(a))}</div>
      <div class="rc-sum">${esc(sum.text)}</div>
      <div class="rc-n">${n === 1 ? 'פריט אחד' : n + ' פריטים'}</div>
    </button>`]);
  }
  if (S.data.other.length) {
    cards.push(['_other', `<button class="room-card" data-key="_other" data-open="_other">
      <div class="rc-top"><span class="rc-ic"><svg viewBox="0 0 24 24"><path d="${ROOM_IC.bolt}"/></svg></span></div>
      <div class="rc-name">פעולות נוספות</div><div class="rc-sum">${esc(otherSummary())}</div><div class="rc-n">בלי חדר ב־HA · ${S.data.other.length} פריטים</div></button>`]);
  }
  h += `<div class="room-grid ${S.edit ? 'editing' : ''}" data-sort="rooms">${ordered(cards, layoutOf('rooms'), (c) => c[0]).map((c) => c[1]).join('')}</div>`;
  const empty = S.data.areas.filter((a) => !a.entities.length).map(areaName);
  if (empty.length) h += `<p class="hint">חדרים בלי מכשירים: ${esc(empty.join(', '))}. משייכים מכשיר לחדר ב־Home Assistant (גלגל השיניים של המכשיר ← Area).</p>`;
  if (isTablet()) h += `<p class="tablet-foot">טאבלט משותף · לחיצה על ☆ במכשיר בתוך חדר מוסיפה אותו למועדפים · <button class="link" data-signout>התנתקות</button></p>`;
  return h;
}

// names of the first few unassigned items, so the card says what is actually in it
function otherSummary() {
  const names = S.data.other.filter(ent).map((id) => ent(id).name);
  return names.slice(0, 2).join(', ') + (names.length > 2 ? ' ועוד' : '');
}

function viewRoom(a) {
  const name = a.id === '_other' ? a.name : areaName(a);
  let h = `<div class="room-head"><button class="back" data-back aria-label="חזרה">${svg('back')}<span>הבית</span></button></div>`;
  h += `<div class="sec-head"><h2 class="with-ic">${a.id === '_other' ? `<span class="h-ic"><svg viewBox="0 0 24 24"><path d="${ROOM_IC.bolt}"/></svg></span>` : `<span class="h-ic">${roomIcon(a)}</span>`}${esc(name)}</h2>${editBtn('r:' + a.id)}</div>`;
  h += sensorChips(a.entities);
  h += quickActions(a.entities.filter(ent), true);
  h += roomGrid(a.id, a.entities) || `<div class="hint">אין מכשירים בחדר הזה.</div>`;
  return h;
}

function openRoom(id) {
  S.edit = false;
  S.room = id;
  history.pushState({ room: id }, '');
  render(); window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => {
  // closing a sheet with × steps history back once; that step must not also leave the room
  if (S.skipPop) { S.skipPop = false; return; }
  if (S.cam) { closeCam(false); return; }
  if (S.remote) { closeRemote(false); return; }
  if (S.gsheet) { closeGroup(false); return; }
  if (S.rsheet) { closeRemSheet(false); return; }
  S.edit = false;
  if (S.room) { S.room = null; render(); window.scrollTo(0, 0); }
});

function viewFamily() {
  const me = S.data.me;
  const isAdmin = me.admin || OWNER_EMAILS.includes(me.email);
  const parent = me.role === 'parent';
  const areaOpts = (sel) => `<option value="">— בלי חדר —</option>` + S.data.allAreas.map((a) => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(areaName(a))}</option>`).join('');
  const nameOfArea = (id) => { const a = S.data.allAreas.find((x) => x.id === id); return a ? areaName(a) : 'בלי חדר'; };

  let h = `<h2>המשפחה</h2>`;
  h += `<div class="list">`;
  for (const m of S.members) {
    const edit = isAdmin
      ? `<div class="edit-row">
          <select data-mrole="${esc(m.id)}">${Object.entries(ROLE).map(([k, v]) => `<option value="${k}" ${m.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
          <select data-mroom="${esc(m.id)}">${areaOpts(m.room)}</select>
          ${m.role !== 'tablet' ? `<input class="phone-in" data-mphone="${esc(m.id)}" value="${esc(fmtPhone(m.phone))}" placeholder="טלפון לוואטסאפ" inputmode="tel" dir="ltr">` : ''}
          ${m.id !== me.email ? `<button class="btn small" data-wa="${esc(m.id)}">הזמנה בוואטסאפ</button><button class="btn small" data-mail="${esc(m.id)}">במייל</button><button class="btn small danger" data-mdel="${esc(m.id)}">הסרה</button>` : ''}
        </div>`
      : parent && m.role === 'child'
        ? `<div class="edit-row"><select data-mroom="${esc(m.id)}">${areaOpts(m.room)}</select></div>` : '';
    h += `<div class="card"><div class="person"><div class="avatar">${esc((m.name || '?')[0])}</div>
      <div class="who"><b>${esc(m.name)}</b><span class="tag">${ROLE[m.role] || m.role}</span>${m.lastSeen ? '' : '<span class="tag wait">עוד לא נכנס/ה</span>'}<small>${esc(nameOfArea(m.room))} · ${esc(m.id)}${m.phone ? ' · 💬 ' + esc(fmtPhone(m.phone)) : ''}</small></div></div>${edit}</div>`;
  }
  h += `</div>`;

  if (isAdmin) {
    h += `<h3>הוספת בן משפחה</h3>
      <form class="card form" id="addMember">
        <div class="row"><input name="name" placeholder="שם" required><input name="email" type="email" placeholder="מייל Google" required dir="ltr"></div>
        <div class="row"><select name="role"><option value="child">ילד/ה</option><option value="parent">הורה</option><option value="tablet">טאבלט משותף</option></select><select name="room">${areaOpts('')}</select></div>
        <div class="row"><input name="phone" placeholder="טלפון לוואטסאפ (לא חובה)" inputmode="tel" dir="ltr"></div>
        <button class="btn primary">הוספה</button>
        <small class="hello">אחרי ההוספה שלחו להם את הכתובת: ${esc(location.origin)}</small>
      </form>`;
    const shared = new Set(S.data.sharedAreas || []);
    h += `<h3>חדרים משותפים לילדים</h3>
      <div class="card"><p class="hello">ילדים רואים את החדר שלהם ואת החדרים שמסומנים כאן. הורים רואים הכול. את דלת הכניסה רק הורים פותחים.</p>
      <div class="checks">${S.data.allAreas.map((a) => `<label><input type="checkbox" data-shared="${esc(a.id)}" ${shared.has(a.id) ? 'checked' : ''}>${esc(areaName(a))}</label>`).join('')}</div></div>`;
  }
  h += `<h3>החשבון שלי</h3><div class="card person"><div class="who"><b>${esc(me.name)}</b><small>${esc(me.email)}</small></div><button class="btn small" data-signout>התנתקות</button></div>`;
  h += pushCard(false);
  return h;
}

function render() {
  if (!S.data) return;
  const v = (S.tab || 'rooms') === 'rooms' ? viewRooms() : S.tab === 'family' ? viewFamily() : viewMine();
  // keep form input while re-rendering the family tab
  const f = $('#addMember');
  const draft = f ? Object.fromEntries(new FormData(f)) : null;
  $('#view').innerHTML = v;
  if (draft) { const nf = $('#addMember'); if (nf) for (const [k, val] of Object.entries(draft)) nf.elements[k].value = val; }
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab));
  document.body.classList.toggle('tablet', isTablet());
  if (S.remote && !R.edit && !R.num) renderRemote();
  if (S.gsheet) renderGroup();
  if (S.cam) renderCamInfo();
  camTick();
  document.body.classList.toggle('arranging', !!S.edit);
  initSortables();
  const mineLabel = document.querySelector('[data-tab="mine"] span');
  if (mineLabel) mineLabel.textContent = isTablet() ? 'מועדפים' : 'שלי';
  renderBadgeOnly();
  if (isTablet()) { tickClock(); keepAwake(); }
  $('#status').className = 'status' + (S.ok ? '' : ' bad');
  $('#status').innerHTML = `<span class="dot${S.stale ? ' stale' : ''}"></span>${S.stale ? 'מתעדכן…' : S.ok ? 'מחובר לבית' : 'אין חיבור לבית'}`;
  renderVoice();
}



/* ---------- device groups: one card per kind (lights, AC, TV) ---------- */
const GID = (room, kind) => `group:${room}:${kind}`;
const isNA = (e) => !e || e.state === 'unavailable' || e.state === 'unknown';
const iconOf = (id) => iconFor(ent(id));
const ALL_ON = /all.?on|הכ(ו)?ל.?דולק|הדלק.?הכ/i, ALL_OFF = /all.?off|הכ(ו)?ל.?כבוי|כבה.?הכ/i;

function roomOfEntity(id) {
  const a = S.data.areas.find((x) => x.entities.includes(id));
  return a ? a.id : (S.data.other.includes(id) ? '_other' : null);
}

// Splits a room's entities into group cards, plain tiles and unavailable ones.
function groupRoom(roomId, ids) {
  ids = ids.filter(ent);
  const used = new Set();
  const out = { groups: [], tiles: [], na: [], hidden: new Set() };
  // TV volume scripts already live inside the TV remote
  for (const id of ids) {
    const e = ent(id);
    if (e.remote) for (const k of ['vol_up', 'vol_down', 'vol_mute', 'vol_power']) if (e[k]) out.hidden.add(e[k]);
  }
  // lights: switches/lights that are lamps, plus "all on/off" style scripts
  const lights = ids.filter((id) => TOGGLE.includes(dom(id)) && iconOf(id) === 'bulb');
  const lightRuns = ids.filter((id) => RUN.includes(dom(id)) && iconOf(id) === 'bulb');
  if (lights.length + lightRuns.length >= 2) {
    const allOn = lightRuns.find((id) => ALL_ON.test(ent(id).name + ' ' + id));
    const allOff = lightRuns.find((id) => ALL_OFF.test(ent(id).name + ' ' + id));
    out.groups.push({ id: GID(roomId, 'lights'), kind: 'lights', room: roomId, lights, allOn, allOff,
      runs: lightRuns.filter((id) => id !== allOn && id !== allOff) });
    [...lights, ...lightRuns].forEach((id) => used.add(id));
  }
  // air conditioner: IR scripts (cool / heat / off ...)
  const ac = ids.filter((id) => RUN.includes(dom(id)) && ['snow', 'sun'].includes(iconOf(id)));
  if (ac.length >= 2) {
    out.groups.push({ id: GID(roomId, 'ac'), kind: 'ac', room: roomId, items: ac });
    ac.forEach((id) => used.add(id));
  }
  const fan = ids.filter((id) => RUN.includes(dom(id)) && iconOf(id) === 'fan');
  if (fan.length >= 2) {
    out.groups.push({ id: GID(roomId, 'fan'), kind: 'fan', room: roomId, items: fan });
    fan.forEach((id) => used.add(id));
  }
  // TV: the player with a remote is the card; other players/TV scripts go inside its remote
  const tvs = ids.filter((id) => dom(id) === 'media_player' && ent(id).remote);
  if (tvs.length) {
    const extras = ids.filter((id) => !used.has(id) && !out.hidden.has(id) && !tvs.includes(id) && !isNA(ent(id)) &&
      (dom(id) === 'media_player' || (RUN.includes(dom(id)) && ['tv', 'speaker'].includes(iconOf(id)))));
    S.tvExtras = S.tvExtras || {};
    S.tvExtras[tvs[0]] = extras;
    extras.forEach((id) => used.add(id));
  }
  for (const id of ids) {
    if (used.has(id) || out.hidden.has(id) || SENSOR.includes(dom(id))) continue;
    (isNA(ent(id)) ? out.na : out.tiles).push(id);
  }
  return out;
}

function findGroup(gid) {
  const [, room, kind] = gid.split(':');
  const r = roomById(room);
  if (!r) return null;
  return groupRoom(room, r.entities).groups.find((g) => g.kind === kind) || null;
}

const FAN_MODE = (name) => {
  const n = name.toLowerCase();
  const sp = (n.match(/speed.?(\d)|מהירות.?(\d)/) || []).slice(1).find(Boolean);
  const label = /off|כיבוי|כבה/.test(n) ? 'כיבוי' : /low|נמוך|איטי/.test(n) ? 'נמוך' : /med|mid|בינוני/.test(n) ? 'בינוני'
    : /high|max|גבוה|מהיר/.test(n) ? 'גבוה' : sp ? `מהירות ${sp}` : /\bon\b|הפעלה/.test(n) ? 'הפעלה' : name;
  return { label, off: label === 'כיבוי', heat: false };
};
const MODE = (g, name) => (g.kind === 'fan' ? FAN_MODE(name) : AC_MODE(name));
const AC_MODE = (name) => {
  const n = name.toLowerCase();
  const deg = (n.match(/(\d{2})/) || [])[1];
  const mode = /off|כיבוי|כבה/.test(n) ? 'כיבוי' : /cool|קירור|קר/.test(n) ? 'קירור' : /heat|חימום|חם/.test(n) ? 'חימום'
    : /fan|מאוורר/.test(n) ? 'מאוורר' : /dry|ייבוש/.test(n) ? 'ייבוש' : null;
  return { label: mode ? (mode === 'כיבוי' ? 'כיבוי' : `${mode}${deg ? ' \u2066' + deg + '°\u2069' : ''}`) : name, off: mode === 'כיבוי', heat: mode === 'חימום' };
};
function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'לפני שעה' : `לפני ${h} שע׳`;
  return new Date(t).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
}
function acLast(g) {
  const runs = S.data.runs || {};
  let best = null;
  for (const id of g.items) if (runs[id] && (!best || runs[id].at > best.r.at)) best = { id, r: runs[id] };
  return best;
}

function groupTile(g) {
  const fav = myFavs().includes(g.id);
  const star = `<button class="fav ${fav ? 'is' : ''}" data-fav="${esc(g.id)}" aria-label="${fav ? 'הסרה מהמועדפים' : 'הוספה למועדפים'}">${svg('star')}</button>`;
  const roomName = g.room === '_other' ? '' : areaName(roomById(g.room));
  const where = opts_where ? `<div class="st where">${esc(roomName)}</div>` : '';
  if (g.kind === 'lights') {
    const avail = g.lights.filter((id) => !isNA(ent(id)));
    const on = avail.filter((id) => isOn(ent(id))).length;
    const st = !g.lights.length ? `${g.runs.length + (g.allOn ? 1 : 0) + (g.allOff ? 1 : 0)} פעולות` : on ? `${on} מתוך ${avail.length} דולקים` : 'הכול כבוי';
    return `<div class="tile group ${on ? 'on' : ''}" data-key="${esc(g.id)}" data-group="${esc(g.id)}" role="button" tabindex="0">${star}
      <div class="ic">${svg('bulb')}</div><div><div class="nm">תאורה</div><div class="st">${esc(st)}</div>${where}</div>
      <div class="g-more">${g.lights.length + g.runs.length} מפסקים ›</div></div>`;
  }
  if (g.kind === 'ac' || g.kind === 'fan') {
    const last = acLast(g);
    const mode = last ? MODE(g, ent(last.id).name) : null;
    const st = last ? `${mode.label} · ${ago(last.r.at)}` : 'לחצו לבחירת מצב';
    const icon = g.kind === 'fan' ? 'fan' : mode && mode.heat ? 'sun' : 'snow';
    return `<div class="tile group cool ${mode && !mode.off ? (mode.heat ? 'heat' : 'chill') : ''}" data-key="${esc(g.id)}" data-group="${esc(g.id)}" role="button" tabindex="0">${star}
      <div class="ic">${svg(icon)}</div><div><div class="nm">${g.kind === 'fan' ? 'מאוורר' : 'מזגן'}</div><div class="st">${esc(st)}</div>${where}</div>
      <div class="g-more">${g.items.length} מצבים ›</div></div>`;
  }
  return '';
}
let opts_where = false;

// Room content: group cards first, then the rest, then a folded list of unavailable devices.
function roomGrid(roomId, ids) {
  const g = groupRoom(roomId, ids);
  const items = ordered([...g.groups.map((x) => [x.id, groupTile(x)]), ...g.tiles.map((id) => [id, tile(id)])], layoutOf('r:' + roomId), (c) => c[0]);
  let h = items.length ? sortGrid('r:' + roomId, items.map((c) => c[1]).join('')) : '';
  if (g.na.length) h += `<details class="na-list"><summary>לא זמינים (${g.na.length})</summary><div class="grid">${g.na.map((id) => tile(id)).join('')}</div></details>`;
  return h;
}

/* group sheet */
function openGroup(gid) {
  S.gsheet = gid;
  history.pushState({ gsheet: gid }, '');
  let el = document.getElementById('gsheet');
  if (!el) { el = document.createElement('div'); el.id = 'gsheet'; el.className = 'sheet'; document.body.appendChild(el); }
  renderGroup();
  initSortables();
  requestAnimationFrame(() => el.classList.add('open'));
}
function closeGroup(viaHistory) {
  const el = document.getElementById('gsheet');
  S.gsheet = null;
  if (el) el.classList.remove('open');
  if (viaHistory) { S.skipPop = true; history.back(); }
}
function renderGroup() {
  const el = document.getElementById('gsheet');
  if (!el || !S.gsheet) return;
  const g = findGroup(S.gsheet);
  if (!g) { closeGroup(true); return; }
  const roomName = g.room === '_other' ? 'פעולות נוספות' : areaName(roomById(g.room));
  let title, body;
  if (g.kind === 'lights') {
    title = 'תאורה';
    const top = `<div class="g-top">
      <button class="g-big on" data-gall="on">${svg('bulb')}<span>הכול דולק</span></button>
      <button class="g-big" data-gall="off">${svg('moon')}<span>הכול כבוי</span></button></div>`;
    body = top + `<div class="sec-head g-edit"><span></span>${editBtn('g:' + g.id)}</div>` + sortGrid('g:' + g.id, ordered([...g.lights, ...g.runs], layoutOf('g:' + g.id)).map((id) => tile(id)).join(''));
  } else {
    title = g.kind === 'fan' ? 'מאוורר' : 'מזגן';
    const last = acLast(g);
    body = `<div class="g-ac">${g.items.map((id) => {
      const m = MODE(g, ent(id).name);
      const isLast = last && last.id === id;
      return `<button class="g-big ${m.off ? '' : m.heat ? 'heat' : 'chill'} ${isLast ? 'last' : ''} ${S.busy.has(id) ? 'busy' : ''}" data-acrun="${esc(id)}">
        ${svg(m.off ? 'power' : g.kind === 'fan' ? 'fan' : m.heat ? 'sun' : 'snow')}<span>${esc(m.label)}</span>${isLast ? `<small>${esc(ago(last.r.at))} · ${esc(last.r.by)}</small>` : ''}</button>`;
    }).join('')}</div>
    <p class="hello g-note">${g.kind === 'fan' ? 'המאוורר' : 'המזגן'} לא מדווח על המצב שלו, אז מוצגת כאן הפקודה האחרונה שנשלחה מהאפליקציה.</p>`;
  }
  el.innerHTML = `<div class="r-backdrop" data-rclose></div>
  <div class="r-sheet g-sheet" role="dialog" aria-label="${esc(title)}">
    <div class="r-head">
      <div class="r-title"><span class="h-ic sm">${svg(g.kind === 'lights' ? 'bulb' : g.kind === 'fan' ? 'fan' : 'snow')}</span><div><b>${esc(title)}</b><small>${esc(roomName)}</small></div></div>
      <button class="r-x" data-rclose aria-label="סגירה">×</button>
    </div>
    ${body}
  </div>`;
}

function groupAll(on) {
  const g = findGroup(S.gsheet);
  if (!g) return;
  const script = on ? g.allOn : g.allOff;
  const lights = g.lights.filter((id) => !isNA(ent(id)));
  const optimistic = () => lights.forEach((id) => { ent(id).state = on ? 'on' : 'off'; });
  if (script) act([{ e: script, s: dom(script) === 'button' ? 'press' : 'turn_on' }], optimistic);
  else if (lights.length) act(lights.map((e) => ({ e, s: on ? 'turn_on' : 'turn_off' })), optimistic);
}
function runAc(id) {
  act([{ e: id, s: 'turn_on' }]).then((ok) => {
    if (!ok) return;
    S.data.runs = { ...(S.data.runs || {}), [id]: { at: Date.now(), by: S.data.me.name } };
    const g = S.gsheet && findGroup(S.gsheet);
    toast(`✓ ${g ? MODE(g, ent(id).name).label : ent(id).name}`);
    render();
  });
}


/* ---------- personal arrangement (drag & drop) ---------- */
// layout: { rooms: [roomIds], 'r:<room>': [cardKeys], 'g:<groupId>': [switchIds] }; favorites keep their own order.
const layoutOf = (scope) => ((S.data && S.data.me.layout) || {})[scope] || [];
function ordered(list, saved, key = (x) => x) {
  if (!saved || !saved.length) return list;
  const pos = new Map(saved.map((k, i) => [k, i]));
  const known = list.filter((x) => pos.has(key(x))).sort((a, b) => pos.get(key(a)) - pos.get(key(b)));
  return [...known, ...list.filter((x) => !pos.has(key(x)))];   // new devices go last
}
const sortGrid = (scope, inner) => `<div class="grid ${S.edit ? 'editing' : ''}" data-sort="${esc(scope)}">${inner}</div>`;
function editBtn(scope) {
  if (!S.edit) return `<button class="edit-btn" data-edit aria-label="סידור">${svg('drag')}<span>סידור</span></button>`;
  const reset = scope === 'fav' ? '' : `<button class="link" data-editreset="${esc(scope)}">ברירת מחדל</button>`;
  return `<span class="edit-row2">${reset}<button class="edit-btn on" data-edit>✓ סיום</button></span>`;
}
let sortables = [];
function initSortables() {
  sortables.forEach((x) => x.destroy());
  sortables = [];
  if (!S.edit || !window.Sortable) return;
  document.querySelectorAll('[data-sort]').forEach((el) => {
    // a grip on every card: drag from it, scroll from anywhere else
    for (const c of el.children) {
      if (!c.querySelector(':scope > .drag-h')) c.insertAdjacentHTML('beforeend', `<span class="drag-h" aria-label="גרירה">${svg('drag')}</span>`);
    }
    sortables.push(new Sortable(el, {
      handle: '.drag-h', animation: 200, easing: 'cubic-bezier(.2,.8,.2,1)', delay: 0,
      forceFallback: true, fallbackOnBody: true, fallbackTolerance: 3, fallbackClass: 'drag-lift',
      ghostClass: 'drag-ghost', chosenClass: 'drag-chosen',
      direction: 'vertical', // Sortable's horizontal mode misreads RTL rows
      scroll: true, scrollSensitivity: 90, scrollSpeed: 14, bubbleScroll: true,
      onStart: () => { document.body.classList.add('dragging'); if (navigator.vibrate) navigator.vibrate(10); },
      onEnd: (ev) => {
        document.body.classList.remove('dragging');
        if (ev.oldIndex !== ev.newIndex) saveOrder(el.dataset.sort, [...el.children].map((c) => c.dataset.key).filter(Boolean));
      },
    }));
  });
}
async function saveOrder(scope, keys) {
  const me = S.data.me;
  S.layoutAt = Date.now();
  try {
    if (scope === 'fav') {
      me.favorites = [...keys, ...me.favorites.filter((f) => !keys.includes(f))];
      await updateDoc(doc(db, 'members', me.email), { favorites: me.favorites });
    } else {
      me.layout = { ...(me.layout || {}), [scope]: keys };
      await updateDoc(doc(db, 'members', me.email), { layout: me.layout });
    }
  } catch { toast('שמירת הסידור נכשלה'); }
}
async function resetOrder(scope) {
  const me = S.data.me;
  const l = { ...(me.layout || {}) };
  delete l[scope];
  me.layout = l;
  S.layoutAt = Date.now();
  render();
  try { await updateDoc(doc(db, 'members', me.email), { layout: l }); toast('חזר לסידור ברירת המחדל'); }
  catch { toast('השמירה נכשלה'); }
}

/* ---------- shared tablet (living-room panel) ---------- */
const ROLE = { parent: 'הורה', child: 'ילד/ה', tablet: 'טאבלט משותף' };
const isTablet = () => !!(S.data && S.data.me.role === 'tablet');

function homeStatus() {
  const es = allControllable().map(ent);
  const lights = es.filter((e) => TOGGLE.includes(dom(e.id)) && isOn(e)).length;
  const open = es.filter((e) => dom(e.id) === 'cover' && e.state === 'open').length;
  const locks = es.filter((e) => dom(e.id) === 'lock');
  const chips = [];
  chips.push(`<span class="hs ${lights ? 'on' : ''}">${lights ? `${lights} דולקים` : 'הכול כבוי'}</span>`);
  if (open) chips.push(`<span class="hs">${open === 1 ? 'תריס אחד פתוח' : `${open} תריסים פתוחים`}</span>`);
  for (const l of locks) chips.push(`<span class="hs ${l.state === 'locked' ? '' : 'alert'}">${esc(l.name)}: ${esc(stateText(l))}</span>`);
  return `<div class="panel"><div class="clock" id="clock"></div><div class="date" id="date"></div><div class="hs-row">${chips.join('')}</div></div>`;
}
function tickClock() {
  const c = document.getElementById('clock'), d = document.getElementById('date');
  if (!c) return;
  const now = new Date();
  c.textContent = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  d.textContent = now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
}
setInterval(tickClock, 15000);

// keep the screen on
let wakeLock = null;
async function keepAwake() {
  if (!isTablet() || document.hidden || wakeLock || !('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch { /* not allowed */ }
}

// back to the house overview after a minute without touch
let lastTouch = Date.now();
for (const ev of ['pointerdown', 'keydown', 'scroll']) addEventListener(ev, () => { lastTouch = Date.now(); keepAwake(); }, { passive: true });
setInterval(() => {
  if (!isTablet() || Date.now() - lastTouch < 60000) return;
  if (S.cam) { closeCam(true); return; }
  if (S.remote) { closeRemote(true); return; }
  if (S.gsheet) { closeGroup(true); return; }
  if (S.rsheet) { closeRemSheet(true); return; }
  if (S.room || S.tab !== 'rooms') {
    if (S.room) { S.room = null; history.back(); }
    S.tab = 'rooms'; render(); window.scrollTo(0, 0);
  }
}, 5000);


/* ---------- cameras (ONVIF via HA; pictures come through the camSnap function) ---------- */
// A camera tile shows a recent still (refreshed every ~20s while on screen); tapping opens a near-live view
// (a new picture about once a second while the sheet is open and the app is visible).
const CAM = { img: {}, at: {}, busy: new Set(), err: {} };
const CAM_THUMB_MS = 20000;

function camSensors() {
  const set = new Set();
  if (!S.data) return set;
  for (const e of Object.values(S.data.entities)) {
    if (dom(e.id) !== 'camera') continue;
    if (e.cam_person) set.add(e.cam_person);
    for (const m of e.cam_motion || []) set.add(m);
  }
  return set;
}
function camState(e) {
  const p = ent(e.cam_person);
  const person = !!(p && p.state === 'on');
  const motion = (e.cam_motion || []).some((id) => { const m = ent(id); return m && m.state === 'on'; });
  if (isNA(e)) return { text: 'לא זמינה', person: false, motion: false };
  return { text: person ? '🚶 זוהה אדם' : motion ? 'יש תנועה' : 'שקט', person, motion };
}
function camTile(e, star, opts) {
  const st = camState(e);
  const src = CAM.img[e.id];
  const cls = ['tile', 'cam-tile', 'wide'];
  if (st.person) cls.push('alert'); else if (st.motion) cls.push('on');
  if (isNA(e)) cls.push('na');
  const where = opts_where || opts.where ? `<div class="st where">${esc(areaName(roomById(roomOfEntity(e.id)) || { name: '' }))}</div>` : '';
  return `<div class="${cls.join(' ')}" data-key="${esc(e.id)}" data-tap="${esc(e.id)}" role="button" tabindex="0">${star}
    <div class="cam-pic">${src ? `<img data-cam="${esc(e.id)}" src="${src}" alt="">` : `<img data-cam="${esc(e.id)}" alt="" hidden><span class="cam-wait">${svg('cam')}</span>`}
      <span class="cam-live">${esc(st.text)}</span></div>
    <div class="cam-foot"><div class="nm">${esc(camName(e))}</div>${where}<div class="st cam-ago" data-camago="${esc(e.id)}">${esc(camAgo(e.id))}</div></div>
  </div>`;
}
const camName = (e) => (/mainstream|substream|cam-?b1p/i.test(e.name) ? 'מצלמה' : e.name);
function camAgo(id) {
  if (CAM.err[id] && !CAM.img[id]) return 'המצלמה לא עונה';
  if (!CAM.at[id]) return 'טוען תמונה…';
  const s = Math.round((Date.now() - CAM.at[id]) / 1000);
  return s < 5 ? 'עכשיו' : s < 60 ? `לפני ${s} שניות` : `לפני ${Math.round(s / 60)} דק׳`;
}
// Paints a new picture into every <img> of that camera without redrawing the page.
function camPaint(id) {
  for (const img of document.querySelectorAll(`img[data-cam="${CSS.escape(id)}"]`)) {
    img.src = CAM.img[id]; img.hidden = false;
    const w = img.parentElement.querySelector('.cam-wait'); if (w) w.remove();
  }
  for (const el of document.querySelectorAll(`[data-camago="${CSS.escape(id)}"]`)) el.textContent = camAgo(id);
}
async function camFetch(id, live) {
  if (CAM.busy.has(id)) return false;
  CAM.busy.add(id);
  try {
    const r = await camSnapFn({ id, live: !!live });
    const old = CAM.img[id];
    const bin = atob(r.data.img), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    CAM.img[id] = URL.createObjectURL(new Blob([buf], { type: r.data.type || 'image/jpeg' }));
    CAM.at[id] = Date.now(); delete CAM.err[id];
    camPaint(id);
    if (old) setTimeout(() => URL.revokeObjectURL(old), 3000);
    return true;
  } catch (e) {
    CAM.err[id] = e.message || 'error';
    for (const el of document.querySelectorAll(`[data-camago="${CSS.escape(id)}"]`)) el.textContent = CAM.img[id] ? camAgo(id) + ' · אין חיבור' : 'המצלמה לא עונה';
    return false;
  } finally { CAM.busy.delete(id); }
}
// thumbnails of cameras that are on screen
function camTick() {
  if (!S.data || document.hidden || S.cam) return;
  const ids = new Set([...document.querySelectorAll('#view img[data-cam]')].map((i) => i.dataset.cam));
  for (const id of ids) {
    const wait = CAM.err[id] ? 60000 : CAM_THUMB_MS;
    if (!CAM.at[id] || Date.now() - CAM.at[id] > wait) { if (!CAM.err[id] || Date.now() - (CAM.errAt || 0) > wait) { CAM.errAt = Date.now(); camFetch(id); } }
  }
}
setInterval(camTick, 5000);
setInterval(() => { for (const id of Object.keys(CAM.at)) for (const el of document.querySelectorAll(`[data-camago="${CSS.escape(id)}"]`)) el.textContent = camAgo(id); }, 5000);

function openCam(id) {
  S.cam = id;
  history.pushState({ cam: id }, '');
  let el = document.getElementById('camsheet');
  if (!el) { el = document.createElement('div'); el.id = 'camsheet'; el.className = 'sheet'; document.body.appendChild(el); }
  const e = ent(id);
  const src = CAM.img[id];
  el.innerHTML = `<div class="r-backdrop" data-rclose></div>
  <div class="r-sheet cam-sheet" role="dialog" aria-label="מצלמה">
    <div class="r-head">
      <div class="r-title"><span class="h-ic sm">${svg('cam')}</span><div><b>${esc(camName(e))}</b><small>${esc(areaName(roomById(roomOfEntity(id)) || { name: '' }))}</small></div></div>
      <button class="r-x" data-rclose aria-label="סגירה">×</button>
    </div>
    <div class="cam-big"><img data-cam="${esc(id)}" ${src ? `src="${src}"` : 'hidden'} alt=""><span class="cam-live" id="camState"></span></div>
    <div class="cam-meta"><span class="cam-dot"></span><span data-camago="${esc(id)}">${esc(camAgo(id))}</span></div>
  </div>`;
  renderCamInfo();
  requestAnimationFrame(() => el.classList.add('open'));
  camLive(id);
}
function renderCamInfo() {
  const e = S.cam && ent(S.cam);
  const el = document.getElementById('camState');
  if (!e || !el) return;
  const st = camState(e);
  el.textContent = st.text;
  el.className = 'cam-live' + (st.person ? ' alert' : st.motion ? ' on' : '');
}
async function camLive(id) {
  const run = (CAM.run = (CAM.run || 0) + 1);
  let fails = 0;
  while (S.cam === id && CAM.run === run) {
    if (document.hidden) { await new Promise((r) => setTimeout(r, 1000)); continue; }
    const t0 = Date.now();
    const ok = await camFetch(id, true);
    fails = ok ? 0 : fails + 1;
    const dot = document.querySelector('#camsheet .cam-dot');
    if (dot) dot.classList.toggle('bad', !ok);
    await new Promise((r) => setTimeout(r, Math.max(fails ? 3000 : 300, 1000 - (Date.now() - t0))));
  }
}
function closeCam(viaHistory) {
  const el = document.getElementById('camsheet');
  S.cam = null; CAM.run = (CAM.run || 0) + 1;
  if (el) el.classList.remove('open');
  if (viaHistory) { S.skipPop = true; history.back(); }
}
// a quick person-detected refresh: when the camera sees someone, poll the house sooner
let camPersonWas = false;
setInterval(() => {
  if (!S.data) return;
  const now = Object.values(S.data.entities).some((e) => dom(e.id) === 'camera' && camState(e).person);
  if (now && !camPersonWas) for (const e of Object.values(S.data.entities)) if (dom(e.id) === 'camera') CAM.at[e.id] = 0;
  camPersonWas = now;
}, 2000);


/* ---------- TV remote (Android TV Remote + Broadlink volume) ---------- */
const R = { num: '', edit: false };
const canEditChannels = () => S.data && S.data.me.role === 'parent';

function openRemote(id) {
  S.remote = id; R.num = ''; R.edit = false;
  history.pushState({ remote: id }, '');
  let el = document.getElementById('remote');
  if (!el) { el = document.createElement('div'); el.id = 'remote'; el.className = 'sheet'; document.body.appendChild(el); }
  renderRemote();
  requestAnimationFrame(() => el.classList.add('open'));
}
function closeRemote(viaHistory) {
  const el = document.getElementById('remote');
  S.remote = null;
  if (el) el.classList.remove('open');
  if (viaHistory) { S.skipPop = true; history.back(); }
}

function renderRemote() {
  const el = document.getElementById('remote');
  if (!el || !S.remote) return;
  const e = ent(S.remote);
  if (!e) { closeRemote(true); return; }
  const rid = roomOfEntity(S.remote);
  if (rid) groupRoom(rid, roomById(rid).entities);
  const extras = ((S.tvExtras || {})[S.remote] || []).filter(ent);
  const on = !['off', 'standby', 'unavailable', 'unknown'].includes(e.state);
  const k = (key, inner, cls = '', label = '') => `<button class="rk ${cls}" data-key="${key}" aria-label="${label}">${inner}</button>`;
  const vol = (ent(e.vol_down) || ent(e.vol_up))
    ? `<div class="r-sec"><span>ווליום</span></div><div class="r-row r-vol">
        ${e.vol_down ? `<button class="rk" data-vol="${esc(e.vol_down)}" aria-label="ווליום למטה">${svg('minus')}</button>` : ''}
        ${e.vol_mute ? `<button class="rk" data-vol="${esc(e.vol_mute)}" aria-label="השתקה">${svg('mute')}</button>` : ''}
        ${e.vol_up ? `<button class="rk" data-vol="${esc(e.vol_up)}" aria-label="ווליום למעלה">${svg('plus')}</button>` : ''}
      </div>` : '';
  const channels = S.data.channels || [];
  const chHtml = R.edit
    ? `<div class="ch-edit">${channels.map((c, i) => `<div class="ch-row">
          <input data-chname="${i}" value="${esc(c.name)}" placeholder="שם">
          <input data-chnum="${i}" value="${esc(c.n)}" inputmode="numeric" placeholder="מספר" dir="ltr">
          <button class="btn small" data-chup="${i}" aria-label="למעלה">${svg('up')}</button>
          <button class="btn small danger" data-chdel="${i}" aria-label="הסרה">✕</button></div>`).join('')}
        <div class="ch-actions"><button class="btn small" data-chadd>+ ערוץ</button><button class="btn small primary" data-chsave>שמירה</button></div></div>`
    : `<div class="ch-grid">${channels.map((c) => `<button class="ch" data-ch="${esc(c.n)}"><b>${esc(c.n)}</b><span>${esc(c.name)}</span></button>`).join('')}</div>`;

  el.innerHTML = `<div class="r-backdrop" data-rclose></div>
  <div class="r-sheet" role="dialog" aria-label="שלט">
    <div class="r-head">
      <div class="r-title"><span class="h-ic sm">${svg('tv')}</span><div><b>${esc(e.name)}</b><small>${on ? 'דולק' : 'כבוי'}</small></div></div>
      ${e.vol_power ? `<button class="rk screen" data-vol="${esc(e.vol_power)}" aria-label="הפעלה וכיבוי של המסך">${svg('tv')}<span>מסך</span></button>` : ''}
      <button class="rk power ${on ? 'on' : ''}" data-power aria-label="הפעלה וכיבוי של הממיר">${svg('power')}</button>
      <button class="r-x" data-rclose aria-label="סגירה">×</button>
    </div>
    <div class="r-body">
      <div class="r-ch">
        <div class="r-sec"><span>ערוצים</span>${canEditChannels() ? `<button class="link" data-chedit>${R.edit ? 'ביטול' : 'עריכה'}</button>` : ''}</div>
        ${chHtml}
      </div>
      <div class="r-num">
        <div class="r-sec"><span>מספר ערוץ</span></div>
        <div class="numpad">
          <div class="num-display">${esc(R.num) || '<span>הקלידו מספר</span>'}</div>
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="rk" data-digit="${n}">${n}</button>`).join('')}
          <button class="rk" data-numdel aria-label="מחיקה">⌫</button>
          <button class="rk" data-digit="0">0</button>
          <button class="rk go" data-numgo>מעבר</button>
        </div>
      </div>
      <div class="r-nav">
        ${vol}
        <div class="r-sec"><span>ניווט</span></div>
        <div class="dpad">
          ${k('DPAD_UP', svg('up'), 'u', 'למעלה')}
          ${k('DPAD_RIGHT', svg('right'), 'r', 'ימינה')}
          ${k('DPAD_CENTER', 'OK', 'ok', 'אישור')}
          ${k('DPAD_LEFT', svg('left'), 'l', 'שמאלה')}
          ${k('DPAD_DOWN', svg('down'), 'd', 'למטה')}
        </div>
        <div class="r-row">
          ${k('BACK', `${svg('back')}<span>חזרה</span>`, 'wide', 'חזרה')}
          ${k('HOME', `${svg('home')}<span>בית</span>`, 'wide', 'בית')}
          ${k('MEDIA_PLAY_PAUSE', `${svg('play')}<span>נגן/השהה</span>`, 'wide', 'נגן או השהה')}
        </div>
      </div>
    </div>
    ${extras.length ? `<div class="r-sec"><span>עוד בחדר</span></div><div class="grid">${extras.map((id) => tile(id, { noFav: true })).join('')}</div>` : ''}
  </div>`;
}

let keyQueue = Promise.resolve();
function sendKeys(keys) {
  const e = ent(S.remote);
  if (!e || !e.remote) return;
  if (navigator.vibrate) navigator.vibrate(8);
  // keep presses in order, without blocking the screen
  keyQueue = keyQueue.then(() => haCall({ calls: [{ e: e.remote, s: 'send_command', data: { command: keys } }] }))
    .catch((err) => toast(err.message || 'הפקודה לא נשלחה'));
}

async function saveChannels(list) {
  S.data.channels = list;
  try { await setDoc(doc(db, 'config', 'app'), { channels: list }, { merge: true }); toast('הערוצים נשמרו ✓'); }
  catch { toast('שמירת הערוצים נכשלה'); }
}
function readChannelEdits() {
  return (S.data.channels || []).map((c, i) => ({
    name: (document.querySelector(`[data-chname="${i}"]`) || {}).value?.trim() || c.name,
    n: ((document.querySelector(`[data-chnum="${i}"]`) || {}).value || c.n).replace(/\D/g, '').slice(0, 4),
  }));
}

function remoteClick(t, ev) {
  const ds = t.dataset;
  if ('rclose' in ds) return closeRemote(true);
  if (ds.key) return sendKeys([ds.key]);
  if (ds.ch) return sendKeys(ds.ch.split(''));
  if (ds.digit) { if (R.num.length < 4) R.num += ds.digit; return renderRemote(); }
  if ('numdel' in ds) { R.num = R.num.slice(0, -1); return renderRemote(); }
  if ('numgo' in ds) { if (R.num) { sendKeys(R.num.split('')); R.num = ''; renderRemote(); } return; }
  if (ds.vol) { if (navigator.vibrate) navigator.vibrate(8); haCall({ calls: [{ e: ds.vol, s: 'turn_on' }] }).catch((err) => toast(err.message || 'הפקודה לא נשלחה')); return; }
  if ('power' in ds) {
    const e = ent(S.remote);
    const on = !['off', 'standby', 'unavailable', 'unknown'].includes(e.state);
    e.state = on ? 'off' : 'on';
    renderRemote();
    act([{ e: e.remote, s: on ? 'turn_off' : 'turn_on' }]);
    return;
  }
  if ('chedit' in ds) { R.edit = !R.edit; return renderRemote(); }
  if ('chadd' in ds) { S.data.channels = [...readChannelEdits(), { name: '', n: '' }]; return renderRemote(); }
  if (ds.chdel) { S.data.channels = readChannelEdits().filter((_, i) => i !== Number(ds.chdel)); return renderRemote(); }
  if (ds.chup) {
    const i = Number(ds.chup), l = readChannelEdits();
    if (i > 0) [l[i - 1], l[i]] = [l[i], l[i - 1]];
    S.data.channels = l; return renderRemote();
  }
  if ('chsave' in ds) {
    const list = readChannelEdits().filter((c) => c.n);
    R.edit = false; saveChannels(list); return renderRemote();
  }
}

/* ---------- data ---------- */
// The last house state is kept on the device, so the app opens instantly and refreshes in the background.
const CACHE_V = 1;
const cacheKey = (email) => 'house:' + CACHE_V + ':' + (email || '').toLowerCase();
function readCache(email) {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey(email)) || 'null');
    return c && c.data && c.data.me && Date.now() - c.at < 7 * 864e5 ? c.data : null;
  } catch { return null; }
}
function writeCache(email, data) { try { localStorage.setItem(cacheKey(email), JSON.stringify({ at: Date.now(), data })); } catch {} }
function clearCaches() { try { for (const k of Object.keys(localStorage)) if (k.startsWith('house:')) localStorage.removeItem(k); } catch {} }
let loading = false;
async function load() {
  if (loading || !S.user) return;
  loading = true;
  try {
    const r = await haStates();
    if (S.data && Date.now() - (S.layoutAt || 0) < 15000) { r.data.me.layout = S.data.me.layout; r.data.me.favorites = S.data.me.favorites; }
    S.data = r.data; S.ok = true; S.stale = false;
    writeCache(S.user.email, r.data);
    // first screen: parents land on the house, children on their own screen
    if (!S.tab || S.data.me.role === 'tablet') S.tab = S.data.me.role === 'child' ? 'mine' : 'rooms';
    if (!S.unsubMembers) watchMembers();
    if (!S.unsubRem) watchReminders();
    if (!S.pushChecked) { S.pushChecked = true; refreshPush(); }
    show('main');
    // don't redraw under someone who is typing or choosing in a form
    const a = document.activeElement;
    if (!S.edit && !(a && ['INPUT', 'SELECT'].includes(a.tagName) && $('#view').contains(a))) render();
  } catch (e) {
    if (/not-member/.test(e.message || '')) {
      clearCaches(); S.data = null; S.stale = false;
      $('#deniedEmail').textContent = S.user.email; show('denied');
    } else {
      S.ok = false; S.stale = false;
      const msg = /deadline|timeout/i.test((e.code || '') + e.message) ? 'הבית לא עונה כרגע. מנסים שוב אוטומטית…' : esc(e.message || '');
      if (!S.data) setTimeout(load, 10000);
      if (S.data) render(); else { show('main'); $('#view').innerHTML = `<div class="hint" style="margin-top:24px">לא הצלחנו להתחבר לבית. ${msg}<br><button class="btn small" data-retry style="margin-top:10px">לנסות שוב</button></div>`; }
    }
  } finally { loading = false; }
}

async function act(calls, optimistic) {
  const ids = calls.map((c) => c.e);
  ids.forEach((id) => S.busy.add(id));
  if (optimistic) optimistic();
  render();
  let ok = true;
  try {
    await haCall({ calls });
  } catch (e) {
    ok = false;
    toast(e.message || 'הפעולה נכשלה');
  } finally {
    ids.forEach((id) => S.busy.delete(id));
    render();
    setTimeout(load, 1500);
  }
  return ok;
}

function toggle(id) {
  const e = ent(id), d = dom(id);
  if (e.remote) return openRemote(id);
  if (d === 'camera') return openCam(id);
  if (RUN.includes(d)) {
    act([{ e: id, s: d === 'button' ? 'press' : 'turn_on' }]).then((ok) => ok && toast(`✓ ${e.name}`));
    return;
  }
  if (d === 'lock') {
    const unlock = e.state === 'locked';
    if (!confirm(unlock ? `לפתוח את ${e.name}?` : `לנעול את ${e.name}?`)) return;
    act([{ e: id, s: unlock ? 'unlock' : 'lock' }], () => { e.state = unlock ? 'unlocking' : 'locking'; });
    return;
  }
  if (TOGGLE.includes(d)) {
    const on = isOn(e);
    act([{ e: id, s: on ? 'turn_off' : 'turn_on' }], () => { e.state = on ? 'off' : 'on'; });
  }
}

let tempTimer = null;
function bumpTemp(id, delta) {
  const e = ent(id);
  const step = e.target_temp_step || 1;
  const t = Math.min(e.max_temp ?? 30, Math.max(e.min_temp ?? 16, (Number(e.temperature) || 24) + delta * step));
  e.temperature = t; render();
  clearTimeout(tempTimer);
  tempTimer = setTimeout(() => act([{ e: id, s: 'set_temperature', data: { temperature: t } }]), 700);
}

async function toggleFav(id) {
  const me = S.data.me;
  const has = me.favorites.includes(id);
  me.favorites = has ? me.favorites.filter((x) => x !== id) : [...me.favorites, id];
  render();
  try { await updateDoc(doc(db, 'members', me.email), { favorites: has ? arrayRemove(id) : arrayUnion(id) }); }
  catch (e) { toast('שמירת המועדף נכשלה'); }
}

async function setMyRoom(areaId) {
  try {
    await updateDoc(doc(db, 'members', S.data.me.email), { room: areaId });
    S.data.me.room = areaId; S.picking = false;
    await load();
  } catch (e) { toast('לא הצלחנו לשמור את החדר'); }
}

function quick(k, scopeRoom) {
  const r = scopeRoom && roomById(scopeRoom);
  const scope = r ? r.entities.filter(ent) : allControllable();
  if (k === 'lights-off') {
    const ids = scope.filter((id) => dom(id) === 'light');
    if (ids.length) act(ids.map((e) => ({ e, s: 'turn_off' })), () => ids.forEach((id) => { ent(id).state = 'off'; }));
  } else {
    const ids = scope.filter((id) => dom(id) === 'cover' && ((ent(id).supported_features ?? 3) & (k === 'covers-open' ? 1 : 2)));
    if (ids.length) act(ids.map((e) => ({ e, s: k === 'covers-open' ? 'open_cover' : 'close_cover' })));
  }
}

/* ---------- members ---------- */
// phones are stored as the WhatsApp sender id: 972501234567
const normPhone = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('0')) d = '972' + d.slice(1); return d; };
const fmtPhone = (p) => (p && p.startsWith('972') ? '0' + p.slice(3).replace(/^(\d{2})(\d{3})(\d+)$/, '$1-$2-$3') : p || '');

function inviteText(m) {
  return `היי ${m.name}! 🏠\nהוזמנת לאפליקציה "הבית שלנו", שבה שולטים בבית החכם.\n` +
    `נכנסים עם חשבון ה־Google של ${m.id}:\n${location.origin}\n` +
    `טיפ: בטלפון אפשר להוסיף את האפליקציה למסך הבית (באייפון דרך כפתור השיתוף ב־Safari, באנדרואיד דרך תפריט Chrome).`;
}
function invite(m, how) {
  const text = inviteText(m);
  if (how === 'wa') window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
  else location.href = `mailto:${encodeURIComponent(m.id)}?subject=${encodeURIComponent('הזמנה ל"הבית שלנו"')}&body=${encodeURIComponent(text)}`;
}

/* ---------- reminders (spoken on the Google speaker) ---------- */
// Read live from Firestore (rules: own, or all for parents); changes go through the reminderOps function.
S.rem = [];
function watchReminders() {
  if (S.unsubRem) S.unsubRem();
  const me = S.data.me;
  const q = me.role === 'parent'
    ? query(collection(db, 'reminders'), where('status', '==', 'pending'))
    : query(collection(db, 'reminders'), where('email', '==', me.email));
  S.unsubRem = onSnapshot(q, (snap) => {
    S.rem = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status === 'pending').sort((a, b) => a.at - b.at);
    if (S.tab === 'mine' && !S.edit) render(); else renderBadgeOnly();
  }, () => {});
}
function renderBadgeOnly() {
  const mineBtn = document.querySelector('[data-tab="mine"]');
  if (!mineBtn) return;
  const n = myReminders().length;
  let b = mineBtn.querySelector('.badge');
  if (n && !b) { b = document.createElement('i'); b.className = 'badge'; mineBtn.appendChild(b); }
  if (b) { if (n) b.textContent = n; else b.remove(); }
}
const myReminders = () => (S.rem || []).filter((r) => S.data && r.email === S.data.me.email);
const DAY = 864e5;
function dayDiff(at) {
  const a = new Date(at), n = new Date();
  return Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / DAY);
}
const hhmm = (at) => new Date(at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
function dayLabel(d, at) {
  if (d === 0) return 'היום';
  if (d === 1) return 'מחר';
  return 'יום ' + new Date(at).toLocaleDateString('he-IL', { weekday: 'long' }).replace(/^יום\s*/, '');
}
function inText(at) {
  const m = Math.round((at - Date.now()) / 60000);
  if (m < 1) return 'עכשיו';
  if (m < 60) return `בעוד ${m} דק׳`;
  if (m < 3 * 60) { const h = Math.floor(m / 60), r = m % 60; return `בעוד ${h === 1 ? 'שעה' : 'שעתיים'}${r ? ` ו-${r} דק׳` : ''}`; }
  return '';
}
function viewReminders() {
  const me = S.data.me;
  const mine = myReminders();
  const others = me.role === 'parent' ? S.rem.filter((r) => r.email !== me.email) : [];
  const row = (r, theirs) => {
    const d = dayDiff(r.at), soon = inText(r.at);
    const confirm = S.remConfirm === r.id;
    return `<div class="rem${d === 0 ? ' today' : ''}">
      <button class="rem-main" data-remedit="${esc(r.id)}" aria-label="עריכה">
        <span class="rem-when"><b>${hhmm(r.at)}</b><small>${dayLabel(d, r.at)}</small></span>
        <span class="rem-what"><b>${esc(r.text)}</b><small>${[theirs ? esc(r.name || 'הטאבלט') : '', soon, r.speakerName ? '🔊 ' + esc(r.speakerName) : ''].filter(Boolean).join(' · ')}</small></span>
      </button>
      <button class="rem-x${confirm ? ' sure' : ''}" data-remcancel="${esc(r.id)}" aria-label="ביטול התזכורת">${confirm ? 'לבטל?' : '×'}</button>
    </div>`;
  };
  let h = `<div class="sec-head"><h3>${svg('bell')} התזכורות ${isTablet() ? 'של הטאבלט' : 'שלי'}</h3><button class="btn small" data-remadd>${svg('plus')}תזכורת</button></div>`;
  h += mine.length ? `<div class="rems">${mine.map((r) => row(r)).join('')}</div>`
    : `<div class="hint">אין תזכורות. אפשר להוסיף כאן, או לבקש מהמיקרופון: "תזכיר לי בעוד 20 דקות להוציא את הכביסה".</div>`;
  if (others.length) h += `<h3 class="rem-others">תזכורות של הילדים</h3><div class="rems">${others.map((r) => row(r, true)).join('')}</div>`;
  return h;
}

// cancel: the first tap asks ("לבטל?"), the second within 4s cancels
let remConfirmT = null;
async function cancelReminder(id, fromSheet) {
  if (!fromSheet && S.remConfirm !== id) {
    S.remConfirm = id; render();
    clearTimeout(remConfirmT); remConfirmT = setTimeout(() => { S.remConfirm = null; if (S.tab === 'mine') render(); }, 4000);
    return;
  }
  S.remConfirm = null;
  const prev = S.rem;
  S.rem = S.rem.filter((r) => r.id !== id); render();
  if (fromSheet) closeRemSheet(true);
  try { await remOps({ op: 'cancel', id }); toast('התזכורת בוטלה'); }
  catch (e) { S.rem = prev; render(); toast('לא הצלחתי לבטל: ' + (e.message || '')); }
}

// the add / edit sheet
const remForm = () => (S.remForm = S.remForm || {});
function openRemSheet(id) {
  const r = id && S.rem.find((x) => x.id === id);
  if (id && !r) return;
  const at = r ? r.at : Math.ceil((Date.now() + 30 * 60000) / (5 * 60000)) * (5 * 60000);
  S.remForm = { id: r ? r.id : null, text: r ? r.text : '', day: Math.max(0, dayDiff(at)), time: new Date(at).toTimeString().slice(0, 5), owner: r && r.email !== S.data.me.email ? r.name : '' };
  S.rsheet = id || 'new';
  history.pushState({ rsheet: S.rsheet }, '');
  let el = document.getElementById('rsheet');
  if (!el) { el = document.createElement('div'); el.id = 'rsheet'; el.className = 'sheet'; document.body.appendChild(el); }
  renderRemSheet();
  requestAnimationFrame(() => { el.classList.add('open'); if (!id) setTimeout(() => { const i = $('#remText'); if (i) i.focus(); }, 260); });
}
function closeRemSheet(viaHistory) {
  const el = document.getElementById('rsheet');
  S.rsheet = null;
  if (el) el.classList.remove('open');
  if (viaHistory) { S.skipPop = true; history.back(); }
}
function remAt() {
  const f = remForm();
  const [h, m] = String(f.time || '').split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  const d = new Date(); d.setDate(d.getDate() + (f.day || 0)); d.setHours(h, m, 0, 0);
  return d.getTime();
}
function renderRemSheet(keep) {
  const el = document.getElementById('rsheet');
  if (!el || !S.rsheet) return;
  const f = remForm();
  if (keep) { const i = $('#remText'), tm = $('#remTime'); if (i) f.text = i.value; if (tm) f.time = tm.value; }
  const days = Array.from({ length: 7 }, (_, i) => {
    const at = Date.now() + i * DAY;
    return `<button type="button" class="chip${f.day === i ? ' on' : ''}" data-remday="${i}">${i < 2 ? dayLabel(i, at) : new Date(at).toLocaleDateString('he-IL', { weekday: 'short' })}</button>`;
  }).join('');
  const at = remAt();
  const past = at && at < Date.now() + 30 * 1000;
  el.innerHTML = `<div class="r-backdrop" data-rclose></div>
  <div class="r-sheet rem-sheet" role="dialog" aria-label="תזכורת">
    <div class="r-head">
      <div class="r-title"><span class="h-ic sm">${svg('bell')}</span><div><b>${f.id ? 'עריכת תזכורת' : 'תזכורת חדשה'}</b><small>${f.owner ? 'של ' + esc(f.owner) + ' · ' : ''}תושמע ברמקול של הבית</small></div></div>
      <button class="r-x" data-rclose aria-label="סגירה">×</button>
    </div>
    <form id="remFormEl" class="rem-form" autocomplete="off">
      <label>מה להזכיר<input id="remText" maxlength="200" value="${esc(f.text)}" placeholder="למשל: לכבות את הגז" required></label>
      <div class="rem-lbl">מתי</div>
      <div class="chips">${days}</div>
      <label class="rem-time">בשעה<input id="remTime" type="time" value="${esc(f.time)}" required></label>
      <p class="rem-hint${past ? ' bad' : ''}" id="remHint">${past ? 'השעה הזו כבר עברה' : at ? `${dayLabel(f.day, at)} ב-${hhmm(at)}${inText(at) ? ' · ' + inText(at) : ''}` : ''}</p>
      <div class="rem-actions">
        <button type="submit" class="btn primary" id="remSave">${f.id ? 'שמירה' : 'הוספה'}</button>
        ${f.id ? `<button type="button" class="btn danger" data-remdel>ביטול התזכורת</button>` : ''}
      </div>
    </form>
  </div>`;
}
document.addEventListener('input', (ev) => {
  if (!ev.target.closest('#rsheet')) return;
  const f = remForm();
  if (ev.target.id === 'remText') f.text = ev.target.value;
  if (ev.target.id === 'remTime') {
    f.time = ev.target.value;
    const at = remAt(), hint = $('#remHint'), past = at && at < Date.now() + 30 * 1000;
    if (hint) { hint.className = 'rem-hint' + (past ? ' bad' : ''); hint.textContent = past ? 'השעה הזו כבר עברה' : at ? `${dayLabel(f.day, at)} ב-${hhmm(at)}${inText(at) ? ' · ' + inText(at) : ''}` : ''; }
  }
});
document.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'remFormEl') return;
  ev.preventDefault();
  const f = remForm();
  f.text = $('#remText').value.trim(); f.time = $('#remTime').value;
  const at = remAt();
  if (!f.text) return toast('מה להזכיר?');
  if (!at || at < Date.now() + 30 * 1000) return toast('השעה הזו כבר עברה');
  const btn = $('#remSave'); btn.disabled = true; btn.textContent = 'שומר…';
  try {
    if (f.id) await remOps({ op: 'update', id: f.id, text: f.text, at });
    else await remOps({ op: 'add', text: f.text, at });
    closeRemSheet(true);
    toast(f.id ? 'התזכורת עודכנה' : `תזכורת ל${dayLabel(f.day, at)} ב-${hhmm(at)}`);
  } catch (e) {
    btn.disabled = false; btn.textContent = f.id ? 'שמירה' : 'הוספה';
    toast('לא הצלחתי לשמור: ' + (e.message || ''));
  }
});
// "in 12 min" labels stay fresh
setInterval(() => { if (S.tab === 'mine' && S.rem && S.rem.length && !S.edit && !S.rsheet && !document.activeElement.closest?.('#view form')) render(); }, 60000);

function watchMembers() {
  if (S.unsubMembers) S.unsubMembers();
  S.unsubMembers = onSnapshot(collection(db, 'members'), (snap) => {
    S.members = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.role === b.role ? (a.name || '').localeCompare(b.name || '', 'he') : a.role === 'parent' ? -1 : 1));
    if (S.tab === 'family') render();
  }, () => {});
}

/* ---------- push notifications (house alerts: main door left open) ---------- */
// The token is kept per phone/browser; the server sends to every member's tokens (not the shared tablet).
const PUSH_KEY = 'push:token';
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
function pushStatus() {
  if (pushSupported() && Notification.permission === 'denied') return 'blocked';
  if (!pushSupported()) return isIOS && !standalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'granted' && localStorage.getItem(PUSH_KEY)) return 'on';
  return 'off';
}
let msgMod = null, messaging = null;
async function pushToken() {
  msgMod = msgMod || await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js');
  if (!(await msgMod.isSupported())) throw new Error('הדפדפן הזה לא תומך בהתראות');
  messaging = messaging || msgMod.getMessaging(app);
  const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  await navigator.serviceWorker.ready;
  const token = await msgMod.getToken(messaging, { serviceWorkerRegistration: reg });
  if (!S.pushListen) {
    S.pushListen = true;
    // app open in the foreground: show it anyway (and as a toast)
    msgMod.onMessage(messaging, (p) => {
      const n = p.notification || {};
      toast(`${n.title || ''} · ${n.body || ''}`);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      reg.showNotification(n.title || 'הבית שלנו', { body: n.body, icon: '/icon-192.png', tag: 'door', renotify: true, dir: 'rtl', lang: 'he' }).catch(() => {});
    });
  }
  return token;
}
async function savePushToken(token) {
  if (!token) throw new Error('לא התקבל אישור מהדפדפן');
  if (localStorage.getItem(PUSH_KEY) === token && localStorage.getItem(PUSH_KEY + ':u') === S.user.email) return;
  await pushTokenFn({ token, ua: navigator.userAgent });
  localStorage.setItem(PUSH_KEY, token); localStorage.setItem(PUSH_KEY + ':u', S.user.email);
}
async function enablePush() {
  try {
    const p = await Notification.requestPermission();
    if (p !== 'granted') { toast(p === 'denied' ? 'ההתראות נחסמו. אפשר לאפשר אותן בהגדרות הדפדפן' : 'ההתראות לא הופעלו'); render(); return; }
    toast('מפעיל התראות…');
    await savePushToken(await pushToken());
    toast('ההתראות הופעלו ✓');
  } catch (e) { toast('לא הצלחתי להפעיל התראות: ' + (e.message || '')); }
  render();
}
async function disablePush() {
  const t = localStorage.getItem(PUSH_KEY);
  localStorage.removeItem(PUSH_KEY); localStorage.removeItem(PUSH_KEY + ':u');
  if (t) {
    await pushTokenFn({ token: t, op: 'remove' }).catch(() => {});
    try { if (msgMod && messaging) await msgMod.deleteToken(messaging); } catch {}
  }
}
// on every start: tokens can rotate, keep the server's copy fresh (silent, only when already allowed)
async function refreshPush() {
  if (isTablet() || !pushSupported() || Notification.permission !== 'granted' || !localStorage.getItem(PUSH_KEY)) return;
  try { await savePushToken(await pushToken()); } catch (e) { console.warn('push refresh', e); }
}
function pushCard(compact) {
  if (isTablet()) return '';
  const st = pushStatus();
  if (compact && (st === 'on' || st === 'unsupported' || localStorage.getItem('push:dismiss'))) return '';
  const txt = {
    on: 'ההתראות פעילות בטלפון הזה ✓',
    off: 'קבלו התראה כשהדלת הראשית נשארת פתוחה.',
    blocked: 'ההתראות חסומות בטלפון הזה. אפשר לאפשר אותן בהגדרות האתר בדפדפן.',
    'ios-install': 'באייפון: לחצו על שיתוף ← "הוסף למסך הבית", פתחו את האפליקציה מהאייקון ואז הפעילו כאן התראות.',
    unsupported: 'הדפדפן הזה לא תומך בהתראות.',
  }[st];
  const btn = st === 'off' ? '<button class="btn small primary" data-pushon>הפעלת התראות</button>'
    : st === 'on' && !compact ? '<button class="btn small" data-pushtest>בדיקה</button>' : '';
  return `<div class="card push-card"><div class="who"><b>🔔 התראות לטלפון</b><small>${txt}</small></div><div class="push-btns">${btn}${compact ? '<button class="link" data-pushhide>לא עכשיו</button>' : ''}</div></div>`;
}

/* ---------- events ---------- */
document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button, [data-tap], [data-group], label, [data-rclose]');
  if (!t) return;
  const ds = t.dataset;
  if ('edit' in ds) { S.edit = !S.edit; if (S.edit) toast('גררו את הכרטיסים בעזרת הידית ⠿'); render(); if (S.gsheet) { renderGroup(); initSortables(); } return; }
  if (ds.editreset) return resetOrder(ds.editreset);
  if (S.edit && t.closest('[data-sort]')) return;
  if (ds.fav) { ev.stopPropagation(); return toggleFav(ds.fav); }
  if (t.closest('#remote') && !ds.tap) return remoteClick(t, ev);
  if (ds.remadd != null) return openRemSheet(null);
  if (ds.remedit) return openRemSheet(ds.remedit);
  if (ds.remcancel) return cancelReminder(ds.remcancel);
  if (t.closest('#rsheet')) {
    if ('rclose' in ds) return closeRemSheet(true);
    if (ds.remday != null) { remForm().day = Number(ds.remday); return renderRemSheet(true); }
    if ('remdel' in ds) return cancelReminder(S.rsheet, true);
  }
  if (t.closest('#camsheet')) {
    if ('rclose' in ds) return closeCam(true);
    return;
  }
  if (t.closest('#gsheet')) {
    if ('rclose' in ds) return closeGroup(true);
    if (ds.gall) return groupAll(ds.gall === 'on');
    if (ds.acrun) return runAc(ds.acrun);
  }
  if (ds.group) return openGroup(ds.group);
  if (ds.tap) return toggle(ds.tap);
  if (ds.act) { const e = ent(ds.act); return act([{ e: ds.act, s: ds.s }], () => { if (ds.s === 'turn_off') e.state = 'off'; }); }
  if (ds.temp) return bumpTemp(ds.temp, Number(ds.delta));
  if (ds.quick) return quick(ds.quick, ds.scope);
  if (ds.open) return openRoom(ds.open);
  if ('back' in ds) return history.back();
  if (ds.tab) { S.edit = false; }
  if (ds.tab) { if (S.room && ds.tab === 'rooms') { history.back(); return; } if (S.room) { S.room = null; history.back(); } S.tab = ds.tab; render(); window.scrollTo(0, 0); return; }
  if (ds.room) return setMyRoom(ds.room);
  if ('pickroom' in ds) {
    if ($('#pickHead')) return;
    $('#view').insertAdjacentHTML('beforeend', `<h3 id="pickHead">בחירת החדר שלי</h3>` + roomPicker(S.data.allAreas, S.data.me.room));
    $('#pickHead').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if ('pushon' in ds) return enablePush();
  if ('pushhide' in ds) { localStorage.setItem('push:dismiss', '1'); return render(); }
  if ('pushtest' in ds) {
    if (Notification.permission !== 'granted') return toast('ההתראות לא מאושרות');
    const reg = await navigator.serviceWorker.getRegistration('/');
    if (reg) reg.showNotification('🔔 בדיקה', { body: 'כך תיראה התראה מהבית', icon: '/icon-192.png', dir: 'rtl', lang: 'he' });
    return;
  }
  if ('signout' in ds) { await disablePush(); clearCaches(); if (S.unsubRem) { S.unsubRem(); S.unsubRem = null; } await signOut(auth); return; }
  if ('retry' in ds) return load();
  if (ds.wa || ds.mail) {
    const m = S.members.find((x) => x.id === (ds.wa || ds.mail));
    if (m) invite(m, ds.wa ? 'wa' : 'mail');
    return;
  }
  if (ds.mdel && confirm('להסיר את בן המשפחה?')) {
    try { await deleteDoc(doc(db, 'members', ds.mdel)); } catch { toast('ההסרה נכשלה'); }
  }
});

document.addEventListener('keydown', (ev) => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.dataset && ev.target.dataset.tap) { ev.preventDefault(); toggle(ev.target.dataset.tap); }
  else if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.dataset && ev.target.dataset.group) { ev.preventDefault(); openGroup(ev.target.dataset.group); }
});

document.addEventListener('change', async (ev) => {
  const t = ev.target, ds = t.dataset;
  try {
    if (ds.mrole) await updateDoc(doc(db, 'members', ds.mrole), { role: t.value });
    if (ds.mroom) await updateDoc(doc(db, 'members', ds.mroom), { room: t.value || null });
    if (ds.mphone) {
      const ph = normPhone(t.value);
      if (t.value.trim() && !/^972\d{8,9}$/.test(ph)) { toast('מספר לא תקין'); return; }
      if (ph && S.members.some((x) => x.id !== ds.mphone && x.phone === ph)) { toast('המספר כבר רשום לבן משפחה אחר'); return; }
      await updateDoc(doc(db, 'members', ds.mphone), { phone: ph || null });
      toast('הטלפון נשמר ✓');
    }
    if (ds.shared) {
      const set = new Set(S.data.sharedAreas || []);
      t.checked ? set.add(ds.shared) : set.delete(ds.shared);
      S.data.sharedAreas = [...set];
      await setDoc(doc(db, 'config', 'app'), { sharedAreas: [...set] }, { merge: true });
    }
    if (ds.mrole === S.data.me.email || ds.mroom === S.data.me.email) load();
  } catch (e) { toast('השמירה נכשלה'); }
});

document.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'addMember') return;
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target));
  const email = f.email.trim().toLowerCase();
  if (!email.includes('@')) return toast('מייל לא תקין');
  try {
    await setDoc(doc(db, 'members', email), { name: f.name.trim(), role: f.role, room: f.room || null, phone: normPhone(f.phone) || null, favorites: [], admin: false, created: Date.now() });
    ev.target.reset();
    toast(`${f.name} נוספ/ה ✓`);
    if (confirm(`לשלוח ל${f.name} הזמנה בוואטסאפ?`)) invite({ id: email, name: f.name.trim() }, 'wa');
  } catch (e) { toast('ההוספה נכשלה'); }
});

$('#loginBtn').addEventListener('click', async () => {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  try { await signInWithPopup(auth, p); }
  catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) return signInWithRedirect(auth, p);
    if (e.code !== 'auth/popup-closed-by-user') { $('#loginErr').textContent = 'הכניסה נכשלה: ' + e.code; $('#loginErr').hidden = false; }
  }
});

/* ---------- voice: tap the mic, speak, the house answers (same brain as the WhatsApp bot) ---------- */
const V = { state: 'idle', rec: null, stream: null, chunks: [], timer: null, heard: '', reply: '', pending: false, err: '' };
const V_MAX_MS = 15000, V_SILENCE_MS = 1600;
const vMime = () => ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']
  .find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
const voiceOk = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

const MIC_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM5 11h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.9V21h-2v-3.1A7 7 0 0 1 5 11z"/></svg>';
let vAutoClose = null;
function renderVoice() {
  const btn = $('#micBtn'), el = $('#voice'), bg = $('#voiceBg');
  btn.hidden = !S.data;
  btn.classList.toggle('rec', V.state === 'rec');
  btn.classList.toggle('busy', V.state === 'think');
  btn.setAttribute('aria-label', V.state === 'rec' ? 'סיום הקלטה' : 'פקודה קולית');
  const inp = $('#voiceText');
  if (!V.open) { clearTimeout(vAutoClose); el.hidden = true; bg.hidden = true; el.className = 'voice-card'; return; }
  const kind = V.state === 'rec' ? 'rec' : V.state === 'think' ? 'think' : V.err ? 'err' : V.pending ? 'ask' : V.reply ? 'ok' : 'type';
  // the poll redraws often; nothing changed → leave the card (and whatever is being typed) alone
  const sig = [kind, V.heard, V.reply, V.err, V.typed].join('|');
  if (sig === V.sig && !el.hidden) return;
  V.sig = sig; clearTimeout(vAutoClose);
  inp.disabled = kind === 'think';
  inp.placeholder = kind === 'rec' ? 'או הקלידו בקשה…' : 'הקלידו בקשה…';
  const head = {
    type: ['מה לעשות?', voiceOk() ? 'הקלידו בקשה, או לחצו על המיקרופון' : 'הקלידו בקשה לבית'],
    rec: ['מקשיב…', 'דברו עכשיו. לחיצה על המיקרופון מסיימת'],
    think: ['רגע, בודק…', 'מעביר את הבקשה לבית'],
    ok: ['הבית', ''],
    ask: ['צריך אישור', ''],
    err: ['לא הסתדר', ''],
  }[kind];
  const icon = { type: svg('home'), rec: MIC_SVG, think: '<span class="v-spin"></span>', ok: svg('home'), ask: svg('lock'), err: '!' }[kind];
  let body = '';
  if (kind === 'rec') body = `<div class="v-wave">${'<i></i>'.repeat(7)}</div>`;
  if (kind === 'think') body = `<div class="v-dots"><i></i><i></i><i></i></div>`;
  if (V.heard && kind !== 'rec') body += `<div class="v-msg me"><small>${V.typed ? 'כתבת' : 'אמרת'}</small>${esc(V.heard)}</div>`;
  if (V.reply && kind !== 'rec' && kind !== 'think') body += `<div class="v-msg house">${esc(V.reply)}</div>`;
  if (V.err) body += `<div class="v-msg bad">${esc(V.err)}</div>`;
  if (kind === 'ask') body += `<div class="v-actions"><button class="btn primary" data-vyes>כן, לפתוח</button><button class="btn" data-vclose>ביטול</button></div>`;
  if (kind === 'err' && voiceOk() && !V.typed) body += `<div class="v-actions"><button class="btn" data-vagain>${MIC_SVG}לנסות שוב</button></div>`;
  el.className = 'voice-card k-' + kind;
  $('#voiceMain').innerHTML = `<div class="v-head"><span class="v-ic">${icon}</span><div class="v-title"><b>${head[0]}</b>${head[1] ? `<small>${head[1]}</small>` : ''}</div>
    <button class="v-x" data-vclose aria-label="סגירה">×</button></div><div class="v-body">${body}</div>`;
  el.hidden = false; bg.hidden = false;
  if (kind === 'ok') armAutoClose();
}
// a plain answer goes away by itself, unless a follow-up is being typed
function armAutoClose() {
  clearTimeout(vAutoClose);
  const inp = $('#voiceText');
  if (inp.value || document.activeElement === inp) return;
  vAutoClose = setTimeout(() => { if (!inp.value && document.activeElement !== inp) closeVoice(); else armAutoClose(); }, 12000);
}
function closeVoice() {
  if (V.state === 'rec') stopRec(true);
  Object.assign(V, { open: false, sig: '', heard: '', reply: '', err: '', pending: false, typed: false });
  const inp = $('#voiceText'); inp.value = ''; inp.blur(); $('.v-send').disabled = true;
  if (window.speechSynthesis) speechSynthesis.cancel();
  renderVoice();
}

function speak(text) {
  if (!window.speechSynthesis || !text) return;
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
  if (!clean) return;
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = 'he-IL';
  const he = speechSynthesis.getVoices().find((x) => /^he|^iw/i.test(x.lang));
  if (he) u.voice = he;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
}

// wake the voice function (and its HA data) while the user is still talking or typing
let lastWarm = 0;
function warmVoice() {
  if (Date.now() - lastWarm < 4 * 60 * 1000) return;
  lastWarm = Date.now();
  voiceFn({ ping: 1 }).catch(() => {});
}
async function startRec() {
  warmVoice();
  if (window.speechSynthesis) speechSynthesis.cancel();
  Object.assign(V, { open: true, heard: '', reply: '', err: '', pending: false, typed: false, chunks: [] });
  if (!voiceOk()) { renderVoice(); return; }   // no recorder here: the card opens for typing only
  try {
    V.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    V.err = e.name === 'NotAllowedError' ? 'צריך לאשר גישה למיקרופון בהגדרות הדפדפן' : 'אין גישה למיקרופון';
    renderVoice(); return;
  }
  const mime = vMime();
  V.rec = new MediaRecorder(V.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
  V.rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) V.chunks.push(ev.data); };
  V.rec.onstop = () => sendRec();
  V.rec.start(250);
  V.state = 'rec'; V.startedAt = Date.now();
  renderVoice();
  // stop by itself after a pause in speech (handy on the tablet), or at the time limit
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = ctx.createAnalyser(); an.fftSize = 1024;
    ctx.createMediaStreamSource(V.stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    let spoke = false, quietSince = Date.now();
    V.ctx = ctx;
    V.timer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0; for (const x of buf) sum += x * x;
      const loud = Math.sqrt(sum / buf.length) > 0.02;
      if (loud) { spoke = true; quietSince = Date.now(); }
      $('#voice').style.setProperty('--lvl', Math.min(1, Math.sqrt(sum / buf.length) * 14).toFixed(2));
      if ((spoke && Date.now() - quietSince > V_SILENCE_MS) || Date.now() - V.startedAt > V_MAX_MS) stopRec();
    }, 100);
  } catch { V.timer = setTimeout(() => stopRec(), V_MAX_MS); }
}
function stopRec(cancel) {
  clearInterval(V.timer); clearTimeout(V.timer); V.timer = null;
  if (V.ctx) { V.ctx.close().catch(() => {}); V.ctx = null; }
  V.cancel = !!cancel;
  if (V.rec && V.rec.state !== 'inactive') V.rec.stop();
  // release the mic right away (the tablet must not keep it open)
  if (V.stream) { V.stream.getTracks().forEach((t) => t.stop()); V.stream = null; }
  if (cancel) { V.state = 'idle'; renderVoice(); }
}
async function sendRec() {
  if (V.cancel) { V.cancel = false; return; }
  const type = (V.rec && V.rec.mimeType) || vMime() || 'audio/webm';
  const blob = new Blob(V.chunks, { type });
  V.rec = null; V.chunks = [];
  if (Date.now() - V.startedAt < 700 || blob.size < 1500) { V.state = 'idle'; V.err = 'לא שמעתי כלום 🎤 לחצו ודברו'; renderVoice(); return; }
  const audio = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
  await askHouse({ audio, mime: type.split(';')[0] });
}
async function askHouse(data) {
  V.state = 'think'; renderVoice();
  try {
    const r = (await voiceFn(data)).data;
    if (r.error) V.err = r.error;
    else {
      V.heard = r.heard || V.heard; V.reply = r.reply || '✅'; V.pending = !!r.pending;
      speak(V.reply);
    }
    if (r.acted || r.done) setTimeout(load, 1500);
  } catch (e) {
    V.err = /deadline|timeout/i.test((e.code || '') + e.message) ? 'הבית לא ענה בזמן. נסו שוב.' : (e.message || 'משהו השתבש');
  }
  V.state = 'idle'; renderVoice();
}
$('#micBtn').addEventListener('click', () => {
  if (V.state === 'rec') stopRec();
  else if (V.state === 'idle') startRec();
});
// typing: touching the text line stops the recording; Enter / the arrow sends
$('#voiceText').addEventListener('focus', () => { warmVoice(); clearTimeout(vAutoClose); if (V.state === 'rec') stopRec(true); });
$('#voiceText').addEventListener('input', (ev) => { clearTimeout(vAutoClose); $('.v-send').disabled = !ev.target.value.trim(); });
$('#voiceForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const inp = $('#voiceText'), text = inp.value.trim().slice(0, 300);
  if (!text || V.state === 'think') return;
  if (V.state === 'rec') stopRec(true);
  if (window.speechSynthesis) speechSynthesis.cancel();
  inp.value = ''; $('.v-send').disabled = true; inp.blur();
  Object.assign(V, { open: true, heard: text, reply: '', err: '', pending: false, typed: true });
  askHouse({ text });
});
// keep the card above the on-screen keyboard
if (window.visualViewport) {
  const kb = () => document.documentElement.style.setProperty('--kb', Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop) + 'px');
  visualViewport.addEventListener('resize', kb); visualViewport.addEventListener('scroll', kb);
}
$('#voice').addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  if (!t || t.closest('#voiceForm')) return;
  if ('vclose' in t.dataset) closeVoice();
  if ('vyes' in t.dataset) { V.pending = false; askHouse({ text: 'כן' }); }
  if ('vagain' in t.dataset) { V.err = ''; startRec(); }
});
// tapping outside closes the answer (not while listening or thinking)
$('#voiceBg').addEventListener('click', () => { if (V.state === 'idle') closeVoice(); });

/* ---------- boot ---------- */
function show(id) { for (const s of ['login', 'denied', 'main', 'loading']) $('#' + s).hidden = s !== id; }
let toastTimer;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600); }

getRedirectResult(auth).catch((e) => {
  $('#loginErr').textContent = 'הכניסה לא הושלמה. אם פתחתם את הקישור מתוך וואטסאפ, פתחו אותו ב־Safari או ב־Chrome ונסו שוב.';
  $('#loginErr').hidden = false;
});
onAuthStateChanged(auth, (u) => {
  S.user = u; S.data = null;
  if (S.unsubMembers) { S.unsubMembers(); S.unsubMembers = null; }
  if (!u) { show('login'); return; }
  // draw the house from the device right away; fresh data replaces it in a moment
  const cached = readCache(u.email);
  if (cached) {
    S.data = cached; S.ok = true; S.stale = true;
    if (!S.tab || cached.me.role === 'tablet') S.tab = cached.me.role === 'child' ? 'mine' : 'rooms';
    show('main'); render();
  } else show('loading');
  load();
});

let lastPoll = 0;
setInterval(() => {
  if (!S.user || !S.data || document.hidden || S.busy.size) return;
  const idle = isTablet() && Date.now() - lastTouch > 120000;
  if (Date.now() - lastPoll < (idle ? 20000 : 8000)) return;
  lastPoll = Date.now(); load();
}, 2000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) load(); });
