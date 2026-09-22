import { describe, expect, it } from "vitest";
import {
  classifyFacebookAuthUrl,
  classifyRemoteConnectError,
} from "./facebook-remote-connect.js";

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

describe("classifyRemoteConnectError", () => {
  it("reports missing server configuration", () => {
    expect(classifyRemoteConnectError(new Error("FACEBOOK_REMOTE_CONNECT_NOT_CONFIGURED")))
      .toBe("not_configured");
  });

  it("reports credentials and quota failures without exposing provider text", () => {
    expect(classifyRemoteConnectError({ status: 401, message: "Unauthorized" }))
      .toBe("browser_service_auth_failed");
    expect(classifyRemoteConnectError({ status: 429, message: "Concurrent session limit" }))
      .toBe("browser_service_limit");
  });

  it("classifies Browserbase free-minute exhaustion as a service limit", () => {
    expect(classifyRemoteConnectError({
      status: 402,
      message: "Free plan browser minutes limit reached",
    })).toBe("browser_service_limit");
  });
});
