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

const users = [
  {
    id: "admin-1",
    first_name: "Admin",
    last_name: "User",
    role: "ADMIN",
    email: "admin@example.com",
    farm_id: "farm-1",
    created_at: new Date().toISOString(),
  },
];

let staffSeq = 1;

vi.mock("../supabase.js", () => ({
  default: {
    auth: {
      signUp: ({ email }) => {
        // duplicate email check
        const existing = users.find((u) => u.email === email);
        if (existing) {
          return Promise.resolve({
            data: { user: null },
            error: { message: "User already registered", status: 400 },
          });
        }
        const newId = `staff-${staffSeq++}`;
        return Promise.resolve({ data: { user: { id: newId } }, error: null });
      },
      admin: {
        deleteUser: (id) => {
          const idx = users.findIndex((u) => u.id === id);
          if (idx === -1)
            return Promise.resolve({ error: { message: "Not found" } });
          users.splice(idx, 1);
          return Promise.resolve({ error: null });
        },
      },
    },
    from: (table) => {
      if (table === "user") {
        return {
          select: (cols, opts) => ({
            eq: (field, val) => {
              if (field === "farm_id") {
                const farmFiltered = users.filter((u) => u.farm_id === val);
                return {
                  // filter out a given id (used by .neq in controller logic variant)
                  neq: (f2, v2) => {
                    if (f2 === "id") {
                      const data = farmFiltered.filter((u) => u.id !== v2);
                      return { data, error: null, count: data.length };
                    }
                    return {
                      data: farmFiltered,
                      error: null,
                      count: farmFiltered.length,
                    };
                  },
                  gte: (createdAtField, iso) => {
                    if (createdAtField === "created_at") {
                      const filtered = farmFiltered.filter(
                        (u) => new Date(u.created_at) >= new Date(iso)
                      );
                      return {
                        data: filtered,
                        error: null,
                        count: filtered.length,
                      };
                    }
                    return {
                      data: farmFiltered,
                      error: null,
                      count: farmFiltered.length,
                    };
                  },
                  data: farmFiltered,
                  error: null,
                  count: farmFiltered.length,
                };
              }
              if (field === "id") {
                const byId = users.filter((u) => u.id === val);
                return { data: byId, error: null, count: byId.length };
              }
              return { data: users, error: null, count: users.length };
            },
            neq: () => ({ data: users, error: null, count: users.length }),
            gte: () => ({
              data: users.filter((u) => true),
              error: null,
              count: users.length,
            }),
          }),
          insert: (payload) => {
            const rec = Array.isArray(payload) ? payload[0] : payload;
            users.push({ ...rec, created_at: new Date().toISOString() });
            return { error: null };
          },
          update: (changes) => ({
            eq: (field, val) => {
              const idx = users.findIndex((u) => u.id === val);
              if (idx !== -1) users[idx] = { ...users[idx], ...changes };
              return { error: null };
            },
          }),
          delete: () => ({
            eq: (field, val) => {
              const idx = users.findIndex((u) => u.id === val);
              if (idx !== -1) users.splice(idx, 1);
              return { error: null };
            },
          }),
        };
      }
      return { select: () => ({ eq: () => ({ data: [], error: null }) }) };
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

describe("Staff API", () => {
  it("fails validation on create (missing password)", async () => {
    const res = await request(app).post("/api/staff").send({
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      role: "STAFF",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });

  it("creates a staff member successfully", async () => {
    const res = await request(app).post("/api/staff").send({
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      password: "password123",
      role: "STAFF",
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/created successfully/i);
  });

  it("rejects duplicate email on create", async () => {
    const res = await request(app).post("/api/staff").send({
      firstName: "Johnny",
      lastName: "Doey",
      email: "john@example.com",
      password: "password123",
      role: "STAFF",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("lists staff (excluding admin)", async () => {
    const res = await request(app).get("/api/staff");
    expect(res.status).toBe(200);
    expect(res.body.staff).toBeInstanceOf(Array);
    expect(
      res.body.staff.find((s) => s.email === "admin@example.com")
    ).toBeUndefined();
  });

  it("gets staff by id", async () => {
    const created = users.find((u) => u.email === "john@example.com");
    const res = await request(app).get(`/api/staff/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.id);
  });

  it("updates staff member", async () => {
    const created = users.find((u) => u.email === "john@example.com");
    const res = await request(app).patch(`/api/staff/${created.id}`).send({
      firstName: "Johnny",
      role: "STAFF",
      lastName: "Doe",
      email: "john@example.com",
      password: "password123",
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated successfully/i);
  });

  it("gets staff count stats", async () => {
    const res = await request(app).get("/api/staff/count");
    expect(res.status).toBe(200);
    expect(res.body.staff).toHaveProperty("count");
  });

  it("deletes staff member", async () => {
    const created = users.find((u) => u.email === "john@example.com");
    const res = await request(app).delete(`/api/staff/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted successfully/i);
  });
});
