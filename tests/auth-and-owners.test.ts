import { expect, test } from "bun:test";
import { Database as SQLite } from "bun:sqlite";
import { readFileSync } from "node:fs";

import {
  CLOSED_BETA_ERROR,
  createAuth,
  parseAllowedEmails,
} from "../app/auth";
import { getDb } from "../app/db.server";
import { trips } from "../app/db/schema";
import {
  GENERIC_SIGNUP_ERROR,
  genericSignupErrorResponse,
} from "../app/signup-errors";
import { addTripOwner, listTripOwners } from "../app/trip-owners.server";
import {
  protectSignupWithTurnstile,
  verifyTurnstile,
} from "../app/turnstile.server";

const baseline = readFileSync(
  new URL("../migrations/0000_initial.sql", import.meta.url),
  "utf8",
);
const authMigration = readFileSync(
  new URL("../migrations/0001_auth_and_trip_owners.sql", import.meta.url),
  "utf8",
);
const rateLimitMigration = readFileSync(
  new URL("../migrations/0002_auth_rate_limit.sql", import.meta.url),
  "utf8",
);

function setup() {
  const sqlite = new SQLite(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(baseline);
  sqlite.exec(authMigration);
  sqlite.exec(rateLimitMigration);
  const binding = {
    prepare(query: string) {
      return {
        bind(...args: unknown[]) {
          const statement = sqlite.query(query);
          return {
            async raw() { return statement.values(...args); },
            execute() { return { results: statement.all(...args), success: true }; },
            async all() { return this.execute(); },
            async run() { return { meta: statement.run(...args), success: true }; },
          };
        },
      };
    },
    async batch(statements: { execute: () => unknown }[]) {
      return sqlite.transaction(() => statements.map((statement) => statement.execute()))();
    },
  };
  return {
    sqlite,
    db: getDb(binding as unknown as D1Database),
  };
}

test("closed beta email configuration is normalized and de-duplicated", () => {
  expect(parseAllowedEmails(" Alex@Example.com,\nSAM@example.com, alex@example.com ")).toEqual([
    "alex@example.com",
    "sam@example.com",
  ]);
});

test("signup failures use one generic public response", async () => {
  const rejected = genericSignupErrorResponse(
    Response.json({ code: "EMAIL_NOT_ALLOWLISTED" }, { status: 403 }),
  );
  expect(rejected.status).toBe(400);
  expect(await rejected.json()).toEqual({
    code: "SIGNUP_FAILED",
    message: GENERIC_SIGNUP_ERROR,
  });

  const limited = genericSignupErrorResponse(
    Response.json({}, {
      status: 429,
      headers: { "X-Retry-After": "600" },
    }),
  );
  expect(limited.status).toBe(429);
  expect(limited.headers.get("X-Retry-After")).toBe("600");
  expect(await limited.json()).toEqual({
    code: "SIGNUP_FAILED",
    message: GENERIC_SIGNUP_ERROR,
  });
});

test("Better Auth creates a user and resolves its session with the D1 schema", async () => {
  const app = setup();
  try {
    const auth = createAuth(app.db, {
      secret: "test-secret-that-is-at-least-32-characters-long",
      baseURL: "http://localhost",
      allowedEmails: ["alex@example.com"],
    });
    const response = await auth.handler(new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ name: "Alex", email: "alex@example.com", password: "password123" }),
    }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("Set-Cookie");
    expect(cookie).toContain("better-auth.session_token");

    const session = await auth.handler(new Request("http://localhost/api/auth/get-session", {
      headers: { Cookie: cookie! },
    }));
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: { name: "Alex", email: "alex@example.com" } });

    const duplicate = await auth.handler(new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ name: "Other Alex", email: "ALEX@EXAMPLE.COM", password: "password456" }),
    }));
    expect(duplicate.status).toBe(422);
    expect(await duplicate.json()).toMatchObject({
      code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
    });
    expect(app.sqlite.query("SELECT COUNT(*) FROM user").values()).toEqual([[1]]);
  } finally {
    app.sqlite.close();
  }
});

test("closed beta signup rejects an email outside the allowlist", async () => {
  const app = setup();
  try {
    const auth = createAuth(app.db, {
      secret: "test-secret-that-is-at-least-32-characters-long",
      baseURL: "http://localhost",
      allowedEmails: [" invited@example.com "],
    });
    const response = await auth.handler(new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ name: "Uninvited", email: "nope@example.com", password: "password123" }),
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: "EMAIL_NOT_ALLOWLISTED",
      message: CLOSED_BETA_ERROR,
    });
    expect(app.sqlite.query("SELECT COUNT(*) FROM user").values()).toEqual([[0]]);
  } finally {
    app.sqlite.close();
  }
});

