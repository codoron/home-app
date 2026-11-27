# Working on home-app (הבית שלנו)

Family smart-home web app over Doron's Home Assistant. Separate from family-app (do not merge them).

## Working agreement
- Reply in Hebrew; UI text Hebrew, RTL. Plan first for new features and wait for approval; requested bug fixes can go straight ahead.
- Never ask for or echo the HA token or service-account keys.

## Deploy
- Push to `main` → `.github/workflows/deploy.yml` deploys hosting + Firestore rules + functions with GitHub secret `FIREBASE_SERVICE_ACCOUNT_HOME_APP_F94E4` (SA `github-deploy@home-app-f94e4.iam.gserviceaccount.com`).
- Check: `gh run list -R codoron/home-app --limit 1`. Errors are written as annotations:
  `J=$(gh api repos/codoron/home-app/actions/runs/<RID>/jobs --jq '.jobs[0].id'); gh api repos/codoron/home-app/check-runs/$J/annotations --jq '.[].message'`
- The session can't reach HA, Google APIs or the live site; Console/Cloud Shell work is Doron's (give copy-paste blocks for https://shell.cloud.google.com/?project=home-app-f94e4).

## Architecture
- `public/` static, Firebase JS SDK 10.12.2 from gstatic. Bump `?v=` in index.html when app.js/style.css change.
- `functions/index.js` (Node 22, europe-west1): `haStates` (areas via `/api/template`, states via `/api/states`, filtered per member) and `haCall` (whitelisted domain/services, permission-checked). Secrets `HA_URL`, `HA_TOKEN`.
- Firestore: `members/{email}` {name, role parent|child|tablet, room (HA area id), favorites[], layout{}, phone?, admin, extraAreas?}; `config/app` {sharedAreas[], channels[{n,name}], geminiModel?}.
- Permissions: parents and the shared living-room `tablet` account all (tablet: clock/status header, wake lock, auto-return to house after 60s idle, no family tab, slower polling when idle); children own room + sharedAreas (+extraAreas); `lock` is parent-only. System admin co.doron@gmail.com (functions `SYS`, rules `sys()`, `public/config.js`).
- TV remote: a `media_player` gets `remote` (Android TV Remote entity with the same object id/name; fallback: an unclaimed remote with activity attrs goes to the best non-speaker player in its room, e.g. the Cast player) and `vol_up/vol_down/vol_mute/vol_power` (Broadlink TV IR scripts; vol_power = the screen's own power toggle, shown as "מסך" in the remote sheet, matched by object id; only for TVs in a room that has an IR blaster, i.e. a remote not linked to any TV, falling back to the living room. The parents' Yes box has no volume). Tapping it opens the remote sheet. `remote.send_command` only accepts keys in `REMOTE_KEYS`. The Yes box ignores CHANNEL_UP and DPAD_UP opens its menu: channels change by sending digits (delay 0.3s). Shared channel list in `config/app.channels` (parents edit).
- Room grouping (frontend `groupRoom`): lamps (+ "all on/off" light scripts) → one "תאורה" card; ≥2 AC IR scripts → one "מזגן" card showing the last command (`config/runs`, written by haCall for AC scripts, returned as `runs`); TV volume scripts hidden (they live in the remote), other media players/TV scripts shown inside the TV remote ("עוד בחדר"); unavailable devices folded under "לא זמינים". Group ids `group:<room>:<kind>` can be favorites. Sheets (`.sheet`: #remote, #gsheet) close via history; `S.skipPop` stops the × close from also leaving the room.
- Volume scripts are matched per room (scripts in the TV's own area; unassigned ones only for the IR-blaster room). ≥2 fan scripts → "מאוורר" card (same sheet as AC, `FAN_MODE`), fan runs tracked in `config/runs` too. A fan *light* counts as a lamp.
- `ha/packages/` keeps copies of the HA package files made here (living_tv.yaml: living_tv_power/mute via remote.rm4plus; bedroom_broadlink.yaml: Broadlink `remote.bedroom_rm`, IR codes from BroadLink app scenes via Proxyman; hex → `b64:`; `e9`-prefixed RF codes get first byte `b2`).
- Personal arrangement: "סידור" toggles `S.edit`; SortableJS 1.15.2 (bundled in public/vendor, drag only by the .drag-h grip added in edit mode so the page still scrolls, `forceFallback` + `direction: 'vertical'` because its horizontal mode misreads RTL). Saved per member in `members/{email}.layout` {rooms, 'r:<room>', 'g:<groupId>'}; favorites order = the favorites array. New items go last; polling doesn't redraw while arranging.
- Hebrew area names: `AREA_NAMES` in `public/config.js`, keyed by HA area name.

## Performance
- Client: last `haStates` result cached in localStorage (`house:1:<email>`, ≤7 days, cleared on sign-out / not-member); on open the house is drawn from it at once (`S.stale` → status "מתעדכן…") and refreshed in the background. index.html modulepreloads app.js/config.js/Firebase modules (keep its `?v=` in step with the script tag), loads the font non-blocking, Sortable deferred.
- Server: `fetchHouse()` (areas + states + config) starts in parallel with `getMember`; `view(m, pre)` takes it. Areas cached 5 min, config 60 s per instance.
- Voice: `voice({ping:1})` warms the function + HA data when the mic opens or the text line is focused (≤ every 4 min). Chat doc and house data load in parallel with the transcript. Gemini via `gen(req, level)`: thinkingLevel MINIMAL for transcripts, LOW for conversation; falls back to the model default if rejected. Logs `voice timing {stt, converse, total}`; `haStates slow` when > 2.5 s.

## Testing locally
`node --check` the JS; render with Playwright, routing gstatic firebase imports to small mock modules.

## WhatsApp bot
- `functions/whatsapp.js` → function `whatsapp` (onRequest, public): GET = Meta verify handshake (`WA_VERIFY`), POST = message, checked with `x-hub-signature-256` (`WA_APP_SECRET`). Replies via Graph v25.0 with `WA_TOKEN`.
- Sender → member by `members/{email}.phone` (normalized `9725…`, set in the family tab); unknown numbers get no reply; tablet ignored.
- Gemini via `@google/genai` on Vertex AI (location `global`, model `gemini-3.8-flash`, override `config/app.geminiModel`; Gemini 2.5 was retired on Vertex on 2026-10-20). Tools: `control`, `tv_channel`; every call goes through `runCalls` (same checks as haCall). Prompt lists only that member's devices.
- Voice notes (`type: audio`): media fetched via Graph `/{media_id}` → url (both with WA_TOKEN), ≤1.5MB, transcribed by the same Gemini model (EMPTY → ask to repeat), then handled like text; replies start with `🎤 "<transcript>"`. Only known members' audio is downloaded.
- Unlock needs "כן" within 3 min (`wa_chats/{phone}.pending`). Short history (6 turns, 10 min) in `wa_chats`. Dedup by message id in `wa_msgs`.
- Meta app "OurHome" (published; privacy page public/privacy.html), test number +1 555 177-2553, WABA id 2095741247730179 subscribed via POST /{waba}/subscribed_apps (without it Meta delivers nothing). Test numbers can't start a chat: Meta sends a template first, then users reply. ≤5 verified recipients. Runtime SA needs `roles/aiplatform.user`.

## Voice in the app
- Mic button (`#micBtn`, bottom corner; larger on the tablet) → MediaRecorder (webm/opus on Chrome/Android, mp4 on iOS), auto-stops after 1.6s of silence or 15s, mic released right away. Base64 audio → callable `voice` (in `functions/whatsapp.js`, same Gemini brain and tools as WhatsApp via shared `converse()`/`speechToText()`; history in `app_chats/{email}`, prompt channel `app` = no emoji, short).
- Returns `{heard, reply, pending, acted}`; the card (`#voice`) shows transcript + reply, reads the reply aloud with the browser's he-IL speechSynthesis, and shows a "כן, לפתוח" button for a pending unlock (sends `{text:'כן'}`). Refreshes states when something ran.
- The card also has a text line (`#voiceForm`, persistent outside `#voiceMain` so polling redraws don't wipe typing; `V.sig` skips unchanged redraws): focusing it cancels the recording, submit sends `{text}` to the same `voice` callable. `V.open` controls visibility; `--kb` (visualViewport) lifts the card above the keyboard. Where MediaRecorder is missing the button opens the card for typing only.
- Mic needs HTTPS + mic permission.
- Spoken reminders (app voice only, not WhatsApp): Gemini tool `remind` {text, minutes | at "HH:MM" Israel, speaker?} → `reminders/{id}` {email, name, text, speaker, at, status pending|sending|done|failed}. 1 min–7 days ahead, ≤20 pending per member. Speaker = a media_player that `isSpeaker` (device_class speaker or name like speaker/nest/google home, not a TV) the member may use; default: speaker in the member's room, else living room; if the member can't see any speaker, the house speaker is used anyway (it only speaks). Today the only one is the living-room Google Home; the LG soundbar (also a Cast speaker) is ranked last (`rank`), and `config/app.reminderSpeaker` (media_player id) pins the speaker.
- Reminders screen ("שלי" tab, also on the tablet): live `onSnapshot` on `reminders` (rules: own by email, parents read all pending; writes only via functions) → list sorted by time, kids' ones under "תזכורות של הילדים" for parents, count badge on the tab. Add/edit sheet `#rsheet` (text, day chips today…+6, time; local device time → ms) and two-tap cancel ("לבטל?"). Callable `reminderOps` {op add|update|cancel} (owner or parent; cancel = delete). Voice tools `list_reminders` / `change_reminder` (cancel, minutes, at, postpone_minutes, text). Up to 7 days ahead; docs keep `speakerName`.
- `reminders` scheduled function (every minute, index.js) speaks due ones with HA `tts.speak` (entity: `config/app.ttsEntity`, else a `tts.*cloud*` (Nabu Casa, he-IL), else google_translate (`iw`)); `config/app.ttsLanguage` overrides. Up to 3 tries.

## House alerts (main door left open)
- HA ids (checked with Doron): door `binary_sensor.main_door_sonoff_a4b00294d5` ("Main door"; the fridge is `binary_sensor.refrigerator_sonoff_a4b00294db`), Google Home `media_player.google_home`, LG soundbar = `media_player.living_room_speaker` (not for speech), TTS `tts.home_assistant_cloud`.
- HA package `ha/packages/door_alert.yaml`: the door sensor on for 10 min → loop every 5 min while open: `rest_command.home_event` {event:open}. Close after an alert (`input_boolean.main_door_alerted`) → event `closed`. `mode: restart` stops the loop on close.
- Speaking is done by `homeEvent` (`speak()` in alerts.js), not HA: skipped 22:00–07:00 Israel; speaker = `config/app.alertSpeaker`, else `media_player.google_home`, else `reminderSpeaker`, else the speaker of the last spoken reminder, else the best Google speaker; TTS entity as for reminders.
- `functions/alerts.js` → `homeEvent` (onRequest, public, no secret): re-reads the sensor from HA (`/api/states/<id>`), sends only if really open ≥9 min / really closed after an alert; `door_alerts/{entity}` {openedAt, lastOpenSent, closedFor} in a transaction = dedupe (open ≤ every 4 min). Recipients: all members except `tablet`.
- Push: FCM web push. `public/firebase-messaging-sw.js` (compat SDK, config duplicated), default Firebase VAPID key. App: `pushCard` in "שלי" (dismissible, `push:dismiss`) and family tab; `enablePush` on tap → callable `pushToken` {token, op?remove} → `push_tokens/{sha256(token)[:40]}` {email, token, ua}. Token refreshed silently on start, removed on sign-out; dead tokens deleted on send. iOS needs the app added to the home screen.
- WhatsApp alerts send from `config/wa.phoneId` (saved by the webhook on any incoming message) or `config/app.waPhoneId`. Free text only reaches people who wrote to the bot within 24h; set `config/app.waAlertTemplate` (approved Utility template, one body var {{1}}, `waAlertLang` default `he`) to reach everyone any time.
