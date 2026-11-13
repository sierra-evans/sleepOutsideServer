import "dotenv/config";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// No real database, products or login needed: mock the pieces the order route depends on.
vi.mock("../../src/database/index.mts", () => ({
  default: { initDb: (cb) => cb && cb(null), getDb: () => ({}), closeDb: async () => {} }
}));
vi.mock("../../src/middleware/authorize.mts", () => ({
  default: (req, res, next) => {
    res.locals.user = { id: "user-1", _id: "user-1", email: "test@example.com", name: "Test" };
    next();
  }
}));
const PRICES = { "880RR": 199.99, "14GVG": 189.99 };
vi.mock("../../src/services/product.service.mts", () => ({
  default: {
    getProductById: async (id) => (id in PRICES ? { id, finalPrice: PRICES[id] } : null)
  }
}));

let server;
let baseUrl;

beforeAll(async () => {
  const app = (await import("../../src/app.ts")).default;
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/orders/`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

// a card that passes the route's payment checks
const payment = { cardNumber: "123456789012", cardExpiration: "12/39", cardCode: "123" };

async function placeOrder(orderItems, totalPrice) {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderItems, totalPrice, ...payment })
  });
  return { status: res.status, body: await res.json() };
}

describe("POST /orders quantities", () => {
  it("accepts a total that accounts for quantity", async () => {
    const { status } = await placeOrder(
      [{ productId: "880RR", quantity: 2 }, { productId: "14GVG", quantity: 1 }],
      2 * 199.99 + 189.99
    );
    expect(status).toBe(201);
  });

  it("rejects a total that ignores quantity", async () => {
    const { status, body } = await placeOrder([{ productId: "880RR", quantity: 3 }], 199.99);
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/totalPrice/);
  });

  it("treats a missing quantity as 1", async () => {
    const { status } = await placeOrder([{ productId: "880RR" }], 199.99);
    expect(status).toBe(201);
  });

  it.each([0, -1, 1.5, 100, "2"])("rejects quantity %j", async (quantity) => {
    const { status, body } = await placeOrder([{ productId: "880RR", quantity }], 199.99);
    expect(status).toBe(400);
    expect(body.error.message).toMatch(/quantity/);
  });
});
