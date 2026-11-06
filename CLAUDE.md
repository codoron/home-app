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
- Firestore: `members/{email}` {name, role parent|child, room (HA area id), favorites[], admin, extraAreas?}; `config/app` {sharedAreas[]}.
- Permissions: parents all; children own room + sharedAreas (+extraAreas); `lock` is parent-only. System admin co.doron@gmail.com (functions `SYS`, rules `sys()`, `public/config.js`).
- Hebrew area names: `AREA_NAMES` in `public/config.js`, keyed by HA area name.

## Testing locally
`node --check` the JS; render with Playwright, routing gstatic firebase imports to small mock modules.

## Next
WhatsApp bot (Meta Cloud API webhook → Gemini → haCall with the sender's permissions).
