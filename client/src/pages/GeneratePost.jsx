import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppData } from '../context/DataProvider'
import { aiService } from '../services/aiService'
import { Sparkles, Copy, Check, RefreshCw, ArrowLeft, ChevronLeft, ChevronRight, Lightbulb, X, SquarePen, Pencil } from 'lucide-react'
import '../styles/generate-post.css'

const TONES = [
  { value: 'professional', label: '💼 מקצועי' },
  { value: 'casual', label: '😊 קליל וידידותי' },
  { value: 'humorous', label: '😂 הומוריסטי' },
  { value: 'inspiring', label: '✨ מעורר השראה' },
  { value: 'urgent', label: '🔥 דחוף / FOMO' },
  { value: 'storytelling', label: '📖 סיפורי' },
]

const POST_TYPES = [
  { value: 'sell_product', label: '🛍️ מכירת מוצר' },
  { value: 'sell_service', label: '💼 קידום שירות' },
  { value: 'sell_course', label: '🎓 מכירת קורס / סדנה' },
  { value: 'real_estate', label: '🏠 נדל״ן (השכרה/מכירה)' },
  { value: 'brand_awareness', label: '📢 חשיפת מותג / עסק חדש' },
  { value: 'engagement', label: '💬 מעורבות ותגובות' },
  { value: 'lead_gen', label: '🎯 איסוף לידים' },
  { value: 'event', label: '🎉 אירוע / השקה' },
  { value: 'testimonial', label: '⭐ שיתוף המלצה / סיפור הצלחה' },
  { value: 'other', label: '📝 אחר' },
]

// Dynamic tags per post type
const TYPE_TAGS = {
  real_estate: [
    { key: 'dealType', label: '🏷️ השכרה / מכירה', options: ['השכרה', 'מכירה'] },
    { key: 'rooms', label: '🛏️ חדרים', placeholder: '3' },
    { key: 'size', label: '📐 גודל (מ״ר)', placeholder: '80' },
    { key: 'price', label: '💰 מחיר', placeholder: '5,200₪' },
    { key: 'location', label: '📍 מיקום', placeholder: 'הרצליה, רחוב חנקין' },
    { key: 'entryDate', label: '📅 תאריך כניסה', placeholder: '1.8.2026' },
    { key: 'parking', label: '🚗 חניה', toggle: true },
    { key: 'balcony', label: '🌇 מרפסת', toggle: true },
    { key: 'ac', label: '❄️ מזגן', toggle: true },
    { key: 'pets', label: '🐾 בע״ח', options: ['מותר', 'לא מותר'] },
    { key: 'roommates', label: '👥 שותפים', options: ['כן', 'לא'] },
    { key: 'furnished', label: '🛋️ מרוהטת', toggle: true },
  ],
  sell_product: [
    { key: 'productName', label: '📦 שם המוצר', placeholder: 'שם המוצר' },
    { key: 'price', label: '💰 מחיר', placeholder: '199₪' },
    { key: 'discount', label: '🏷️ הנחה / מבצע', placeholder: '20% הנחה' },
    { key: 'shipping', label: '🚚 משלוח', options: ['חינם', 'בתשלום', 'איסוף עצמי'] },
    { key: 'stock', label: '📊 מלאי', placeholder: 'מוגבל / ללא הגבלה' },
  ],
  sell_service: [
    { key: 'serviceName', label: '💼 שם השירות', placeholder: 'שם השירות' },
    { key: 'price', label: '💰 מחיר', placeholder: 'החל מ-200₪' },
    { key: 'experience', label: '⏳ ניסיון', placeholder: '5 שנים' },
    { key: 'area', label: '📍 אזור שירות', placeholder: 'מרכז הארץ' },
    { key: 'freeConsult', label: '🎁 ייעוץ ראשוני חינם', toggle: true },
  ],
  sell_course: [
    { key: 'courseName', label: '🎓 שם הקורס', placeholder: 'שם הקורס' },
    { key: 'price', label: '💰 מחיר', placeholder: '990₪' },
    { key: 'discount', label: '🏷️ מבצע', placeholder: '30% הנחה לנרשמים ראשונים' },
    { key: 'sessions', label: '📚 מספר מפגשים', placeholder: '8 מפגשים' },
    { key: 'format', label: '💻 פורמט', options: ['אונליין', 'פרונטלי', 'היברידי'] },
    { key: 'startDate', label: '📅 תאריך התחלה', placeholder: '1.9.2026' },
    { key: 'graduates', label: '🎓 מספר בוגרים', placeholder: '500+' },
  ],
  event: [
    { key: 'eventName', label: '🎉 שם האירוע', placeholder: 'שם האירוע' },
    { key: 'date', label: '📅 תאריך', placeholder: '15.8.2026' },
    { key: 'time', label: '🕐 שעה', placeholder: '20:00' },
    { key: 'venue', label: '📍 מיקום', placeholder: 'תל אביב, אולם X' },
    { key: 'price', label: '💰 מחיר כניסה', placeholder: 'חינם / 50₪' },
    { key: 'registration', label: '📝 הרשמה מראש', toggle: true },
  ],
  brand_awareness: [
    { key: 'businessName', label: '🏪 שם העסק', placeholder: 'שם העסק' },
    { key: 'yearsActive', label: '⏳ שנים בתחום', placeholder: '5 שנים' },
    { key: 'speciality', label: '⭐ התמחות', placeholder: 'שמלות ערב בהתאמה אישית' },
    { key: 'area', label: '📍 מיקום / אזור', placeholder: 'תל אביב' },
  ],
  lead_gen: [
    { key: 'offer', label: '🎁 מה מציעים', placeholder: 'ייעוץ חינם, מדריך, הדגמה' },
  ],
  testimonial: [
    { key: 'clientName', label: '👤 שם הלקוח', placeholder: 'שם (אופציונלי)' },
    { key: 'result', label: '📈 תוצאה שהושגה', placeholder: 'הכפיל מכירות תוך חודש' },
  ],
}

