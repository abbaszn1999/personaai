import { GoogleAuth } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/cloud-platform"];

let cachedAuth: GoogleAuth | null = null;

/**
 * Resolves service-account credentials from env, in order of how pleasant they are to set:
 *
 * 1. `ACS_CLIENT_EMAIL` + `ACS_PRIVATE_KEY` — two plain values copied out of the key JSON the
 *    Cloud console hands you. Preferred: a whole JSON blob on one env line is miserable to paste
 *    and easy to corrupt.
 * 2. `GOOGLE_APPLICATION_CREDENTIALS_JSON` — that same JSON, inline, for deploy targets whose
 *    secret stores are already populated that way.
 *
 * `undefined` hands control back to `GoogleAuth`, which falls back to
 * `GOOGLE_APPLICATION_CREDENTIALS` (a key-file path) and then ambient ADC. Note that ADC's
 * *user* credentials are useless here regardless — `retail.googleapis.com` rejects end-user
 * credentials outright and accepts only a service account.
 */
function resolveCredentials(): { client_email: string; private_key: string } | undefined {
  const clientEmail = process.env.ACS_CLIENT_EMAIL;
  const privateKey = process.env.ACS_PRIVATE_KEY;
  if (clientEmail && privateKey) {
    // Env files can't hold real newlines, so a pasted PEM arrives with literal backslash-n that
    // the crypto layer would reject.
    return { client_email: clientEmail, private_key: privateKey.replace(/\\n/g, "\n") };
  }

  const inlineJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  return inlineJson ? JSON.parse(inlineJson) : undefined;
}

/** One `GoogleAuth` instance per process — it caches the token internally and refreshes on
 *  expiry, so nothing here needs its own TTL bookkeeping. */
function getAuth(): GoogleAuth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = new GoogleAuth({ scopes: SCOPES, credentials: resolveCredentials() });
  return cachedAuth;
}

export async function getAcsAccessToken(): Promise<string> {
  const client = await getAuth().getClient();
  const { token } = await client.getAccessToken();
  if (!token) {
    throw new Error("[acs/auth] GoogleAuth returned no access token — check service account credentials");
  }
  return token;
}
