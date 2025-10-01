import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import request from "supertest";

vi.mock("../middleware/authMiddleware.js", () => ({
  authMiddleware: (req, res, next) => {
    res.locals.authData = { sub: "user-123", email: "user@example.com" };
    res.locals.role = "ADMIN";
    res.locals.farmId = "farm-1";
    next();
  },
  restrictToAdmin: (req, res, next) => next(),
}));

const inventory = [];
const harvests = [
  {
    id: 1,
    tree_id: 1,
    coconut_count: 10,
    total_weight: 20,
    estimated_value: 100,
    added_to_inventory: false,
  },
];
let invSeq = 1;

vi.mock("../supabase.js", () => ({
  default: {
    from: (table) => {
      if (table === "inventory") {
        return {
          select: () => ({
            eq: (field, value) => {
              if (field === "farm_id") {
                const farmFiltered = inventory.filter(
                  (i) => i.farm_id === value
                );
                return {
                  eq: (f2, v2) => {
                    if (f2 === "category") {
                      const catFiltered = farmFiltered.filter(
                        (i) => i.category === v2
                      );
                      return {
                        order: () => ({ data: catFiltered, error: null }),
                      };
                    }
                    if (f2 === "name") {
                      const nameFiltered = farmFiltered.filter(
                        (i) => i.name === v2
                      );
                      return {
                        single: () => ({ data: nameFiltered[0], error: null }),
                        select: () => ({ data: nameFiltered, error: null }),
                        ilike: (field3, v3) => {
                          if (field3 === "name") {
                            const lower = v3.toLowerCase();
                            const likeFiltered = farmFiltered.filter(
                              (i) => i.name.toLowerCase() === lower
                            );
                            return { data: likeFiltered, error: null };
                          }
                          return { data: [], error: null };
                        },
                      };
                    }
                    return {
                      order: () => ({ data: farmFiltered, error: null }),
                      ilike: (field3, v3) => {
                        if (field3 === "name") {
                          const lower = v3.toLowerCase();
                          const likeFiltered = farmFiltered.filter(
                            (i) => i.name.toLowerCase() === lower
                          );
                          return { data: likeFiltered, error: null };
                        }
                        return { data: [], error: null };
                      },
                    };
                  },
                  order: () => ({ data: farmFiltered, error: null }),
                  ilike: (field2, v2) => {
                    if (field2 === "name") {
                      const lower = v2.toLowerCase();
                      const likeFiltered = farmFiltered.filter(
                        (i) => i.name.toLowerCase() === lower
                      );
                      return { data: likeFiltered, error: null };
                    }
                    return { data: [], error: null };
                  },
                };
              }
              if (field === "id") {
                const data = inventory.filter(
                  (i) => String(i.id) === String(value)
                );
                return {
                  eq: (f2, v2) => {
                    if (f2 === "farm_id") {
                      const farmFiltered = data.filter((i) => i.farm_id === v2);
                      return { data: farmFiltered, error: null };
                    }
                    return { data, error: null };
                  },
                  data,
                  error: null,
                  single: () => ({ data: data[0], error: null }),
                };
              }
              if (field === "category") {
                const data = inventory.filter((i) => i.category === value);
                return { order: () => ({ data, error: null }) };
              }
              return { order: () => ({ data: inventory, error: null }) };
            },
            order: () => ({ data: inventory, error: null }),
            in: () => ({
              data: inventory.map((i) => ({
                category: i.category,
                stock_qty: i.stock_qty,
              })),
              error: null,
            }),
          }),
          insert: (payload) => ({
            select: () => ({
              single: () => {
                const rec = {
                  id: invSeq++,
                  updated_at: new Date().toISOString(),
                  ...payload,
                };
                inventory.push(rec);
                return { data: rec, error: null };
              },
            }),
          }),
          update: (changes) => ({
            eq: (field, value) => {
              const idx = inventory.findIndex(
                (i) => String(i.id) === String(value)
              );
              if (idx !== -1)
                inventory[idx] = { ...inventory[idx], ...changes };
              return {
                select: () => ({
                  single: () => ({ data: inventory[idx], error: null }),
                }),
                error: null,
              };
            },
          }),
          delete: () => ({
            eq: (field, value) => {
              const idx = inventory.findIndex(
                (i) => String(i.id) === String(value)
              );
              if (idx !== -1) inventory.splice(idx, 1);
              return { error: null };
            },
          }),
        };
      }
      if (table === "harvest") {
        return {
          update: (changes) => ({
            eq: (field, value) => ({
              single: () => {
                const idx = harvests.findIndex(
                  (h) => String(h.id) === String(value)
                );
                if (idx !== -1)
                  harvests[idx] = { ...harvests[idx], ...changes };
                return { data: harvests[idx], error: null };
              },
            }),
          }),
        };
      }
      return { select: () => ({ data: [], error: null }) };
    },
    rpc: (fnName, args) => {
      if (fnName === "get_low_stock_items") {
        const low = inventory.filter(
          (i) =>
            (i.low_stock_alert ?? 0) > 0 && i.stock_qty <= i.low_stock_alert
        );
        return Promise.resolve({ data: low, error: null });
      }
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

describe("Inventory API", () => {
  it("lists inventory (empty initially)", async () => {
    const res = await request(app).get("/api/inventory");
    expect(res.status).toBe(200);
    expect(res.body.inventory).toEqual([]);
  });

  it("fails validation on create (missing unit)", async () => {
    const res = await request(app).post("/api/inventory").send({
      name: "Fertilizer A",
      category: "Fertilizer",
      stockQty: 10,
      amountPerUnit: 2,
      // unit missing
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });

  it("creates an inventory item successfully", async () => {
    const res = await request(app).post("/api/inventory").send({
      name: "Fertilizer A",
      category: "Fertilizer",
      stockQty: 10,
      amountPerUnit: 2,
      unit: "kg",
      stockPrice: 100,
      lowStockAlert: 3,
    });
    expect(res.status).toBe(201);
    expect(res.body.inventoryItem).toMatchObject({
      name: "Fertilizer A",
      category: "Fertilizer",
      stock_qty: 10,
      amount_per_unit: 2,
      total_available: 20,
    });
  });

  it("rejects duplicate inventory name", async () => {
    const res = await request(app).post("/api/inventory").send({
      name: "Fertilizer A",
      category: "Fertilizer",
      stockQty: 5,
      amountPerUnit: 1,
      unit: "kg",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });

  it("updates an inventory item", async () => {
    const res = await request(app).patch("/api/inventory/1").send({
      name: "Fertilizer A",
      category: "Fertilizer",
      stockQty: 12,
      amountPerUnit: 2,
      unit: "kg",
      lowStockAlert: 2,
      stockPrice: 120,
      totalAvailable: 24,
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated successfully/i);
  });

  it("retrieves inventory item by id", async () => {
    const res = await request(app).get("/api/inventory/1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it("gets low stock items (none yet)", async () => {
    const res = await request(app).get("/api/inventory/low-stock");
    expect(res.status).toBe(200);
    expect(res.body.lowStockItems).toBeInstanceOf(Array);
  });

  it("adds coconut to inventory (creates Coconut first)", async () => {
    // Insert Coconut item
    const createRes = await request(app).post("/api/inventory").send({
      name: "Coconut",
      category: "Product",
      stockQty: 5,
      amountPerUnit: 1,
      unit: "pcs",
    });
    expect(createRes.status).toBe(201);

    const res = await request(app)
      .patch("/api/inventory/add-to-inventory")
      .send({
        quantity: 10,
        harvestId: 1,
      });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/coconut added to inventory/i);
  });

  it("deletes an inventory item", async () => {
    const res = await request(app).delete("/api/inventory/1");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted successfully/i);
  });
});
