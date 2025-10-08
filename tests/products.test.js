import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import request from "supertest";

vi.mock("../middleware/authMiddleware.js", () => ({
  authMiddleware: (req, res, next) => {
    res.locals.authData = { sub: "user-123", email: "user@example.com" };
    res.locals.role = "ADMIN";
    res.locals.farmId = "farm-1";
    res.locals.region = "REGION IV-A";
    next();
  },
  restrictToAdmin: (req, res, next) => next(),
}));

const inventory = [
  {
    id: 1,
    farm_id: "farm-1",
    name: "Copra",
    total_available: 500,
    amount_per_unit: 1,
    unit: "kg",
  },
  {
    id: 2,
    farm_id: "farm-1",
    name: "Coconut Oil",
    total_available: 100,
    amount_per_unit: 1,
    unit: "L",
  },
];
const products = [];
let productSeq = 1;
const sales = [];

vi.mock("../supabase.js", () => ({
  default: {
    from: (table) => {
      switch (table) {
        case "inventory":
          return {
            select: () => ({
              eq: (field, val) => ({
                eq: (field2, val2) => ({
                  single: () => {
                    const item = inventory.find(
                      (i) => String(i.id) === String(val) && i.farm_id === val2
                    );
                    return { data: item, error: null };
                  },
                }),
                single: () => {
                  const item = inventory.find(
                    (i) => String(i.id) === String(val)
                  );
                  return { data: item, error: null };
                },
              }),
            }),
          };
        case "products":
          return {
            select: () => ({
              eq: (field, val) => {
                if (field === "farm_id") {
                  const farmFiltered = products.filter(
                    (p) => p.farm_id === val
                  );
                  return {
                    eq: (f2, v2) => {
                      if (f2 === "inventory_id") {
                        const dup = farmFiltered.find(
                          (p) => String(p.inventory_id) === String(v2)
                        );
                        return {
                          maybeSingle: () => ({
                            data: dup || null,
                            error: null,
                          }),
                        };
                      }
                      if (f2 === "id") {
                        const one = farmFiltered.filter(
                          (p) => String(p.id) === String(v2)
                        );
                        return {
                          single: () => ({ data: one[0], error: null }),
                          maybeSingle: () => ({
                            data: one[0] || null,
                            error: null,
                          }),
                        };
                      }
                      return { data: farmFiltered, error: null };
                    },
                    order: () => ({ data: farmFiltered, error: null }),
                  };
                }
                if (field === "id") {
                  const byId = products.filter(
                    (p) => String(p.id) === String(val)
                  );
                  return {
                    eq: (f2, v2) => {
                      if (f2 === "farm_id") {
                        const match = byId.filter(
                          (p) => String(p.farm_id) === String(v2)
                        );
                        return {
                          single: () => ({ data: match[0], error: null }),
                        };
                      }
                      return { single: () => ({ data: byId[0], error: null }) };
                    },
                    single: () => ({ data: byId[0], error: null }),
                  };
                }
                return { data: products, error: null };
              },
              order: () => ({ data: products, error: null }),
            }),
            insert: (payload) => ({
              select: () => ({
                single: () => {
                  const inserted = Array.isArray(payload)
                    ? payload[0]
                    : payload;
                  const inv = inventory.find(
                    (i) => i.id === inserted.inventory_id
                  );
                  const rec = {
                    id: productSeq++,
                    created_at: new Date().toISOString(),
                    inventory: { name: inv?.name },
                    ...inserted,
                  };
                  products.push(rec);
                  return { data: rec, error: null };
                },
              }),
            }),
            update: (changes) => ({
              eq: (field, val) => ({
                select: () => ({
                  single: () => {
                    const idx = products.findIndex(
                      (p) => String(p.id) === String(val)
                    );
                    if (idx !== -1)
                      products[idx] = { ...products[idx], ...changes };
                    const rec = products[idx];
                    return { data: rec, error: null };
                  },
                }),
              }),
            }),
            delete: () => ({
              eq: (field, val) => {
                const idx = products.findIndex(
                  (p) => String(p.id) === String(val)
                );
                if (idx !== -1) products.splice(idx, 1);
                return { error: null };
              },
            }),
          };
        case "sales":
          return {
            select: () => ({
              eq: () => ({
                gte: () => ({ order: () => ({ data: sales, error: null }) }),
              }),
            }),
          };
        default:
          return { select: () => ({ eq: () => ({ data: [], error: null }) }) };
      }
    },
    rpc: (fnName) => {
      if (fnName === "get_farm_sales_total")
        return Promise.resolve({ data: 0, error: null });
      if (fnName === "get_farm_sales_count")
        return Promise.resolve({ data: 0, error: null });
      if (fnName === "get_farm_customer_count")
        return Promise.resolve({ data: 0, error: null });
      if (fnName === "get_peak_copra_prediction")
        return Promise.resolve({ data: [{ peak: 100 }], error: null });
      if (fnName === "get_latest_copra_price")
        return Promise.resolve({ data: [{ copra_price: 70 }], error: null });
      return Promise.resolve({ data: [], error: null });
    },
  },
}));

let app;
beforeAll(async () => {
  const mod = await import("../app.js");
  app = mod.default;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Products API", () => {
  it("lists products (empty initially)", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
  });

  it("fails validation on create (missing price)", async () => {
    const res = await request(app).post("/api/products").send({
      inventoryItemId: "1",
      amountToSell: 10,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });

  it("creates a product successfully", async () => {
    const res = await request(app).post("/api/products").send({
      inventoryItemId: "1",
      description: "Fresh copra",
      price: 120,
      amountToSell: 50,
      image: "",
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/created successfully/i);
    expect(res.body.product).toMatchObject({
      farm_id: "farm-1",
      inventory_id: "1",
      price: 120,
    });
  });

  it("rejects duplicate product for same inventory item", async () => {
    const res = await request(app).post("/api/products").send({
      inventoryItemId: "1",
      description: "Fresh copra again",
      price: 130,
      amountToSell: 60,
      image: "",
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it("gets product by id", async () => {
    const res = await request(app).get("/api/products/1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it("updates a product successfully", async () => {
    const res = await request(app).patch("/api/products/1").send({
      price: 125,
      amountToSell: 55,
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated successfully/i);
    expect(res.body.product.price).toBe(125);
  });

  it("deletes a product", async () => {
    const res = await request(app).delete("/api/products/1");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted successfully/i);
  });
});
