# ביקורת P2 ומוכנות לפרודקשיין

תאריך בדיקה: 25 באוגוסט 2026

## החלטת שחרור

**No-Go להשקה מלאה כ"מוצר P2 תחרותי".** אפשר לשקול בטא סגורה לאחר תיקון שערי השחרור, אך אין להציג כרגע יכולות צוות, inbox, CSV import, דוחות מתוזמנים או push כיכולות קיימות.

## מצב מול הדרישות

| דרישה | מצב | ממצא |
|---|---|---|
| טקסט, מדיה ושעת פרסום לכל פלטפורמה | חלקי | קיימות בחירת פלטפורמות, captions ייעודיים ל-Instagram ותזמונים נפרדים. התוכן הראשי והמדיה אינם מודל overrides מלא לכל פלטפורמה. המלצות השעה הן קבועות וממוקדות Facebook, לא מבוססות נתוני החשבון. |
| צוות, תפקידים, הזמנות, approvals והערות | מחוץ להיקף | הוסר מתוכנית העבודה לפי החלטת המוצר. |
| CSV/PDF ודוחות מתוזמנים במייל | חלקי | PDF הוא חלון הדפסה בצד לקוח. אין export CSV, אין הפקת PDF שרתית, ואין ReportSchedule/worker/email delivery. |
| import מרובה באמצעות CSV | חסר | אין endpoint, parser, preview, validation report או UI ליבוא. |
| onboarding עם checklist ותקינות חיבורים | חלקי | יש חיווי מחובר/לא מחובר ל-Facebook, Instagram ו-WhatsApp. אין checklist מתמשך, אחוז השלמה, בדיקת הרשאות/תוקף מפורטת או מסלול recovery אחיד. |
| inbox לתגובות והודעות Instagram/Facebook | חסר | נאספים counts/metrics בלבד. אין models לשיחות/הודעות/תגובות, webhooks, sync cursor או UI inbox. |
| AI rewrite/shorten/tone/repurpose | חלקי | קיים generator עם tone ו-reference post. אין API פעולות מובנות לשכתוב, קיצור ו-repurpose מתוך עורך פוסט קיים. |
| PWA אמיתית ו-push | חסר | קיים manifest בסיסי, אך `main.jsx` מבטל service workers ומוחק caches. אין service worker פעיל, PushSubscription, VAPID או delivery worker. |
| תמיכה, status ותיעוד troubleshooting | חלקי | קיימים Guides/Resources/Contact, health endpoints ודשבורד operations למנהל. אין מרכז תמיכה מאוחד, status page ציבורי, incident history או troubleshooting לפי קודי שגיאה. |

## שערי שחרור שחייבים להיסגר

1. **בדיקות CI ירוקות:** לקוח 217/217 עובר לאחר תיקון setup; שרת עדיין נכשל ב-5 בדיקות subscription/billing מתוך 377. יש ליישר את חוזה הבדיקות עם billing provider ולהוסיף contract tests ל-webhook ול-idempotency.
2. **בדיקת billing אמיתית בסביבת staging:** subscribe, webhook success/failure, cancel, retry ו-double delivery. כרגע הכשל בסוויטה מונע הוכחת regression.
3. **בדיקת encoding מלאה בעברית:** נמצאו מחרוזות mojibake בקוד, לרבות תבנית ה-PDF ודפי UI. יש לתקן ולבדוק RTL בדפדפן וב-PDF לפני חשיפה ללקוחות.
4. **Smoke tests אמיתיים לכל פלטפורמה:** חיבור, token/session expiry, פרסום מיידי, מתוזמן, retry, duplicate prevention ומדיה לא נתמכת.
5. **הגדרת הבטחת המוצר:** להסיר מהשיווק כל יכולת P2 שעדיין חסרה; אחרת זו בעיית אמון ותמיכה, לא רק פער פיצ'ר.
6. **Runbook פרודקשיין:** migration/rollback, worker health, queue backlog, alerts, backup restore, token refresh וניתוק ספק.

## סדר פיתוח מומלץ

### P0 — לפני כל השקה

- CI ירוק ובדיקות billing/staging.
- תיקון encoding ו-PDF.
- smoke/E2E למסלולי auth, חיבור, יצירה, תזמון, פרסום וחיוב.
- ניטור API + worker + תור, alerts ו-runbook rollback.

### P1 — בטא תחרותית

- onboarding checklist ו-connection diagnostics.
- platform overrides אמיתיים: text/media/time לכל יעד.
- AI actions מתוך העורך: rewrite, shorten, tone, repurpose.
- CSV import עם preview, validation ושגיאות לפי שורה.
- CSV export והפקת PDF יציבה בצד שרת.

### P2 — הרחבת המוצר

- scheduled reports במייל עם timezone, recipients ו-unsubscribe.
- unified inbox דרך Meta webhooks, הרשאות, pagination ו-SLA sync.
- PWA offline shell + install UX + Web Push.
- public status page ומרכז troubleshooting מבוסס error codes.

## Definition of Done לכל יכולת חדשה

- הרשאות ובידוד tenant נבדקו.
- API validation, rate limiting, audit log ו-idempotency הוגדרו לפי הצורך.
- loading/empty/error/retry states קיימים במובייל ובדסקטופ.
- unit + integration + E2E למסלול העיקרי ולכשל ספק.
- metrics, logs ו-alerts קיימים לפני הפעלה בפרודקשיין.
- תיעוד תמיכה ו-rollout מדורג עם feature flag.
