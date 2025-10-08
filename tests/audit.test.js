import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import request from "supertest";

vi.mock("../middleware/authMiddleware.js", () => ({
  authMiddleware: (req, res, next) => {
    res.locals.authData = { sub: "user-123", email: "user@example.com" };
    res.locals.role = "ADMIN";
    res.locals.farmId = 1;
    next();
  },
}));

const auditEvents = [
  {
    id: 1,
    created_at: new Date().toISOString(),
    actor_id: "user-123",
    action: "update",
    resource_type: "tree",
    resource_id: "42",
    previous: { status: "Healthy" },
    changes: { status: "Diseased" },
    next: { status: "Diseased" },
    farm_id: 1,
  },
  {
    id: 2,
    created_at: new Date().toISOString(),
    actor_id: "user-999",
    action: "create",
    resource_type: "inventory",
    resource_id: "77",
    previous: null,
    changes: { name: "Fertilizer" },
    next: { name: "Fertilizer" },
    farm_id: 2,
  },
];

vi.mock("../supabase.js", () => ({
  default: {
    from: (table) => {
      if (table !== "audit_events") {
        return { select: () => ({}) };
      }
      let rows = [...auditEvents];
      const api = {
        select: () => api,
        eq: (field, value) => {
          rows = rows.filter((r) => String(r[field]) === String(value));
          return api;
        },
        order: () => api,
        ilike: (field, pattern) => {
          const needle = String(pattern).replace(/%/g, "").toLowerCase();
          rows = rows.filter((r) =>
            String(r[field] || "")
              .toLowerCase()
              .includes(needle)
          );
          return api;
        },
        or: () => api,
        range: (from, to) => ({ data: rows.slice(from, to + 1), error: null }),
      };
      return api;
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

describe("Audit Events API", () => {
  it("returns only events for the user's farm", async () => {
    const res = await request(app).get("/api/audit-events");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.audit_events)).toBe(true);
    // only farm_id = 1 should be returned
    expect(res.body.audit_events.every((e) => e.farm_id === 1)).toBe(true);
    expect(res.body.audit_events.length).toBe(1);
  });

  it("supports pagination", async () => {
    const res = await request(app).get("/api/audit-events?page=1&pageSize=1");
    expect(res.status).toBe(200);
    expect(res.body.audit_events.length).toBeLessThanOrEqual(1);
  });
});
