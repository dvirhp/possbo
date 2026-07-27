import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(),
    })),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const expectedLogo = readFileSync(
  join(__dirname, "../../src/assets/logo-email-white.png"),
);

let sendVerificationEmail, sendPasswordResetEmail, sendFeedbackEmail;
let mockSendMail;

beforeEach(async () => {
  vi.resetModules();
  mockSendMail = vi.fn().mockResolvedValue({ messageId: "123" });

  const nodemailer = await import("nodemailer");
  nodemailer.default.createTransport.mockReturnValue({ sendMail: mockSendMail });

  const mailer = await import("../../src/utils/mailer.js");
  sendVerificationEmail = mailer.sendVerificationEmail;
  sendPasswordResetEmail = mailer.sendPasswordResetEmail;
  sendFeedbackEmail = mailer.sendFeedbackEmail;
});

describe("mailer", () => {
  describe("sendVerificationEmail", () => {
    it("sends email with correct code in subject", async () => {
      const result = await sendVerificationEmail("test@test.com", "123456");

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "test@test.com",
          subject: expect.stringContaining("123456"),
        })
      );
    });

    it("includes the code in the HTML body", async () => {
      await sendVerificationEmail("test@test.com", "654321");

      const call = mockSendMail.mock.calls[0][0];
      expect(call.html).toContain("654321");
    });

    it("returns false when sendMail fails", async () => {
      mockSendMail.mockRejectedValueOnce(new Error("SMTP error"));

      const result = await sendVerificationEmail("bad@test.com", "111111");
      expect(result).toBe(false);
    });

    it("sends email with from field populated", async () => {
      await sendVerificationEmail("test@test.com", "123456");

      const call = mockSendMail.mock.calls[0][0];
      expect(call.from).toBeDefined();
    });

    it("sends HTML content (not plain text only)", async () => {
      await sendVerificationEmail("test@test.com", "123456");

      const call = mockSendMail.mock.calls[0][0];
      expect(call.html).toBeDefined();
      expect(call.html.length).toBeGreaterThan(0);
    });

    it("embeds the current Possbo logo used by registration and WhatsApp bot verification", async () => {
      await sendVerificationEmail("test@test.com", "123456");

      const call = mockSendMail.mock.calls[0][0];
      expect(call.html).toContain('src="cid:possbo-logo"');
      expect(call.attachments).toEqual([
        expect.objectContaining({
          filename: "possbo-logo.png",
          cid: "possbo-logo",
          content: expectedLogo,
        }),
      ]);
    });

    it("returns false on SMTP connection timeout", async () => {
      mockSendMail.mockRejectedValueOnce(new Error("Connection timeout"));

      const result = await sendVerificationEmail("test@test.com", "123456");
      expect(result).toBe(false);
    });
  });

  describe("sendPasswordResetEmail", () => {
    it("sends password reset email", async () => {
      const result = await sendPasswordResetEmail("user@test.com", "999999");

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "user@test.com",
          html: expect.stringContaining("999999"),
        })
      );
    });

    it("returns false on failure", async () => {
      mockSendMail.mockRejectedValueOnce(new Error("Network error"));

      const result = await sendPasswordResetEmail("fail@test.com", "000000");
      expect(result).toBe(false);
    });

    it("uses a distinct subject from verification email", async () => {
      await sendVerificationEmail("test@test.com", "111111");
      const verifySubject = mockSendMail.mock.calls[0][0].subject;

      mockSendMail.mockClear();
      await sendPasswordResetEmail("test@test.com", "222222");
      const resetSubject = mockSendMail.mock.calls[0][0].subject;

      expect(resetSubject).not.toBe(verifySubject);
    });

    it("includes the code in the subject", async () => {
      await sendPasswordResetEmail("test@test.com", "999999");

      const call = mockSendMail.mock.calls[0][0];
      expect(call.subject).toContain("999999");
    });

    it("sends email with from field", async () => {
      await sendPasswordResetEmail("test@test.com", "123456");

      const call = mockSendMail.mock.calls[0][0];
      expect(call.from).toBeDefined();
    });

    it("embeds the current Possbo logo in password verification emails", async () => {
      await sendPasswordResetEmail("test@test.com", "123456");

      const call = mockSendMail.mock.calls[0][0];
      expect(call.html).toContain('src="cid:possbo-logo"');
      expect(call.attachments[0]).toEqual(
        expect.objectContaining({
          cid: "possbo-logo",
          content: expectedLogo,
        }),
      );
    });
  });

  describe("sendFeedbackEmail", () => {
    it("embeds the current Possbo logo in chatbot/feedback email templates", async () => {
      await sendFeedbackEmail({
        userName: "Test User",
        userEmail: "test@test.com",
        features: [],
        answers: {},
        prompt: "",
      });

      const call = mockSendMail.mock.calls[0][0];
      expect(call.html).toContain('src="cid:possbo-logo"');
      expect(call.attachments[0]).toEqual(
        expect.objectContaining({
          cid: "possbo-logo",
          content: expectedLogo,
        }),
      );
    });
  });
});
