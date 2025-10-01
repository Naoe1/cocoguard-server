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

// In-memory store to simulate 'tree' rows for create/read/update/delete flows
const trees = [];
let idSeq = 1;

vi.mock("../supabase.js", () => ({
  default: {
    from: (table) => {
      switch (table) {
        case "tree":
          return {
            select: (cols) => ({
              eq: (field, value) => {
                if (field === "farm_id") {
                  const farmFiltered = trees.filter((t) => t.farm_id === value);
                  return {
                    // Support chaining second eq("tree_code", code)
                    eq: (nextField, nextValue) => {
                      if (nextField === "tree_code") {
                        const data = farmFiltered.filter(
                          (t) => t.tree_code === nextValue
                        );
                        return { data, error: null };
                      }
                      // Fallback
                      return { data: farmFiltered, error: null };
                    },
                    order: () => ({
                      limit: () => ({
                        order: () => ({ data: farmFiltered, error: null }),
                      }),
                    }),
                  };
                }
                if (field === "id") {
                  const data = trees.filter(
                    (t) => String(t.id) === String(value)
                  );
                  return {
                    data,
                    error: null,
                    single: () => ({ data: data[0], error: null }),
                    select: () => ({ data, error: null }),
                    eq: () => ({ data, error: null }),
                  };
                }
                if (field === "tree_code") {
                  const data = trees.filter((t) => t.tree_code === value);
                  return {
                    data,
                    error: null,
                    select: () => ({ data, error: null }),
                    eq: () => ({ data, error: null }),
                  };
                }
                return { single: () => ({ data: null, error: null }) };
              },
              order: () => ({
                limit: () => ({ order: () => ({ data: trees, error: null }) }),
              }),
            }),
            insert: (payload) => {
              const arr = Array.isArray(payload) ? payload : [payload];
              const inserted = arr.map((p) => ({
                id: idSeq++,
                updated_at: new Date().toISOString(),
                ...p,
              }));
              trees.push(...inserted);
              return {
                select: () => ({
                  single: () => ({ data: inserted[0], error: null }),
                }),
              };
            },
            update: (changes) => ({
              eq: (field, value) => {
                const idx = trees.findIndex(
                  (t) => String(t.id) === String(value)
                );
                if (idx !== -1) {
                  trees[idx] = { ...trees[idx], ...changes };
                }
                return { error: null };
              },
            }),
            delete: () => ({
              eq: (field, value) => {
                const idx = trees.findIndex(
                  (t) => String(t.id) === String(value)
                );
                if (idx !== -1) trees.splice(idx, 1);
                return { error: null };
              },
            }),
          };
        default:
          return {
            select: () => ({
              eq: () => ({ single: () => ({ data: null, error: null }) }),
            }),
          };
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

describe("Coconuts API", () => {
  it("lists coconuts (empty initially)", async () => {
    const res = await request(app).get("/api/coconuts");
    expect(res.status).toBe(200);
    expect(res.body.coconuts).toEqual([]);
  });

  it("fails validation on create (missing required status)", async () => {
    const res = await request(app).post("/api/coconuts").send({
      treeCode: "TREE-001",
      plantingDate: "2024-01-01",
      height: 2,
      trunkDiameter: 5,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });

  it("creates a coconut successfully", async () => {
    const res = await request(app).post("/api/coconuts").send({
      treeCode: "TREE-001",
      plantingDate: "2024-01-01",
      height: 2,
      trunkDiameter: 5,
      status: "Healthy",
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/created successfully/i);
    expect(res.body.coconut).toMatchObject({
      tree_code: "TREE-001",
      status: "Healthy",
    });
  });

  it("rejects duplicate tree code", async () => {
    // second insert with same treeCode
    const res = await request(app).post("/api/coconuts").send({
      treeCode: "TREE-001",
      plantingDate: "2024-01-02",
      height: 3,
      trunkDiameter: 6,
      status: "Healthy",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(res.body.errors?.[0]?.message).toMatch(/already exists/i);
  });

  it("updates a coconut successfully", async () => {
    const res = await request(app).patch("/api/coconuts/1").send({
      treeCode: "TREE-001",
      plantingDate: "2024-01-01",
      height: 2.5,
      trunkDiameter: 5.2,
      status: "Healthy",
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated successfully/i);
  });

  it("deletes a coconut", async () => {
    const res = await request(app).delete("/api/coconuts/1");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted successfully/i);
  });
});
