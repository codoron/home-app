import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { firebaseConfig, AREA_NAMES, OWNER_EMAILS } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const fns = getFunctions(app, 'europe-west1');
const haStates = httpsCallable(fns, 'haStates', { timeout: 25000 });
const haCall = httpsCallable(fns, 'haCall', { timeout: 30000 });

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
  mute: 'M3 9h4l5-4v14l-5-4H3zm13.6 0L15 10.6 16.4 12 15 13.4 16.6 15l1.4-1.4 1.4 1.4 1.6-1.6-1.4-1.4L21 10.6 19.4 9 18 10.4z',
  home: 'M12 3 3 10v10a1 1 0 0 0 1 1h5v-6h6v6h5a1 1 0 0 0 1-1V10z',
  moon: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
};
const svg = (k) => `<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="${P[k] || P.power}"/></svg>`;

// Icon by what the device does: its name says more than its HA domain
// (a Sonoff "switch" can be a light, a script can drive the AC or the TV).
function iconFor(e) {
  const d = dom(e.id), n = (e.name + ' ' + e.id).toLowerCase();
  const lamp = /light|lamp|led|spot|אור|תאורה|מנורה|ספוט|נברשת/.test(n);
  if (d === 'light' || (lamp && /\bfan\b|מאוורר/.test(n) && d !== 'fan')) return 'bulb';
  if (d === 'lock') return e.state === 'unlocked' ? 'unlock' : 'lock';
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
    return `<div class="${cls.join(' ')}">${star}${head}${label}<div class="ctl">${b.join('')}</div></div>`;
  }
  if (d === 'climate') {
    const t = e.temperature ?? '–';
    return `<div class="${cls.join(' ')}">${star}${head}${label}
      <div class="ctl">
        <button data-temp="${esc(id)}" data-delta="-1" aria-label="פחות">${svg('minus')}</button>
        <div class="temp">${esc(t)}°</div>
        <button data-temp="${esc(id)}" data-delta="1" aria-label="יותר">${svg('plus')}</button>
        <button data-act="${esc(id)}" data-s="${e.state === 'off' ? 'turn_on' : 'turn_off'}" aria-label="הפעלה">${svg('power')}</button>
      </div></div>`;
  }
  if (SENSOR.includes(d)) return '';
  return `<div class="${cls.join(' ')}" data-tap="${esc(id)}" role="button" tabindex="0">${star}${head}${label}</div>`;
}

