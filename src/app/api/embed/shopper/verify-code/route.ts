import { NextRequest } from "next/server";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import {
  consumeShopperLoginCode,
  getLatestShopperLoginCode,
  getShopperAccountByEmail,
  incrementShopperLoginCodeAttempts,
  upsertShopperAccount,
} from "@/lib/db/shopper-accounts";
import { listShopperProfiles } from "@/lib/db/shopper-profiles";
import { linkShopperSession, parseEmbedSessionId } from "@/lib/db/shopper-session-links";
import { hashToken } from "@/lib/shopper-auth/tokens";
import { issueShopperSession } from "@/lib/shopper-auth/session";
import { serializeShopperProfile } from "@/lib/shopper-auth/serialize-profile";

const MAX_ATTEMPTS = 5;

interface RequestBody {
  embedToken?: string;
  email?: string;
  code?: string;
  acceptPrivacy?: boolean;
  sessionId?: string;
}

export async function OPTIONS() {
  return embedOptions();
}

/** Second step of shopper sign-in: checks the code emailed by request-code, then creates the
 *  shopper account (first time) or just signs back into the existing one, and issues a
 *  long-lived bearer session token. Existing profiles come back in the same payload so the
 *  widget can skip a second round trip on login. */
export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));

    const resolution = await resolveEmbedRequest(body.embedToken);
    if ("error" in resolution) return resolution.error;
    const { workspace } = resolution;

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!email || !code) {
      return embedJson({ error: "Email and code are required." }, { status: 400 });
    }

    const record = await getLatestShopperLoginCode(workspace.workspaceId, email);
    if (!record) {
      return embedJson({ error: "That code has expired — request a new one." }, { status: 400 });
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      return embedJson({ error: "Too many incorrect attempts — request a new code." }, { status: 429 });
    }
    if (new Date(record.expiresAt).getTime() < Date.now()) {
      return embedJson({ error: "That code has expired — request a new one." }, { status: 400 });
    }

    if (hashToken(code) !== record.codeHash) {
      await incrementShopperLoginCodeAttempts(record.id, record.attempts);
      return embedJson({ error: "Incorrect code — please try again." }, { status: 400 });
    }

    const existingAccount = await getShopperAccountByEmail(workspace.workspaceId, email);
    if (!existingAccount && body.acceptPrivacy !== true) {
      return embedJson(
        { error: "Please accept the privacy notice to continue.", code: "privacy_required" },
        { status: 400 }
      );
    }

    await consumeShopperLoginCode(record.id);

    const account = await upsertShopperAccount(workspace.workspaceId, email, body.acceptPrivacy === true);
    if (!account) {
      return embedJson({ error: "Could not create your account — please try again." }, { status: 500 });
    }

    const sessionId = parseEmbedSessionId(body.sessionId);
    if (sessionId) {
      await linkShopperSession({ ownerId: workspace.ownerId, sessionId, shopperAccountId: account.id });
    }

    const userAgent = req.headers.get("user-agent");
    const token = await issueShopperSession(account.id, userAgent);
    const profiles = (await listShopperProfiles(account.id)).map(serializeShopperProfile);

    return embedJson({
      token,
      account: { id: account.id, email: account.email, createdAt: account.createdAt },
      profiles,
    });
  } catch (err) {
    console.error("[api/embed/shopper/verify-code POST]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}
