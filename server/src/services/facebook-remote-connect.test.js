import { describe, expect, it } from "vitest";
import { classifyFacebookAuthUrl } from "./facebook-remote-connect.js";

describe("classifyFacebookAuthUrl", () => {
  it.each([
    "https://www.facebook.com/two_factor/remember_browser/?encrypted_context=abc",
    "https://m.facebook.com/checkpoint/",
    "https://www.facebook.com/two_step_verification/",
    "https://www.facebook.com/login/identify/",
  ])("keeps the remote session open for security flow URL %s", (url) => {
    expect(classifyFacebookAuthUrl(url).isSecurityPage).toBe(true);
  });

  it("allows a normal authenticated Facebook page", () => {
    expect(
      classifyFacebookAuthUrl("https://www.facebook.com/?sk=h_chr"),
    ).toEqual({
      isLoginPage: false,
      isSecurityPage: false,
      isCaptchaPage: false,
    });
  });
});
