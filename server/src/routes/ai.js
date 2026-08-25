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
  const startedAt = Date.now();
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
      log.error("GEMINI_API_KEY not configured", { event: "ai_configuration_error", userId: req.user.id, requestId: req.requestId });
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
      log.error("Gemini API request failed", new Error(errData), { event: "ai_generation_failed", userId: req.user.id, requestId: req.requestId, statusCode: response.status, durationMs: Date.now() - startedAt, model: "gemini-2.0-flash" });
      return res.status(502).json({ error: "שגיאה בשירות AI" });
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      log.warn("AI response did not contain generated text", { event: "ai_empty_response", userId: req.user.id, requestId: req.requestId, durationMs: Date.now() - startedAt, model: "gemini-2.0-flash" });
      return res.status(502).json({ error: "לא התקבלה תשובה מהAI" });
    }

    log.info("AI post generated", { event: "ai_generation_completed", userId: req.user.id, requestId: req.requestId, durationMs: Date.now() - startedAt, model: "gemini-2.0-flash", promptTokens: data.usageMetadata?.promptTokenCount || 0, completionTokens: data.usageMetadata?.candidatesTokenCount || 0, totalTokens: data.usageMetadata?.totalTokenCount || 0, postType });
    res.json({ post: generatedText });
  } catch (err) {
    log.error("AI generation crashed", err, { event: "ai_generation_failed", userId: req.user?.id, requestId: req.requestId, durationMs: Date.now() - startedAt, model: "gemini-2.0-flash" });
    res.status(500).json({ error: "שגיאה פנימית" });
  }
});

const TRANSFORM_OPERATIONS = {
  rewrite: "שכתב את הטקסט כך שיהיה ברור, זורם ומשכנע יותר, בלי לשנות עובדות או פרטי קשר",
  shorten: "קצר את הטקסט בכ-40% תוך שמירה על המסר, העובדות והקריאה לפעולה",
  tone: "שכתב את הטקסט בטון המבוקש תוך שמירה על העובדות, הקישורים ופרטי הקשר",
  repurpose: "התאם את הפוסט לפלטפורמת היעד, כולל מבנה, אורך וסגנון מתאימים",
};

router.post("/transform-post", async (req, res) => {
  const startedAt = Date.now();
  try {
    const text = String(req.body?.text || "").trim();
    const operation = String(req.body?.operation || "");
    const tone = String(req.body?.tone || "professional").slice(0, 50);
    const platform = String(req.body?.platform || "facebook").slice(0, 30);
    if (!text) return res.status(400).json({ error: "יש להזין טקסט לעיבוד" });
    if (text.length > 12000) return res.status(413).json({ error: "הטקסט ארוך מדי לעיבוד AI" });
    if (!TRANSFORM_OPERATIONS[operation]) return res.status(400).json({ error: "פעולת AI אינה נתמכת" });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "שירות AI לא מוגדר" });

    const prompt = `אתה עורך תוכן מקצועי בעברית. ${TRANSFORM_OPERATIONS[operation]}.
טון מבוקש: ${tone}.
פלטפורמת יעד: ${platform}.
החזר רק את הטקסט המעובד, ללא הסבר, כותרת או מירכאות.
אין להמציא מחירים, הבטחות, נתונים, קישורים או פרטי קשר חדשים.

<source_text>
${text}
</source_text>`;
    const response = await fetch(`${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: operation === "shorten" ? 0.35 : 0.65, maxOutputTokens: 1536 },
      }),
    });
    if (!response.ok) {
      log.warn("AI transformation provider error", { event: "ai_transform_failed", userId: req.user.id, operation, statusCode: response.status });
      return res.status(502).json({ error: "שגיאה בשירות AI" });
    }
    const data = await response.json();
    const transformedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!transformedText) return res.status(502).json({ error: "לא התקבלה תשובה מה-AI" });
    log.info("AI post transformed", { event: "ai_transform_completed", userId: req.user.id, operation, platform, durationMs: Date.now() - startedAt });
    return res.json({ post: transformedText, operation, platform });
  } catch (error) {
    log.error("AI transformation crashed", error, { event: "ai_transform_failed", userId: req.user?.id, durationMs: Date.now() - startedAt });
    return res.status(500).json({ error: "שגיאה פנימית" });
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
