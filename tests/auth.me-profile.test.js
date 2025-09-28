import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import request from "supertest";

vi.mock("../middleware/authMiddleware.js", () => ({
  authMiddleware: (req, res, next) => {
    res.locals.authData = { sub: "user-123", email: "user@example.com" };
    res.locals.role = "ADMIN";
    res.locals.farmId = "farm-1";
    res.locals.region = "Region";
    next();
  },
  restrictToAdmin: (req, res, next) => next(),
}));

vi.mock("../supabase.js", () => ({
  default: {
    from: (table) => {
      switch (table) {
        case "user":
          return {
            select: () => ({
              eq: () => ({
                single: () => ({
                  data: {
                    first_name: "John",
                    last_name: "Doe",
                    farm_id: {
                      street: "123 St",
                      barangay: "Bgy",
                      city: "City",
                      province: "Province",
                      region: "Region",
                      postal_code: "1234",
                    },
                    role: "ADMIN",
                  },
                  error: null,
                }),
              }),
            }),
            update: () => ({ eq: () => ({ error: null }) }),
          };
        case "farm":
          return {
            update: () => ({ eq: () => ({ error: null }) }),
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

describe("GET /api/auth/me", () => {
  it("returns current user profile assembled from user + farm", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: "user@example.com",
      firstName: "John",
      lastName: "Doe",
      role: "ADMIN",
      farmId: "farm-1",
      farmAddress: {
        street: "123 St",
        barangay: "Bgy",
        city: "City",
        province: "Province",
        region: "Region",
        postal_code: "1234",
      },
    });
  });
});

describe("PATCH /api/auth/update-profile", () => {
  it("updates profile and returns new data", async () => {
    const payload = {
      firstName: "Jane",
      lastName: "Smith",
      street: "456 Ave",
      barangay: "NewBgy",
      city: "NewCity",
      province: "NewProvince",
      region: "NewRegion",
      postal_code: "9876",
    };

    const res = await request(app)
      .patch("/api/auth/update-profile")
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated/i);
    expect(res.body.data).toMatchObject(payload);
  });
});
