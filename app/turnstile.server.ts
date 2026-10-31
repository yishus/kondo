const siteVerifyURL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileVerification = {
  action?: unknown;
  success?: unknown;
};

export async function verifyTurnstile({
  fetcher = fetch,
  remoteIp,
  responseToken,
  secretKey,
}: {
  fetcher?: typeof fetch;
  remoteIp?: string;
  responseToken: string;
  secretKey: string;
}) {
  if (!secretKey || !responseToken) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(siteVerifyURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: secretKey,
        response: responseToken,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) return false;

    const result = (await response.json()) as TurnstileVerification;
    // Cloudflare's public test keys return action "test" or omit it. Still
    // require a successful Siteverify response and the exact dummy token.
    const testVerification = secretKey === "1x0000000000000000000000000000000AA"
      && responseToken === "XXXX.DUMMY.TOKEN.XXXX"
      && (result.action === undefined || result.action === "test");
    return result.success === true && (result.action === "signup" || testVerification);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function protectSignupWithTurnstile({
  fetcher,
  next,
  request,
  secretKey,
}: {
  fetcher?: typeof fetch;
  next: () => Promise<Response>;
  request: Request;
  secretKey: string;
}) {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  if (pathname.endsWith("/api/auth/sign-up/email")) {
    const verified = await verifyTurnstile({
      fetcher,
      secretKey,
      responseToken: request.headers.get("x-captcha-response") ?? "",
      remoteIp: request.headers.get("cf-connecting-ip") ?? undefined,
    });
    if (!verified) {
      return Response.json(
        { code: "CAPTCHA_FAILED", message: "Signup verification failed" },
        { status: 403 },
      );
    }
  }

  return next();
}
