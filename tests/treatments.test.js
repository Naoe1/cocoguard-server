import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import request from "supertest";

vi.mock("../middleware/authMiddleware.js", () => ({
  authMiddleware: (req, res, next) => {
    res.locals.authData = { sub: "admin-1", email: "admin@example.com" };
    res.locals.role = "ADMIN";
    res.locals.farmId = "farm-1";
    next();
  },
  restrictToAdmin: (req, res, next) => next(),
}));

let trees;
let treatments;
let inventory;

const resetData = () => {
  trees = [
    { id: 1, tree_code: "T-001", farm_id: "farm-1" },
    { id: 2, tree_code: "T-002", farm_id: "farm-1" },
    { id: 3, tree_code: "T-003", farm_id: "farm-2" },
  ];
  treatments = [
    {
      id: 1,
      applied_to: 1,
      date_applied: new Date().toISOString(),
      type: "Pesticide",
      product: "ProdA",
      end_date: null,
      amount: 2,
      unit: "L",
      created_at: new Date().toISOString(),
    },
  ];
  inventory = [
    { id: 10, farm_id: "farm-1", total_available: 20 },
    { id: 11, farm_id: "farm-1", total_available: 1 },
  ];
};

resetData();

// Helper to simulate auto increment id
const nextTreatmentId = () =>
  treatments.length ? Math.max(...treatments.map((t) => t.id)) + 1 : 1;

