# הבית שלנו

אפליקציית ווב משפחתית לבית החכם, מעל Home Assistant.

- **כתובת:** https://home-app-f94e4.web.app
- **Firebase:** פרויקט `home-app-f94e4` (Blaze), אזור הפונקציות europe-west1.
- **HA:** מגיעים אליו דרך Nabu Casa. הכתובת וה־token שמורים ב־Secret Manager בשמות `HA_URL` ו־`HA_TOKEN`. ה־token שייך למשתמש `home-app` ב־HA, שאינו מנהל.

## איך זה עובד
- הדפדפן לא מדבר עם HA ישירות. הוא קורא ל־Cloud Functions, `haStates` ו־`haCall`, והן בודקות מי המשתמש ומה מותר לו, ורק אז פונות ל־HA.
- חדרים ומכשירים נקראים מ־HA (Areas), כך שכל שיוך של מכשיר לחדר ב־HA מופיע באפליקציה לבד.
- **הורים** רואים ושולטים בהכול. **ילדים** רואים את החדר שלהם ואת החדרים המשותפים, שנבחרים במסך "משפחה". את המנעול פותחים רק הורים.
- כל משתמש בוחר חדר ומועדפים, וזה נשמר ב־`members/{email}`.

## עדכונים
כל push לענף `main` מעלה לאוויר אוטומטית (`.github/workflows/deploy.yml`): האתר, כללי האבטחה והפונקציות.
מעקב: https://github.com/codoron/home-app/actions

## החלפת token של HA
```bash
read -s HA_TOKEN   # מדביקים ולוחצים Enter
printf '%s' "$HA_TOKEN" | gcloud secrets versions add HA_TOKEN --data-file=- --project=home-app-f94e4; unset HA_TOKEN
```
אחר כך צריך לפרוס מחדש את הפונקציות, כלומר לבצע שינוי כלשהו בתיקייה `functions/`.

## קבצים
| קובץ | מה יש בו |
|---|---|
| `public/index.html`, `style.css`, `app.js` | האפליקציה (בלי build) |
| `public/config.js` | הגדרות Firebase, מייל המנהל, שמות החדרים בעברית |
| `functions/index.js` | הגשר ל־HA, כולל ההרשאות |
| `firestore.rules` | כללי האבטחה |
