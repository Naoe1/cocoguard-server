import request from "supertest";
import { vi, describe, it, expect } from "vitest";

import app from "../app.js";

describe("GET / (root health check)", () => {
  it("should return 200 and running message", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("CocoGuard API is running");
  });
});

describe("Auth protection", () => {
  it("returns 403 and minimal error body when accessing protected route without token", async () => {
    const res = await request(app).get("/api/coconuts");
    expect(res.status).toBe(403);
    expect(res.body).toBeTypeOf("object");
    expect(Object.keys(res.body)).toEqual(["message"]);
    expect(res.body.message).toMatch(/unauthorized/i);
  });
});
