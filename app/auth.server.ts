import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { redirect } from "react-router";

import { createAuth, parseAllowedEmails } from "./auth";
import { getDb, type Database } from "./db.server";
import { tripOwners } from "./db/schema";
import { protectSignupWithTurnstile } from "./turnstile.server";

type AuthEnvironment = typeof env & {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  CLOSED_BETA_EMAILS?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
};

let authInstance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  if (authInstance) return authInstance;

  const authEnv = env as AuthEnvironment;
  if (!authEnv.BETTER_AUTH_SECRET) {
    throw new Error(
      "BETTER_AUTH_SECRET is required. Add a random secret of at least 32 characters to .dev.vars or your Worker secrets.",
    );
  }
  authInstance = createAuth(getDb(env.DB), {
    secret: authEnv.BETTER_AUTH_SECRET,
    baseURL: authEnv.BETTER_AUTH_URL,
    allowedEmails: parseAllowedEmails(authEnv.CLOSED_BETA_EMAILS ?? ""),
  });
  return authInstance;
}

export async function handleAuthRequest(request: Request) {
  return protectSignupWithTurnstile({
    request,
    secretKey: (env as AuthEnvironment).TURNSTILE_SECRET_KEY ?? "",
    next: () => getAuth().handler(request),
  });
}

export function getTurnstileSiteKey() {
  return ((env as AuthEnvironment).TURNSTILE_SITE_KEY ?? "").trim();
}

export async function getOptionalUser(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

export async function requireUser(request: Request) {
  const user = await getOptionalUser(request);
  if (user) return user;

  const url = new URL(request.url);
  const returnTo = `${url.pathname}${url.search}`;
  throw redirect(`/sign-in?${new URLSearchParams({ returnTo })}`);
}

export async function requireTripOwner(
  request: Request,
  db: Database,
  tripId: string,
) {
  const currentUser = await requireUser(request);
  const [ownership] = await db
    .select({ tripId: tripOwners.tripId })
    .from(tripOwners)
    .where(
      and(
        eq(tripOwners.tripId, tripId),
        eq(tripOwners.userId, currentUser.id),
      ),
    )
    .limit(1);

  if (!ownership) throw new Response("Trip not found", { status: 404 });
  return currentUser;
}