// Supabase mock
vi.mock("../supabase.js", () => ({
  default: {
    from: (table) => {
      switch (table) {
        case "tree":
          return {
            select: () => ({
              eq: (field, val) => {
                if (field === "farm_id") {
                  return {
                    eq: (f2, v2) => {
                      if (f2 === "tree_code") {
                        const row = trees.filter(
                          (t) => t.farm_id === val && t.tree_code === v2
                        );
                        return { data: row, error: null };
                      }
                      return {
                        data: trees.filter((t) => t.farm_id === val),
                        error: null,
                      };
                    },
                    data: trees.filter((t) => t.farm_id === val),
                    error: null,
                  };
                }
                if (field === "tree_code") {
                  return {
                    data: trees.filter((t) => t.tree_code === val),
                    error: null,
                  };
                }
                return { data: trees, error: null };
              },
            }),
          };
        case "inventory":
          return {
            select: () => ({
              eq: (field, val) => {
                if (field === "id") {
                  return {
                    eq: (f2, v2) => {
                      if (f2 === "farm_id") {
                        const row = inventory.filter(
                          (i) => i.id === Number(val) && i.farm_id === v2
                        );
                        return { data: row, error: null };
                      }
                      return { data: [], error: null };
                    },
                    data: inventory.filter((i) => i.id === Number(val)),
                    error: null,
                  };
                }
                return { data: inventory, error: null };
              },
            }),
            update: (values) => ({
              eq: (field, val) => {
                if (field === "id") {
                  const item = inventory.find((i) => i.id === Number(val));
                  if (item) Object.assign(item, values);
                  return { data: [item], error: null };
                }
                return { data: [], error: null };
              },
            }),
          };
        case "treatment":
          return {
            select: () => ({
              eq: (field, val) => {
                const byFarm = (rows) =>
                  rows.filter((r) => {
                    const tree = trees.find((t) => t.id === r.applied_to);
                    return !!tree && tree.farm_id === val;
                  });
                if (field === "tree.farm.id") {
                  return {
                    eq: (f2, v2) => {
                      if (f2 === "id") {
                        const farmFiltered = byFarm(treatments);
                        const row = farmFiltered.filter(
                          (t) => t.id === Number(v2)
                        );
                        return {
                          data: row,
                          error: null,
                          order: () => ({
                            data: row.sort((a, b) =>
                              b.created_at.localeCompare(a.created_at)
                            ),
                            error: null,
                          }),
                        };
                      }
                      if (f2 === "tree.id") {
                        const farmFiltered = byFarm(treatments);
                        const row = farmFiltered.filter(
                          (t) => t.applied_to === Number(v2)
                        );
                        return {
                          data: row,
                          error: null,
                          order: () => ({
                            data: row.sort((a, b) =>
                              b.created_at.localeCompare(a.created_at)
                            ),
                            error: null,
                          }),
                        };
                      }
                      const all = byFarm(treatments);
                      return {
                        data: all,
                        error: null,
                        order: () => ({
                          data: all.sort((a, b) =>
                            b.created_at.localeCompare(a.created_at)
                          ),
                          error: null,
                        }),
                      };
                    },
                    order: () => ({
                      data: byFarm(treatments).sort((a, b) =>
                        b.created_at.localeCompare(a.created_at)
                      ),
                      error: null,
                    }),
                    data: byFarm(treatments),
                    error: null,
                  };
                }
                if (field === "id") {
                  return {
                    data: treatments.filter((t) => t.id === Number(val)),
                    error: null,
                  };
                }
                return { data: treatments, error: null };
              },
              order: () => ({
                data: [...treatments].sort((a, b) =>
                  b.created_at.localeCompare(a.created_at)
                ),
                error: null,
              }),
            }),
            insert: (payload) => ({
              select: () => {
                const id = nextTreatmentId();
                const record = {
                  id,
                  ...payload,
                  created_at: new Date().toISOString(),
                };
                treatments.push(record);
                return { data: [record], error: null };
              },
            }),
            update: (values) => ({
              eq: (field, val) => {
                if (field === "id") {
                  const existing = treatments.find((t) => t.id === Number(val));
                  if (existing) Object.assign(existing, values);
                  return { data: existing ? [existing] : [], error: null };
                }
                return { data: [], error: null };
              },
            }),
            delete: () => ({
              eq: (field, val) => {
                if (field === "id") {
                  const idx = treatments.findIndex((t) => t.id === Number(val));
                  if (idx !== -1) {
                    treatments.splice(idx, 1);
                    return { data: [], error: null };
                  }
                }
                return { data: [], error: null };
              },
            }),
          };
        default:
          return { select: () => ({ data: [], error: null }) };
      }
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

describe("Treatment API", () => {
  it("lists treatments", async () => {
    const res = await request(app).get("/api/treatments");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.treatments)).toBe(true);
    expect(res.body.treatments.length).toBeGreaterThan(0);
  });

  it("filters treatments by tree (coconutId)", async () => {
    const tree = trees[0];
    const res = await request(app).get(`/api/treatments?coconutId=${tree.id}`);
    expect(res.status).toBe(200);
    expect(res.body.treatments.every((t) => t.applied_to === tree.id)).toBe(
      true
    );
  });

  it("returns 404 when getting treatment that does not exist", async () => {
    const res = await request(app).get("/api/treatments/9999");
    expect(res.status).toBe(404);
  });

  it("creates treatment (without inventory use)", async () => {
    const payload = {
      treeCode: "T-001",
      dateApplied: new Date().toISOString(),
      type: "Pesticide",
      product: "NewProd",
      endDate: "",
      amount: 1,
      unit: "L",
    };
    const res = await request(app).post("/api/treatments").send(payload);
    expect(res.status).toBe(201);
    expect(res.body.treatment).toBeDefined();
    expect(res.body.treatment[0].product).toBe("NewProd");
  });

  it("fails validation for missing required fields", async () => {
    const res = await request(app).post("/api/treatments").send({});
    expect(res.status).toBe(400);
    expect(res.body.errors || res.body.validationErrors).toBeDefined();
  });

  it("updates treatment", async () => {
    const existing = treatments[0];
    const payload = {
      treeCode: "T-001",
      dateApplied: new Date().toISOString(),
      type: "Fungicide",
      product: "ProdA-updated",
      endDate: new Date().toISOString(),
      amount: 3,
      unit: "L",
    };
    const res = await request(app)
      .patch(`/api/treatments/${existing.id}`)
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated/i);
    expect(treatments[0].product).toBe("ProdA-updated");
  });

  it("deletes treatment", async () => {
    const newPayload = {
      treeCode: "T-001",
      dateApplied: new Date().toISOString(),
      type: "Pesticide",
      product: "ToDelete",
      endDate: "",
      amount: 1,
      unit: "L",
    };
    const createRes = await request(app)
      .post("/api/treatments")
      .send(newPayload);
    expect(createRes.status).toBe(201);
    const id = createRes.body.treatment[0].id;
    const delRes = await request(app).delete(`/api/treatments/${id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.message).toMatch(/deleted/i);
  });

  it("creates treatment and decrements inventory when inventoryItemId provided", async () => {
    const before = inventory.find((i) => i.id === 10).total_available;
    const payload = {
      treeCode: "T-001",
      dateApplied: new Date().toISOString(),
      type: "Pesticide",
      product: "WithInventory",
      endDate: "",
      inventoryItemId: String(10),
      amount: 5,
      unit: "L",
    };
    const res = await request(app).post("/api/treatments").send(payload);
    expect(res.status).toBe(201);
    const after = inventory.find((i) => i.id === 10).total_available;
    expect(before - after).toBe(5);
  });

  it("fails when inventory amount exceeds available", async () => {
    const payload = {
      treeCode: "T-001",
      dateApplied: new Date().toISOString(),
      type: "Pesticide",
      product: "TooMuch",
      endDate: "",
      inventoryItemId: String(11),
      amount: 5,
      unit: "L",
    };
    const res = await request(app).post("/api/treatments").send(payload);
    expect(res.status).toBe(400);
    expect(res.body.validationError?.field).toBe("amount");
  });
});
