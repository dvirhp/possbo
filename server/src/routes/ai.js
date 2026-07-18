import express from "express";
import { createLogger } from "../utils/logger.js";

const router = express.Router();
const log = createLogger("ai");

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// Middleware: require authenticated user
router.use((req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "נדרשת התחברות" });
  }
  next();
});

router.post("/generate-post", async (req, res) => {
  try {
    const { postType, otherType, topic, productOrService, audience, uniqueValue, tone, cta, useEmojis, referencePost, extraDetails, tags, contactWhatsapp, contactPhone, contactEmail, whatsappNum, whatsappMsg, phone, email } = req.body;

    if (!postType || !topic || !productOrService) {
      return res.status(400).json({ error: "נא למלא לפחות סוג פוסט, תחום ומה מפרסמים" });
    }

    if (postType === 'other' && !otherType) {
      return res.status(400).json({ error: "נא לפרט מה סוג הפוסט" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      log.error("GEMINI_API_KEY not configured");
      return res.status(500).json({ error: "שירות AI לא מוגדר" });
    }

    const systemPrompt = buildPrompt({ postType, otherType, topic, productOrService, audience, uniqueValue, tone, cta, useEmojis, referencePost, extraDetails, tags, contactWhatsapp, contactPhone, contactEmail, whatsappNum, whatsappMsg, phone, email });

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      const errData = await response.text();
      log.error("Gemini API error:", errData);
      return res.status(502).json({ error: "שגיאה בשירות AI" });
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      return res.status(502).json({ error: "לא התקבלה תשובה מהAI" });
    }

    res.json({ post: generatedText });
  } catch (err) {
    log.error("AI generate error:", err.message);
    res.status(500).json({ error: "שגיאה פנימית" });
  }
});

function buildPrompt({ postType, otherType, topic, productOrService, audience, uniqueValue, tone, cta, useEmojis, referencePost, extraDetails, tags, contactWhatsapp, contactPhone, contactEmail, whatsappNum, whatsappMsg, phone, email }) {
  const toneMap = {
    professional: "מקצועי, רשמי ואמין",
    casual: "קליל, ידידותי ונגיש",
    humorous: "הומוריסטי, מצחיק וקליל",
    inspiring: "מעורר השראה ומוטיבציה",
    urgent: "דחוף, יוצר FOMO וקורא לפעולה מיידית",
    storytelling: "סיפורי, אישי ומרגש",
  };

  const postTypeMap = {
    sell_product: "מכירת מוצר",
    sell_service: "קידום ושיווק שירות",
    sell_course: "מכירת קורס או סדנה",
    real_estate: "פרסום נכס נדל״ן",
    brand_awareness: "חשיפה ומיתוג של עסק",
    engagement: "יצירת מעורבות ושיח",
    lead_gen: "איסוף לידים ופניות",
    event: "קידום אירוע או השקה",
    testimonial: "שיתוף המלצה או סיפור הצלחה",
    other: "פוסט כללי",
  };

  const toneText = toneMap[tone] || tone || "מקצועי";
  const typeText = postType === 'other' ? otherType : (postTypeMap[postType] || postType);

  let prompt = `אתה קופירייטר מומחה עם 10 שנות ניסיון בכתיבת פוסטים לפייסבוק בעברית שמביאים תוצאות מוכחות.
אתה מתמחה בתחום: ${topic}.

צור פוסט אחד לפייסבוק בעברית שמטרתו: ${typeText}.

📋 פרטי הפוסט:
- מה מפרסמים: ${productOrService}
- תחום: ${topic}
- סוג: ${typeText}
- טון כתיבה: ${toneText}`;

  if (audience) {
    prompt += `\n- קהל יעד: ${audience}`;
  }

  if (uniqueValue) {
    prompt += `\n- יתרון ייחודי / USP: ${uniqueValue}`;
  }

  if (cta) {
    prompt += `\n- קריאה לפעולה (CTA): ${cta}`;
  }

  if (extraDetails) {
    prompt += `\n- פרטים נוספים: ${extraDetails}`;
  }

  // Add dynamic tags
  if (tags && typeof tags === 'object') {
    const filledTags = Object.entries(tags).filter(([, v]) => v !== undefined && v !== '');
    if (filledTags.length > 0) {
      prompt += `\n\n📌 פרטים ספציפיים שחשוב לכלול בפוסט:`;
      for (const [key, val] of filledTags) {
        const displayVal = val === true ? 'כן' : val;
        prompt += `\n- ${key}: ${displayVal}`;
      }
    }
  }

  // Add contact information
  const contactParts = [];
  if (contactWhatsapp && whatsappNum) {
    contactParts.push(`וואטסאפ: ${whatsappNum}${whatsappMsg ? ` (הודעה: "${whatsappMsg}")` : ''}`);
  }
  if (contactPhone && phone) {
    contactParts.push(`טלפון: ${phone}`);
  }
  if (contactEmail && email) {
    contactParts.push(`אימייל: ${email}`);
  }
  if (contactParts.length > 0) {
    prompt += `\n\n📞 פרטי יצירת קשר שחייבים להופיע בסוף הפוסט:\n${contactParts.join('\n')}`;
  }

  if (referencePost) {
    prompt += `\n\n📋 פוסט להשראה (כתוב בסגנון דומה אבל עם התוכן שלי למעלה):\n${referencePost}`;
  }

  prompt += `

📐 הנחיות כתיבה:
- כתוב רק את הפוסט עצמו, בלי הקדמות או הסברים
- ${useEmojis ? "השתמש באימוג׳ים בצורה מאוזנת ורלוונטית לתוכן" : "אל תשתמש באימוג׳ים בכלל"}
- פתח עם משפט הוק (hook) שתופס תשומת לב מיד
- בנה את הפוסט בצורה שזורמת: hook → גוף הפוסט → CTA
- ${cta ? `סיים עם קריאה לפעולה ברורה: ${cta}` : "סיים עם קריאה לפעולה ברורה"}
- אורך: 4-10 שורות (לא יותר מדי ארוך, לא קצר מדי)
- כתוב בגובה העיניים, לא "מלמעלה"
- אם רלוונטי, השתמש ברווחים ושורות ריקות לקריאות`;

  return prompt;
}

export default router;
