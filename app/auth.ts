import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, betterAuth } from "better-auth";

import type { Database } from "./db.server";
import * as schema from "./db/schema";

export const CLOSED_BETA_ERROR =
  "Kondo is currently in closed beta. This email is not on the allowlist.";

export function parseAllowedEmails(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function createAuth(
  db: Database,
  options: {
    secret: string;
    baseURL?: string;
    allowedEmails: readonly string[];
  },
) {
  const allowedEmails = new Set(
    options.allowedEmails.map((email) => email.trim().toLowerCase()),
  );

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-up/email": {
          window: 10 * 60,
          max: 5,
        },
      },
    },
    advanced: {
      database: { joins: true },
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (newUser) => {
            if (!allowedEmails.has(newUser.email.trim().toLowerCase())) {
              throw new APIError("FORBIDDEN", {
                code: "EMAIL_NOT_ALLOWLISTED",
                message: CLOSED_BETA_ERROR,
              });
            }
          },
        },
      },
    },
    secret: options.secret,
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
  });
}
