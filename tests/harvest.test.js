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

const trees = [{ id: 1, tree_code: "TREE-100", farm_id: "farm-1" }];
const harvests = [];
let harvestSeq = 1;

const DEFAULT_COPRA_PRICE = 68;

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
        case "harvest":
          return {
            select: () => ({
              eq: (field, value) => {
                if (field === "tree.farm.id" || field === "tree.farm_id") {
                  const farmFiltered = harvests.filter((h) => {
                    const tree = trees.find((t) => t.id === h.tree_id);
                    return tree?.farm_id === value;
                  });
                  return {
                    eq: (f2, v2) => {
                      if (f2 === "tree.id") {
                        const filtered = farmFiltered.filter(
                          (h) => String(h.tree_id) === String(v2)
                        );
                        return {
                          order: () => ({ data: filtered, error: null }),
                        };
                      }
                      if (f2 === "id") {
                        const filtered = farmFiltered.filter(
                          (h) => String(h.id) === String(v2)
                        );
                        return { data: filtered, error: null };
                      }
                      return { data: farmFiltered, error: null };
                    },
                    gte: () => ({
                      order: () => ({ data: farmFiltered, error: null }),
                    }),
                    order: () => ({ data: farmFiltered, error: null }),
                  };
                }
                if (field === "id") {
                  const data = harvests.filter(
                    (h) => String(h.id) === String(value)
                  );
                  return {
                    data,
                    error: null,
                    single: () => {
                      const row = data[0];
                      if (!row) return { data: undefined, error: null };
                      const tree = trees.find((t) => t.id === row.tree_id);
                      return {
                        data: {
                          ...row,
                          tree: { farm_id: tree?.farm_id },
                        },
                        error: null,
                      };
                    },
                  };
                }
                return { data: harvests, error: null };
              },
              gte: () => ({ order: () => ({ data: harvests, error: null }) }),
              order: () => ({ data: harvests, error: null }),
            }),
            insert: (payload) => ({
              select: () => ({
                data: (() => {
                  const arr = Array.isArray(payload) ? payload : [payload];
                  const inserted = arr.map((p) => {
                    const rec = {
                      id: harvestSeq++,
                      created_at: new Date().toISOString(),
                      added_to_inventory: false,
                      ...p,
                    };
                    harvests.push(rec);
                    return rec;
                  });
                  return inserted;
                })(),
                error: null,
              }),
            }),
            update: (changes) => ({
              eq: (field, val) => {
                const idx = harvests.findIndex(
                  (h) => String(h.id) === String(val)
                );
                if (idx !== -1)
                  harvests[idx] = { ...harvests[idx], ...changes };
                return { error: null };
              },
            }),
            delete: () => ({
              eq: (field, val) => {
                const idx = harvests.findIndex(
                  (h) => String(h.id) === String(val)
                );
                if (idx !== -1) harvests.splice(idx, 1);
                return { error: null };
              },
            }),
          };
        default:
          return {
            select: () => ({ eq: () => ({ data: [], error: null }) }),
          };
      }
    },
    rpc: (fnName, args) => {
      if (fnName === "get_latest_copra_price") {
        return Promise.resolve({
          data: [{ copra_price: DEFAULT_COPRA_PRICE }],
          error: null,
        });
      }
      if (fnName === "add_harvest_to_inventory") {
        const id = Number(args.harvest_id);
        const idx = harvests.findIndex((h) => h.id === id);
        if (idx !== -1) {
          harvests[idx].added_to_inventory = true;
        }
        return Promise.resolve({ data: { success: true }, error: null });
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

describe("Harvests API", () => {
  it("lists harvests (empty initially)", async () => {
    const res = await request(app).get("/api/harvests");
    expect(res.status).toBe(200);
    expect(res.body.harvests).toEqual([]);
  });

  it("fails validation on create (missing totalWeight)", async () => {
    const res = await request(app).post("/api/harvests").send({
      treeCode: "TREE-100",
      coconutCount: 10,
      harvestDate: "2024-01-01",
      // totalWeight missing
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });

  it("creates a harvest successfully", async () => {
    const res = await request(app).post("/api/harvests").send({
      treeCode: "TREE-100",
      coconutCount: 15,
      totalWeight: 25,
      harvestDate: "2024-01-02",
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/created successfully/i);
    expect(res.body.harvest[0]).toMatchObject({
      tree_id: 1,
      coconut_count: 15,
      total_weight: 25,
    });
  });

  it("updates a harvest successfully", async () => {
    // update the first harvest id=1
    const res = await request(app)
      .patch("/api/harvests/1")
      .send({
        coconutCount: 20,
        totalWeight: 30,
        estimatedValue: 30 * DEFAULT_COPRA_PRICE,
        harvestDate: "2024-01-03",
        treeCode: "TREE-100",
      });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated successfully/i);
  });

  it("retrieves harvest by id", async () => {
    const res = await request(app).get("/api/harvests/1");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it("adds harvest to inventory", async () => {
    const res = await request(app).post("/api/harvests/1/inventory");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(
      /added to inventory|successfully added to inventory/i
    );
  });

  it("deletes a harvest", async () => {
    const res = await request(app).delete("/api/harvests/1");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted successfully/i);
  });

  it("returns stats (recentHarvests array)", async () => {
    // create another harvest to show up in stats
    await request(app).post("/api/harvests").send({
      treeCode: "TREE-100",
      coconutCount: 5,
      totalWeight: 10,
      harvestDate: new Date().toISOString(),
    });
    const res = await request(app).get("/api/harvests/stats");
    expect(res.status).toBe(200);
    expect(res.body.harvest.recentHarvests).toBeInstanceOf(Array);
  });
});
