import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import request from "supertest";

const mockAuth = {
  signInWithPassword: vi.fn(async ({ email, password }) => {
    if (email === "user@example.com" && password === "ValidPass1") {
      return {
        data: {
          user: { id: "user-123", email: "user@example.com" },
          session: {
            access_token: "access-token",
            refresh_token: "refresh-token",
            expires_in: 3600,
          },
          expires_in: 3600,
        },
        error: null,
      };
    }
    return {
      data: {},
      error: { message: "Invalid login credentials", status: 400 },
    };
  }),
  signUp: vi.fn(async ({ email }) => ({
    data: {
      user: { id: "new-user-1", email },
      session: {
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      },
    },
    error: null,
  })),
  refreshSession: vi.fn(async ({ refresh_token }) => {
    if (refresh_token === "refresh-token" || refresh_token === "new-refresh") {
      return {
        data: {
          user: { id: "user-123", email: "user@example.com" },
          session: {
            access_token: "refreshed-access",
            refresh_token,
            expires_in: 3600,
          },
        },
        error: null,
      };
    }
    return { data: {}, error: { message: "No session", status: 401 } };
  }),
  signOut: vi.fn(async () => ({ error: null })),
  verifyOtp: vi.fn(async ({ token_hash }) => {
    if (token_hash === "valid-token") {
      return { data: { user: { id: "otp-user" } }, error: null };
    }
    return {
      data: { user: null },
      error: { message: "Invalid token", status: 400 },
    };
  }),
  admin: { updateUserById: vi.fn(async () => ({ error: null })) },
  resetPasswordForEmail: vi.fn(async () => ({ error: null })),
};

vi.mock("../supabase.js", () => ({
  default: {
    auth: mockAuth,
    from: (table) => {
      switch (table) {
        case "user":
          return {
            insert: () => ({ error: null }),
            select: () => ({
              eq: (field, value) => ({
                single: () => {
                  if (value === "absent@example.com") {
                    return { data: null, error: null };
                  }
                  return {
                    data: {
                      id: "user-123",
                      first_name: "John",
                      last_name: "Doe",
                      farm_id: "farm-1",
                      role: "ADMIN",
                      email: value,
                    },
                    error: null,
                  };
                },
              }),
            }),
            update: () => ({ eq: () => ({ error: null }) }),
          };
        case "farm":
          return {
            insert: () => ({
              select: () => ({ data: [{ id: "farm-1" }], error: null }),
            }),
            update: () => ({ eq: () => ({ error: null }) }),
          };
        case "inventory":
          return { insert: () => ({ error: null }) };
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

describe("POST /api/auth/login validation", () => {
  it("returns 400 when body is missing", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message", "Validation failed");
    expect(res.body.errors).toBeDefined();
  });

  it("returns 400 when password too short", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "123" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });

  it("returns 400 for invalid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "WrongPass1" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid login/i);
  });

  it("returns 200 for valid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "ValidPass1" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message", "Login successful");
    expect(res.body).toHaveProperty("access_token");
  });
});

describe("POST /api/auth/register validation", () => {
  const base = {
    firstName: "John",
    lastName: "Doe",
    email: "new@example.com",
    password: "Password1",
    paypal_email: "paypal@example.com",
    street: "123 St",
    barangay: "Bgy",
    city: "City",
    province: "Province",
    region: "Region",
    postal_code: "1234",
  };

  it("fails validation when required field missing", async () => {
    const { firstName, ...rest } = base;
    const res = await request(app).post("/api/auth/register").send(rest);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
    expect(res.body.errors.some((e) => e.path === "firstName")).toBe(true);
  });

  it("creates user successfully", async () => {
    const res = await request(app).post("/api/auth/register").send(base);
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("User created successfully");
    expect(res.body).toHaveProperty("user");
    expect(res.body).toHaveProperty("access_token");
  });
});

describe("GET /api/auth/refresh", () => {
  it("returns 401 when no refresh cookie present", async () => {
    const res = await request(app).get("/api/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/no session|token/i);
  });

  it("returns 200 and refreshed token when cookie valid", async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "ValidPass1" });
    const cookie = loginRes.headers["set-cookie"].find((c) =>
      c.includes("refresh_token")
    );
    expect(cookie).toBeDefined();

    const res = await request(app)
      .get("/api/auth/refresh")
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.body.message).toMatch(/refreshed/i);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 200 and clears refresh cookie", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", "refresh_token=refresh-token; Path=/api/auth/refresh")
      .send();
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
    const setCookie = res.headers["set-cookie"] || [];
    const cleared = setCookie.some(
      (c) =>
        /refresh_token=/.test(c) &&
        (/Max-Age=0/i.test(c) || /Expires=/i.test(c))
    );
    expect(cleared).toBe(true);
  });
});

describe("POST /api/auth/forgot password flow", () => {
  it("returns 404 for unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/forgot")
      .send({ email: "absent@example.com" });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/user not found/i);
  });

  it("returns 200 for existing email and triggers resetPasswordForEmail", async () => {
    const res = await request(app)
      .post("/api/auth/forgot")
      .send({ email: "exists@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password reset link/i);
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledOnce();
  });
});

describe("POST /api/auth/update-password", () => {
  it("returns 400 for invalid token", async () => {
    const res = await request(app)
      .post("/api/auth/update-password?token=bad-token")
      .send({ password: "NewSecurePass1" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid token/i);
  });

  it("returns 200 for valid token and updates password", async () => {
    const res = await request(app)
      .post("/api/auth/update-password?token=valid-token")
      .send({ password: "NewSecurePass1" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password updated/i);
    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "valid-token",
      type: "email",
    });
  });
});
