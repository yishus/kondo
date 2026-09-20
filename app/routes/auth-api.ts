import type { Route } from "./+types/auth-api";
import { getAuth, handleAuthRequest } from "../auth.server";
import { genericSignupErrorResponse } from "../signup-errors";

export function loader({ request }: Route.LoaderArgs) {
  return getAuth().handler(request);
}

export async function action({ request }: Route.ActionArgs) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  const isSignup = pathname.endsWith("/api/auth/sign-up/email");
  const response = await handleAuthRequest(request);
  return isSignup && !response.ok
    ? genericSignupErrorResponse(response)
    : response;
}
