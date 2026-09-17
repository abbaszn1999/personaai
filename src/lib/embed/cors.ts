/**
 * Every `/api/embed/*` route is deliberately public and cross-origin (it's called from
 * arbitrary merchant websites, not this app's own domain). The embed token in the request
 * body — not a cookie — is the credential, so `Access-Control-Allow-Origin: *` is safe here:
 * there's no session to leak via `credentials: include`.
 */
export const EMBED_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function embedJson(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    headers: { ...EMBED_CORS_HEADERS, ...(init?.headers ?? {}) },
  });
}

export function embedOptions(): Response {
  return new Response(null, { status: 204, headers: EMBED_CORS_HEADERS });
}
