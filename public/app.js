import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { firebaseConfig, AREA_NAMES, OWNER_EMAILS } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const fns = getFunctions(app, 'europe-west1');
const haStates = httpsCallable(fns, 'haStates');
const haCall = httpsCallable(fns, 'haCall');

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dom = (e) => e.split('.')[0];

const S = { user: null, data: null, tab: 'mine', busy: new Set(), members: [], ok: true, unsubMembers: null };

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
  moon: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
};
const svg = (k) => `<svg viewBox="0 0 24 24"><path d="${P[k]}"/></svg>`;

function iconFor(e) {
  const d = dom(e.id), n = (e.name + ' ' + e.id).toLowerCase();
  if (d === 'light') return 'bulb';
  if (d === 'cover') return 'blind';
  if (d === 'lock') return e.state === 'unlocked' ? 'unlock' : 'lock';
  if (d === 'climate' || /\bac\b|ac_|מזגן/.test(n)) return /heat|חימום/.test(n) ? 'sun' : 'snow';
  if (d === 'media_player' || /\btv\b|tv_|טלוויזיה/.test(n)) return 'tv';
  if (d === 'fan') return 'fan';
  if (d === 'binary_sensor') return 'door';
  if (d === 'sensor') return 'temp';
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

/* ---------- tiles ---------- */
function tile(id, opts = {}) {
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
    `<button class="fav ${fav ? 'is' : ''}" data-fav="${esc(id)}" aria-label="מועדף">${svg('star')}</button>`;
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

function quickActions(scopeIds) {
  const lightsOn = scopeIds.filter((id) => dom(id) === 'light' && ent(id).state !== 'off');
  const covers = scopeIds.filter((id) => dom(id) === 'cover' && ((ent(id).supported_features ?? 2) & 2));
  const btn = (k, icon, text) => `<button data-quick="${k}">${svg(icon)}<span>${text}</span></button>`;
  const b = [];
  if (scopeIds.some((id) => dom(id) === 'light')) b.push(btn('lights-off', 'moon', lightsOn.length ? `כיבוי כל האורות (${lightsOn.length})` : 'כיבוי כל האורות'));
  if (covers.length) b.push(btn('covers-close', 'down', 'סגירת כל התריסים'));
  if (covers.length) b.push(btn('covers-open', 'up', 'פתיחת כל התריסים'));
  return b.length ? `<div class="quick">${b.join('')}</div>` : '';
}

function viewMine() {
  const me = S.data.me;
  const room = S.data.areas.find((a) => a.id === me.room) || null;
  const favs = myFavs().filter(ent);
  let h = `<h2>שלום, ${esc(me.name.split(' ')[0])}</h2>`;
  h += quickActions(allControllable());

  h += `<h3>המועדפים שלי</h3>`;
  h += favs.length ? grid(favs) : `<div class="hint">אין עדיין מועדפים. לחצו על ☆ בפינה של כל מכשיר כדי להוסיף אותו לכאן.</div>`;

  if (room) {
    const canChange = me.role === 'parent';
    h += `<div class="sec-head"><h3>${esc(areaName(room))} <span class="count">החדר שלי</span></h3>${canChange ? '<button class="link" data-pickroom>החלפת חדר</button>' : ''}</div>`;
    h += sensorChips(room.entities);
    h += grid(room.entities) || `<div class="hint">אין עדיין מכשירים בחדר הזה.</div>`;
  } else {
    h += `<h3>איזה חדר שלך?</h3>`;
    h += roomPicker(S.data.allAreas);
    if (me.role !== 'parent') h += `<p class="hint">שימו לב: אפשר לבחור פעם אחת. אחר כך רק הורה יכול להחליף.</p>`;
  }
  return h;
}

function roomPicker(list, sel) {
  return `<div class="rooms-pick">${list.map((a) => `<button data-room="${esc(a.id)}" class="${a.id === sel ? 'sel' : ''}">${esc(areaName(a))}</button>`).join('')}</div>`;
}

function viewRooms() {
  let h = `<h2>כל החדרים</h2>`;
  const mine = S.data.me.room;
  const areas = [...S.data.areas].sort((a, b) => (b.id === mine) - (a.id === mine));
  for (const a of areas) {
    const ctrl = a.entities.filter((id) => !SENSOR.includes(dom(id)));
    if (!a.entities.length) continue;
    const on = ctrl.filter((id) => isOn(ent(id))).length;
    h += `<h3>${esc(areaName(a))} ${on ? `<span class="count">${on} דולקים</span>` : ''}</h3>`;
    h += sensorChips(a.entities);
    h += grid(a.entities);
  }
  if (S.data.other.length) {
    h += `<h3>פעולות ומכשירים בלי חדר <span class="count">רק להורים</span></h3>`;
    h += grid(S.data.other);
  }
  const empty = S.data.areas.filter((a) => !a.entities.length).map(areaName);
  if (empty.length) h += `<p class="hint">חדרים בלי מכשירים: ${esc(empty.join(', '))}. משייכים מכשיר לחדר ב־Home Assistant (גלגל השיניים של המכשיר ← Area).</p>`;
  return h;
}

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
          <select data-mrole="${esc(m.id)}"><option value="parent" ${m.role === 'parent' ? 'selected' : ''}>הורה</option><option value="child" ${m.role === 'child' ? 'selected' : ''}>ילד/ה</option></select>
          <select data-mroom="${esc(m.id)}">${areaOpts(m.room)}</select>
          ${m.id !== me.email ? `<button class="btn small" data-wa="${esc(m.id)}">הזמנה בוואטסאפ</button><button class="btn small" data-mail="${esc(m.id)}">במייל</button><button class="btn small danger" data-mdel="${esc(m.id)}">הסרה</button>` : ''}
        </div>`
      : parent && m.role === 'child'
        ? `<div class="edit-row"><select data-mroom="${esc(m.id)}">${areaOpts(m.room)}</select></div>` : '';
    h += `<div class="card"><div class="person"><div class="avatar">${esc((m.name || '?')[0])}</div>
      <div class="who"><b>${esc(m.name)}</b><span class="tag">${m.role === 'parent' ? 'הורה' : 'ילד/ה'}</span>${m.lastSeen ? '' : '<span class="tag wait">עוד לא נכנס/ה</span>'}<small>${esc(nameOfArea(m.room))} · ${esc(m.id)}</small></div></div>${edit}</div>`;
  }
  h += `</div>`;

  if (isAdmin) {
    h += `<h3>הוספת בן משפחה</h3>
      <form class="card form" id="addMember">
        <div class="row"><input name="name" placeholder="שם" required><input name="email" type="email" placeholder="מייל Google" required dir="ltr"></div>
        <div class="row"><select name="role"><option value="child">ילד/ה</option><option value="parent">הורה</option></select><select name="room">${areaOpts('')}</select></div>
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
  const v = S.tab === 'rooms' ? viewRooms() : S.tab === 'family' ? viewFamily() : viewMine();
  // keep form input while re-rendering the family tab
  const f = $('#addMember');
  const draft = f ? Object.fromEntries(new FormData(f)) : null;
  $('#view').innerHTML = v;
  if (draft) { const nf = $('#addMember'); if (nf) for (const [k, val] of Object.entries(draft)) nf.elements[k].value = val; }
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab));
  $('#status').className = 'status' + (S.ok ? '' : ' bad');
  $('#status').innerHTML = `<span class="dot"></span>${S.ok ? 'מחובר לבית' : 'אין חיבור לבית'}`;
}

