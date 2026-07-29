import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Send, ChevronLeft, Image } from 'lucide-react'
import { useAppData } from '../context/DataProvider'
import { groupsService } from '../services/groupsService'
import '../styles/chatbot.css'

const AGENT_NAME = 'פוסבוט'
const SUPPORT_EMAIL = 'support@possbo-app.co.il'

function getTimeStr() {
  return new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

// Knowledge base - organized by topic with nested categories
const TOPICS = [
  {
    id: 'welcome',
    label: 'בחרו נושא לעזרה:',
    options: [
      { id: 'create-post-flow', label: '📝 צור קמפיין חדש', desc: 'יצירה מהירה ומודרכת בצ׳אט' },
      { id: 'getting-started', label: '🚀 התחלה מהירה', desc: 'לומדים את הבסיס במהירות' },
      { id: 'features', label: '✨ תכונות המערכת', desc: 'גלו את כל האפשרויות' },
      { id: 'ai-generate', label: '🤖 יצירת פוסט בעזרת AI', desc: 'יצירה, עריכה ושימוש בטמפלייט' },
      { id: 'troubleshoot', label: '🔧 פתרון בעיות', desc: 'עזרה בבעיות נפוצות' },
      { id: 'contact', label: '💬 צור קשר', desc: 'דברו עם התמיכה שלנו' },
    ]
  },
  {
    id: 'getting-started',
    label: 'התחלה מהירה',
    answer: `בחר נושא:`,
    options: [
      { id: 'publish', label: '🚀 איך לפרסם פוסט' },
      { id: 'groups', label: '👥 קבוצות פייסבוק' },
      { id: 'ai-generate', label: '🤖 יצירת פוסט בעזרת AI' },
      { id: 'pages', label: '📄 הסבר על דפי האתר' },
      { id: 'welcome', label: '🔙 חזרה' },
    ]
  },
  {
    id: 'features',
    label: 'תכונות המערכת',
    answer: `בחר תכונה:`,
    options: [
      { id: 'campaigns', label: '📋 קמפיינים' },
      { id: 'instagram', label: '📸 אינסטגרם' },
      { id: 'whatsapp', label: '💬 WhatsApp' },
      { id: 'templates', label: '📝 טמפלייטים' },
      { id: 'schedule', label: '⏰ תזמון פרסומים' },
      { id: 'profile', label: '👤 פרסום בפרופיל' },
      { id: 'statistics', label: '📈 סטטיסטיקות ומדדים' },
      { id: 'publication-status', label: '✅ התקדמות פרסום' },
      { id: 'reports', label: '📊 דוחות וסיכומים' },
      { id: 'settings', label: '⚙️ הגדרות' },
      { id: 'ai-generate', label: '🤖 יצירת פוסט בעזרת AI' },
      { id: 'welcome', label: '🔙 חזרה' },
    ]
  },
  {
    id: 'pages',
    label: 'דפי האתר',
    answer: `הנה סקירה של דפי האתר הראשיים:

🏠 **דשבורד** מרכז הפיקוד שלך. סיכום קמפיינים, סטטיסטיקות, לוח שנה, וקבוצות.

👥 **קבוצות פייסבוק** ניהול כל הקבוצות שלך בפייסבוק.

📋 **קמפיינים** כל הפרסומים שיצרת או תזמנת ב-Facebook, Instagram ו-WhatsApp.

📅 **יומן** לוח שנה עם כל הפרסומים המתוזמנים.

📊 **סטטיסטיקות** נתוני חשיפה ומעורבות.

📝 **טמפלייטים** תבניות מוכנות לפרסום מהיר.

🤖 **יצירת פוסט בעזרת AI** מחולל תוכן שניתן להעביר לקמפיין או לטמפלייט.

📈 **דוחות וסיכום** היסטוריית פרסום, הצלחות, כשלים, תזמונים וייצוא PDF.

💬 **פידבק** שליחת משוב על המערכת.`,
    options: [
      { id: 'getting-started', label: '🔙 חזרה' },
      { id: 'publish', label: '🚀 איך לפרסם' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'publish',
    label: 'איך לפרסם פוסט',
    answer: `ככה מפרסמים פוסט:

1️⃣ **תוכן** כתוב טקסט, הוסף תמונה, כותרת, ומיקום.

2️⃣ **הפצה** בחר לאן לפרסם:
• **פייסבוק** — קבוצות ו/או פרופיל אישי
• **אינסטגרם** — פיד, סטורי, או ריל
• **WhatsApp** — קבוצות ו/או רשימות תפוצה

3️⃣ **תזמון** פרסם עכשיו, תזמן, או הגדר פרסום חוזר. אפשר לתזמן בנפרד קבוצות, פרופיל, WhatsApp וכל סוג פרסום באינסטגרם.

4️⃣ **סיכום** בדוק ולחץ "פרסם".

המערכת מציגה התקדמות לפי מספר היעדים, ומסמנת שהקמפיין הסתיים רק לאחר שכל היעדים הסתיימו.

💡 **טיפ:** אפשר להתחיל מטמפלייט או ליצור את הטקסט בעזרת AI.`,
    options: [
      { id: 'instagram', label: '📸 פרסום באינסטגרם' },
      { id: 'schedule', label: '⏰ עוד על תזמון' },
      { id: 'templates', label: '📝 טמפלייטים' },
      { id: 'getting-started', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'campaigns',
    label: 'קמפיינים',
    answer: `**קמפיין** = פוסט שפרסמת או תזמנת.

כולל: תוכן, מדיה, יעדי הפצה (Facebook, Instagram ו-WhatsApp), תזמונים וסטטוס לכל יעד.

**היתרונות:**
✅ ניהול מרוכז של כל הפרסומים
✅ הפצה ל-Facebook ול-Instagram בקמפיין אחד
✅ שילוב WhatsApp עם קבוצות ורשימות תפוצה
✅ מעקב הצלחה/כישלון והתקדמות בכל יעד
✅ תזמון חוזר ותזמון עצמאי לפלטפורמות ולסוגי Instagram
✅ היסטוריה מלאה

ב**טאב קמפיינים** בדשבורד אפשר לסנן, לפתוח פרטים, לראות היסטוריית פרסום וקישורים לתוצאות.`,
    options: [
      { id: 'publish', label: '🚀 איך ליצור קמפיין' },
      { id: 'instagram', label: '📸 פרסום באינסטגרם' },
      { id: 'features', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'instagram',
    label: 'אינסטגרם',
    answer: `**פרסום באינסטגרם:**

📸 **חיבור חשבון** הגדרות > אינסטגרם > "חבר חשבון". החיבור מתבצע דרך OAuth מאובטח (אישור מ-Meta).

**3 סוגי פרסום:**
📷 **פיד** — פוסט רגיל בפיד האינסטגרם שלך.
📱 **סטורי** — סטורי שנעלם אחרי 24 שעות.
🎬 **ריל** — סרטון קצר (וידאו בלבד).

**איך מפרסמים:**
1. ביצירת קמפיין > שלב הפצה > טאב "אינסטגרם"
2. סמן את סוגי הפרסום הרצויים (פיד/סטורי/ריל)
3. העלה מדיה מתאימה לכל סוג
4. אפשר להגדיר תזמון נפרד לפוסט, סטורי וריל

**חשוב לדעת:**
• פוסט בפיד דורש תמונה או וידאו.
• ריל דורש וידאו. אם מוסיפים וידאו עבור ריל, אפשר לבחור אם הוא מיועד רק לריל או לכל הקמפיין.
• בסטורי עם כמה קבצים אפשר לבחור ראשון, את כולם כסטוריז נפרדים, או קובץ מסוים.
• מלל ומיקום נתמכים בפוסט ובריל בהתאם לתמיכת Instagram; סטורי הוא בעיקר מדיה.
• קישור לסטורי זמין כל עוד הסטורי פעיל, עד כ-24 שעות.

⚠️ נדרש חשבון אינסטגרם עסקי (Business/Creator).`,
    options: [
      { id: 'publish', label: '🚀 איך ליצור קמפיין' },
      { id: 'schedule', label: '⏰ תזמון לפי פלטפורמה' },
      { id: 'settings', label: '⚙️ חיבור חשבון' },
      { id: 'troubleshoot', label: '🔧 בעיות באינסטגרם' },
      { id: 'features', label: '🔙 חזרה' },
    ]
  },
  {
    id: 'groups',
    label: 'קבוצות פייסבוק',
    answer: `**קבוצות פייסבוק:**

🔄 **סנכרון** "סנכרן מפייסבוק" למשיכת כל הקבוצות.

🔍 **חיפוש וסינון** מצא קבוצה לפי שם ובחר יעדים בקמפיין.

📊 **מידע** מוצגים פרטי הקבוצה וכמות החברים כאשר הנתון זמין.

אם הסנכרון נכשל, בדוק שחיבור Facebook פעיל ונסה להתחבר מחדש.`,
    options: [
      { id: 'troubleshoot', label: '🔧 בעיות בסנכרון' },
      { id: 'getting-started', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    answer: `**עבודה עם WhatsApp:**

🔗 **חיבור** בהגדרות מחברים את חשבון WhatsApp ומסנכרנים יעדים.

👥 **יעדי תפוצה** אפשר לבחור קבוצות WhatsApp ורשימות תפוצה. הבחירה נעשית בטאב WhatsApp בשלב ההפצה.

⏰ **תזמון** אפשר לפרסם מיד, במועד חד-פעמי או באופן חוזר, בנפרד משאר הפלטפורמות.

📝 **הודעת קישור** בהגדרות אפשר לשמור מספר WhatsApp והודעת ברירת מחדל שתשמש בקישורים המצורפים לתוכן.

🤖 **בוט WhatsApp** קמפיינים שנשלחים ליעדי WhatsApp מתבצעים דרך חיבור הבוט/החשבון הפעיל.

אם קבוצות או רשימות אינן מופיעות, ודא שהחיבור פעיל ובצע סנכרון מחדש.`,
    options: [
      { id: 'publish', label: '🚀 יצירת קמפיין' },
      { id: 'schedule', label: '⏰ תזמון WhatsApp' },
      { id: 'settings', label: '⚙️ חיבורים והגדרות' },
      { id: 'troubleshoot', label: '🔧 פתרון בעיות' },
      { id: 'features', label: '🔙 חזרה' },
    ]
  },
  {
    id: 'statistics',
    label: 'סטטיסטיקות ומדדים',
    answer: `**עמוד סטטיסטיקות** מרכז את נתוני החשיפה והמעורבות לפי התקופה שנבחרה.

📈 **חשיפה לאורך זמן** גרף פעילות וחשיפה משוערת.

📸 **Instagram** בטאב Instagram מוצגים פרסומים, צפיות, לייקים, תגובות, שיתופים וחשיפה, כולל חלוקה לפוסטים, רילס וסטוריז.

🔵 **Facebook** בטאב Facebook מוצגים המדדים הזמינים והאמינים: פרסומים, לייקים, תגובות וחשיפה משוערת. צפיות ושיתופים אינם מוצגים כשאין נתון אמין מהמקור.

🏅 **פוסטים מובילים** אפשר למיין לפי לייקים או תגובות. בפוסט Instagram מוצגים גם צפיות ושיתופים כמידע נוסף, ללא מיון לפיהם.

🔄 ניתן לרענן מדדים כדי למשוך נתונים עדכניים מהפלטפורמות.`,
    options: [
      { id: 'reports', label: '📊 דוחות וסיכום' },
      { id: 'instagram', label: '📸 מדדי Instagram' },
      { id: 'features', label: '🔙 חזרה' },
    ]
  },
  {
    id: 'publication-status',
    label: 'התקדמות פרסום',
    answer: `**איך נקבע סטטוס הקמפיין?**

כל קבוצה, פרופיל, סוג Instagram ויעד WhatsApp הם משימת פרסום נפרדת.

⏳ בזמן העבודה מוצגת התקדמות כמו **1 מתוך 3 יעדים הושלמו**.

✅ הקמפיין מסומן כהושלם רק לאחר שכל יעדי הפרסום הסתיימו.

⚠️ אם יעד מסוים נכשל, אפשר לראות זאת בפרטי הקמפיין ובהיסטוריית הפרסום. הודעת שגיאה טכנית מלאה אינה אמורה להיחשף למשתמש; מוצגת הודעה ברורה עם הצעד הבא.

🔗 לאחר הצלחה אפשר לפתוח את הקישור לפוסט. קישור לסטורי זמין רק בזמן שהסטורי פעיל, עד כ-24 שעות.`,
    options: [
      { id: 'campaigns', label: '📋 ניהול קמפיינים' },
      { id: 'troubleshoot', label: '🔧 פרסום שנכשל' },
      { id: 'statistics', label: '📈 מדדי פרסום' },
      { id: 'features', label: '🔙 חזרה' },
    ]
  },
  {
    id: 'templates',
    label: 'טמפלייטים',
    answer: `**טמפלייטים** = תבניות מוכנות לפרסום מהיר.

**ליצור:** טמפלייטים > טמפלייט חדש > הוסף תוכן, מדיה ויעדי תפוצה > שמור.

**אפשרויות בטמפלייט:**
• יצירת תוכן בעזרת AI והוספת אימוג׳ים
• בחירת יעדים בטאבים Facebook, Instagram ו-WhatsApp
• שמירת הודעת WhatsApp לפי ברירת המחדל שבהגדרות המשתמש
• בחירת פוסט, סטורי וריל ב-Instagram

**להשתמש:** בעמוד הטמפלייטים לחץ "צור קמפיין", או בחר טמפלייט מתוך יצירת קמפיין.

⏰ התזמון אינו נשמר בטמפלייט. בוחרים אותו בעת יצירת הקמפיין בפועל.`,
    options: [
      { id: 'publish', label: '🚀 איך לפרסם' },
      { id: 'features', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'reports',
    label: 'דוחות וסיכומים',
    answer: `**עמוד הדוחות:**

📊 כרטיסי KPI: סך פרסומים, הצלחות, כישלונות, אחוז הצלחה, קבוצות פעילות וחשיפה משוערת.

📋 פעילות אחרונה: Facebook, Instagram ו-WhatsApp עם סטטוס ופרטים.

📅 פרסומים מתוזמנים: מה עומד לצאת.

🖨️ ייצוא PDF: דוח מעוצב להורדה.

💡 אפשר לסנן לפי פלטפורמה ותקופה. מדדי ביצועים מפורטים של הרשתות נמצאים בעמוד **סטטיסטיקות**, לא בדוחות.`,
    options: [
      { id: 'features', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'schedule',
    label: 'תזמון פרסומים',
    answer: `**3 מצבי תזמון:**

⚡ **מיידי** פורסם מיד.
📅 **מתוזמן** תאריך ושעה ספציפיים.
🔄 **חוזר** טווח תאריכים, ימים בשבוע ושעה אחת או יותר לכל יום.

📡 **תזמון לפי יעד:**
קבוצות Facebook, פרופיל אישי ו-WhatsApp יכולים לצאת בזמנים שונים.
גם פוסט, סטורי וריל ב-Instagram יכולים לקבל תזמון נפרד.

💡 השעות המומלצות שמופיעות במערכת מבוססות על הנתונים הזמינים בחשבון; אין שעה אחת שמתאימה לכל קהל.`,
    options: [
      { id: 'campaigns', label: '📋 קמפיינים' },
      { id: 'instagram', label: '📸 פרסום באינסטגרם' },
      { id: 'features', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'profile',
    label: 'פרסום בפרופיל',
    answer: `**פרסום בפרופיל האישי:**

**איך:** ביצירת פוסט, הפעל "פרסם בפרופיל האישי".

**אפשרויות:**
• פרופיל בלבד
• פרופיל + קבוצות
• תזמון נפרד מהקבוצות

הפרסום מתבצע דרך חיבור Facebook של המשתמש. אם החיבור אינו פעיל, יש להתחבר מחדש בהגדרות.`,
    options: [
      { id: 'publish', label: '🚀 עוד על פרסום' },
      { id: 'features', label: '🔙 חזרה' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'settings',
    label: 'הגדרות',
    answer: `**הגדרות חשבון:**

👤 **פרופיל** שם, תמונה, פרטי התחברות.
🔔 **התראות** פעמון בתפריט הצד.
🔗 **פייסבוק** חיבור מאובטח באמצעות דפדפן.
📸 **אינסטגרם** חיבור דרך OAuth — אישור מאובטח.
📱 **WhatsApp** חיבור, קבוצות ורשימות תפוצה, מספר קישור והודעת ברירת מחדל.
🎨 **ערכת נושא** שמש/ירח בתפריט.`,
    options: [
      { id: 'instagram', label: '📸 חיבור אינסטגרם' },
      { id: 'features', label: '🔙 חזרה' },
      { id: 'troubleshoot', label: '🔧 פתרון בעיות' },
      { id: 'contact', label: '📧 לא מצאת תשובה?' },
    ]
  },
  {
    id: 'ai-generate',
    label: 'יצירת פוסט בעזרת AI',
    answer: `**יצירת פוסט בעזרת AI** הוא כלי ליצירת טיוטת תוכן מותאמת שאפשר לערוך לפני השימוש.

**איך זה עובד:**

1️⃣ **בחר סוג פוסט** מכירה, שירות, אירוע, תוכן ערך, גיוס עובדים ועוד.

2️⃣ **מלא פרטים** תחום, מוצר/שירות, קהל יעד, יתרון ייחודי.

3️⃣ **התאם טון** מקצועי, חברי, שיווקי, הומוריסטי ועוד.

4️⃣ **לחץ "ייצר פוסט"** הAI ייצור פוסט מותאם אישית!

**אפשרויות נוספות:**
✅ הוספת אימוג׳ים אוטומטית
✅ קריאה לפעולה מותאמת
✅ העתקת פוסט לדוגמה כהשראה
✅ עריכה חופשית של התוצאה
✅ העברה ישירה ליצירת קמפיין
✅ שימוש מתוך יצירת טמפלייט וחזרה לטמפלייט עם התוכן

💡 **טיפ:** לחצו על "דוגמאות" כדי לראות איך ממלאים ומה הAI מייצר!`,
    options: [
      { id: 'ai-tips', label: '💡 טיפים לתוצאות טובות יותר' },
      { id: 'publish', label: '🚀 איך לפרסם פוסט' },
      { id: 'templates', label: '📝 שמירה כטמפלייט' },
      { id: 'welcome', label: '🔙 חזרה לתפריט' },
    ]
  },
  {
    id: 'ai-tips',
    label: 'טיפים ליצירת פוסט בעזרת AI',
    answer: `**טיפים לתוצאות מעולות:**

🎯 **היו ספציפיים** "קורס יוגה לנשים אחרי לידה" עדיף על "קורס".

👥 **הגדירו קהל יעד** ככל שתהיו מדויקים, הפוסט יהיה ממוקד יותר.

⭐ **הדגישו יתרון ייחודי** מה מבדיל אתכם מהמתחרים?

📝 **הוסיפו פרטים** מבצע, מחיר, תאריך, עוזר לAI ליצור תוכן מדויק.

📋 **השתמשו בפוסט לדוגמה** הדביקו פוסט שאהבתם והAI ייצר משהו בסגנון דומה.

🔄 **נסו שוב** לא אהבתם? לחצו שוב ותקבלו גרסה חדשה!

✏️ **ערכו את התוצאה** הפוסט ניתן לעריכה לפני פרסום.`,
    options: [
      { id: 'ai-generate', label: '🤖 חזרה ליצירת פוסט בעזרת AI' },
      { id: 'publish', label: '🚀 איך לפרסם' },
      { id: 'welcome', label: '🔙 חזרה לתפריט' },
    ]
  },
  {
    id: 'troubleshoot',
    label: 'פתרון בעיות',
    answer: `**בעיות נפוצות:**

❌ **פרסום Facebook נכשל** בדוק שהחיבור פעיל. אם נדרש, התחבר מחדש ונסה שוב.

📸 **פרסום Instagram נכשל** ודא שמחובר חשבון Business/Creator ושיש מדיה מתאימה. אם החיבור אינו תקין, המערכת מציגה הודעה ידידותית ושולחת הודעת חיבור מחדש לפי הצורך.

🔄 **סנכרון קבוצות לא עובד** בדוק את חיבור Facebook ונסה סנכרון נוסף.

⏰ **תזמון לא יצא** בדוק את סטטוס היעדים בקמפיין ואת חיבורי הפלטפורמות.

🖼️ **מדיה לא עולה** נסה קובץ תמונה או וידאו נתמך ובגודל סביר. לריל נדרש וידאו.

💬 **WhatsApp לא מציג יעדים** ודא שהחיבור פעיל ובצע סנכרון של הקבוצות ורשימות התפוצה.

🔐 **Instagram נראה מחובר אך נכשל** נסה חיבור מחדש. חידוש שגרתי של טוקנים מתבצע מאחורי הקלעים, אך ביטול הרשאה או טוקן לא תקין עדיין דורשים אישור משתמש חדש.`,
    options: [
      { id: 'welcome', label: '🔙 חזרה לתפריט' },
      { id: 'settings', label: '⚙️ הגדרות' },
      { id: 'contact', label: '📧 עדיין לא נפתר?' },
    ]
  },
  {
    id: 'contact',
    label: 'צור קשר',
    answer: `לא מצאת תשובה? 😊

שלח לנו מייל ונחזור אליך בהקדם:

📧 **${SUPPORT_EMAIL}**

או לחץ על הכפתור למטה לפתיחת מייל חדש.`,
    options: [
      { id: 'send-email', label: '📧 שלח מייל עכשיו' },
      { id: 'welcome', label: '🔙 חזרה לתפריט' },
    ]
  },
]

const CHATBOT_VERSION = 5 // bump to reset cached sessions when topics change

// ─── Post Creation Flow Steps ────────────────────────────────
const FLOW_STEPS = {
  content: 'content',
  platforms: 'platforms',
  fb_groups: 'fb_groups',
  ig_types: 'ig_types',
  wa_targets: 'wa_targets',
  scheduling: 'scheduling',
  summary: 'summary',
}

const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

export default function ChatBot() {
  const navigate = useNavigate()
  const { user, groups: cachedGroups, waGroups, waBroadcastLists, loadWaGroups, forceRefresh } = useAppData()

  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem('chatbot-open') === 'true' } catch { return false }
  })
  const [messages, setMessages] = useState(() => {
    try {
      const ver = sessionStorage.getItem('chatbot-version')
      if (ver && Number(ver) !== CHATBOT_VERSION) {
        sessionStorage.removeItem('chatbot-messages')
        sessionStorage.removeItem('chatbot-topic')
        sessionStorage.setItem('chatbot-version', String(CHATBOT_VERSION))
        return []
      }
      sessionStorage.setItem('chatbot-version', String(CHATBOT_VERSION))
      const saved = sessionStorage.getItem('chatbot-messages')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [currentTopic, setCurrentTopic] = useState(() => {
    try { return sessionStorage.getItem('chatbot-topic') || null } catch { return null }
  })
  const messagesEndRef = useRef(null)
  const panelRef = useRef(null)
  const fabRef = useRef(null)
  const inputRef = useRef(null)

  // ─── Post Creation Flow State ────────────────────────────
  const [flowActive, setFlowActive] = useState(false)
  const [flowStep, setFlowStep] = useState(null)
  const [flowData, setFlowData] = useState({
    text: '',
    images: [],
    imagePreviews: [],
    title: '',
    fbGroups: true,
    fbProfile: false,
    instagram: false,
    whatsapp: false,
    selectedGroups: [],
    igTypes: ['FEED'],
    selectedWaTargets: [],
    fbScheduleMode: 'now',
    fbScheduleDate: '',
    fbScheduleTime: '',
    fbRecurringDays: [],
    fbRecurringTime: '',
    profileScheduleMode: 'now',
    profileScheduleDate: '',
    profileScheduleTime: '',
    profileRecurringDays: [],
    profileRecurringTime: '',
    igScheduleMode: 'now',
    igScheduleDate: '',
    igScheduleTime: '',
    igRecurringDays: [],
    igRecurringTime: '',
    waScheduleMode: 'now',
    waScheduleDate: '',
    waScheduleTime: '',
    waRecurringDays: [],
    waRecurringTime: '',
  })
  const [flowInput, setFlowInput] = useState('')
  const [groupSearch, setGroupSearch] = useState('')
  const [waSearch, setWaSearch] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [allGroups, setAllGroups] = useState(cachedGroups || [])
  const [loadingGroups, setLoadingGroups] = useState(false)

  useEffect(() => {
    if (cachedGroups?.length) setAllGroups(cachedGroups)
  }, [cachedGroups])

  useEffect(() => {
    const handleOpen = () => setOpen(true)
    window.addEventListener('open-chatbot', handleOpen)
    return () => window.removeEventListener('open-chatbot', handleOpen)
  }, [])

  useEffect(() => {
    try { sessionStorage.setItem('chatbot-open', open ? 'true' : 'false') } catch { /* ignore */ }
  }, [open])

  useEffect(() => {
    try { sessionStorage.setItem('chatbot-messages', JSON.stringify(messages)) } catch { /* ignore */ }
  }, [messages])

  useEffect(() => {
    try { if (currentTopic) sessionStorage.setItem('chatbot-topic', currentTopic) } catch { /* ignore */ }
  }, [currentTopic])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        fabRef.current && !fabRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [open])

  useEffect(() => {
    if (open && messages.length === 0) {
      const t = getTimeStr()
      setMessages([
        {
          type: 'bot', time: t,
          text: `שלום! 👋 אני **${AGENT_NAME}**,\nהסוכן החכם שלך.\nאיך אפשר לעזור לך היום?`,
          style: 'greeting'
        },
        {
          type: 'bot', time: t,
          text: `בחרו נושא לעזרה:`,
          options: TOPICS.find(t => t.id === 'welcome')?.options || []
        }
      ])
      setCurrentTopic('welcome')
    }
  }, [open])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50)
    }
  }, [open])

  useEffect(() => {
    if (flowActive && flowStep === FLOW_STEPS.content && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [flowActive, flowStep])

  // ─── Load groups ─────────────────────────────────────────
  const loadGroups = useCallback(async () => {
    setLoadingGroups(true)
    try {
      const res = await groupsService.getSavedGroups()
      if (res.data.success && res.data.groups) setAllGroups(res.data.groups)
    } catch { /* silent */ }
    finally { setLoadingGroups(false) }
  }, [])

  // ─── FAQ Option Click ───────────────────────────────────
  const handleOptionClick = (option) => {
    setMessages(prev => [...prev, { type: 'user', text: option.label, time: getTimeStr() }])

    if (option.id === 'create-post-flow') {
      startFlow()
      return
    }

    if (option.id === 'send-email') {
      window.open(`mailto:${SUPPORT_EMAIL}?subject=פנייה מ-Possbo&body=שלום, אשמח לעזרה ב...`, '_blank')
      setTimeout(() => {
        setMessages(prev => [...prev, {
          type: 'bot', time: getTimeStr(),
          text: `נפתח חלון מייל חדש! 📧\nנחזור אליך בהקדם האפשרי.`,
          options: [{ id: 'welcome', label: '🔙 חזרה לתפריט' }]
        }])
      }, 400)
      return
    }

    const topic = TOPICS.find(t => t.id === option.id)
    if (!topic) return
    setCurrentTopic(topic.id)

    setTimeout(() => {
      if (topic.answer) {
        setMessages(prev => [...prev, { type: 'bot', time: getTimeStr(), text: topic.answer, options: topic.options || [] }])
      } else if (topic.options) {
        setMessages(prev => [...prev, { type: 'bot', time: getTimeStr(), text: `${topic.label}, בחר נושא:`, options: topic.options }])
      }
    }, 400)
  }

  // ═══════════════════════════════════════════════════════════
  // POST CREATION FLOW
  // ═══════════════════════════════════════════════════════════

  const startFlow = () => {
    setFlowActive(true)
    setFlowStep(FLOW_STEPS.content)
    setFlowData({
      text: '', images: [], imagePreviews: [], title: '',
      fbGroups: true, fbProfile: false, instagram: false, whatsapp: false,
      selectedGroups: [], igTypes: ['FEED'], selectedWaTargets: [],
      fbScheduleMode: 'now', fbScheduleDate: '', fbScheduleTime: '', fbRecurringDays: [], fbRecurringTime: '',
      profileScheduleMode: 'now', profileScheduleDate: '', profileScheduleTime: '', profileRecurringDays: [], profileRecurringTime: '',
      igScheduleMode: 'now', igScheduleDate: '', igScheduleTime: '', igRecurringDays: [], igRecurringTime: '',
      waScheduleMode: 'now', waScheduleDate: '', waScheduleTime: '', waRecurringDays: [], waRecurringTime: '',
    })
    setFlowInput('')
    setGroupSearch('')
    setWaSearch('')

    setTimeout(() => {
      setMessages(prev => [...prev, {
        type: 'bot', time: getTimeStr(), style: 'flow',
        text: `מעולה! 🎉 בואו ניצור קמפיין מהיר יחד!\n\n**שלב 1/5: תוכן הפוסט**\nכתבו את הטקסט והוסיפו מדיה אם צריך.\n\nלאפשרויות מתקדמות כמו מיקום, מדיה נפרדת ותזמון נפרד לפוסט/סטורי/ריל, השתמשו בעמוד "צור קמפיין".`
      }])
    }, 400)
  }

  const cancelFlow = () => {
    setFlowActive(false)
    setFlowStep(null)
    setFlowInput('')
    setTimeout(() => {
      setMessages(prev => [...prev, {
        type: 'bot', time: getTimeStr(),
        text: `ביטלתי את יצירת הפוסט. 🙂\nאיך אפשר לעזור?`,
        options: TOPICS.find(t => t.id === 'welcome')?.options || []
      }])
    }, 300)
  }

  const handleFlowTextSubmit = () => {
    const text = flowInput.trim()
    if (!text) return
    setFlowData(prev => ({ ...prev, text }))
    setMessages(prev => [...prev, { type: 'user', text, time: getTimeStr() }])
    setFlowInput('')
    advanceToStep(FLOW_STEPS.platforms)
  }

  const advanceToStep = (step) => {
    setFlowStep(step)
    const t = getTimeStr()

    switch (step) {
      case FLOW_STEPS.platforms:
        setTimeout(() => {
          setMessages(prev => [...prev, {
            type: 'bot', time: t, style: 'flow',
            text: `תוכן נשמר! ✅\n\n**שלב 2/5: לאן לפרסם?**\nבחרו את הפלטפורמות:`,
            widget: 'platforms'
          }])
        }, 400)
        break
      case FLOW_STEPS.fb_groups:
        loadGroups()
        setTimeout(() => {
          setMessages(prev => [...prev, {
            type: 'bot', time: t, style: 'flow',
            text: `**שלב 3/5: בחירת קבוצות פייסבוק**\nסמנו את הקבוצות לפרסום:`,
            widget: 'fb_groups'
          }])
        }, 400)
        break
      case FLOW_STEPS.ig_types:
        setTimeout(() => {
          setMessages(prev => [...prev, {
            type: 'bot', time: t, style: 'flow',
            text: `**שלב 3/5: סוגי פרסום באינסטגרם**\nבחרו היכן לפרסם:`,
            widget: 'ig_types'
          }])
        }, 400)
        break
      case FLOW_STEPS.wa_targets:
        if (user?.whatsappSessionConnected) loadWaGroups()
        setTimeout(() => {
          setMessages(prev => [...prev, {
            type: 'bot', time: t, style: 'flow',
            text: `**שלב 3/5: יעדי וואטסאפ**\nסמנו קבוצות או רשימות שידור:`,
            widget: 'wa_targets'
          }])
        }, 400)
        break
      case FLOW_STEPS.scheduling:
        setTimeout(() => {
          setMessages(prev => [...prev, {
            type: 'bot', time: t, style: 'flow',
            text: `**שלב 4/5: תזמון** ⏰\nהגדירו תזמון לכל פלטפורמה.\n\nביצירה המהירה בצ׳אט, סוגי Instagram שנבחרו חולקים תזמון. לתזמון נפרד לפוסט, סטורי וריל עברו לעמוד "צור קמפיין".`,
            widget: 'scheduling'
          }])
        }, 400)
        break
      case FLOW_STEPS.summary:
        setTimeout(() => {
          setMessages(prev => [...prev, {
            type: 'bot', time: t, style: 'flow',
            text: buildSummaryText(),
            widget: 'summary'
          }])
        }, 400)
        break
    }
  }

  const handlePlatformsNext = () => {
    const { fbGroups, fbProfile, instagram, whatsapp } = flowData
    if (!fbGroups && !fbProfile && !instagram && !whatsapp) return

    setMessages(prev => [...prev, {
      type: 'user', time: getTimeStr(),
      text: `פלטפורמות: ${[fbGroups && 'קבוצות FB', fbProfile && 'פרופיל', instagram && 'אינסטגרם', whatsapp && 'וואטסאפ'].filter(Boolean).join(', ')}`
    }])

    if (fbGroups) advanceToStep(FLOW_STEPS.fb_groups)
    else if (instagram) advanceToStep(FLOW_STEPS.ig_types)
    else if (whatsapp) advanceToStep(FLOW_STEPS.wa_targets)
    else advanceToStep(FLOW_STEPS.scheduling)
  }

  const handleFbGroupsNext = () => {
    if (flowData.selectedGroups.length === 0) return
    setMessages(prev => [...prev, {
      type: 'user', time: getTimeStr(),
      text: `נבחרו ${flowData.selectedGroups.length} קבוצות פייסבוק ✅`
    }])
    if (flowData.instagram) advanceToStep(FLOW_STEPS.ig_types)
    else if (flowData.whatsapp) advanceToStep(FLOW_STEPS.wa_targets)
    else advanceToStep(FLOW_STEPS.scheduling)
  }

  const handleIgTypesNext = () => {
    if (flowData.igTypes.length === 0) return
    const hasMedia = flowData.images.length > 0
    const hasVideo = flowData.images.some(file => file?.type?.startsWith('video/'))
    if (!hasMedia) {
      setMessages(prev => [...prev, {
        type: 'bot', time: getTimeStr(),
        text: `כדי לפרסם ב-Instagram צריך להוסיף מדיה בשלב התוכן. חזרו להתחלה והוסיפו תמונה או וידאו. 🖼️`,
        options: [{ id: 'create-post-flow', label: '🔄 התחלת קמפיין מחדש' }, { id: 'welcome', label: '🔙 חזרה לתפריט' }]
      }])
      setFlowActive(false)
      setFlowStep(null)
      return
    }
    if (flowData.igTypes.includes('REEL') && !hasVideo) {
      setMessages(prev => [...prev, {
        type: 'bot', time: getTimeStr(),
        text: `ריל דורש קובץ וידאו. התמונות שהועלו יכולות לשמש לפוסט או לסטורי, אך לא לריל. 🎬`,
        options: [{ id: 'create-post-flow', label: '🔄 התחלת קמפיין מחדש' }, { id: 'instagram', label: '📸 מידע על Instagram' }]
      }])
      setFlowActive(false)
      setFlowStep(null)
      return
    }
    const labels = { FEED: 'פיד', STORY: 'סטורי', REEL: 'ריל' }
    setMessages(prev => [...prev, {
      type: 'user', time: getTimeStr(),
      text: `אינסטגרם: ${flowData.igTypes.map(t => labels[t]).join(', ')} ✅`
    }])
    if (flowData.whatsapp) advanceToStep(FLOW_STEPS.wa_targets)
    else advanceToStep(FLOW_STEPS.scheduling)
  }

  const handleWaTargetsNext = () => {
    if (flowData.selectedWaTargets.length === 0) return
    setMessages(prev => [...prev, {
      type: 'user', time: getTimeStr(),
      text: `נבחרו ${flowData.selectedWaTargets.length} יעדי וואטסאפ ✅`
    }])
    advanceToStep(FLOW_STEPS.scheduling)
  }

  const handleSchedulingNext = () => {
    const parts = []
    if (flowData.fbGroups) parts.push(`FB: ${scheduleModeLabel(flowData.fbScheduleMode)}`)
    if (flowData.fbProfile) parts.push(`פרופיל: ${scheduleModeLabel(flowData.profileScheduleMode)}`)
    if (flowData.instagram) parts.push(`IG: ${scheduleModeLabel(flowData.igScheduleMode)}`)
    if (flowData.whatsapp) parts.push(`WA: ${scheduleModeLabel(flowData.waScheduleMode)}`)
    setMessages(prev => [...prev, { type: 'user', time: getTimeStr(), text: `תזמון: ${parts.join(' | ')} ✅` }])
    advanceToStep(FLOW_STEPS.summary)
  }

  const scheduleModeLabel = (mode) => mode === 'now' ? 'מיידי' : mode === 'scheduled' ? 'מתוזמן' : 'חוזר'

  const buildSummaryText = () => {
    const d = flowData
    let text = `**שלב 5/5: סיכום** 📋\n\n`
    text += `📝 **תוכן:** ${d.text.substring(0, 60)}${d.text.length > 60 ? '...' : ''}\n`
    if (d.images.length) text += `🖼️ **תמונות:** ${d.images.length}\n`
    text += `\n📡 **יעדים:**\n`
    if (d.fbGroups) text += `• קבוצות פייסבוק: ${d.selectedGroups.length} קבוצות\n`
    if (d.fbProfile) text += `• פרופיל אישי\n`
    if (d.instagram) {
      const labels = { FEED: 'פיד', STORY: 'סטורי', REEL: 'ריל' }
      text += `• אינסטגרם: ${d.igTypes.map(t => labels[t]).join(', ')}\n`
    }
    if (d.whatsapp) text += `• וואטסאפ: ${d.selectedWaTargets.length} יעדים\n`
    text += `\n⏰ **תזמון:**\n`
    if (d.fbGroups) text += `• קבוצות FB: ${formatScheduleLabel(d.fbScheduleMode, d.fbScheduleDate, d.fbScheduleTime, d.fbRecurringDays, d.fbRecurringTime)}\n`
    if (d.fbProfile) text += `• פרופיל: ${formatScheduleLabel(d.profileScheduleMode, d.profileScheduleDate, d.profileScheduleTime, d.profileRecurringDays, d.profileRecurringTime)}\n`
    if (d.instagram) text += `• אינסטגרם: ${formatScheduleLabel(d.igScheduleMode, d.igScheduleDate, d.igScheduleTime, d.igRecurringDays, d.igRecurringTime)}\n`
    if (d.whatsapp) text += `• וואטסאפ: ${formatScheduleLabel(d.waScheduleMode, d.waScheduleDate, d.waScheduleTime, d.waRecurringDays, d.waRecurringTime)}\n`
    text += `\nהכל נראה טוב? 🚀`
    return text
  }

  const formatScheduleLabel = (mode, date, time, days, recurTime) => {
    if (mode === 'now') return 'פרסום מיידי ⚡'
    if (mode === 'scheduled') return `${date} בשעה ${time} 📅`
    if (mode === 'recurring') {
      const dayLabels = (days || []).map(d => DAY_NAMES[d]).join(', ')
      return `כל ${dayLabels} בשעה ${recurTime} 🔄`
    }
    return 'מיידי'
  }

  // ─── Publish ────────────────────────────────────────────
  const handlePublish = async () => {
    setPublishing(true)
    setMessages(prev => [...prev, { type: 'bot', time: getTimeStr(), text: `מפרסם... ⏳`, style: 'flow' }])

    try {
      const d = flowData
      const scheduleMode = d.fbScheduleMode !== 'now' ? d.fbScheduleMode : (d.profileScheduleMode !== 'now' ? d.profileScheduleMode : 'now')

      const payload = {
        title: d.title || '',
        text: d.text,
        groupIds: d.selectedGroups.map(g => g.id),
        anonymous: false,
        location: '',
        publishToProfile: d.fbProfile,
        instagramEnabled: d.instagram && (user?.instagramConnected || false),
        instagramPublishTypes: d.instagram ? d.igTypes : null,
        scheduleMode,
        scheduleDate: d.fbScheduleMode === 'scheduled' ? d.fbScheduleDate : '',
        scheduleTime: d.fbScheduleMode === 'scheduled' ? d.fbScheduleTime : '',
        recurringDays: d.fbScheduleMode === 'recurring' ? d.fbRecurringDays : [],
        recurringTime: d.fbScheduleMode === 'recurring' ? d.fbRecurringTime : '',
        recurringTimes: d.fbScheduleMode === 'recurring' ? [d.fbRecurringTime] : [],
        dayTimes: d.fbScheduleMode === 'recurring' ? Object.fromEntries(d.fbRecurringDays.map(day => [day, [d.fbRecurringTime]])) : {},
        recurringStartDate: '',
        recurringEndDate: null,
        campaignType: scheduleMode === 'recurring' ? 'RECURRING' : scheduleMode === 'scheduled' ? 'SCHEDULED' : 'ONE_TIME',
        profileScheduleMode: d.profileScheduleMode,
        profileScheduleDate: d.profileScheduleMode === 'scheduled' ? d.profileScheduleDate : null,
        profileScheduleTime: d.profileScheduleMode === 'scheduled' ? d.profileScheduleTime : null,
        profileRecurringDays: d.profileScheduleMode === 'recurring' ? d.profileRecurringDays : null,
        profileDayTimes: d.profileScheduleMode === 'recurring' ? Object.fromEntries(d.profileRecurringDays.map(day => [day, [d.profileRecurringTime]])) : null,
        profileRecurringStartDate: null,
        profileRecurringEndDate: null,
        igScheduleMode: d.igScheduleMode,
        igScheduleDate: d.igScheduleMode === 'scheduled' ? d.igScheduleDate : null,
        igScheduleTime: d.igScheduleMode === 'scheduled' ? d.igScheduleTime : null,
        igRecurringDays: d.igScheduleMode === 'recurring' ? d.igRecurringDays : null,
        igDayTimes: d.igScheduleMode === 'recurring' ? Object.fromEntries(d.igRecurringDays.map(day => [day, [d.igRecurringTime]])) : null,
        igRecurringStartDate: null,
        igRecurringEndDate: null,
        igPerTypeSchedules: d.instagram ? Object.fromEntries(d.igTypes.map(type => [type, { mode: d.igScheduleMode, date: d.igScheduleDate, time: d.igScheduleTime, recurringDays: d.igRecurringDays, dayTimes: Object.fromEntries((d.igRecurringDays || []).map(day => [day, [d.igRecurringTime]])), startDate: '', endDate: '' }])) : null,
        igTypeCaptions: null,
        whatsappEnabled: d.whatsapp,
        whatsappTargets: d.whatsapp ? d.selectedWaTargets : null,
        waScheduleMode: d.waScheduleMode,
        waScheduleDate: d.waScheduleMode === 'scheduled' ? d.waScheduleDate : null,
        waScheduleTime: d.waScheduleMode === 'scheduled' ? d.waScheduleTime : null,
        waRecurringDays: d.waScheduleMode === 'recurring' ? d.waRecurringDays : null,
        waDayTimes: d.waScheduleMode === 'recurring' ? Object.fromEntries(d.waRecurringDays.map(day => [day, [d.waRecurringTime]])) : null,
        waRecurringStartDate: null,
        waRecurringEndDate: null,
      }

      const res = await groupsService.createCampaign(payload, d.images.length ? d.images : null, null)

      if (res.data.success) {
        forceRefresh()
        setMessages(prev => [...prev, {
          type: 'bot', time: getTimeStr(),
          text: scheduleMode === 'now'
            ? `הקמפיין נוצר והפרסום התחיל! 🎉\nאפשר לעקוב בקמפיינים אחר ההתקדמות בכל יעד. הקמפיין יסומן כהושלם רק כשכל היעדים יסתיימו.`
            : `הקמפיין תוזמן בהצלחה! 📅✅\nאפשר לראות אותו בקמפיינים ולעקוב אחר כל יעד בזמן הפרסום.`,
          options: [{ id: 'welcome', label: '🔙 חזרה לתפריט' }]
        }])
        setFlowActive(false)
        setFlowStep(null)
      } else {
        setMessages(prev => [...prev, {
          type: 'bot', time: getTimeStr(),
          text: `לא הצלחנו ליצור את הקמפיין כרגע. נסו שוב מאוחר יותר או בדקו את חיבורי הפלטפורמות בהגדרות. 😕`,
          options: [{ id: 'create-post-flow', label: '🔄 נסה שוב' }, { id: 'welcome', label: '🔙 חזרה לתפריט' }]
        }])
        setFlowActive(false)
        setFlowStep(null)
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        type: 'bot', time: getTimeStr(),
        text: `לא הצלחנו להשלים את הפעולה כרגע. נסו שוב מאוחר יותר; אם הבעיה חוזרת, בדקו את חיבורי הפלטפורמות או פנו לתמיכה. 😕`,
        options: [{ id: 'create-post-flow', label: '🔄 נסה שוב' }, { id: 'welcome', label: '🔙 חזרה לתפריט' }]
      }])
      setFlowActive(false)
      setFlowStep(null)
    } finally {
      setPublishing(false)
    }
  }

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    const newImages = [...flowData.images, ...files].slice(0, 10)
    setFlowData(prev => ({
      ...prev,
      images: newImages,
      imagePreviews: newImages.map(f => URL.createObjectURL(f))
    }))
  }

  // ─── Reset ──────────────────────────────────────────────
  const handleReset = () => {
    setFlowActive(false)
    setFlowStep(null)
    setFlowInput('')
    const t = getTimeStr()
    setMessages([
      { type: 'bot', time: t, text: `שלום! 👋 איך אפשר לעזור?`, style: 'greeting' },
      { type: 'bot', time: t, text: `בחרו נושא לעזרה:`, options: TOPICS.find(t => t.id === 'welcome')?.options || [] }
    ])
    setCurrentTopic('welcome')
  }

  // ═══════════════════════════════════════════════════════════
  // WIDGET RENDERERS
  // ═══════════════════════════════════════════════════════════

  const renderWidget = (widget) => {
    switch (widget) {
      case 'platforms': return renderPlatformsWidget()
      case 'fb_groups': return renderFbGroupsWidget()
      case 'ig_types': return renderIgTypesWidget()
      case 'wa_targets': return renderWaTargetsWidget()
      case 'scheduling': return renderSchedulingWidget()
      case 'summary': return renderSummaryWidget()
      default: return null
    }
  }

  const renderPlatformsWidget = () => (
    <div className="chatbot-widget chatbot-platforms-widget">
      <label className="chatbot-toggle-row">
        <input type="checkbox" checked={flowData.fbGroups}
          onChange={e => setFlowData(prev => ({ ...prev, fbGroups: e.target.checked }))} />
        <span>👥 קבוצות פייסבוק</span>
      </label>
      <label className="chatbot-toggle-row">
        <input type="checkbox" checked={flowData.fbProfile}
          onChange={e => setFlowData(prev => ({ ...prev, fbProfile: e.target.checked }))} />
        <span>👤 פרופיל אישי</span>
      </label>
      <label className="chatbot-toggle-row">
        <input type="checkbox" checked={flowData.instagram}
          disabled={!user?.instagramConnected}
          onChange={e => setFlowData(prev => ({ ...prev, instagram: e.target.checked }))} />
        <span>📸 אינסטגרם {!user?.instagramConnected && <small>(לא מחובר)</small>}</span>
      </label>
      <label className="chatbot-toggle-row">
        <input type="checkbox" checked={flowData.whatsapp}
          disabled={!user?.whatsappSessionConnected}
          onChange={e => setFlowData(prev => ({ ...prev, whatsapp: e.target.checked }))} />
        <span>💬 וואטסאפ {!user?.whatsappSessionConnected && <small>(לא מחובר)</small>}</span>
      </label>
      <div className="chatbot-widget-actions">
        <button className="chatbot-flow-btn primary" onClick={handlePlatformsNext}
          disabled={!flowData.fbGroups && !flowData.fbProfile && !flowData.instagram && !flowData.whatsapp}>
          המשך ←
        </button>
        <button className="chatbot-flow-btn cancel" onClick={cancelFlow}>ביטול</button>
      </div>
    </div>
  )

  const renderFbGroupsWidget = () => {
    const filtered = allGroups.filter(g => g.name?.toLowerCase().includes(groupSearch.toLowerCase()))
    return (
      <div className="chatbot-widget chatbot-groups-widget">
        <input type="text" className="chatbot-search-input" placeholder="🔍 חיפוש קבוצה..." aria-label="חיפוש קבוצה"
          value={groupSearch} onChange={e => setGroupSearch(e.target.value)} />
        {loadingGroups ? (
          <div className="chatbot-loading">טוען קבוצות...</div>
        ) : (
          <>
            <div className="chatbot-groups-actions">
              <button className="chatbot-link-btn" onClick={() => setFlowData(prev => ({ ...prev, selectedGroups: filtered }))}>
                בחר הכל ({filtered.length})
              </button>
              <button className="chatbot-link-btn" onClick={() => setFlowData(prev => ({ ...prev, selectedGroups: [] }))}>
                נקה בחירה
              </button>
            </div>
            <div className="chatbot-groups-list">
              {filtered.slice(0, 50).map(group => {
                const selected = flowData.selectedGroups.some(g => g.id === group.id)
                return (
                  <label key={group.id} className={`chatbot-group-item ${selected ? 'selected' : ''}`}>
                    <input type="checkbox" checked={selected}
                      onChange={() => {
                        setFlowData(prev => ({
                          ...prev,
                          selectedGroups: selected
                            ? prev.selectedGroups.filter(g => g.id !== group.id)
                            : [...prev.selectedGroups, group]
                        }))
                      }} />
                    <div className="chatbot-group-info">
                      <span className="chatbot-group-name">{group.name}</span>
                      {group.memberCount > 0 && <span className="chatbot-group-members">{group.memberCount.toLocaleString()} חברים</span>}
                    </div>
                  </label>
                )
              })}
            </div>
            {filtered.length === 0 && <div className="chatbot-empty">לא נמצאו קבוצות</div>}
            <div className="chatbot-selected-count">נבחרו: {flowData.selectedGroups.length} קבוצות</div>
          </>
        )}
        <div className="chatbot-widget-actions">
          <button className="chatbot-flow-btn primary" onClick={handleFbGroupsNext}
            disabled={flowData.selectedGroups.length === 0}>המשך ←</button>
          <button className="chatbot-flow-btn cancel" onClick={cancelFlow}>ביטול</button>
        </div>
      </div>
    )
  }

  const renderIgTypesWidget = () => (
    <div className="chatbot-widget chatbot-ig-widget">
      {[
        { id: 'FEED', label: '📷 פיד', desc: 'פוסט רגיל בפיד' },
        { id: 'STORY', label: '📱 סטורי', desc: 'נעלם אחרי 24 שעות' },
        { id: 'REEL', label: '🎬 ריל', desc: 'סרטון קצר (וידאו)' },
      ].map(type => {
        const checked = flowData.igTypes.includes(type.id)
        return (
          <label key={type.id} className={`chatbot-toggle-row ${checked ? 'active' : ''}`}>
            <input type="checkbox" checked={checked}
              onChange={() => {
                setFlowData(prev => ({
                  ...prev,
                  igTypes: checked ? prev.igTypes.filter(t => t !== type.id) : [...prev.igTypes, type.id]
                }))
              }} />
            <div className="chatbot-ig-type-info">
              <span>{type.label}</span>
              <small>{type.desc}</small>
            </div>
          </label>
        )
      })}
      <div className="chatbot-widget-actions">
        <button className="chatbot-flow-btn primary" onClick={handleIgTypesNext}
          disabled={flowData.igTypes.length === 0}>המשך ←</button>
        <button className="chatbot-flow-btn cancel" onClick={cancelFlow}>ביטול</button>
      </div>
    </div>
  )

  const renderWaTargetsWidget = () => {
    const allTargets = [
      ...(waGroups || []).map(g => ({ ...g, type: 'group' })),
      ...(waBroadcastLists || []).map(b => ({ ...b, type: 'broadcast' })),
    ]
    const filtered = allTargets.filter(t => t.name?.toLowerCase().includes(waSearch.toLowerCase()))
    return (
      <div className="chatbot-widget chatbot-groups-widget">
        <input type="text" className="chatbot-search-input" placeholder="🔍 חיפוש..." aria-label="חיפוש יעד וואטסאפ"
          value={waSearch} onChange={e => setWaSearch(e.target.value)} />
        {!user?.whatsappSessionConnected ? (
          <div className="chatbot-empty">וואטסאפ לא מחובר. חברו בהגדרות.</div>
        ) : allTargets.length === 0 ? (
          <div className="chatbot-loading">טוען קבוצות וואטסאפ...</div>
        ) : (
          <>
            <div className="chatbot-groups-actions">
              <button className="chatbot-link-btn" onClick={() => setFlowData(prev => ({ ...prev, selectedWaTargets: filtered }))}>
                בחר הכל ({filtered.length})
              </button>
              <button className="chatbot-link-btn" onClick={() => setFlowData(prev => ({ ...prev, selectedWaTargets: [] }))}>נקה</button>
            </div>
            <div className="chatbot-groups-list">
              {filtered.slice(0, 50).map(target => {
                const selected = flowData.selectedWaTargets.some(t => t.id === target.id)
                return (
                  <label key={target.id} className={`chatbot-group-item ${selected ? 'selected' : ''}`}>
                    <input type="checkbox" checked={selected}
                      onChange={() => {
                        setFlowData(prev => ({
                          ...prev,
                          selectedWaTargets: selected
                            ? prev.selectedWaTargets.filter(t => t.id !== target.id)
                            : [...prev.selectedWaTargets, target]
                        }))
                      }} />
                    <div className="chatbot-group-info">
                      <span className="chatbot-group-name">{target.name}</span>
                      <span className="chatbot-group-members">{target.type === 'group' ? '👥 קבוצה' : '📢 רשימת שידור'}</span>
                    </div>
                  </label>
                )
              })}
            </div>
            <div className="chatbot-selected-count">נבחרו: {flowData.selectedWaTargets.length} יעדים</div>
          </>
        )}
        <div className="chatbot-widget-actions">
          <button className="chatbot-flow-btn primary" onClick={handleWaTargetsNext}
            disabled={flowData.selectedWaTargets.length === 0}>המשך ←</button>
          <button className="chatbot-flow-btn cancel" onClick={cancelFlow}>ביטול</button>
        </div>
      </div>
    )
  }

  const renderSchedulingWidget = () => (
    <div className="chatbot-widget chatbot-schedule-widget">
      {flowData.fbGroups && (
        <div className="chatbot-schedule-section">
          <div className="chatbot-schedule-title">👥 קבוצות פייסבוק</div>
          {renderScheduleControls('fb')}
        </div>
      )}
      {flowData.fbProfile && (
        <div className="chatbot-schedule-section">
          <div className="chatbot-schedule-title">👤 פרופיל אישי</div>
          {renderScheduleControls('profile')}
        </div>
      )}
      {flowData.instagram && (
        <div className="chatbot-schedule-section">
          <div className="chatbot-schedule-title">📸 אינסטגרם</div>
          {renderScheduleControls('ig')}
        </div>
      )}
      {flowData.whatsapp && (
        <div className="chatbot-schedule-section">
          <div className="chatbot-schedule-title">💬 וואטסאפ</div>
          {renderScheduleControls('wa')}
        </div>
      )}
      <div className="chatbot-widget-actions">
        <button className="chatbot-flow-btn primary" onClick={handleSchedulingNext}>המשך ←</button>
        <button className="chatbot-flow-btn cancel" onClick={cancelFlow}>ביטול</button>
      </div>
    </div>
  )

  const renderScheduleControls = (prefix) => {
    const modeKey = `${prefix}ScheduleMode`
    const dateKey = `${prefix}ScheduleDate`
    const timeKey = `${prefix}ScheduleTime`
    const recurDaysKey = `${prefix}RecurringDays`
    const recurTimeKey = `${prefix}RecurringTime`
    const mode = flowData[modeKey]

    return (
      <div className="chatbot-schedule-controls">
        <div className="chatbot-schedule-modes">
          {[
            { value: 'now', label: '⚡ מיידי' },
            { value: 'scheduled', label: '📅 מתוזמן' },
            { value: 'recurring', label: '🔄 חוזר' },
          ].map(opt => (
            <button key={opt.value}
              className={`chatbot-sched-mode-btn ${mode === opt.value ? 'active' : ''}`}
              onClick={() => setFlowData(prev => ({ ...prev, [modeKey]: opt.value }))}>
              {opt.label}
            </button>
          ))}
        </div>
        {mode === 'scheduled' && (
          <div className="chatbot-schedule-inputs">
            <input type="date" className="chatbot-date-input"
              value={flowData[dateKey]} min={new Date().toISOString().split('T')[0]}
              onChange={e => setFlowData(prev => ({ ...prev, [dateKey]: e.target.value }))} />
            <input type="time" className="chatbot-time-input"
              value={flowData[timeKey]}
              onChange={e => setFlowData(prev => ({ ...prev, [timeKey]: e.target.value }))} />
          </div>
        )}
        {mode === 'recurring' && (
          <div className="chatbot-schedule-recurring">
            <div className="chatbot-days-row">
              {DAY_NAMES.map((name, i) => {
                const selected = (flowData[recurDaysKey] || []).includes(i)
                return (
                  <button key={i} className={`chatbot-day-btn ${selected ? 'active' : ''}`}
                    onClick={() => {
                      setFlowData(prev => ({
                        ...prev,
                        [recurDaysKey]: selected
                          ? prev[recurDaysKey].filter(d => d !== i)
                          : [...(prev[recurDaysKey] || []), i]
                      }))
                    }}>
                    {name}
                  </button>
                )
              })}
            </div>
            <input type="time" className="chatbot-time-input"
              value={flowData[recurTimeKey]}
              onChange={e => setFlowData(prev => ({ ...prev, [recurTimeKey]: e.target.value }))} />
          </div>
        )}
      </div>
    )
  }

  const renderSummaryWidget = () => (
    <div className="chatbot-widget chatbot-summary-widget">
      <div className="chatbot-widget-actions">
        <button className="chatbot-flow-btn publish" onClick={handlePublish} disabled={publishing}>
          {publishing ? '⏳ מפרסם...' : '🚀 פרסם עכשיו!'}
        </button>
        <button className="chatbot-flow-btn cancel" onClick={cancelFlow} disabled={publishing}>❌ ביטול</button>
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <>
      <button ref={fabRef} className="chatbot-fab" onClick={() => setOpen(!open)} title="צ'אט עזרה" aria-label={open ? 'סגור צ׳אט עזרה' : 'פתח צ׳אט עזרה'} aria-expanded={open}>
        <img src="/bot-avatar.svg" alt="צ'אט" className="chatbot-fab-img" />
        {!open && <span className="chatbot-fab-pulse" />}
      </button>

      {open && (
        <div className="chatbot-panel" ref={panelRef} role="dialog" aria-modal="false" aria-label="צ׳אט עזרה">
          <div className="chatbot-header">
            <div className="chatbot-header-info">
              <div className="chatbot-avatar">
                <img src="/bot-avatar.svg" alt="פוסבוט" />
              </div>
              <div className="chatbot-header-text">
                <span className="chatbot-name">{AGENT_NAME}</span>
                <span className="chatbot-status">● מחובר</span>
              </div>
            </div>
            <button className="chatbot-close" onClick={() => setOpen(false)} aria-label="סגור צ׳אט">
              <X size={18} />
            </button>
          </div>

          <div className="chatbot-messages" aria-live="polite" aria-label="הודעות צ׳אט">
            {messages.map((msg, i) => (
              <div key={i} className={`chatbot-msg chatbot-msg-${msg.type} ${msg.style === 'greeting' ? 'chatbot-msg-greeting' : ''} ${msg.style === 'flow' ? 'chatbot-msg-flow' : ''}`}>
                {msg.type === 'bot' && (
                  <div className="chatbot-msg-avatar">
                    <img src="/bot-avatar.svg" alt="" />
                  </div>
                )}
                <div className="chatbot-msg-bubble">
                  <div className="chatbot-msg-text" dangerouslySetInnerHTML={{ __html: formatBotText(msg.text) }} />
                  {msg.widget && renderWidget(msg.widget)}
                  {msg.options?.length > 0 && (
                    <div className="chatbot-options">
                      {msg.options.map((opt) => (
                        <button key={opt.id} className="chatbot-option-btn" onClick={() => handleOptionClick(opt)}>
                          <div className="chatbot-option-content">
                            <span className="chatbot-option-label">{opt.label}</span>
                            {opt.desc && <span className="chatbot-option-desc">{opt.desc}</span>}
                          </div>
                          <ChevronLeft size={14} />
                        </button>
                      ))}
                    </div>
                  )}
                  {msg.time && <span className="chatbot-msg-time">{msg.time}</span>}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer — text input during content step, otherwise standard */}
          {flowActive && flowStep === FLOW_STEPS.content ? (
            <div className="chatbot-input-footer">
              <div className="chatbot-input-row">
                <textarea
                  ref={inputRef}
                  className="chatbot-textarea"
                  placeholder="כתבו את הפוסט כאן..."
                  aria-label="תוכן הפוסט"
                  value={flowInput}
                  onChange={e => setFlowInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFlowTextSubmit() } }}
                  rows={3}
                />
              </div>
              <div className="chatbot-input-actions">
                <label className="chatbot-img-btn" title="הוסף תמונות" aria-label="הוסף תמונות או סרטונים">
                  <Image size={16} />
                  <input type="file" accept="image/*,video/*" multiple hidden onChange={handleImageSelect} aria-label="בחר תמונות או סרטונים" />
                </label>
                {flowData.imagePreviews.length > 0 && (
                  <span className="chatbot-img-count">📷 {flowData.imagePreviews.length}</span>
                )}
                <button className="chatbot-send-btn" onClick={handleFlowTextSubmit} disabled={!flowInput.trim()} aria-label="שלח תוכן">
                  <Send size={16} />
                </button>
                <button className="chatbot-flow-btn cancel chatbot-cancel-sm" onClick={cancelFlow} aria-label="בטל יצירה">✕</button>
              </div>
            </div>
          ) : (
            <div className="chatbot-footer">
              {flowActive ? (
                <span className="chatbot-footer-text">שלב {getStepNumber(flowStep)}/5 — יצירת פוסט 📝</span>
              ) : (
                <span className="chatbot-footer-text">אני כאן אם תצטרכו אותי! 💜</span>
              )}
              <button className="chatbot-reset-btn" onClick={handleReset}>🔄 התחל מחדש</button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function getStepNumber(step) {
  const map = {
    content: 1, platforms: 2, fb_groups: 3, ig_types: 3, wa_targets: 3,
    scheduling: 4, fb_schedule: 4, profile_schedule: 4, ig_schedule: 4, wa_schedule: 4, summary: 5,
  }
  return map[step] || 1
}

function formatBotText(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}
