import express from "express";
import { createLogger } from "../utils/logger.js";
import { asyncHandler } from "../utils/async-handler.js";
import { sendFeedbackEmail } from "../utils/mailer.js";

const router = express.Router();
const log = createLogger("feedback");

router.post(
  "/",
  asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "יש להתחבר כדי לשלוח פידבק" });
    }

    const { features, answers, prompt } = req.body;

    await sendFeedbackEmail({
      userName: req.user.name || req.user.email,
      userEmail: req.user.email,
      features: features || [],
      answers: answers || {},
      prompt: prompt || "",
    });

    log.info("Feedback submitted", { userId: req.user.id });
    res.json({ success: true });
  }),
);

export default router;