/* ---------- data ---------- */
let loading = false;
async function load() {
  if (loading || !S.user) return;
  loading = true;
  try {
    const r = await haStates();
    S.data = r.data; S.ok = true;
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
      if (S.data) render(); else { show('main'); $('#view').innerHTML = `<div class="hint" style="margin-top:24px">לא הצלחנו להתחבר לבית. ${esc(e.message || '')}<br><button class="btn small" data-retry style="margin-top:10px">לנסות שוב</button></div>`; }
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

function quick(k) {
  const scope = allControllable();
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
  const t = ev.target.closest('button, [data-tap], label');
  if (!t) return;
  const ds = t.dataset;
  if (ds.fav) { ev.stopPropagation(); return toggleFav(ds.fav); }
  if (ds.tap) return toggle(ds.tap);
  if (ds.act) { const e = ent(ds.act); return act([{ e: ds.act, s: ds.s }], () => { if (ds.s === 'turn_off') e.state = 'off'; }); }
  if (ds.temp) return bumpTemp(ds.temp, Number(ds.delta));
  if (ds.quick) return quick(ds.quick);
  if (ds.tab) { S.tab = ds.tab; render(); window.scrollTo(0, 0); return; }
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

getRedirectResult(auth).catch(() => {});
onAuthStateChanged(auth, (u) => {
  S.user = u; S.data = null;
  if (S.unsubMembers) { S.unsubMembers(); S.unsubMembers = null; }
  if (!u) { show('login'); return; }
  show('loading');
  load();
});

setInterval(() => { if (S.user && S.data && !document.hidden && !S.busy.size) load(); }, 8000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) load(); });
