import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createLogger } from "./logger.js";

const log = createLogger("mailer");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const emailLogo = fs.readFileSync(
  path.join(__dirname, "..", "assets", "logo-email-white.png"),
);
const EMAIL_LOGO_CID = "possbo-logo";

function emailAttachments() {
  return [
    {
      filename: "possbo-logo.png",
      content: emailLogo,
      cid: EMAIL_LOGO_CID,
      contentType: "image/png",
      contentDisposition: "inline",
    },
  ];
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Build an HTML email wrapper that adapts to the user's light/dark mode preference.
 * Light mode: white card on light gray bg, dark text.
 * Dark mode: dark card on near-black bg, light text.
 */
function buildEmailHtml({ title, bodyContent }) {
  const clientUrl = (process.env.CLIENT_URL || "https://possbo.com").replace(/\/+$/, "");
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.SMTP_USER || "";
  return `<!DOCTYPE html>
<html lang="he" dir="rtl" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Segoe UI', Arial, sans-serif; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-spacing: 0; border-collapse: collapse; }
    img { border: 0; display: block; }
    .email-outer { background-color: #f4f6f9; }
    .email-card { background-color: #ffffff; }
    .email-header { background-color: #0a0a0f; }
    .email-title { color: #1a1a2e; }
    .email-text { color: #4b5563; }
    .email-muted { color: #6b7280; }
    .email-code-box { background-color: #f5f5f5; border-color: #e0e0e0; }
    .email-code { color: #1a1a2e; }
    .email-footer-border { border-top-color: #eef0f4; }
    .email-footer-text { color: #9ca3af; }
    .email-footer-sub { color: #c0c7d1; }

    @media (prefers-color-scheme: dark) {
      .email-outer { background-color: #0a0a0f !important; }
      .email-card { background-color: #1a1a2e !important; }
      .email-header { background-color: #ffffff !important; }
      .email-logo { filter: invert(1) !important; }
      .email-title { color: #f0f0f5 !important; }
      .email-text { color: #d1d5db !important; }
      .email-muted { color: #9ca3af !important; }
      .email-code-box { background-color: #1f1f2e !important; border-color: #3b3b4a !important; }
      .email-code { color: #ffffff !important; }
      .email-footer-border { border-top-color: #2d2d4a !important; }
      .email-footer-text { color: #6b7280 !important; }
      .email-footer-sub { color: #4b5563 !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; direction: rtl;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-outer" style="background-color: #f4f6f9;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" class="email-card" style="max-width: 480px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header with Logo -->
          <tr>
            <td class="email-header" style="background-color: #0c0c10; padding: 24px 32px; text-align: center;">
              <img class="email-logo" src="cid:${EMAIL_LOGO_CID}" alt="Possbo" width="80" height="80" style="display:block; margin:0 auto; width:80px; height:80px;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px 28px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="email-footer-border" style="padding: 20px 28px; border-top: 1px solid #eef0f4; text-align: center;">
              <p class="email-footer-text" style="margin: 0; font-size: 12px; color: #9ca3af;">© ${new Date().getFullYear()} Possbo. כל הזכויות שמורות.</p>
              <p class="email-footer-sub" style="margin: 6px 0 0; font-size: 11px; line-height: 1.6; color: #c0c7d1;">זוהי הודעת שירות ואבטחה שנשלחה בעקבות פעולה בחשבון. אם לא ביקשת אותה, אפשר להתעלם ואין למסור את הקוד לאיש.</p>
              <p class="email-footer-sub" style="margin: 8px 0 0; font-size: 11px; color: #c0c7d1;">
                <a href="${clientUrl}/privacy" style="color: #8b93a1; text-decoration: underline;">מדיניות פרטיות</a>
                ${supportEmail ? `&nbsp;·&nbsp;<a href="mailto:${escapeHtml(supportEmail)}" style="color: #8b93a1; text-decoration: underline;">יצירת קשר</a>` : ""}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildEmailCodeBlock(code) {
  const safeCode = escapeHtml(code);
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <div class="email-code-box" title="לחץ לסימון הקוד" style="background-color: #f5f5f5; border: 2px solid #e0e0e0; border-radius: 12px; padding: 20px 32px; display: inline-block; cursor: text; user-select: all; -webkit-user-select: all;">
            <span class="email-code" dir="ltr" style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1a1a2e; font-family: 'Courier New', monospace; white-space: nowrap; user-select: all; -webkit-user-select: all;">${safeCode}</span>
          </div>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top: 10px;">
          <span class="email-muted" style="font-size: 11px; color: #6b7280;">לחץ על הקוד כדי לסמן ולהעתיק</span>
        </td>
      </tr>
    </table>`;
}

function buildExpiryNotice(extraText = "") {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" dir="rtl" style="margin: 0 auto;">
            <tr>
              <td class="email-muted" style="font-size: 13px; color: #6b7280; text-align: center; vertical-align: middle;">הקוד תקף ל-10 דקות בלבד${extraText}</td>
              <td width="8" aria-hidden="true"></td>
              <td aria-hidden="true" style="font-size: 15px; line-height: 20px; text-align: center; vertical-align: middle;">⏱️</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

/**
 * Send a verification code email
 */
export async function sendVerificationEmail(to, code) {
  const bodyContent = `
    <h2 class="email-title" style="margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #1a1a2e; text-align: center;">קוד האימות שלך</h2>
    <p class="email-muted" style="margin: 0 0 24px; font-size: 14px; color: #6b7280; text-align: center;">הזן את הקוד הבא כדי לאמת את חשבונך</p>
    ${buildEmailCodeBlock(code)}
    ${buildExpiryNotice()}
  `;

  const html = buildEmailHtml({ title: "קוד אימות - Possbo", bodyContent });
  const text = `קוד האימות שלך ב-Possbo: ${code}\nהקוד תקף ל-10 דקות.`;

  try {
    await transporter.sendMail({
      from: `"Possbo" <${process.env.SMTP_USER}>`,
      to,
      subject: `${code} - קוד אימות Possbo`,
      html,
      text,
      headers: { "X-Priority": "1" },
      attachments: emailAttachments(),
    });
    log.info("Verification email sent", { to });
    return true;
  } catch (error) {
    log.error("Failed to send email", error);
    return false;
  }
}

/**
 * Send a password reset verification code
 */
export async function sendPasswordResetEmail(to, code) {
  const bodyContent = `
    <h2 class="email-title" style="margin: 0 0 8px; font-size: 20px; font-weight: 700; color: #1a1a2e; text-align: center;">שינוי סיסמה</h2>
    <p class="email-muted" style="margin: 0 0 24px; font-size: 14px; color: #6b7280; text-align: center;">הזן את הקוד הבא כדי לאפס את הסיסמה שלך</p>
    ${buildEmailCodeBlock(code)}
    ${buildExpiryNotice(" — אם לא ביקשת שינוי סיסמה, אפשר להתעלם מהמייל")}
  `;

  const html = buildEmailHtml({ title: "שינוי סיסמה - Possbo", bodyContent });
  const text = `קוד לשינוי סיסמה ב-Possbo: ${code}\nהקוד תקף ל-10 דקות. אם לא ביקשת — התעלם.`;

  try {
    await transporter.sendMail({
      from: `"Possbo" <${process.env.SMTP_USER}>`,
      to,
      subject: `${code} - שינוי סיסמה Possbo`,
      html,
      text,
      headers: { "X-Priority": "1" },
      attachments: emailAttachments(),
    });
    log.info("Password reset email sent", { to });
    return true;
  } catch (error) {
    log.error("Failed to send password reset email", error);
    return false;
  }
}

/**
 * Notify a customer that Instagram publishing cannot continue until OAuth is
 * connected again. The caller is responsible for deduplicating these emails.
 */
export async function sendInstagramReconnectEmail(to, name = "") {
  if (!to) {
    log.warn("Instagram reconnect email skipped: user has no email");
    return false;
  }

  const safeName = escapeHtml(name || "שלום");
  const clientUrl = process.env.CLIENT_URL || "http://localhost:4200";
  const reconnectUrl = `${clientUrl.replace(/\/$/, "")}/dashboard?tab=account`;
  const bodyContent = `
    <h2 class="email-title" style="margin:0 0 12px;font-size:20px;font-weight:700;color:#1a1a2e;text-align:center;">נדרש חיבור מחדש ל־Instagram</h2>
    <p class="email-text" style="margin:0 0 16px;font-size:14px;color:#4b5563;line-height:1.8;">${safeName}, לא הצלחנו לפרסם את הקמפיין שלך ב־Instagram מפני שהחיבור לחשבון אינו תקף.</p>
    <p class="email-text" style="margin:0 0 22px;font-size:14px;color:#4b5563;line-height:1.8;">כדי להמשיך לפרסם פוסטים, סטוריז ורילס, יש להיכנס להגדרות Possbo ולחבר את חשבון Instagram מחדש.</p>
    <table role="presentation" width="100%"><tr><td align="center">
      <a href="${reconnectUrl}" style="display:inline-block;padding:12px 24px;border-radius:10px;background:#e1306c;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">חיבור Instagram מחדש</a>
    </td></tr></table>
    <p class="email-muted" style="margin:22px 0 0;font-size:12px;color:#6b7280;text-align:center;">הקמפיין לא סומן כהצלחה ב־Instagram.</p>
  `;
  const html = buildEmailHtml({
    title: "נדרש חיבור מחדש ל־Instagram - Possbo",
    bodyContent,
  });

  try {
    await transporter.sendMail({
      from: `"Possbo" <${process.env.SMTP_USER}>`,
      to,
      subject: "נדרש חיבור מחדש ל־Instagram",
      html,
      text: `${name ? `${name}, ` : ""}לא הצלחנו לפרסם את הקמפיין שלך ב־Instagram. יש לחבר את החשבון מחדש דרך הגדרות Possbo: ${reconnectUrl}`,
      attachments: emailAttachments(),
    });
    log.info("Instagram reconnect email sent", { to });
    return true;
  } catch (error) {
    log.error("Failed to send Instagram reconnect email", error, { to });
    return false;
  }
}

/**
 * Send a publication lifecycle email (scheduled, succeeded or failed).
 */
export async function sendPublicationNotificationEmail({
  to,
  name = "",
  event,
  postTitle = "",
  platform = "",
  target = "",
  scheduledAt = null,
  errorMessage = "",
}) {
  if (!to) {
    log.warn("Publication notification email skipped: user has no email", { event });
    return false;
  }

  const config = {
    success: {
      subject: "הפרסום הושלם בהצלחה",
      title: "הפרסום שלך עלה בהצלחה",
      color: "#16a34a",
      intro: "הפרסום הסתיים בהצלחה וזמין כעת ביעד שבחרת.",
    },
    failure: {
      subject: "הפרסום לא הושלם",
      title: "נדרשת בדיקה בפרסום",
      color: "#dc2626",
      intro: "לא הצלחנו להשלים את הפרסום. אפשר לבדוק את הפרטים ולנסות שוב מתוך Possbo.",
    },
    schedule: {
      subject: "הקמפיין תוזמן בהצלחה",
      title: "הקמפיין נוסף ליומן",
      color: "#5b5ce2",
      intro: "התזמון נשמר והמערכת תנסה לפרסם אותו באופן אוטומטי במועד שנבחר.",
    },
  }[event];
  if (!config) return false;

  const clientUrl = (process.env.CLIENT_URL || "http://localhost:4200").replace(/\/$/, "");
  const safeName = escapeHtml(name || "שלום");
  const safeTitle = escapeHtml(postTitle || "קמפיין ללא שם");
  const safePlatform = escapeHtml(platform || "הערוצים שנבחרו");
  const safeTarget = escapeHtml(target || "");
  const safeError = escapeHtml(errorMessage || "");
  const scheduleLabel = scheduledAt
    ? new Date(scheduledAt).toLocaleString("he-IL", { dateStyle: "medium", timeStyle: "short" })
    : "";

  const details = [
    ["קמפיין", safeTitle],
    platform ? ["פלטפורמה", safePlatform] : null,
    target ? ["יעד", safeTarget] : null,
    scheduleLabel ? ["מועד", escapeHtml(scheduleLabel)] : null,
    event === "failure" && safeError ? ["סיבה", safeError] : null,
  ].filter(Boolean);

  const bodyContent = `
    <h2 class="email-title" style="margin:0 0 10px;font-size:20px;font-weight:700;color:#1a1a2e;text-align:center;">${config.title}</h2>
    <p class="email-text" style="margin:0 0 20px;font-size:14px;color:#4b5563;line-height:1.8;text-align:center;">${safeName}, ${config.intro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      ${details.map(([label, value]) => `<tr><td style="padding:9px 12px;color:#6b7280;font-size:12px;border-bottom:1px solid #eef0f4;">${label}</td><td style="padding:9px 12px;color:#1a1a2e;font-size:13px;font-weight:600;border-bottom:1px solid #eef0f4;">${value}</td></tr>`).join("")}
    </table>
    <table role="presentation" width="100%" style="margin-top:22px;"><tr><td align="center">
      <a href="${clientUrl}/dashboard?tab=campaigns" style="display:inline-block;padding:11px 22px;border-radius:10px;background:${config.color};color:#fff;text-decoration:none;font-size:13px;font-weight:700;">לצפייה בקמפיינים</a>
    </td></tr></table>
  `;

  try {
    await transporter.sendMail({
      from: `"Possbo" <${process.env.SMTP_USER}>`,
      to,
      subject: `${config.subject} - Possbo`,
      html: buildEmailHtml({ title: `${config.subject} - Possbo`, bodyContent }),
      text: `${config.subject}\nקמפיין: ${postTitle || "ללא שם"}${platform ? `\nפלטפורמה: ${platform}` : ""}${target ? `\nיעד: ${target}` : ""}${scheduleLabel ? `\nמועד: ${scheduleLabel}` : ""}${errorMessage ? `\nסיבה: ${errorMessage}` : ""}\n${clientUrl}/dashboard?tab=campaigns`,
      attachments: emailAttachments(),
    });
    log.info("Publication notification email sent", { to, event });
    return true;
  } catch (error) {
    log.error("Failed to send publication notification email", error, { to, event });
    return false;
  }
}

/**
 * Generate a 6-digit verification code
 */
export function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send feedback email to the site admin
 */
export async function sendFeedbackEmail({
  userName,
  userEmail,
  features,
  answers,
  prompt,
}) {
  const questionLabels = {
    favorite: "מה הכי אהבת?",
    leastFavorite: "מה הכי פחות אהבת?",
    searchFeedback: "מה דעתך על החיפוש?",
    jobScreenFeedback: "מסך משרה – מה היית רוצה לשנות או לשפר?",
    missingFree: "מה חסר לך היום בגרסה החינמית?",
    upgradeTrigger: "מה היה גורם לך לשדרג למנוי פרימיום?",
  };

  const answersHtml = Object.entries(answers)
    .filter(([, v]) => v && v.trim())
    .map(
      ([k, v]) => `
      <tr><td style="padding:8px 12px;font-weight:600;color:#6366f1;vertical-align:top;white-space:nowrap;">${questionLabels[k] || k}</td></tr>
      <tr><td style="padding:4px 12px 16px;color:#1a1a2e;">${v.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td></tr>
    `,
    )
    .join("");

  const bodyContent = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a1a2e;text-align:center;">📝 פידבק חדש</h2>
    <table role="presentation" width="100%" style="margin-bottom:16px;">
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;"><strong>משתמש:</strong> ${userName.replace(/</g, "&lt;")} (${userEmail})</td></tr>
    </table>
    ${
      features.length > 0
        ? `
    <div style="padding:8px 12px;margin-bottom:16px;">
      <strong style="color:#6366f1;font-size:14px;">פיצ׳רים שנוסו:</strong><br/>
      <span style="font-size:13px;color:#1a1a2e;">${features.map((f) => f.replace(/</g, "&lt;")).join(", ")}</span>
    </div>`
        : ""
    }
    <table role="presentation" width="100%">
      ${answersHtml}
    </table>
    ${
      prompt.trim()
        ? `
    <div style="padding:12px;margin-top:8px;background:#f0f0ff;border-radius:8px;">
      <strong style="color:#6366f1;font-size:14px;">פרומפט מוצע:</strong>
      <p style="margin:8px 0 0;font-size:13px;color:#1a1a2e;white-space:pre-wrap;">${prompt.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    </div>`
        : ""
    }
  `;

  const html = buildEmailHtml({ title: "פידבק חדש - Possbo", bodyContent });

  const textParts = [`פידבק חדש מ-${userName} (${userEmail})`];
  if (features.length > 0) textParts.push(`פיצ'רים: ${features.join(", ")}`);
  Object.entries(answers)
    .filter(([, v]) => v?.trim())
    .forEach(([k, v]) => {
      textParts.push(`${questionLabels[k] || k}: ${v}`);
    });
  if (prompt.trim()) textParts.push(`פרומפט: ${prompt}`);

  try {
    await transporter.sendMail({
      from: `"Possbo Feedback" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      replyTo: userEmail,
      subject: `📝 פידבק חדש מ-${userName}`,
      html,
      text: textParts.join("\n\n"),
      attachments: emailAttachments(),
    });
    log.info("Feedback email sent", { userEmail });
    return true;
  } catch (error) {
    log.error("Failed to send feedback email", error);
    throw error;
  }
}

/**
 * Send contact form email to the site admin
 */
export async function sendContactEmail({
  name,
  email,
  phone,
  subject,
  message,
  accountUser,
}) {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone || "לא נמסר");
  const safeSubject = escapeHtml(subject || "פנייה כללית");
  const safeMessage = escapeHtml(message);
  const safeAccount = accountUser
    ? `${escapeHtml(accountUser.name || "משתמש")} (${escapeHtml(accountUser.email || "")})`
    : "פנייה ציבורית ללא התחברות";

  const bodyContent = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1a1a2e;text-align:center;">פניית צור קשר חדשה</h2>
    <table role="presentation" width="100%" style="margin-bottom:16px;">
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;"><strong>שם:</strong> ${safeName}</td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;"><strong>אימייל:</strong> ${safeEmail}</td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;"><strong>טלפון:</strong> ${safePhone}</td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;"><strong>נושא:</strong> ${safeSubject}</td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;"><strong>חשבון:</strong> ${safeAccount}</td></tr>
    </table>
    <div style="padding:14px 16px;background:#f3f4f6;border-radius:10px;border:1px solid #e5e7eb;">
      <strong style="display:block;margin-bottom:8px;color:#1a1a2e;font-size:14px;">תוכן ההודעה:</strong>
      <p style="margin:0;font-size:13px;color:#1a1a2e;line-height:1.7;white-space:pre-wrap;">${safeMessage}</p>
    </div>
  `;

  const html = buildEmailHtml({ title: "פניית צור קשר - Possbo", bodyContent });
  const text = [
    `פניית צור קשר חדשה מ-${name}`,
    `אימייל: ${email}`,
    `טלפון: ${phone || "לא נמסר"}`,
    `נושא: ${subject || "פנייה כללית"}`,
    `חשבון: ${
      accountUser
        ? `${accountUser.name || "משתמש"} (${accountUser.email || ""})`
        : "פנייה ציבורית ללא התחברות"
    }`,
    "",
    message,
  ].join("\n");

  try {
    await transporter.sendMail({
      from: `"Possbo Contact" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      replyTo: email,
      subject: `צור קשר - ${subject || name}`,
      html,
      text,
      attachments: emailAttachments(),
    });
    log.info("Contact email sent");
    return true;
  } catch (error) {
    log.error("Failed to send contact email", error);
    throw error;
  }
}