test("signup is limited to five attempts per ten-minute window in D1", async () => {
  const app = setup();
  try {
    const auth = createAuth(app.db, {
      secret: "test-secret-that-is-at-least-32-characters-long",
      baseURL: "http://localhost",
      allowedEmails: [],
    });
    const statuses = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await auth.handler(new Request("http://localhost/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost" },
        body: JSON.stringify({
          name: "Blocked",
          email: `blocked-${attempt}@example.com`,
          password: "password123",
        }),
      }));
      statuses.push(response.status);
    }

    expect(statuses).toEqual([403, 403, 403, 403, 403, 429]);
    expect(app.sqlite.query("SELECT count FROM rate_limit").values()).toEqual([[5]]);
  } finally {
    app.sqlite.close();
  }
});

test("Turnstile verification fails closed and accepts only signup tokens", async () => {
  let verificationRequests = 0;
  const fetcher = (async (input, init) => {
    verificationRequests += 1;
    expect(String(input)).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      secret: "turnstile-test-secret",
      response: "verified-token",
      remoteip: "203.0.113.10",
    });
    return Response.json({ success: true, action: "signup" });
  }) as typeof fetch;

  expect(await verifyTurnstile({
    fetcher,
    responseToken: "verified-token",
    secretKey: "",
  })).toBe(false);
  expect(verificationRequests).toBe(0);

  expect(await verifyTurnstile({
    fetcher,
    remoteIp: "203.0.113.10",
    responseToken: "verified-token",
    secretKey: "turnstile-test-secret",
  })).toBe(true);
  expect(verificationRequests).toBe(1);

  expect(await verifyTurnstile({
    fetcher: (async () => Response.json({ success: true, action: "login" })) as typeof fetch,
    responseToken: "verified-token",
    secretKey: "turnstile-test-secret",
  })).toBe(false);
});

test("Turnstile runs before the protected auth handler", async () => {
  let authHandlerCalls = 0;
  const request = new Request("http://localhost/api/auth/sign-up/email", {
    method: "POST",
    headers: { "x-captcha-response": "bad-token" },
  });
  const response = await protectSignupWithTurnstile({
    request,
    secretKey: "turnstile-test-secret",
    fetcher: (async () => Response.json({ success: false })) as typeof fetch,
    next: async () => {
      authHandlerCalls += 1;
      return new Response("handled");
    },
  });

  expect(response.status).toBe(403);
  expect(authHandlerCalls).toBe(0);

  const signInResponse = await protectSignupWithTurnstile({
    request: new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
    }),
    secretKey: "",
    next: async () => {
      authHandlerCalls += 1;
      return new Response("handled");
    },
  });
  expect(signInResponse.status).toBe(200);
  expect(authHandlerCalls).toBe(1);
});

test("an empty allowlist blocks signup without blocking existing-user sign-in", async () => {
  const app = setup();
  try {
    const configuredAuth = createAuth(app.db, {
      secret: "test-secret-that-is-at-least-32-characters-long",
      baseURL: "http://localhost",
      allowedEmails: ["existing@example.com"],
    });
    const signup = await configuredAuth.handler(new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ name: "Existing", email: "existing@example.com", password: "password123" }),
    }));
    expect(signup.status).toBe(200);

    const unconfiguredAuth = createAuth(app.db, {
      secret: "test-secret-that-is-at-least-32-characters-long",
      baseURL: "http://localhost",
      allowedEmails: [],
    });
    const blockedSignup = await unconfiguredAuth.handler(new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ name: "New User", email: "new@example.com", password: "password123" }),
    }));
    expect(blockedSignup.status).toBe(403);

    const signIn = await unconfiguredAuth.handler(new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ email: "existing@example.com", password: "password123" }),
    }));
    expect(signIn.status).toBe(200);
    expect(signIn.headers.get("Set-Cookie")).toContain("better-auth.session_token");
    expect(app.sqlite.query("SELECT COUNT(*) FROM user").values()).toEqual([[1]]);
  } finally {
    app.sqlite.close();
  }
});

test("an owner can add another registered user and duplicate ownership is rejected", async () => {
  const app = setup();
  try {
    const now = Date.now();
    app.sqlite.exec(`
      INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES
        ('first','First Owner','first@example.com',0,${now},${now}),
        ('second','Second Owner','second@example.com',0,${now},${now});
      INSERT INTO trips(id,title) VALUES ('trip','Japan');
      INSERT INTO trip_owners(trip_id,user_id) VALUES ('trip','first');
    `);

    expect(await addTripOwner(app.db, "trip", " SECOND@EXAMPLE.COM ")).toMatchObject({
      ok: true,
      owner: { id: "second" },
    });
    expect(await listTripOwners(app.db, "trip")).toEqual([
      { id: "first", name: "First Owner", email: "first@example.com" },
      { id: "second", name: "Second Owner", email: "second@example.com" },
    ]);
    expect(await addTripOwner(app.db, "trip", "second@example.com")).toMatchObject({
      ok: false,
      error: expect.stringContaining("already an owner"),
    });
    expect(await addTripOwner(app.db, "trip", "missing@example.com")).toMatchObject({
      ok: false,
      error: expect.stringContaining("No Kondo account"),
    });
    await app.db.delete(trips);
    expect(app.sqlite.query("SELECT COUNT(*) FROM trip_owners").values()).toEqual([[0]]);
    expect(app.sqlite.query("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    app.sqlite.close();
  }
});