function sensorChips(ids) {
  const chips = ids.map(ent).filter((e) => e && SENSOR.includes(dom(e.id)) && e.state !== 'unavailable').map((e) => {
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
      (favs.length ? grid(favs) : `<div class="hint" style="margin-top:14px">אין עדיין מועדפים. לחצו על ☆ בפינה של מכשיר בכל חדר כדי להוסיף אותו לכאן.</div>`);
  }
  const room = S.data.areas.find((a) => a.id === me.room) || null;
  const favs = myFavs().filter(favOk);
  let h = `<h2>שלום, ${esc(me.name.split(' ')[0])}</h2>`;
  h += quickActions(allControllable());

  h += `<h3>המועדפים שלי</h3>`;
  h += favs.length ? grid(favs) : `<div class="hint">אין עדיין מועדפים. לחצו על ☆ בפינה של כל מכשיר כדי להוסיף אותו לכאן.</div>`;

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
  if (unlocked) parts.push('הדלת לא נעולה');
  else if (doorOpen) parts.push('דלת פתוחה');
  return { text: parts.join(' · ') || 'הכול כבוי', on: lights > 0, alert: unlocked || doorOpen, temp: temp ? `${Math.round(parseFloat(temp.state) * 10) / 10}°` : '' };
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
  const areas = S.data.areas.filter((a) => a.entities.length).sort((a, b) => (b.id === mine) - (a.id === mine));
  let h = isTablet() ? homeStatus() : `<h2>הבית</h2>`;
  h += quickActions(allControllable());
  if (isTablet()) {
    // the tablet has no menu: shared favorites sit on the house screen itself
    const favs = myFavs().filter(favOk);
    if (favs.length) h += `<h3>מועדפים</h3>` + grid(favs) + `<h3>חדרים</h3>`;
  }
  h += `<div class="room-grid">`;
  for (const a of areas) {
    const sum = roomSummary(a.entities);
    const gr = groupRoom(a.id, a.entities);
    const n = gr.groups.length + gr.tiles.length;
    h += `<button class="room-card ${sum.on ? 'on' : ''} ${sum.alert ? 'alert' : ''}" data-open="${esc(a.id)}">
      <div class="rc-top"><span class="rc-ic">${roomIcon(a)}</span>${sum.temp ? `<span class="rc-temp">${esc(sum.temp)}</span>` : ''}${a.id === mine ? '<span class="rc-mine">שלי</span>' : ''}</div>
      <div class="rc-name">${esc(areaName(a))}</div>
      <div class="rc-sum">${esc(sum.text)}</div>
      <div class="rc-n">${n === 1 ? 'פריט אחד' : n + ' פריטים'}</div>
    </button>`;
  }
  if (S.data.other.length) {
    h += `<button class="room-card" data-open="_other">
      <div class="rc-top"><span class="rc-ic"><svg viewBox="0 0 24 24"><path d="${ROOM_IC.bolt}"/></svg></span></div>
      <div class="rc-name">פעולות נוספות</div><div class="rc-sum">מזגן, טלוויזיה ועוד</div><div class="rc-n">רק להורים</div></button>`;
  }
  h += `</div>`;
  const empty = S.data.areas.filter((a) => !a.entities.length).map(areaName);
  if (empty.length) h += `<p class="hint">חדרים בלי מכשירים: ${esc(empty.join(', '))}. משייכים מכשיר לחדר ב־Home Assistant (גלגל השיניים של המכשיר ← Area).</p>`;
  if (isTablet()) h += `<p class="tablet-foot">טאבלט משותף · לחיצה על ☆ במכשיר בתוך חדר מוסיפה אותו למועדפים · <button class="link" data-signout>התנתקות</button></p>`;
  return h;
}

function viewRoom(a) {
  const name = a.id === '_other' ? a.name : areaName(a);
  let h = `<div class="room-head"><button class="back" data-back aria-label="חזרה">${svg('back')}<span>הבית</span></button></div>`;
  h += `<h2 class="with-ic">${a.id === '_other' ? `<span class="h-ic"><svg viewBox="0 0 24 24"><path d="${ROOM_IC.bolt}"/></svg></span>` : `<span class="h-ic">${roomIcon(a)}</span>`}${esc(name)}</h2>`;
  h += sensorChips(a.entities);
  h += quickActions(a.entities.filter(ent), true);
  h += roomGrid(a.id, a.entities) || `<div class="hint">אין מכשירים בחדר הזה.</div>`;
  return h;
}

function openRoom(id) {
  S.room = id;
  history.pushState({ room: id }, '');
  render(); window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => {
  // closing a sheet with × steps history back once; that step must not also leave the room
  if (S.skipPop) { S.skipPop = false; return; }
  if (S.remote) { closeRemote(false); return; }
  if (S.gsheet) { closeGroup(false); return; }
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
          ${m.id !== me.email ? `<button class="btn small" data-wa="${esc(m.id)}">הזמנה בוואטסאפ</button><button class="btn small" data-mail="${esc(m.id)}">במייל</button><button class="btn small danger" data-mdel="${esc(m.id)}">הסרה</button>` : ''}
        </div>`
      : parent && m.role === 'child'
        ? `<div class="edit-row"><select data-mroom="${esc(m.id)}">${areaOpts(m.room)}</select></div>` : '';
    h += `<div class="card"><div class="person"><div class="avatar">${esc((m.name || '?')[0])}</div>
      <div class="who"><b>${esc(m.name)}</b><span class="tag">${ROLE[m.role] || m.role}</span>${m.lastSeen ? '' : '<span class="tag wait">עוד לא נכנס/ה</span>'}<small>${esc(nameOfArea(m.room))} · ${esc(m.id)}</small></div></div>${edit}</div>`;
  }
  h += `</div>`;

  if (isAdmin) {
    h += `<h3>הוספת בן משפחה</h3>
      <form class="card form" id="addMember">
        <div class="row"><input name="name" placeholder="שם" required><input name="email" type="email" placeholder="מייל Google" required dir="ltr"></div>
        <div class="row"><select name="role"><option value="child">ילד/ה</option><option value="parent">הורה</option><option value="tablet">טאבלט משותף</option></select><select name="room">${areaOpts('')}</select></div>
        <button class="btn primary">הוספה</button>
        <small class="hello">אחרי ההוספה שלחו להם את הכתובת: ${esc(location.origin)}</small>
      </form>`;
    const shared = new Set(S.data.sharedAreas || []);
    h += `<h3>חדרים משותפים לילדים</h3>
      <div class="card"><p class="hello">ילדים רואים את החדר שלהם ואת החדרים שמסומנים כאן. הורים רואים הכול. את דלת הכניסה רק הורים פותחים.</p>
      <div class="checks">${S.data.allAreas.map((a) => `<label><input type="checkbox" data-shared="${esc(a.id)}" ${shared.has(a.id) ? 'checked' : ''}>${esc(areaName(a))}</label>`).join('')}</div></div>`;
  }
  h += `<h3>החשבון שלי</h3><div class="card person"><div class="who"><b>${esc(me.name)}</b><small>${esc(me.email)}</small></div><button class="btn small" data-signout>התנתקות</button></div>`;
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
  const mineLabel = document.querySelector('[data-tab="mine"] span');
  if (mineLabel) mineLabel.textContent = isTablet() ? 'מועדפים' : 'שלי';
  if (isTablet()) { tickClock(); keepAwake(); }
  $('#status').className = 'status' + (S.ok ? '' : ' bad');
  $('#status').innerHTML = `<span class="dot"></span>${S.ok ? 'מחובר לבית' : 'אין חיבור לבית'}`;
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
    if (e.remote) for (const k of ['vol_up', 'vol_down', 'vol_mute']) if (e[k]) out.hidden.add(e[k]);
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
    return `<div class="tile group ${on ? 'on' : ''}" data-group="${esc(g.id)}" role="button" tabindex="0">${star}
      <div class="ic">${svg('bulb')}</div><div><div class="nm">תאורה</div><div class="st">${esc(st)}</div>${where}</div>
      <div class="g-more">${g.lights.length + g.runs.length} מפסקים ›</div></div>`;
  }
  if (g.kind === 'ac' || g.kind === 'fan') {
    const last = acLast(g);
    const mode = last ? MODE(g, ent(last.id).name) : null;
    const st = last ? `${mode.label} · ${ago(last.r.at)}` : 'לחצו לבחירת מצב';
    const icon = g.kind === 'fan' ? 'fan' : mode && mode.heat ? 'sun' : 'snow';
    return `<div class="tile group cool ${mode && !mode.off ? (mode.heat ? 'heat' : 'chill') : ''}" data-group="${esc(g.id)}" role="button" tabindex="0">${star}
      <div class="ic">${svg(icon)}</div><div><div class="nm">${g.kind === 'fan' ? 'מאוורר' : 'מזגן'}</div><div class="st">${esc(st)}</div>${where}</div>
      <div class="g-more">${g.items.length} מצבים ›</div></div>`;
  }
  return '';
}
let opts_where = false;

// Room content: group cards first, then the rest, then a folded list of unavailable devices.
function roomGrid(roomId, ids) {
  const g = groupRoom(roomId, ids);
  const cards = g.groups.map(groupTile).join('') + g.tiles.map((id) => tile(id)).join('');
  let h = cards ? `<div class="grid">${cards}</div>` : '';
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
    body = top + `<div class="grid">${[...g.lights, ...g.runs].map((id) => tile(id)).join('')}</div>`;
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
  if (S.remote) { closeRemote(true); return; }
  if (S.gsheet) { closeGroup(true); return; }
  if (S.room || S.tab !== 'rooms') {
    if (S.room) { S.room = null; history.back(); }
    S.tab = 'rooms'; render(); window.scrollTo(0, 0);
  }
}, 5000);


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
      <button class="rk power ${on ? 'on' : ''}" data-power aria-label="הפעלה וכיבוי">${svg('power')}</button>
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
let loading = false;
async function load() {
  if (loading || !S.user) return;
  loading = true;
  try {
    const r = await haStates();
    S.data = r.data; S.ok = true;
    // first screen: parents land on the house, children on their own screen
    if (!S.tab || S.data.me.role === 'tablet') S.tab = S.data.me.role === 'child' ? 'mine' : 'rooms';
    if (!S.unsubMembers) watchMembers();
    show('main');
    // don't redraw under someone who is typing or choosing in a form
    const a = document.activeElement;
    if (!(a && ['INPUT', 'SELECT'].includes(a.tagName) && $('#view').contains(a))) render();
  } catch (e) {
    if (/not-member/.test(e.message || '')) {
      $('#deniedEmail').textContent = S.user.email; show('denied');
    } else {
      S.ok = false;
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

function watchMembers() {
  if (S.unsubMembers) S.unsubMembers();
  S.unsubMembers = onSnapshot(collection(db, 'members'), (snap) => {
    S.members = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.role === b.role ? (a.name || '').localeCompare(b.name || '', 'he') : a.role === 'parent' ? -1 : 1));
    if (S.tab === 'family') render();
  }, () => {});
}

/* ---------- events ---------- */
document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('button, [data-tap], [data-group], label, [data-rclose]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.fav) { ev.stopPropagation(); return toggleFav(ds.fav); }
  if (t.closest('#remote') && !ds.tap) return remoteClick(t, ev);
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
  if (ds.tab) { if (S.room && ds.tab === 'rooms') { history.back(); return; } if (S.room) { S.room = null; history.back(); } S.tab = ds.tab; render(); window.scrollTo(0, 0); return; }
  if (ds.room) return setMyRoom(ds.room);
  if ('pickroom' in ds) {
    if ($('#pickHead')) return;
    $('#view').insertAdjacentHTML('beforeend', `<h3 id="pickHead">בחירת החדר שלי</h3>` + roomPicker(S.data.allAreas, S.data.me.room));
    $('#pickHead').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if ('signout' in ds) { await signOut(auth); return; }
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
    await setDoc(doc(db, 'members', email), { name: f.name.trim(), role: f.role, room: f.room || null, favorites: [], admin: false, created: Date.now() });
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
  show('loading');
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
