import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
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

// In-memory datasets
const trees = [
  { id: 1, farm_id: "farm-1", status: "Healthy" },
  { id: 2, farm_id: "farm-1", status: "Healthy" },
  { id: 3, farm_id: "farm-1", status: "Diseased" },
  { id: 4, farm_id: "farm-2", status: "Healthy" },
];
const harvests = [
  {
    id: 1,
    tree_id: 1,
    total_weight: 10,
    estimated_value: 680,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    tree_id: 2,
    total_weight: 5,
    estimated_value: 340,
    created_at: new Date().toISOString(),
  },
];
const inventory = [
  { id: 1, farm_id: "farm-1" },
  { id: 2, farm_id: "farm-1" },
];
const users = [
  { id: "admin-1", farm_id: "farm-1", role: "ADMIN" },
  { id: "staff-1", farm_id: "farm-1", role: "STAFF" },
  { id: "staff-2", farm_id: "farm-1", role: "STAFF" },
  { id: "staff-3", farm_id: "farm-2", role: "STAFF" },
];

function countWrapper(arr) {
  return { data: arr, error: null, count: arr.length };
}

vi.mock("../supabase.js", () => ({
  default: {
    from: (table) => {
      switch (table) {
        case "tree":
          return {
            select: (cols, opts) => ({
              eq: (field, val) => {
                if (field === "farm_id") {
                  const farmFiltered = trees.filter((t) => t.farm_id === val);
                  return {
                    eq: (f2, v2) => {
                      if (f2 === "status") {
                        const statusFiltered = farmFiltered.filter(
                          (t) => t.status === v2
                        );
                        return countWrapper(statusFiltered);
                      }
                      return countWrapper(farmFiltered);
                    },
                    ...countWrapper(farmFiltered),
                  };
                }
                return countWrapper(trees);
              },
              ...countWrapper(trees),
            }),
          };
        case "harvest":
          return {
            select: () => {
              const buildResponse = (rows) => ({
                data: rows,
                error: null,
                count: rows.length,
                gte: (col, iso) => {
                  if (col === "created_at") {
                    const threshold = new Date(iso);
                    const recent = rows.filter(
                      (h) => new Date(h.created_at) >= threshold
                    );
                    return { data: recent, error: null, count: recent.length };
                  }
                  return { data: rows, error: null, count: rows.length };
                },
              });
              const base = buildResponse(harvests);
              return {
                ...base,
                eq: (field, val) => {
                  let filtered = harvests;
                  if (field === "tree.farm_id") {
                    filtered = harvests.filter((h) => {
                      const tree = trees.find((t) => t.id === h.tree_id);
                      return tree?.farm_id === val;
                    });
                  }
                  const eqResp = buildResponse(filtered);
                  // chain: eq(...).gte(...)
                  return eqResp;
                },
              };
            },
          };
        case "inventory":
          return {
            select: () => ({
              eq: (field, val) => {
                if (field === "farm_id") {
                  const farmFiltered = inventory.filter(
                    (i) => i.farm_id === val
                  );
                  return { ...countWrapper(farmFiltered) };
                }
                return countWrapper(inventory);
              },
              ...countWrapper(inventory),
            }),
          };
        case "user":
          return {
            select: (cols, opts) => ({
              eq: (field, val) => {
                if (field === "farm_id") {
                  const farmFiltered = users.filter((u) => u.farm_id === val);
                  return {
                    eq: (f2, v2) => {
                      if (f2 === "role") {
                        const roleFiltered = farmFiltered.filter(
                          (u) => u.role === v2
                        );
                        return {
                          neq: (f3, v3) => {
                            if (f3 === "id") {
                              const filtered = roleFiltered.filter(
                                (u) => u.id !== v3
                              );
                              return { ...countWrapper(filtered) };
                            }
                            return { ...countWrapper(roleFiltered) };
                          },
                          ...countWrapper(roleFiltered),
                        };
                      }
                      return countWrapper(farmFiltered);
                    },
                    ...countWrapper(farmFiltered),
                  };
                }
                return countWrapper(users);
              },
              neq: () => countWrapper(users),
              gte: () => countWrapper(users),
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

describe("Dashboard Stats API", () => {
  it("returns aggregated dashboard stats", async () => {
    const res = await request(app).get("/api/stats");
    expect(res.status).toBe(200);
    expect(res.body.trees.total).toBeDefined();
    expect(res.body.harvests.totalWeight).toBeGreaterThan(0);
    expect(res.body.inventory.totalItems).toBeGreaterThan(0);
    expect(res.body.staff.total).toBeGreaterThanOrEqual(0);
  });
});
