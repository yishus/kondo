export const GENERIC_SIGNUP_ERROR =
  "We couldn't create your account. Check your invitation details, or sign in if you already have an account.";

export function genericSignupErrorResponse(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json");
  return new Response(
    JSON.stringify({
      code: "SIGNUP_FAILED",
      message: GENERIC_SIGNUP_ERROR,
    }),
    {
      status: response.status === 429 ? 429 : 400,
      headers,
    },
  );
}
