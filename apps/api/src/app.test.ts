import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "./app.js";
import { emptyEventData } from "./test-data.js";
const app = createApp({
  frontendOrigin: "http://localhost:3000",
  dataForToken: () => ({
    ...emptyEventData,
    isApproved: async (id) => id === "owner",
    listProfiles: async () => [],
  }),
  verifyToken: async (token) =>
    token === "valid"
      ? { id: "owner" }
      : token === "outsider"
        ? { id: "other" }
        : null,
});
test("health is public and responses are not cached", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.headers["cache-control"], "no-store");
  assert.deepEqual(res.body, { status: "ok" });
});
test("private routes reject absent and invalid credentials", async () => {
  for (const token of [undefined, "Bearer invalid", "Basic valid"]) {
    const req = request(app).get("/api/v1/me");
    if (token) req.set("Authorization", token);
    assert.equal((await req).status, 401);
  }
});
test("authenticated accounts outside allowlist are forbidden", async () => {
  assert.equal(
    (
      await request(app)
        .get("/api/v1/me")
        .set("Authorization", "Bearer outsider")
    ).status,
    403,
  );
});
test("allowed account receives only its identifier", async () => {
  const res = await request(app)
    .get("/api/v1/me")
    .set("Authorization", "Bearer valid");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { user: { id: "owner" } });
});
test("CORS does not reflect an arbitrary origin", async () => {
  const res = await request(app)
    .get("/health")
    .set("Origin", "https://untrusted.example");
  assert.equal(
    res.headers["access-control-allow-origin"],
    "http://localhost:3000",
  );
});
test("auth service exceptions fail closed without leaking details", async () => {
  const failing = createApp({
    frontendOrigin: "http://localhost:3000",
    dataForToken: () => ({
      ...emptyEventData,
      isApproved: async (id) => id === "owner",
      listProfiles: async () => [],
    }),
    verifyToken: async () => {
      throw new Error("secret");
    },
  });
  const res = await request(failing)
    .get("/api/v1/me")
    .set("Authorization", "Bearer valid");
  assert.equal(res.status, 503);
  assert.equal(JSON.stringify(res.body).includes("secret"), false);
});

test("profile queries receive the verified request token, never a query-string owner", async () => {
  const calls: string[] = [];
  const secured = createApp({
    frontendOrigin: "http://localhost:3000",
    verifyToken: async (token) => (token === "valid" ? { id: "owner" } : null),
    dataForToken: (token) => {
      calls.push(token);
      return {
        ...emptyEventData,
        isApproved: async (id) => id === "owner",
        listProfiles: async () => [
          {
            id: "profile-1",
            name: "Profile 1",
            avatar: null,
            created_at: "2026-09-11T00:00:00Z",
          },
        ],
      };
    },
  });
  assert.equal((await request(secured).get("/api/v1/profiles")).status, 401);
  assert.deepEqual(calls, []);
  const res = await request(secured)
    .get("/api/v1/profiles?owner_id=someone-else")
    .set("Authorization", "Bearer valid");
  assert.equal(res.status, 200);
  assert.equal(res.body.profiles[0].name, "Profile 1");
  assert.deepEqual(calls, ["valid"]);
});
test("profile routes deny unapproved users and hide database failures", async () => {
  assert.equal(
    (
      await request(app)
        .get("/api/v1/profiles")
        .set("Authorization", "Bearer outsider")
    ).status,
    403,
  );
  for (const failMembership of [true, false]) {
    const failing = createApp({
      frontendOrigin: "http://localhost:3000",
      verifyToken: async () => ({ id: "owner" }),
      dataForToken: () => ({
        ...emptyEventData,
        isApproved: async () => {
          if (failMembership) throw new Error("secret SQL");
          return true;
        },
        listProfiles: async () => {
          throw new Error("secret SQL");
        },
      }),
    });
    const res = await request(failing)
      .get("/api/v1/profiles")
      .set("Authorization", "Bearer valid");
    assert.equal(res.status, 503);
    assert.equal(JSON.stringify(res.body).includes("secret"), false);
  }
});
