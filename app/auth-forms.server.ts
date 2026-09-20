import { handleAuthRequest } from "./auth.server";

export function safeReturnTo(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export function runAuthEndpoint(
  request: Request,
  path: string,
  body?: Record<string, unknown>,
  extraHeaders?: HeadersInit,
) {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");
  for (const [name, value] of new Headers(extraHeaders)) {
    headers.set(name, value);
  }

  return handleAuthRequest(
    new Request(new URL(`/api/auth/${path}`, request.url), {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
    }),
  );
}

export async function authError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as {
      code?: unknown;
      message?: unknown;
    };
    if (
      payload.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ||
      payload.code === "USER_ALREADY_EXISTS"
    ) {
      return "An account already exists for this email. Sign in instead.";
    }
    return typeof payload.message === "string" ? payload.message : fallback;
  } catch {
    return fallback;
  }
}
