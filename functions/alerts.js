// House alerts: Home Assistant calls homeEvent (rest_command in ha/packages/door_alert.yaml) when the main door
// has been open 10 minutes (again every 5) and when it closes after an alert.
// The call carries no secret: we read the sensor's real state from HA ourselves, so a forged call can at most
// repeat a true alert, and repeats are rate limited. Everyone gets a push (phones that turned it on) and a
// WhatsApp message (members with a phone). The shared tablet gets neither.
const crypto = require('crypto');
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const GRAPH = 'https://graph.facebook.com/v25.0';
const SITE = 'https://home-app-f94e4.web.app/';
const tokenId = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 40);

module.exports = ({ ha, db, getMember, getCfg, HA_URL, HA_TOKEN, WA_TOKEN }) => {
  // ---- push tokens (one doc per phone/browser; clients never read them) ----
  const pushToken = onCall(async (req) => {
    const m = await getMember(req);
    const d = req.data || {};
    const token = String(d.token || '');
    if (token.length < 20 || token.length > 4096) throw new HttpsError('invalid-argument', 'bad token');
    const ref = db.doc('push_tokens/' + tokenId(token));
    if (d.op === 'remove') { await ref.delete(); return { ok: true }; }
    await ref.set({ email: m.email, token, ua: String(d.ua || '').slice(0, 200), at: Date.now() });
    return { ok: true };
  });

  async function recipients() {
    const snap = await db.collection('members').get();
    return snap.docs.map((d) => ({ email: d.id, ...d.data() })).filter((m) => m.role !== 'tablet');
  }

  async function push(members, title, body, tag) {
    const ok = new Set(members.map((m) => m.email));
    const snap = await db.collection('push_tokens').get();
    const docs = snap.docs.filter((d) => ok.has(d.data().email));
    if (!docs.length) return 0;
    const r = await admin.messaging().sendEachForMulticast({
      tokens: docs.map((d) => d.data().token),
      notification: { title, body },
      webpush: {
        headers: { Urgency: 'high', TTL: '900' },
        notification: { icon: SITE + 'icon-192.png', badge: SITE + 'favicon-64.png', tag, renotify: true, dir: 'rtl', lang: 'he' },
        fcmOptions: { link: SITE },
      },
    });
    // phones that uninstalled / revoked: forget them
    await Promise.all(r.responses.map((x, i) => {
      const c = x.error && x.error.code;
      if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token' || c === 'messaging/invalid-argument') return docs[i].ref.delete();
      if (x.error) console.warn('push failed', c, x.error.message);
      return null;
    }));
    return r.successCount;
  }

  // Free text only reaches someone who wrote to the bot in the last 24 hours. With config/app.waAlertTemplate
  // (an approved Utility template with one body variable {{1}}; language config/app.waAlertLang, default "he")
  // it reaches everyone at any time.
  async function whatsapp(members, text) {
    const cfg = await getCfg();
    const wa = await db.doc('config/wa').get();
    const phoneId = cfg.waPhoneId || (wa.exists && wa.data().phoneId);
    if (!phoneId) { console.warn('alert: no WhatsApp phone id yet (send the bot any message once)'); return 0; }
    let sent = 0;
    for (const m of members.filter((x) => x.phone)) {
      const msg = cfg.waAlertTemplate
        ? { type: 'template', template: { name: cfg.waAlertTemplate, language: { code: cfg.waAlertLang || 'he' }, components: [{ type: 'body', parameters: [{ type: 'text', text }] }] } }
        : { type: 'text', text: { body: text } };
      const r = await fetch(`${GRAPH}/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + WA_TOKEN.value().trim(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: m.phone, ...msg }),
      }).catch((e) => ({ ok: false, status: 0, text: async () => e.message }));
      if (r.ok) sent++;
      else console.warn('alert whatsapp failed', m.phone.slice(-4), r.status, (await r.text()).slice(0, 300));
    }
    return sent;
  }

  async function notifyAll(title, body, tag, waText) {
    const members = await recipients();
    const [p, w] = await Promise.all([
      push(members, title, body, tag).catch((e) => { console.error('push', e.message); return 0; }),
      whatsapp(members, waText || `${title}. ${body}`).catch((e) => { console.error('whatsapp', e.message); return 0; }),
    ]);
    console.log('alert sent', tag, JSON.stringify({ push: p, whatsapp: w }));
    return { push: p, whatsapp: w };
  }

  const homeEvent = onRequest({ secrets: [HA_URL, HA_TOKEN, WA_TOKEN], invoker: 'public', timeoutSeconds: 60 }, async (req, res) => {
    if (req.method !== 'POST') { res.sendStatus(405); return; }
    const b = req.body || {};
    const entity = String(b.entity || ''), event = String(b.event || '');
    if (!/^binary_sensor\.[a-z0-9_]{1,80}$/.test(entity) || !['open', 'closed'].includes(event)) { res.sendStatus(400); return; }
    let s;
    try { s = await ha('/api/states/' + entity); } catch (e) { res.status(502).send('ha'); return; }
    if (!s || !s.state) { res.sendStatus(404); return; }
    const changed = Date.parse(s.last_changed);
    const ref = db.doc('door_alerts/' + entity);
    const name = 'הדלת הראשית';
    // claim the alert in a transaction so two calls never both send
    const plan = await db.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      const d = cur.exists ? cur.data() : {};
      const now = Date.now();
      if (event === 'open') {
        if (s.state !== 'on' || now - changed < 9 * 60 * 1000) return null;
        if (d.openedAt === changed && now - (d.lastOpenSent || 0) < 4 * 60 * 1000) return null;
        tx.set(ref, { openedAt: changed, lastOpenSent: now, alerts: d.openedAt === changed ? (d.alerts || 0) + 1 : 1 }, { merge: true });
        const min = Math.round((now - changed) / 60000);
        return { title: `🚪 ${name} פתוחה`, body: `פתוחה כבר ${min} דקות`, wa: `🚪 ${name} פתוחה כבר ${min} דקות`, tag: 'door-' + entity };
      }
      if (s.state === 'on' || !d.openedAt || d.closedFor === d.openedAt) return null;
      tx.set(ref, { closedFor: d.openedAt, closedAt: changed }, { merge: true });
      const min = Math.max(1, Math.round((changed - d.openedAt) / 60000));
      return { title: `✅ ${name} נסגרה`, body: `הייתה פתוחה ${min} דקות`, wa: `✅ ${name} נסגרה (הייתה פתוחה ${min} דקות)`, tag: 'door-' + entity };
    });
    if (!plan) { res.json({ ok: true, skipped: true }); return; }
    const r = await notifyAll(plan.title, plan.body, plan.tag, plan.wa);
    res.json({ ok: true, ...r });
  });

  return { pushToken, homeEvent };
};
