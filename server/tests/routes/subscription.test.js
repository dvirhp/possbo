import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock prisma
const mockPlanFindMany = vi.fn();
const mockSubscriptionFindFirst = vi.fn();
const mockSubscriptionUpdate = vi.fn();
const mockPlanFindFirst = vi.fn();
const mockPaymentFindMany = vi.fn();
const mockCreateCheckout = vi.fn();
const mockCancelProviderSubscription = vi.fn();

vi.mock("../../src/config/prisma.js", () => ({
  default: {
    plan: {
      findMany: (...args) => mockPlanFindMany(...args),
      findFirst: (...args) => mockPlanFindFirst(...args),
    },
    subscription: {
      findFirst: (...args) => mockSubscriptionFindFirst(...args),
      update: (...args) => mockSubscriptionUpdate(...args),
    },
    payment: {
      findMany: (...args) => mockPaymentFindMany(...args),
    },
  },
}));

vi.mock("../../src/services/billing-provider.js", () => ({
  billingEnabled: () => true,
  createCheckout: (...args) => mockCreateCheckout(...args),
  cancelProviderSubscription: (...args) => mockCancelProviderSubscription(...args),
}));

vi.mock("../../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock("../../src/utils/auth-middleware.js", () => ({
  requireAuth: (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    next();
  },
}));

let app;

beforeEach(async () => {
  vi.clearAllMocks();

  app = express();
  app.use(express.json());

  // Simulate authenticated user by default
  app.use((req, _res, next) => {
    if (!req.headers["x-skip-auth"]) {
      req.user = { id: "user-1", email: "test@test.com" };
    }
    next();
  });

  const { default: subscriptionRouter } = await import(
    "../../src/routes/subscription.js"
  );
  app.use("/api/subscription", subscriptionRouter);
});

describe("GET /api/subscription/plans", () => {
  it("should return 401 when not authenticated", async () => {
    const res = await request(app)
      .get("/api/subscription/plans")
      .set("x-skip-auth", "true");
    expect(res.status).toBe(401);
  });

  it("should return plans list", async () => {
    mockPlanFindMany.mockResolvedValue([
      { id: "plan-1", name: "Basic", priceMonthly: 49, isActive: true },
    ]);

    const res = await request(app).get("/api/subscription/plans");
    expect(res.status).toBe(200);
    expect(res.body.plans).toHaveLength(1);
    expect(res.body.plans[0].name).toBe("Basic");
  });

  it("should return 500 on db error", async () => {
    mockPlanFindMany.mockRejectedValue(new Error("DB error"));

    const res = await request(app).get("/api/subscription/plans");
    expect(res.status).toBe(500);
  });
});

describe("GET /api/subscription/me", () => {
  it("should return current subscription", async () => {
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-1",
      status: "ACTIVE",
      plan: { name: "Basic" },
    });

    const res = await request(app).get("/api/subscription/me");
    expect(res.status).toBe(200);
    expect(res.body.subscription.status).toBe("ACTIVE");
  });

  it("should return null when no subscription", async () => {
    mockSubscriptionFindFirst.mockResolvedValue(null);

    const res = await request(app).get("/api/subscription/me");
    expect(res.status).toBe(200);
    expect(res.body.subscription).toBeNull();
  });

  it("should return 500 on db error", async () => {
    mockSubscriptionFindFirst.mockRejectedValue(new Error("DB error"));

    const res = await request(app).get("/api/subscription/me");
    expect(res.status).toBe(500);
  });
});

describe("POST /api/subscription/subscribe", () => {
  it("should return 409 when user already has an open subscription", async () => {
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-1",
      status: "ACTIVE",
    });

    const res = await request(app)
      .post("/api/subscription/subscribe")
      .send({ planId: "plan-1", token: "tok_123" });
    expect(res.status).toBe(409);
  });

  it("should return 404 when no active plan found", async () => {
    mockSubscriptionFindFirst.mockResolvedValue(null);
    mockPlanFindFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/subscription/subscribe")
      .send({ planId: "plan-1", token: "tok_123" });
    expect(res.status).toBe(404);
  });

  it("should create a hosted checkout session without activating locally", async () => {
    mockSubscriptionFindFirst.mockResolvedValue(null);
    mockPlanFindFirst.mockResolvedValue({
      id: "plan-1",
      name: "Basic",
      priceMonthly: 49,
    });
    mockCreateCheckout.mockResolvedValue({ id: "checkout-1", url: "https://billing.test/checkout-1" });

    const res = await request(app)
      .post("/api/subscription/subscribe")
      .send({ planId: "plan-1", token: "tok_123" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ checkoutUrl: "https://billing.test/checkout-1", sessionId: "checkout-1" });
    expect(mockCreateCheckout).toHaveBeenCalledWith(expect.objectContaining({
      user: expect.objectContaining({ id: "user-1" }),
      plan: expect.objectContaining({ id: "plan-1" }),
    }));
  });

  it("should return 502 when checkout creation fails", async () => {
    mockSubscriptionFindFirst.mockRejectedValue(new Error("DB error"));

    const res = await request(app)
      .post("/api/subscription/subscribe")
      .send({ planId: "plan-1", token: "tok_123" });
    expect(res.status).toBe(502);
  });
});

describe("POST /api/subscription/cancel", () => {
  it("should return 404 when no active subscription", async () => {
    mockSubscriptionFindFirst.mockResolvedValue(null);

    const res = await request(app).post("/api/subscription/cancel");
    expect(res.status).toBe(404);
  });

  it("should schedule cancellation with the billing provider", async () => {
    const now = new Date();
    const startedAt = new Date(now);
    startedAt.setDate(startedAt.getDate() - 15);
    const endsAt = new Date(startedAt);
    endsAt.setMonth(endsAt.getMonth() + 1);

    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-1",
      status: "ACTIVE",
      gatewaySubscriptionId: "provider-sub-1",
      startedAt,
      endsAt,
      plan: { priceMonthly: 49 },
    });
    mockSubscriptionUpdate.mockResolvedValue({ id: "sub-1", status: "CANCELLED" });
    mockCancelProviderSubscription.mockResolvedValue({ cancel_at: Math.floor(endsAt.getTime() / 1000) });

    const res = await request(app).post("/api/subscription/cancel");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Cancellation scheduled");
    expect(res.body.cancelAt).toBeTruthy();
    expect(mockCancelProviderSubscription).toHaveBeenCalledWith("provider-sub-1");
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "sub-1" } }));
  });

  it("should return 502 when cancellation fails", async () => {
    mockSubscriptionFindFirst.mockRejectedValue(new Error("DB error"));

    const res = await request(app).post("/api/subscription/cancel");
    expect(res.status).toBe(502);
  });
});

describe("GET /api/subscription/payments", () => {
  it("should return payments list", async () => {
    mockPaymentFindMany.mockResolvedValue([
      { id: "pay-1", amount: 49, currency: "ILS", status: "SUCCESS" },
    ]);

    const res = await request(app).get("/api/subscription/payments");
    expect(res.status).toBe(200);
    expect(res.body.payments).toHaveLength(1);
  });

  it("should return 500 on db error", async () => {
    mockPaymentFindMany.mockRejectedValue(new Error("DB error"));

    const res = await request(app).get("/api/subscription/payments");
    expect(res.status).toBe(500);
  });
});