const EXAMPLES = [
  {
    title: '🏠 השכרת דירה בהרצליה',
    postType: 'real_estate',
    topic: 'נדל״ן - השכרת דירות',
    productOrService: 'יחידת דיור מעוצבת כ-40 מ״ר עם חצר פרטית, קומת קרקע, משופצת וברמת גימור גבוהה, מרוהטת, סמטת חנקין הרצליה',
    audience: 'יחידים שמחפשים דירה שקטה ואיכותית בהרצליה',
    uniqueValue: 'חצר פרטית, מרוהטת ברמה גבוהה, דקה מתחבורה, סמטה שקטה',
    tone: 'professional',
    cta: 'לכתוב הודעה בוואטסאפ בלבד',
    useEmojis: true,
    extraDetails: 'כולל הכל חוץ מחשמל, כניסה לחוזה קיים, ללא עישון, ללא בע״ח',
    tags: { dealType: 'השכרה', size: '40', price: '5,200₪', location: 'הרצליה, סמטת חנקין', entryDate: '1.8.2026', parking: true, ac: true, pets: 'לא מותר', furnished: true },
    contactWhatsapp: true, whatsappNum: '0542122366',
    sampleResult: `✨ להשכרה | יחידת דיור מעוצבת עם חצר פרטית | הרצליה ✨

באחת הסמטאות השקטות בהרצליה מוצעת להשכרה יחידת דיור מעוצבת, מוארת ומרוהטת ברמה גבוהה – מוכנה לכניסה.

🏡 כ-40 מ"ר | קומת קרקע | חצר פרטית
🛋️ מרוהטת ומאובזרת | ❄️ מזגן | 🚗 חניה בשפע

✔️ מתאימה ליחיד | 🚭 ללא עישון | 🐾 ללא בע״ח
📅 כניסה: 1.8.2026
💰 5,200 ₪ לחודש (כולל הכל פרט לחשמל)

📱 וואטסאפ בלבד: 0542122366`,
  },
  {
    title: '🏠 מכירת דירה בתל אביב',
    postType: 'real_estate',
    topic: 'נדל״ן - מכירת דירות',
    productOrService: 'דירת 4 חדרים ברחוב ביאליק תל אביב, קומה 7, נוף לים, שיפוץ מלא, מעלית וחניה',
    audience: 'זוגות ומשפחות שמחפשים דירה בתל אביב',
    uniqueValue: 'נוף לים, שיפוץ חדש, מוכנה לכניסה מיידית',
    tone: 'professional',
    cta: 'להתקשר לתיאום סיור',
    useEmojis: true,
    extraDetails: 'ממ״ד, 2 שירותים, מרפסת שמש, ללא תיווך',
    tags: { dealType: 'מכירה', rooms: '4', size: '110', price: '3,850,000₪', location: 'תל אביב, ביאליק', parking: true, balcony: true, ac: true },
    contactPhone: true, phone: '052-8881234',
    sampleResult: `🏠 למכירה | 4 חדרים עם נוף לים | ביאליק, תל אביב

4 חדרים, 110 מ"ר, קומה 7 עם נוף פתוח לים 🌊
שיפוץ מלא, מטבח חדש, חדרי רחצה מעוצבים, פרקט בכל הדירה.

📐 4 חדרים | 110 מ"ר | קומה 7
🛡️ ממ"ד | 🌇 מרפסת שמש | 🚗 חניה בטאבו

💰 3,850,000 ₪ | ללא תיווך
📞 לתיאום סיור: 052-8881234`,
  },
  {
    title: '🎓 קורס שיווק דיגיטלי',
    postType: 'sell_course',
    topic: 'שיווק דיגיטלי',
    productOrService: 'קורס אונליין "שיווק בפייסבוק מא׳ עד ת׳", 8 מפגשים עם תרגול מעשי',
    audience: 'בעלי עסקים קטנים שרוצים ללמוד לשווק לבד',
    uniqueValue: '500 בוגרים, הקורס הכי מעשי בשוק, ליווי אישי',
    tone: 'urgent',
    cta: 'להירשם בלינק בתגובה הראשונה',
    useEmojis: true,
    extraDetails: '30% הנחה ל-20 הנרשמים הראשונים',
    tags: { courseName: 'שיווק בפייסבוק מא׳ עד ת׳', price: '1,490₪', discount: '30% ל-20 ראשונים', sessions: '8', format: 'אונליין', startDate: '1.9.2026', graduates: '500+' },
    contactWhatsapp: true, whatsappNum: '0501234567', whatsappMsg: 'אשמח לפרטים על הקורס',
    sampleResult: `⏰ נשארו רק 8 מקומות!

בעלי עסקים, עדיין משלמים למישהו אחר לנהל לכם את הפייסבוק?

📚 8 מפגשים מעשיים | אונליין
🎯 ליווי אישי צמוד
🎓 500+ בוגרים שרואים תוצאות

💰 1,490₪ | 🔥 30% הנחה ל-20 ראשונים!
📅 מתחיל 1.9.2026

הלינק בתגובה הראשונה 👇
📱 שאלות, וואטסאפ: 0501234567`,
  },
  {
    title: '👗 סטודיו שמלות ערב',
    postType: 'brand_awareness',
    topic: 'אופנה - שמלות ערב',
    productOrService: 'סטודיו לשמלות ערב בהתאמה אישית, עיצוב ותפירה ע״י מעצבת עם 15 שנות ניסיון',
    audience: 'נשים 25-45 שמחפשות שמלה מיוחדת לאירוע',
    uniqueValue: 'עיצוב אישי, בד מאיטליה, התאמה מושלמת לגוף',
    tone: 'inspiring',
    cta: 'כתבי בתגובות ״רוצה״ ונשלח קטלוג',
    useEmojis: true,
    extraDetails: 'קולקציית קיץ חדשה, הזמנה אונליין עם משלוח',
    tags: { businessName: 'Studio Bella', yearsActive: '15 שנים', speciality: 'שמלות ערב בהתאמה אישית', area: 'רמת גן' },
    contactWhatsapp: true, whatsappNum: '0549876543',
    sampleResult: `כל אישה מגיעה לרגע שהיא רוצה להרגיש הכי יפה בעולם ✨

ב-Studio Bella כל שמלה נתפרת במיוחד בשבילך.
בד איכותי מאיטליה, התאמה מושלמת, כי את לא ״מידה״, את יצירה 👗

🆕 קולקציית קיץ חדשה!
📍 רמת גן | 📦 הזמנה אונליין עם משלוח

כתבי ״רוצה״ בתגובות ונשלח קטלוג + מחירון 💕
📱 וואטסאפ: 0549876543`,
  },
  {
    title: '🐕 אילוף כלבים פרטי',
    postType: 'sell_service',
    topic: 'אילוף כלבים',
    productOrService: 'חבילת אילוף פרטי, 5 מפגשים בבית הלקוח, שיטה חיובית בלבד',
    audience: 'בעלי כלבים עם בעיות התנהגות',
    uniqueValue: 'מאלף מוסמך, 8 שנות ניסיון, תוצאות מהמפגש הראשון',
    tone: 'casual',
    cta: 'לשלוח וואטסאפ לפגישת היכרות חינם',
    useEmojis: true,
    extraDetails: 'פגישת היכרות ראשונה חינם, אזור המרכז והשרון',
    tags: { serviceName: 'אילוף פרטי בבית', price: 'החל מ-350₪', experience: '8 שנים', area: 'המרכז והשרון', freeConsult: true },
    contactWhatsapp: true, whatsappNum: '0527654321', contactPhone: true, phone: '0527654321',
    sampleResult: `הכלב שלכם קופץ על אורחים? מושך ברצועה? 🐶

✅ 5 מפגשים פרטיים אצלכם בבית
✅ 100% שיטה חיובית
✅ תוצאות מהמפגש הראשון

💰 החל מ-350₪ למפגש | 📍 מרכז והשרון
🎁 פגישת היכרות, חינם!

📱 וואטסאפ: 0527654321
📞 חייגו: 0527654321`,
  },
  {
    title: '🛍️ מוצר קוסמטיקה טבעית',
    postType: 'sell_product',
    topic: 'קוסמטיקה טבעית',
    productOrService: 'סרום היאלורוני אנטי-אייג׳ינג טבעי 100%, תוצרת ישראלית, 30 מ״ל',
    audience: 'נשים 30-55 שמחפשות טיפוח טבעי ואיכותי',
    uniqueValue: '100% טבעי, ללא ניסויים בבע״ח, תוצרת ישראלית, תוצאות תוך שבועיים',
    tone: 'inspiring',
    cta: 'להזמין בלינק בתגובה הראשונה',
    useEmojis: true,
    extraDetails: 'משלוח חינם מעל 150₪, מבצע 1+1 השבוע',
    tags: { productName: 'סרום Pure Glow', price: '189₪', discount: 'מבצע 1+1 השבוע!', shipping: 'חינם', stock: 'מוגבל' },
    contactEmail: true, email: 'orders@pureglow.co.il',
    sampleResult: `את יודעת מה ההבדל בין עור שנראה טוב לעור שזוהר? ✨

סרום Pure Glow, היאלורוני טהור, 100% טבעי 🇮🇱

🌿 רכיבים טבעיים בלבד | 🐰 ללא ניסויים
⏱️ תוצאות תוך שבועיים

💰 189₪ | 🔥 מבצע 1+1 השבוע בלבד!
🚚 משלוח חינם מעל 150₪
⚠️ מלאי מוגבל

הלינק בתגובה הראשונה 👇
📧 שאלות: orders@pureglow.co.il`,
  },
  {
    title: '🎉 ערב השקת מסעדה',
    postType: 'event',
    topic: 'מסעדנות',
    productOrService: 'ערב השקה למסעדה איטלקית "La Pasta", טעימות חינם, מוזיקה חיה, שף מאיטליה',
    audience: 'חובבי אוכל ותושבי רמת השרון',
    uniqueValue: 'שף איטלקי אמיתי, חומרי גלם מאיטליה, אווירה ייחודית',
    tone: 'casual',
    cta: 'לאשר הגעה בתגובות או בוואטסאפ',
    useEmojis: true,
    extraDetails: 'כניסה חופשית, מתנה לכל מגיע, מוזיקה עד חצות',
    tags: { eventName: 'ערב השקת La Pasta', date: '25.8.2026', time: '19:00', venue: 'רמת השרון, סוקולוב 42', price: 'כניסה חופשית!', registration: true },
    contactWhatsapp: true, whatsappNum: '0505559876',
    sampleResult: `🍝 רמת השרון, מסעדה איטלקית חדשה נפתחת!

La Pasta פותחת דלתות ואתם מוזמנים 🎉

🇮🇹 שף איטלקי | 🍕 טעימות חינם | 🎵 מוזיקה חיה
🎁 מתנה לכל מי שמגיע!

📅 25.8.2026 | 🕖 19:00
📍 סוקולוב 42, רמת השרון
🎟️ כניסה חופשית!

כתבו ״מגיע/ה״ בתגובות 👇
📱 וואטסאפ: 0505559876`,
  },
  {
    title: '🎯 ייעוץ עסקי, לידים',
    postType: 'lead_gen',
    topic: 'ייעוץ עסקי',
    productOrService: 'פגישת ייעוץ עסקי חינם 45 דק׳, ניתוח העסק, זיהוי חסמים, תוכנית פעולה',
    audience: 'בעלי עסקים קטנים שמרגישים תקועים',
    uniqueValue: '200+ עסקים, MBA מאוניברסיטת ת״א, שיטה מוכחת',
    tone: 'storytelling',
    cta: 'שלחו וואטסאפ עם המילה ״ייעוץ״',
    useEmojis: true,
    extraDetails: 'ללא התחייבות, אפשר גם בזום',
    tags: { offer: 'פגישת ייעוץ חינם 45 דק׳' },
    contactWhatsapp: true, whatsappNum: '0541112233', whatsappMsg: 'ייעוץ',
    sampleResult: `לפני שנה, רונית ניהלה עסק עיצוב פנים. עבדה 14 שעות ביום ובקושי שרדה 💔

היום? מרוויחה פי 3, עובדת 8 שעות, וצוות של 3 עובדים.

מה השתנה? פגישת ייעוץ אחת של 45 דקות ⚡

📊 200+ עסקים | 🎓 MBA מאוניברסיטת ת״א
🎁 פגישה ראשונה, חינם, ללא התחייבות
📍 פרונטלי או זום

📱 שלחו ״ייעוץ״ בוואטסאפ: 0541112233`,
  },
  {
    title: '⭐ סיפור הצלחה, דיאטנית',
    postType: 'testimonial',
    topic: 'תזונה וירידה במשקל',
    productOrService: 'קליניקה לתזונה, ירידה במשקל בשיטה מותאמת אישית ללא דיאטות קיצוניות',
    audience: 'אנשים שניסו דיאטות ולא הצליחו',
    uniqueValue: 'דיאטנית קלינית מוסמכת, שיטה מותאמת, 95% מגיעים ליעד',
    tone: 'storytelling',
    cta: 'כתבו ״רוצה פרטים״ בתגובות',
    useEmojis: true,
    extraDetails: 'פגישת היכרות ב-50₪ בלבד',
    tags: { clientName: 'שרה כ.', result: 'ירדה 18 ק״ג ב-4 חודשים' },
    contactWhatsapp: true, whatsappNum: '0508887766', contactPhone: true, phone: '03-6445566',
    sampleResult: `״ניסיתי כל דיאטה שקיימת. כלום לא עבד.״

ככה שרה כ. הרגישה לפני 4 חודשים 💭
היום? ירדה 18 ק״ג. בלי רעב. בלי ויתורים קיצוניים.

הסוד? תוכנית שנבנתה בדיוק בשבילה 🎯

📊 95% מגיעים ליעד | 🎓 דיאטנית קלינית מוסמכת
🎁 פגישת היכרות, רק 50₪

💬 כתבו ״רוצה פרטים״ בתגובות
📱 וואטסאפ: 0508887766 | 📞 03-6445566`,
  },
  {
    title: '💻 בניית אתרים',
    postType: 'sell_service',
    topic: 'פיתוח אתרים',
    productOrService: 'בניית אתר תדמית או חנות אונליין מותאמת אישית, כולל עיצוב, SEO והדרכה',
    audience: 'בעלי עסקים שצריכים אתר חדש או שדרוג',
    uniqueValue: '10 שנים, 300+ אתרים, עיצוב מותאם מובייל, תמיכה שוטפת',
    tone: 'professional',
    cta: 'שלחו הודעה להצעת מחיר חינם',
    useEmojis: true,
    extraDetails: '3 תשלומים ללא ריבית, מוכן תוך 14 יום',
    tags: { serviceName: 'בניית אתר מותאם', price: 'החל מ-3,500₪', experience: '10 שנים', area: 'שירות ארצי', freeConsult: true },
    contactWhatsapp: true, whatsappNum: '0523334455', contactEmail: true, email: 'info@webpro.co.il',
    sampleResult: `עדיין בלי אתר? או שהאתר שלכם נראה כמו 2015? 😬

✅ עיצוב מותאם, מושלם במובייל
✅ SEO בסיסי כלול
✅ הדרכה מלאה לניהול עצמאי

📊 10 שנים | 300+ אתרים
💰 החל מ-3,500₪ | 3 תשלומים
⏱️ מוכן תוך 14 יום

🎁 הצעת מחיר, חינם
📱 וואטסאפ: 0523334455
📧 info@webpro.co.il`,
  },
]

