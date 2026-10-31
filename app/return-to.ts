/** Resolve post-auth navigation to a path on this app's origin. */
export function safeReturnTo(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  const origin = "https://kondo.invalid";
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}
