import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  connectedAccount: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  notification: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
};
const decryptMock = vi.fn();
const encryptMock = vi.fn();
const sendEmailMock = vi.fn();

vi.mock("../../src/config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../src/utils/encryption.js", () => ({
  decrypt: decryptMock,
  encrypt: encryptMock,
}));
vi.mock("../../src/utils/mailer.js", () => ({
  sendInstagramReconnectEmail: sendEmailMock,
}));
vi.mock("../../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const { refreshExpiringInstagramTokens } = await import(
  "../../src/jobs/instagram-token-refresh.js"
);

const account = {
  id: "ig-account-1",
  userId: "user-1",
  accessTokenEncrypted: "encrypted",
  tokenExpiresAt: new Date(),
  user: { id: "user-1", email: "user@example.com", name: "Test User" },
};

describe("Instagram token refresh job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.connectedAccount.findMany.mockResolvedValue([account]);
    prismaMock.connectedAccount.update.mockResolvedValue({});
    prismaMock.notification.findFirst.mockResolvedValue(null);
    prismaMock.notification.create.mockResolvedValue({});
    decryptMock.mockReturnValue("old-token");
    encryptMock.mockReturnValue("new-encrypted-token");
    sendEmailMock.mockResolvedValue(true);
  });

  it("refreshes and stores a new encrypted token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          access_token: "new-token",
          expires_in: 5184000,
        }),
      }),
    );

    const result = await refreshExpiringInstagramTokens();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("grant_type=ig_refresh_token"),
    );
    expect(encryptMock).toHaveBeenCalledWith("new-token");
    expect(prismaMock.connectedAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: account.id },
        data: expect.objectContaining({
          accessTokenEncrypted: "new-encrypted-token",
          status: "ACTIVE",
        }),
      }),
    );
    expect(result).toMatchObject({ scanned: 1, refreshed: 1, errors: 0 });
  });

  it("marks an unreadable token expired and notifies the user", async () => {
    decryptMock.mockImplementation(() => {
      throw new Error("decrypt failed");
    });

    const result = await refreshExpiringInstagramTokens();

    expect(prismaMock.connectedAccount.update).toHaveBeenCalledWith({
      where: { id: account.id },
      data: { status: "EXPIRED" },
    });
    expect(prismaMock.notification.create).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(
      account.user.email,
      account.user.name,
    );
    expect(result.reconnectRequired).toBe(1);
  });

  it("does not duplicate reconnect notifications within 24 hours", async () => {
    decryptMock.mockImplementation(() => {
      throw new Error("decrypt failed");
    });
    prismaMock.notification.findFirst.mockResolvedValue({ id: "existing" });

    await refreshExpiringInstagramTokens();

    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
