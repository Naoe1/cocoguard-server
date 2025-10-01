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

const trees = [{ id: 1, tree_code: "TREE-200", farm_id: "farm-1" }];
const nutrients = [];
let nutrientSeq = 1;

vi.mock("../supabase.js", () => ({
  default: {
    from: (table) => {
      switch (table) {
        case "tree":
          return {
            select: () => ({
              eq: (field, val) => ({
                eq: (field2, val2) => {
                  const data = trees.filter(
                    (t) => t.farm_id === val && t.tree_code === val2
                  );
                  return { data, error: null };
                },
              }),
            }),
          };
        case "inventory":
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({ data: [], error: null }),
              }),
            }),
            update: () => ({ eq: () => ({ error: null }) }),
          };
        case "nutrient":
          return {
            select: () => ({
              eq: (field, value) => {
                if (field === "tree.farm.id") {
                  const farmFiltered = nutrients.filter((n) => {
                    const tree = trees.find((t) => t.id === n.applied_to);
                    return tree?.farm_id === value;
                  });
                  return {
                    eq: (f2, v2) => {
                      if (f2 === "tree.id") {
                        const filtered = farmFiltered.filter(
                          (n) => String(n.applied_to) === String(v2)
                        );
                        return {
                          order: () => ({ data: filtered, error: null }),
                        };
                      }
                      if (f2 === "id") {
                        const filtered = farmFiltered.filter(
                          (n) => String(n.id) === String(v2)
                        );
                        return { data: filtered, error: null };
                      }
                      return { data: farmFiltered, error: null };
                    },
                    order: () => ({ data: farmFiltered, error: null }),
                  };
                }
                if (field === "id") {
                  const data = nutrients.filter(
                    (n) => String(n.id) === String(value)
                  );
                  return { data, error: null };
                }
                return { data: nutrients, error: null };
              },
              order: () => ({ data: nutrients, error: null }),
            }),
            insert: (payload) => ({
              select: () => ({
                data: (() => {
                  const arr = Array.isArray(payload) ? payload : [payload];
                  const inserted = arr.map((p) => {
                    const rec = {
                      id: nutrientSeq++,
                      created_at: new Date().toISOString(),
                      ...p,
                    };
                    nutrients.push(rec);
                    return rec;
                  });
                  return inserted;
                })(),
                error: null,
              }),
            }),
            update: (changes) => ({
              eq: (field, val) => {
                const idx = nutrients.findIndex(
                  (n) => String(n.id) === String(val)
                );
                if (idx !== -1)
                  nutrients[idx] = { ...nutrients[idx], ...changes };
                return { error: null };
              },
            }),
            delete: () => ({
              eq: (field, val) => {
                const idx = nutrients.findIndex(
                  (n) => String(n.id) === String(val)
                );
                if (idx !== -1) nutrients.splice(idx, 1);
                return { error: null };
              },
            }),
          };
        default:
          return { select: () => ({ eq: () => ({ data: [], error: null }) }) };
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

describe("Nutrients API", () => {
  it("lists nutrients (empty initially)", async () => {
    const res = await request(app).get("/api/nutrients");
    expect(res.status).toBe(200);
    expect(res.body.nutrients).toEqual([]);
  });

  it("fails validation on create (missing amount)", async () => {
    const res = await request(app).post("/api/nutrients").send({
      treeCode: "TREE-200",
      dateApplied: "2024-01-01",
      product: "Urea",
      // amount missing
      applicationMethod: "Soil",
      unit: "kg",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });

  it("creates a nutrient application successfully", async () => {
    const res = await request(app).post("/api/nutrients").send({
      treeCode: "TREE-200",
      dateApplied: "2024-01-01",
      product: "Urea",
      amount: 5,
      applicationMethod: "Soil",
      unit: "kg",
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/created successfully/i);
    expect(res.body.nutrient[0]).toMatchObject({
      applied_to: 1,
      product: "Urea",
      amount: 5,
    });
  });

  it("updates a nutrient successfully", async () => {
    const res = await request(app).patch("/api/nutrients/1").send({
      treeCode: "TREE-200",
      dateApplied: "2024-01-02",
      product: "Urea",
      amount: 6,
      applicationMethod: "Soil",
      unit: "kg",
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated successfully/i);
  });

  it("retrieves nutrient by id", async () => {
    const res = await request(app).get("/api/nutrients/1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it("deletes a nutrient", async () => {
    const res = await request(app).delete("/api/nutrients/1");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted successfully/i);
  });
});
