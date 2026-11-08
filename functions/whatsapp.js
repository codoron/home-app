// WhatsApp → Gemini → Home Assistant.
// Meta posts every incoming message here. The sender is identified by phone number (members/{email}.phone),
// Gemini only sees the devices that member may use, and every action goes through runCalls (same checks as the app).
const crypto = require('crypto');
const { onRequest, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const WA_TOKEN = defineSecret('WA_TOKEN');           // permanent (system user) token
const WA_APP_SECRET = defineSecret('WA_APP_SECRET'); // to check Meta's signature
const WA_VERIFY = defineSecret('WA_VERIFY');         // our own string for the webhook handshake

const GRAPH = 'https://graph.facebook.com/v25.0';
const MODEL_DEFAULT = 'gemini-3.8-flash';            // Vertex AI, location "global"; override in config/app.geminiModel
const AREA_HE = {
  'Living Room': 'סלון', Kitchen: 'מטבח', 'Master Bedroom': 'חדר שינה הורים', "Adi's room": 'החדר של עדי',
  "Aviv's room": 'החדר של אביב', "Matan's room": 'החדר של מתן', Bathroom: 'אמבטיה', 'Dining Room': 'פינת אוכל',
  Entrance: 'כניסה', Garden: 'גינה', 'Gaming room': 'חדר משחקים', Storage: 'מחסן', 'Parents restroom': 'שירותי הורים',
};
const YES = /^\s*(כן|כן\.|יאללה|אישור|מאשר|מאשרת|בטח|yes|y|ok|אוקיי)\s*[!.]*\s*$/i;

// 0501234567 / +972-50-123-4567 / 972501234567 → 972501234567
const normPhone = (p) => {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '972' + d.slice(1);
  return d;
};

module.exports = ({ ha, view, runCalls, db, dom, objId, HA_URL, HA_TOKEN }) => {
  let genai = null;
  async function gemini() {
    if (!genai) {
      const { GoogleGenAI } = require('@google/genai');
      genai = new GoogleGenAI({ vertexai: true, project: process.env.GCLOUD_PROJECT || 'home-app-f94e4', location: 'global' });
    }
    return genai;
  }

  async function send(phoneId, to, text) {
    const r = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + WA_TOKEN.value().trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text.slice(0, 4000) } }),
    });
    if (!r.ok) console.error('whatsapp send failed', r.status, await r.text());
  }

  function validSignature(req) {
    const sig = String(req.get('x-hub-signature-256') || '');
    const mine = 'sha256=' + crypto.createHmac('sha256', WA_APP_SECRET.value().trim()).update(req.rawBody || '').digest('hex');
    return sig.length === mine.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(mine));
  }

  // ---- what Gemini may do ----
  const TOOLS = [{
    functionDeclarations: [
      {
        name: 'control',
        description: 'Operate one device from the list. Call it once per device; several calls in one turn are fine.',
        parameters: {
          type: 'OBJECT',
          properties: {
            entity_id: { type: 'STRING', description: 'Exact id from the device list' },
            action: { type: 'STRING', enum: ['turn_on', 'turn_off', 'open', 'close', 'stop', 'lock', 'unlock', 'run', 'set_temperature'] },
            temperature: { type: 'NUMBER', description: 'Only for set_temperature' },
          },
          required: ['entity_id', 'action'],
        },
      },
      {
        name: 'tv_channel',
        description: 'Switch a TV box to a channel number (digits are sent one by one).',
        parameters: {
          type: 'OBJECT',
          properties: { tv_entity_id: { type: 'STRING' }, channel: { type: 'STRING', description: 'Channel number, digits only' } },
          required: ['tv_entity_id', 'channel'],
        },
      },
    ],
  }];

  function toCall(v, name, a) {
    if (name === 'tv_channel') {
      const tv = v.entities[a.tv_entity_id];
      const ch = String(a.channel || '').replace(/\D/g, '');
      if (!tv || !tv.remote) throw new HttpsError('invalid-argument', 'אין שלט לטלוויזיה הזו');
      if (!ch || ch.length > 4) throw new HttpsError('invalid-argument', 'מספר ערוץ לא תקין');
      return { e: tv.remote, s: 'send_command', data: { command: ch.split('') } };
    }
    const e = String(a.entity_id || ''), d = dom(e);
    const map = {
      cover: { open: 'open_cover', close: 'close_cover', stop: 'stop_cover' },
      lock: { lock: 'lock', unlock: 'unlock' },
      script: { run: 'turn_on', turn_on: 'turn_on' },
      scene: { run: 'turn_on', turn_on: 'turn_on' },
      button: { run: 'press', turn_on: 'press' },
      climate: { turn_on: 'turn_on', turn_off: 'turn_off', set_temperature: 'set_temperature' },
    }[d] || { turn_on: 'turn_on', turn_off: 'turn_off' };
    const s = map[a.action];
    if (!s) throw new HttpsError('invalid-argument', `הפעולה ${a.action} לא מתאימה ל־${e}`);
    return { e, s, data: s === 'set_temperature' ? { temperature: a.temperature } : undefined };
  }

  function deviceList(v, cfg) {
    const line = (id) => {
      const e = v.entities[id];
      let st = e.state;
      if (e.unit_of_measurement) st += e.unit_of_measurement;
      const extra = e.remote ? ' (TV box: use tv_channel for channels)' : '';
      return `- ${id} | ${e.name} | ${st}${extra}`;
    };
    const skip = new Set();
    // remotes and TV volume scripts belong to their TV, not to the plain list
    for (const e of Object.values(v.entities)) if (e.remote) for (const k of ['remote', 'vol_up', 'vol_down', 'vol_mute']) if (e[k]) skip.add(e[k]);
    const out = [];
    for (const a of v.areas) {
      const ids = a.entities.filter((id) => v.entities[id] && !skip.has(id));
      if (ids.length) out.push(`## ${AREA_HE[a.name] || a.name} (${a.name})`, ...ids.map(line));
    }
    const other = v.other.filter((id) => v.entities[id] && !skip.has(id));
    if (other.length) out.push('## Not in a room', ...other.map(line));
    // TV volume scripts are listed with their TV
    for (const e of Object.values(v.entities)) {
      if (!e.remote) continue;
      const vol = ['vol_up', 'vol_down', 'vol_mute'].filter((k) => e[k]).map((k) => `${k.slice(4)}=${e[k]}`);
      if (vol.length) out.push(`(volume of ${e.name}: run scripts ${vol.join(', ')})`);
    }
    const ch = (Array.isArray(cfg.channels) ? cfg.channels : []).map((c) => `${c.name}=${c.n}`).join(', ');
    if (ch) out.push(`Saved TV channels: ${ch}`);
    return out.join('\n');
  }

  function systemPrompt(m, v, cfg) {
    const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    return `You are the smart home of the Cohen-Netzer family, talking on WhatsApp with ${m.name} (${m.role === 'child' ? 'a child' : 'a parent'}).
Now: ${now} (Israel).
Rules:
- Reply in the language the user wrote in (usually Hebrew). Be short and warm. Plain text, no markdown; one emoji at most.
- Act only on devices in the list below, using their exact ids. If a request matches nothing in the list, say you can't do it (the user may not have access).
- If the request is ambiguous (e.g. "the light" when a room has several), ask one short question instead of guessing.
- Air conditioners and fans are IR scripts (e.g. "AC cool 22", "Bedroom fan low"): run the script that matches the requested mode with action "run". They report no state.
- For "all lights" in a room, prefer that room's "lights all on/off" script if one exists; otherwise turn each light on/off.
- Lights driven by RF are one-way, so their state may be stale; don't argue about it.
- For questions about the home ("what's on?", "is the door locked?"), answer from the states below. Don't invent states.
- To turn on a TV box and set a channel, you may just call tv_channel: it turns the box on and waits for it to boot.
- If the user asks to turn on "the TV" and the room also has a separate TV-power script (e.g. "TV power"), run it too, because the box and the screen are separate.
- After acting, confirm briefly what you did. If a tool returns an error, explain it simply.
- Unlocking a door needs a confirmation; the tool will tell you. Then ask the user to reply "כן".

Devices this user may use (id | name | state):
${deviceList(v, cfg)}`;
  }

  // A box that is off, or was just turned on, drops the first key presses: wake it and give it time to boot.
  const BOOT_MS = 9000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function wakeTv(m, v, tvId, woke) {
    const tv = v.entities[tvId];
    if (!tv || !tv.remote) return;
    const off = ['off', 'standby', 'unavailable', 'unknown'].includes(tv.state);
    if (off && !woke.has(tvId)) {
      await runCalls(m, v, [{ e: tv.remote, s: 'turn_on' }]);
      woke.set(tvId, Date.now());
    }
    if (woke.has(tvId)) {
      const left = BOOT_MS - (Date.now() - woke.get(tvId));
      if (left > 0) await sleep(left);
    }
  }

  // ---- one incoming message ----
  async function handle(from, text, phoneId) {
    const snap = await db.collection('members').where('phone', '==', from).limit(1).get();
    if (snap.empty) { console.log('whatsapp: unknown sender', from.slice(0, 5) + '…'); return; } // stay silent
    const doc = snap.docs[0];
    const m = { email: doc.id, ...doc.data() };
    if (m.role === 'tablet') return;

    const chatRef = db.doc('wa_chats/' + from);
    const chatSnap = await chatRef.get();
    const chat = chatSnap.exists ? chatSnap.data() : {};
    const fresh = chat.at && Date.now() - chat.at < 10 * 60 * 1000;
    const history = fresh ? (chat.turns || []).slice(-6) : [];

    let v;
    try { v = await view(m); } catch { await send(phoneId, from, 'הבית לא עונה כרגע 😕 נסו שוב עוד מעט.'); return; }

    // a pending door unlock waits for "כן"
    if (chat.pending && Date.now() - chat.pending.at < 3 * 60 * 1000) {
      await chatRef.set({ pending: null }, { merge: true });
      if (YES.test(text)) {
        try { await runCalls(m, v, chat.pending.calls); await send(phoneId, from, '✅ פתחתי.'); }
        catch (e) { await send(phoneId, from, 'לא הצלחתי: ' + e.message); }
        return;
      }
    }

    const cfgSnap = await db.doc('config/app').get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};
    const ai = await gemini();
    const model = cfg.geminiModel || MODEL_DEFAULT;
    const contents = [
      ...history.map((t) => ({ role: t.r === 'u' ? 'user' : 'model', parts: [{ text: t.t }] })),
      { role: 'user', parts: [{ text }] },
    ];
    let reply = '';
    let pending = null;
    const woke = new Map();   // TVs turned on during this message
    for (let round = 0; round < 4; round++) {
      const res = await ai.models.generateContent({
        model, contents,
        config: { systemInstruction: systemPrompt(m, v, cfg), tools: TOOLS, temperature: 0.2 },
      });
      const calls = res.functionCalls || [];
      if (!calls.length) { reply = (res.text || '').trim(); break; }
      contents.push(res.candidates[0].content);   // keeps Gemini's thought signatures
      const parts = [];
      for (const fc of calls) {
        let response;
        try {
          const call = toCall(v, fc.name, fc.args || {});
          if (call.s === 'unlock') {
            if (!v.entities[call.e]) throw new HttpsError('permission-denied', 'אין הרשאה');
            pending = { calls: [call], at: Date.now() };
            response = { status: 'needs_confirmation', message: 'Not done yet. Ask the user to reply "כן" to unlock.' };
          } else {
            if (fc.name === 'tv_channel') await wakeTv(m, v, fc.args.tv_entity_id, woke);
            await runCalls(m, v, [call]);
            if (call.s === 'turn_on' && v.entities[call.e]?.remote) woke.set(call.e, Date.now());
            response = { status: 'done' };
          }
        } catch (e) {
          response = { status: 'error', message: e.message };
        }
        console.log('whatsapp tool', fc.name, JSON.stringify(fc.args), response.status, response.message || '');
        parts.push({ functionResponse: { name: fc.name, response } });
      }
      contents.push({ role: 'user', parts });
    }
    if (!reply) reply = '✅';
    await chatRef.set({
      at: Date.now(), pending,
      turns: [...history, { r: 'u', t: text }, { r: 'm', t: reply }].slice(-6),
    });
    await send(phoneId, from, reply);
  }

  return onRequest(
    { secrets: [HA_URL, HA_TOKEN, WA_TOKEN, WA_APP_SECRET, WA_VERIFY], invoker: 'public', timeoutSeconds: 60, memory: '512MiB' },
    async (req, res) => {
      // Meta's one-time handshake when the webhook is set up
      if (req.method === 'GET') {
        if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === WA_VERIFY.value().trim()) {
          res.status(200).send(String(req.query['hub.challenge'] || ''));
        } else res.sendStatus(403);
        return;
      }
      if (req.method !== 'POST') { res.sendStatus(405); return; }
      if (!validSignature(req)) { console.warn('whatsapp: bad signature'); res.sendStatus(401); return; }

      const value = req.body?.entry?.[0]?.changes?.[0]?.value || {};
      const msg = (value.messages || [])[0];
      if (!msg) { res.sendStatus(200); return; }         // delivery/read receipts
      const phoneId = value.metadata?.phone_number_id;
      const from = normPhone(msg.from);
      try {
        // Meta retries; handle each message once
        await db.doc('wa_msgs/' + msg.id).create({ at: Date.now() });
      } catch { res.sendStatus(200); return; }
      try {
        if (msg.type !== 'text') await send(phoneId, from, 'כרגע אני מבין רק הודעות טקסט ✍️');
        else await handle(from, String(msg.text?.body || '').slice(0, 1000), phoneId);
      } catch (e) {
        console.error('whatsapp handle failed', e);
        await send(phoneId, from, 'משהו השתבש 😕 נסו שוב.').catch(() => {});
      }
      res.sendStatus(200);
    },
  );
};

module.exports.normPhone = normPhone;
