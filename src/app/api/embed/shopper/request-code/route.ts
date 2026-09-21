import { NextRequest } from "next/server";
import { resolveEmbedRequest } from "@/lib/embed/resolve";
import { embedJson, embedOptions } from "@/lib/embed/cors";
import {
  consumeShopperLoginCode,
  createShopperLoginCode,
  getLatestShopperLoginCode,
} from "@/lib/db/shopper-accounts";
import { allowLoginCodeRequest } from "@/lib/shopper-auth/rate-limit";
import { generateLoginCode, hashToken } from "@/lib/shopper-auth/tokens";
import { sendShopperLoginCode } from "@/lib/shopper-auth/email";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RequestBody {
  embedToken?: string;
  email?: string;
}

export async function OPTIONS() {
  return embedOptions();
}

/** First step of shopper sign-in: emails a 6-digit code for the given (workspace, email) pair.
 *  Always responds 200 on a well-formed email — this endpoint's own rate limits are the abuse
 *  defense, not response-shape secrecy, since an account is only ever created at verify-code
 *  once a code is actually proven, so there's no meaningful "does this email exist" to leak. */
export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json().catch(() => ({}));

    const resolution = await resolveEmbedRequest(body.embedToken);
    if ("error" in resolution) return resolution.error;
    const { workspace } = resolution;

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !EMAIL_RE.test(email)) {
      return embedJson({ error: "Enter a valid email address." }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!allowLoginCodeRequest(workspace.workspaceId, email, ip)) {
      return embedJson({ error: "Too many code requests — please try again later." }, { status: 429 });
    }

    const latest = await getLatestShopperLoginCode(workspace.workspaceId, email);
    if (latest && Date.now() - new Date(latest.createdAt).getTime() < RESEND_COOLDOWN_MS) {
      return embedJson({ error: "Please wait a moment before requesting another code." }, { status: 429 });
    }

    const code = generateLoginCode();
    await createShopperLoginCode({
      workspaceId: workspace.workspaceId,
      email,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });

    const sent = await sendShopperLoginCode(email, code, workspace.branding.agentName);
    if (!sent) {
      // The row is already written, and the resend cooldown above only looks at unconsumed
      // codes — burn this one so a mail failure doesn't lock the shopper out for a minute
      // waiting on a code that was never delivered.
      const orphan = await getLatestShopperLoginCode(workspace.workspaceId, email);
      if (orphan) await consumeShopperLoginCode(orphan.id);
      return embedJson({ error: "Couldn't send the code right now — please try again." }, { status: 502 });
    }

    return embedJson({ ok: true });
  } catch (err) {
    console.error("[api/embed/shopper/request-code POST]", err);
    return embedJson({ error: "Internal server error" }, { status: 500 });
  }
}
