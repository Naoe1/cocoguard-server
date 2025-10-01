import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterEach,
  beforeEach,
} from "vitest";
import request from "supertest";

vi.mock("../middleware/authMiddleware.js", () => ({
  authMiddleware: (req, res, next) => {
    res.locals.authData = { sub: "user-123", email: "user@example.com" };
    res.locals.role = "ADMIN";
    res.locals.farmId = "1";
    next();
  },
  restrictToAdmin: (req, res, next) => next(),
}));

let products = [];
let inventories = [];
let sales = [];
let saleItems = [];
let productSeq = 1;

vi.mock("../utils/paypal.js", () => ({
  createOrder: vi.fn((cart, paypalEmail) => {
    if (!Array.isArray(cart) || cart.length === 0) {
      return Promise.reject(new Error("Invalid or empty cart data provided."));
    }
    const total = cart.reduce((sum, item) => {
      const prod = products.find((p) => p.id === Number(item.sku));
      return sum + (prod ? Number(prod.price) * Number(item.quantity) : 0);
    }, 0);
    return Promise.resolve({
      jsonResponse: {
        id: "PAYPAL-ORDER-123",
        status: "CREATED",
        purchase_units: [
          {
            amount: { value: total.toFixed(2) },
            items: cart.map((it) => ({ sku: it.sku, quantity: it.quantity })),
          },
        ],
      },
      httpStatusCode: 201,
    });
  }),
  captureOrder: vi.fn((orderID) => {
    return Promise.resolve({
      jsonResponse: {
        id: orderID,
        status: "COMPLETED",
        payer: { email_address: "buyer@example.com" },
      },
      httpStatusCode: 201,
    });
  }),
  getOrderDetails: vi.fn((orderID) => {
    return Promise.resolve({
      jsonResponse: {
        id: orderID,
        purchase_units: [
          {
            amount: { value: "150.00" },
            payments: {
              captures: [
                {
                  seller_receivable_breakdown: {
                    paypal_fee: { value: "5.00" },
                    net_amount: { value: "145.00" },
                  },
                },
              ],
            },
            items: products.slice(0, 2).map((p) => ({
              sku: p.id,
              name:
                inventories.find((inv) => inv.id === p.inventory_id)?.name ||
                "Item",
              unit_amount: { value: Number(p.price).toFixed(2) },
              quantity: "1",
            })),
          },
        ],
      },
    });
  }),
}));

// Supabase mock
vi.mock("../supabase.js", () => ({
  default: {
    from: (table) => {
      switch (table) {
        case "farm":
          return {
            select: () => ({
              eq: (field, val) => {
                const rows =
                  val == 1 ? [{ id: 1, paypal_email: "farm@example.com" }] : [];
                return {
                  data: rows,
                  error: null,
                  single: () => ({ data: rows[0] || null, error: null }),
                };
              },
              single: () => ({
                data: { id: 1, paypal_email: "farm@example.com" },
                error: null,
              }),
            }),
          };
        case "products":
          return {
            select: () => ({
              eq: (field, value) => {
                if (field === "farm_id") {
                  const filtered = products.filter(
                    (p) => p.farm_id === Number(value)
                  );
                  return {
                    order: () => ({ data: filtered, error: null }),
                  };
                }
                if (field === "id") {
                  const byId = products.filter((p) => p.id === Number(value));
                  return {
                    eq: (f2, v2) => {
                      if (f2 === "farm_id") {
                        const filtered = byId.filter(
                          (p) => p.farm_id === Number(v2)
                        );
                        return {
                          single: () => ({
                            data: filtered[0] && {
                              ...filtered[0],
                              inventory:
                                inventories.find(
                                  (i) => i.id === filtered[0].inventory_id
                                ) || null,
                            },
                            error: null,
                          }),
                        };
                      }
                      return { data: byId, error: null };
                    },
                    single: () => ({ data: byId[0] || null, error: null }),
                  };
                }
                return { data: products, error: null };
              },
              in: (col, ids) => {
                const rows = products.filter((p) => ids.includes(p.id));
                return {
                  data: rows.map((r) => ({
                    id: r.id,
                    price: r.price,
                    inventory: inventories.find(
                      (inv) => inv.id === r.inventory_id
                    ) || { name: "Unknown" },
                  })),
                  error: null,
                };
              },
              order: () => ({ data: products, error: null }),
            }),
          };
        case "sales":
          return {
            insert: (payload) => {
              sales.push(payload);
              return { data: payload, error: null };
            },
          };
        case "sale_items":
          return {
            insert: (payload) => {
              saleItems.push(...payload);
              return { data: payload, error: null };
            },
          };
        default:
          return { select: () => ({ data: [], error: null }) };
      }
    },
    rpc: (fnName, args) => {
      if (fnName === "increment_total_sales") {
        return Promise.resolve({ data: { success: true }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  },
}));

let app;
beforeAll(async () => {
  const mod = await import("../app.js");
  app = mod.default;
});

beforeEach(() => {
  // reset stores
  products = [];
  inventories = [];
  sales = [];
  saleItems = [];
  productSeq = 1;
  inventories.push({
    id: 10,
    name: "Copra",
    stock_qty: 100,
    amount_per_unit: 1,
    unit: "kg",
  });
  products.push({
    id: productSeq++,
    description: "Premium Copra",
    price: 75,
    image: null,
    amount_to_sell: 50,
    farm_id: 1,
    inventory_id: 10,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Market API", () => {
  it("lists farm products", async () => {
    const res = await request(app).get("/api/market/1");
    expect(res.status).toBe(200);
    expect(res.body.products).toBeInstanceOf(Array);
    expect(res.body.products.length).toBeGreaterThan(0);
  });

  it("returns 404 for non-existing farm", async () => {
    const res = await request(app).get("/api/market/999");
    expect(res.status).toBe(404);
  });

  it("gets product by id", async () => {
    const res = await request(app).get("/api/market/1/1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it("create paypal order validation error (empty cart)", async () => {
    const res = await request(app)
      .post("/api/market/1/create-order")
      .send({ cart: [] });
    expect(res.status).toBe(400);
  });

  it("creates paypal order successfully", async () => {
    const res = await request(app)
      .post("/api/market/1/create-order")
      .send({ cart: [{ sku: 1, quantity: 2 }] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("CREATED");
  });

  it("captures paypal order and records sales", async () => {
    const captureRes = await request(app)
      .post("/api/market/1/capture-order")
      .send({ orderID: "PAYPAL-ORDER-123" });
    expect(captureRes.status).toBe(201);
    expect(captureRes.body.status).toBe("COMPLETED");
    // sales & sale_items arrays populated
  });

  it("capture order missing orderID", async () => {
    const res = await request(app).post("/api/market/1/capture-order").send({});
    expect(res.status).toBe(400);
  });
});
