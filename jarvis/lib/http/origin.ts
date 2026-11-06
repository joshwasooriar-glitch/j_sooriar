/**
 * The origin the browser actually used, for building redirects.
 *
 * Next's request.url can report a different host than the one the browser
 * sent (for example localhost when the browser used 127.0.0.1, or the internal
 * host behind a proxy). Redirecting there after sign-in drops the session
 * cookie, which was set for the browser's host, and the user lands back on
 * the login page. Found by the acceptance run.
 */
export function requestOrigin(headers: Headers, fallback: string): string {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host || !/^[a-z0-9.\-:[\]]+$/i.test(host)) return fallback;
  const proto = (headers.get("x-forwarded-proto") ?? new URL(fallback).protocol.replace(":", "")).split(",")[0].trim();
  return `${proto === "https" ? "https" : "http"}://${host}`;
}
