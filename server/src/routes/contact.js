import express from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { createLogger } from "../utils/logger.js";
import { sendContactEmail } from "../utils/mailer.js";

const router = express.Router();
const log = createLogger("contact");

const MAX_FIELD_LENGTH = 500;
const MAX_MESSAGE_LENGTH = 5000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const name = normalizeString(req.body.name);
    const email = normalizeString(req.body.email).toLowerCase();
    const phone = normalizeString(req.body.phone);
    const subject = normalizeString(req.body.subject);
    const message = normalizeString(req.body.message);

    if (!name || !email || !message) {
      return res.status(400).json({ error: "יש למלא שם, אימייל ותוכן הודעה" });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: "כתובת האימייל אינה תקינה" });
    }

    if (
      name.length > MAX_FIELD_LENGTH ||
      email.length > MAX_FIELD_LENGTH ||
      phone.length > MAX_FIELD_LENGTH ||
      subject.length > MAX_FIELD_LENGTH ||
      message.length > MAX_MESSAGE_LENGTH
    ) {
      return res.status(400).json({ error: "הטקסט שהוזן ארוך מדי" });
    }

    await sendContactEmail({
      name,
      email,
      phone,
      subject,
      message,
      accountUser: req.user
        ? { id: req.user.id, name: req.user.name, email: req.user.email }
        : null,
    });

    log.info("Contact form submitted", {
      userId: req.user?.id || null,
      hasPhone: Boolean(phone),
    });

    res.json({ success: true });
  }),
);

export default router;