export default function GeneratePost() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAppData()
  const fromCreatePost = location.state?.fromCreatePost || false
  const fromTemplateForm = location.state?.fromTemplateForm || false
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [generatedPost, setGeneratedPost] = useState('')
  const [showExamples, setShowExamples] = useState(false)
  const [selectedExample, setSelectedExample] = useState(null)
  const [editing, setEditing] = useState(false)

  const [form, setForm] = useState({
    postType: '',
    otherType: '',
    topic: '',
    productOrService: '',
    audience: '',
    uniqueValue: '',
    tone: 'professional',
    cta: '',
    useEmojis: true,
    referencePost: '',
    extraDetails: '',
    tags: {},
    contactWhatsapp: false,
    contactPhone: false,
    contactEmail: false,
    whatsappNum: '',
    whatsappMsg: '',
    phone: '',
    email: '',
  })

  const updateField = (field, value) => {
    setForm(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'postType' && value !== prev.postType ? { tags: {} } : {}),
    }))
  }

  const updateTag = (key, value) => {
    setForm(prev => ({ ...prev, tags: { ...prev.tags, [key]: value } }))
  }

  const handleGenerate = async () => {
    setError('')
    setLoading(true)
    try {
      const { data } = await aiService.generatePost(form)
      setGeneratedPost(data.post)
      setStep(3)
    } catch {
      // Fallback demo mode when AI is not connected
      const demoPost = `✨ זהו פוסט לדוגמה (מצב דמו, הAI לא מחובר עדיין)\n\nתחום: ${form.topic}\nמה מפרסמים: ${form.productOrService}\nטון: ${form.tone}\n\n📌 כשהAPI יחובר, כאן יופיע פוסט אמיתי שנוצר על ידי AI.`
      setGeneratedPost(demoPost)
      setStep(3)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedPost)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleUseInPost = () => {
    if (fromTemplateForm) {
      const templateId = location.state?.templateId
      navigate(templateId ? `/templates/${templateId}/edit` : '/templates/new', {
        state: {
          generatedContent: generatedPost,
          templateDraft: location.state?.templateDraft || null,
        },
      })
      return
    }
    navigate('/create-post', {
      state: {
        generatedContent: generatedPost,
        createPostDraft: location.state?.createPostDraft || null,
      },
    })
  }

  const canGoStep2 = form.postType && form.topic && form.productOrService && (form.postType !== 'other' || form.otherType)

  const loadExample = (example) => {
    setForm({
      postType: example.postType,
      otherType: '',
      topic: example.topic,
      productOrService: example.productOrService,
      audience: example.audience,
      uniqueValue: example.uniqueValue,
      tone: example.tone,
      cta: example.cta,
      useEmojis: example.useEmojis,
      referencePost: '',
      extraDetails: example.extraDetails,
      tags: {},
      contactWhatsapp: false,
      contactPhone: false,
      contactEmail: false,
      whatsappNum: '',
      whatsappMsg: '',
      phone: '',
      email: '',
    })
    setShowExamples(false)
    setSelectedExample(null)
  }

  return (
    <div className="generate-post-page">
      <div className="generate-post-container">
        <div className="generate-post-header">
          <Sparkles size={28} />
          <h1>יצירת פוסט בעזרת AI</h1>
          <p className="header-tip">💡 ככל שתספרו יותר ותדייקו יותר, כך הפוסט ייצא טוב יותר!</p>
          <button className="examples-btn" onClick={() => setShowExamples(true)}>
            <Lightbulb size={16} />
            ראה דוגמאות
          </button>
        </div>

        {/* Examples Popup */}
        {showExamples && (
          <div className="examples-overlay" onClick={() => { setShowExamples(false); setSelectedExample(null) }}>
            <div className="examples-popup" onClick={e => e.stopPropagation()}>

              {!selectedExample ? (
                <>
                  <div className="examples-popup-header">
                    <h2>דוגמאות למילוי</h2>
                    <button className="examples-close" onClick={() => { setShowExamples(false); setSelectedExample(null) }}>
                      <X size={20} />
                    </button>
                  </div>
                  <p className="examples-subtitle">בחרו דוגמה שתוביל לכם להכיר את האפשרות</p>
                  <div className="examples-list">
                    {EXAMPLES.map((ex, i) => {
                      const emoji = ex.title.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)/u)?.[0] || '📝'
                      const titleText = ex.title.replace(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F)\s*/u, '')
                      return (
                        <button key={i} className="example-list-item" onClick={() => setSelectedExample(ex)}>
                          <div className="example-list-icon">{emoji}</div>
                          <div className="example-list-content">
                            <div className="example-list-title">{titleText}</div>
                            <div className="example-list-desc">{ex.productOrService.length > 60 ? ex.productOrService.substring(0, 60) + '...' : ex.productOrService}</div>
                          </div>
                          <ChevronLeft size={18} className="example-list-arrow" />
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <div className="example-detail">
                  <div className="examples-popup-header">
                    <h2>{selectedExample.title}</h2>
                    <button className="examples-close" onClick={() => { setShowExamples(false); setSelectedExample(null) }}>
                      <X size={20} />
                    </button>
                  </div>
                  <button className="example-back-btn" onClick={() => setSelectedExample(null)}>
                    <ChevronRight size={16} />
                    חזרה לרשימת הדוגמאות
                  </button>

                  <div className="example-fields-section">
                    <h3 className="example-section-title">פרטי הדוגמה</h3>
                    <div className="example-fields-grid">
                      <div className="example-field-row">
                        <span className="example-field-icon">📝</span>
                        <span className="example-field-label">סוג הפוסט</span>
                        <span className="example-field-value">{POST_TYPES.find(t => t.value === selectedExample.postType)?.label?.replace(/^\S+\s/, '')}</span>
                      </div>
                      <div className="example-field-row">
                        <span className="example-field-icon">🏷️</span>
                        <span className="example-field-label">תחום</span>
                        <span className="example-field-value">{selectedExample.topic}</span>
                      </div>
                      <div className="example-field-row">
                        <span className="example-field-icon">📦</span>
                        <span className="example-field-label">מה מפרסמים</span>
                        <span className="example-field-value">{selectedExample.productOrService}</span>
                      </div>
                      <div className="example-field-row">
                        <span className="example-field-icon">👥</span>
                        <span className="example-field-label">קהל יעד</span>
                        <span className="example-field-value">{selectedExample.audience}</span>
                      </div>
                      <div className="example-field-row">
                        <span className="example-field-icon">⭐</span>
                        <span className="example-field-label">יתרון ייחודי</span>
                        <span className="example-field-value">{selectedExample.uniqueValue}</span>
                      </div>
                      <div className="example-field-row">
                        <span className="example-field-icon">🎭</span>
                        <span className="example-field-label">טון</span>
                        <span className="example-field-value">{TONES.find(t => t.value === selectedExample.tone)?.label}</span>
                      </div>
                      <div className="example-field-row">
                        <span className="example-field-icon">📣</span>
                        <span className="example-field-label">קריאה לפעולה</span>
                        <span className="example-field-value">{selectedExample.cta}</span>
                      </div>
                      <div className="example-field-row">
                        <span className="example-field-icon">😊</span>
                        <span className="example-field-label">אימוג׳ים</span>
                        <span className="example-field-value">{selectedExample.useEmojis ? 'כן' : 'לא'}</span>
                      </div>
                      {selectedExample.extraDetails && (
                        <div className="example-field-row">
                          <span className="example-field-icon">📝</span>
                          <span className="example-field-label">פרטים נוספים</span>
                          <span className="example-field-value">{selectedExample.extraDetails}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="example-result-section">
                    <h3 className="example-section-title">תוצאת AI</h3>
                    <div className="example-result-box">
                      <pre className="result-text">{selectedExample.sampleResult}</pre>
                    </div>
                  </div>

                  <button className="generate-btn primary example-fill-btn" onClick={() => loadExample(selectedExample)}>
                    ✏️ מלא דומה
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Progress Steps - Clickable */}
        <div className="generate-steps">
          <button
            className={`generate-step clickable ${step >= 1 ? 'active' : ''} ${step === 1 ? 'current' : ''}`}
            onClick={() => setStep(1)}
          >
            <span className="step-num">1</span>
            <span className="step-label">פרטי הפוסט</span>
          </button>
          <div className="step-line" />
          <button
            className={`generate-step clickable ${step >= 2 ? 'active' : ''} ${step === 2 ? 'current' : ''}`}
            onClick={() => { if (canGoStep2) setStep(2) }}
            disabled={!canGoStep2}
          >
            <span className="step-num">2</span>
            <span className="step-label">סגנון וטון</span>
          </button>
          <div className="step-line" />
          <button
            className={`generate-step clickable ${step >= 3 ? 'active' : ''} ${step === 3 ? 'current' : ''}`}
            disabled={!generatedPost}
            onClick={() => { if (generatedPost) setStep(3) }}
          >
            <span className="step-num">3</span>
            <span className="step-label">התוצאה</span>
          </button>
        </div>

        {error && <div className="generate-error">{error}</div>}

        {/* Step 1: What are you promoting? */}
        {step === 1 && (
          <div className="generate-form">
            <div className="form-group">
              <label>מה סוג הפוסט? *</label>
              <div className="post-type-grid">
                {POST_TYPES.map(t => (
                  <button
                    key={t.value}
                    className={`post-type-btn ${form.postType === t.value ? 'selected' : ''}`}
                    onClick={() => updateField('postType', t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {form.postType === 'other' && (
                <input
                  type="text"
                  className="other-type-input"
                  placeholder="פרט מה סוג הפוסט שלך..."
                  value={form.otherType}
                  onChange={e => updateField('otherType', e.target.value)}
                />
              )}
            </div>

            {/* Dynamic tags per post type */}
            {TYPE_TAGS[form.postType] && (
              <div className="form-group">
                <label>פרטים נוספים לסוג הפוסט (אופציונלי)</label>
                <div className="type-tags-grid">
                  {TYPE_TAGS[form.postType].map(tag => (
                    <div key={tag.key} className="type-tag-item">
                      <span className="type-tag-label">{tag.label}</span>
                      {tag.toggle ? (
                        <div className="toggle-row mini">
                          <button
                            className={`toggle-btn mini ${form.tags[tag.key] === true ? 'selected' : ''}`}
                            onClick={() => updateTag(tag.key, form.tags[tag.key] === true ? undefined : true)}
                          >
                            ✓ יש
                          </button>
                        </div>
                      ) : tag.options ? (
                        <div className="toggle-row mini">
                          {tag.options.map(opt => (
                            <button
                              key={opt}
                              className={`toggle-btn mini ${form.tags[tag.key] === opt ? 'selected' : ''}`}
                              onClick={() => updateTag(tag.key, form.tags[tag.key] === opt ? undefined : opt)}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          type="text"
                          className="type-tag-input"
                          placeholder={tag.placeholder}
                          value={form.tags[tag.key] || ''}
                          onChange={e => updateTag(tag.key, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group">
              <label>באיזה תחום/נישה? *</label>
              <input
                type="text"
                placeholder="לדוגמה: עיצוב אופנה, נדל״ן, קואצ'ינג, מסעדה איטלקית..."
                value={form.topic}
                onChange={e => updateField('topic', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>מה בדיוק אתה מפרסם/מקדם? *</label>
              <textarea
                placeholder="לדוגמה: שמלות ערב בהתאמה אישית, דירת 3 חד׳ בתל אביב, קורס שיווק דיגיטלי למתחילים..."
                value={form.productOrService}
                onChange={e => updateField('productOrService', e.target.value)}
                rows={2}
              />
            </div>

            <div className="form-group">
              <label>למי הפוסט מכוון? (קהל יעד)</label>
              <input
                type="text"
                placeholder="לדוגמה: נשים 25-40, בעלי עסקים קטנים, זוגות צעירים שמחפשים דירה..."
                value={form.audience}
                onChange={e => updateField('audience', e.target.value)}
              />
            </div>

            <button
              className="generate-btn primary centered-btn"
              onClick={() => setStep(2)}
              disabled={!canGoStep2}
            >
              המשך
              <ArrowLeft size={18} />
            </button>
          </div>
        )}

        {/* Step 2: Style & Tone */}
        {step === 2 && (
          <div className="generate-form">
            <div className="form-group">
              <label>מה הייחוד / יתרון שלך?</label>
              <input
                type="text"
                placeholder="לדוגמה: 10 שנות ניסיון, מחיר הכי זול בשוק, 500 לקוחות מרוצים..."
                value={form.uniqueValue}
                onChange={e => updateField('uniqueValue', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>באיזה טון לכתוב?</label>
              <div className="tone-options">
                {TONES.map(t => (
                  <button
                    key={t.value}
                    className={`tone-btn ${form.tone === t.value ? 'selected' : ''}`}
                    onClick={() => updateField('tone', t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>מה אתה רוצה שהקורא יעשה? (CTA)</label>
              <input
                type="text"
                placeholder="לדוגמה: לשלוח הודעה, להתקשר, להירשם ללינק, לכתוב בתגובות..."
                value={form.cta}
                onChange={e => updateField('cta', e.target.value)}
              />
            </div>

            {/* Contact Methods */}
            <div className="form-group">
              <label>דרכי יצירת קשר (אופציונלי)</label>
              <p className="field-hint">בחר דרכים ליצירת קשר שיופיעו בפוסט</p>
              <div className="contact-methods">
                <button
                  className={`contact-method-btn ${form.contactWhatsapp ? 'selected' : ''}`}
                  onClick={() => {
                    if (!form.contactWhatsapp && user?.whatsappNumber) {
                      updateField('contactWhatsapp', true)
                      setForm(prev => ({
                        ...prev,
                        contactWhatsapp: true,
                        whatsappNum: prev.whatsappNum || user.whatsappNumber,
                        whatsappMsg: prev.whatsappMsg || user.whatsappMessage || '',
                      }))
                    } else {
                      updateField('contactWhatsapp', !form.contactWhatsapp)
                    }
                  }}
                >
                  📱 וואטסאפ
                </button>
                <button
                  className={`contact-method-btn ${form.contactPhone ? 'selected' : ''}`}
                  onClick={() => updateField('contactPhone', !form.contactPhone)}
                >
                  📞 טלפון
                </button>
                <button
                  className={`contact-method-btn ${form.contactEmail ? 'selected' : ''}`}
                  onClick={() => updateField('contactEmail', !form.contactEmail)}
                >
                  📧 אימייל
                </button>
              </div>

              {form.contactWhatsapp && (
                <div className="contact-detail">
                  {!form.whatsappNum && !user?.whatsappNumber ? (
                    <div className="contact-missing-hint">⚠️ לא קישרת מספר וואטסאפ עדיין</div>
                  ) : null}
                  <div className="contact-input-row">
                    <span className="contact-input-label">מספר:</span>
                    <input
                      type="tel"
                      dir="ltr"
                      placeholder="972501234567"
                      value={form.whatsappNum}
                      onChange={e => updateField('whatsappNum', e.target.value)}
                    />
                  </div>
                  <div className="contact-input-row">
                    <span className="contact-input-label">הודעה:</span>
                    <input
                      type="text"
                      placeholder="הודעה ראשונית (אופציונלי)"
                      value={form.whatsappMsg}
                      onChange={e => updateField('whatsappMsg', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {form.contactPhone && (
                <div className="contact-detail">
                  <div className="contact-input-row">
                    <span className="contact-input-label">מספר:</span>
                    <input
                      type="tel"
                      dir="ltr"
                      placeholder="050-1234567"
                      value={form.phone}
                      onChange={e => updateField('phone', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {form.contactEmail && (
                <div className="contact-detail">
                  <div className="contact-input-row">
                    <span className="contact-input-label">אימייל:</span>
                    <input
                      type="email"
                      dir="ltr"
                      placeholder="example@mail.com"
                      value={form.email}
                      onChange={e => updateField('email', e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>להוסיף אימוג׳ים?</label>
              <div className="toggle-row">
                <button
                  className={`toggle-btn ${form.useEmojis ? 'selected' : ''}`}
                  onClick={() => updateField('useEmojis', true)}
                >
                  כן 😊
                </button>
                <button
                  className={`toggle-btn ${!form.useEmojis ? 'selected' : ''}`}
                  onClick={() => updateField('useEmojis', false)}
                >
                  לא, בלי
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>פרטים נוספים / הערות</label>
              <textarea
                placeholder="כל דבר נוסף שחשוב לציין: מבצע, תאריך, מספר טלפון, לינק, מחיר..."
                value={form.extraDetails}
                onChange={e => updateField('extraDetails', e.target.value)}
                rows={2}
              />
            </div>

            <div className="form-group">
              <label>יש לך פוסט לדוגמה? (אופציונלי)</label>
              <p className="field-hint">הדבק פוסט דומה שאהבת והAI ייצר משהו בסגנון דומה</p>
              <textarea
                placeholder="הדבק כאן תוכן של פוסט שאהבת את הסגנון שלו..."
                value={form.referencePost}
                onChange={e => updateField('referencePost', e.target.value)}
                rows={4}
              />
            </div>

            <div className="generate-actions">
              <button className="generate-btn secondary" onClick={() => setStep(1)}>
                חזרה
              </button>
              <button
                className="generate-btn primary"
                onClick={handleGenerate}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <RefreshCw size={18} className="spinning" />
                    יוצר פוסט...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    צור פוסט
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === 3 && (
          <div className="generate-result">
            <div className="result-box">
              {editing ? (
                <textarea
                  className="result-edit-textarea"
                  value={generatedPost}
                  onChange={e => setGeneratedPost(e.target.value)}
                  rows={10}
                  autoFocus
                />
              ) : (
                <pre className="result-text">{generatedPost}</pre>
              )}
            </div>

            <div className="result-actions">
              <button className="generate-btn icon-btn" onClick={handleCopy}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? 'הועתק!' : 'העתק'}
              </button>
              <button
                className={`generate-btn icon-btn ${editing ? 'selected' : ''}`}
                onClick={() => setEditing(!editing)}
              >
                <Pencil size={18} />
                {editing ? 'סיום עריכה' : 'עריכה'}
              </button>
              <button className="generate-btn primary" onClick={handleUseInPost}>
                <SquarePen size={18} />
                {fromTemplateForm ? 'חזרה לטמפלייט עם התוכן' : fromCreatePost ? 'חזרה לפוסט עם התוכן' : 'עבור לפרסום פוסט'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
