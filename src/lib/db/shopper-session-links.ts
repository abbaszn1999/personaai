import { db } from "@/lib/supabase/server";

const MAX_SESSION_ID_LENGTH = 128;

/** Normalizes the widget's browser session id, or null when it isn't usable as a key. */
export function parseEmbedSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_SESSION_ID_LENGTH) return null;
  return trimmed;
}

/** Records which shopper account is signed in on a browser session. An existing link is kept,
 *  so a session never moves its spend from one account to another. */
export async function linkShopperSession(input: {
  ownerId: string;
  sessionId: string;
  shopperAccountId: string;
}): Promise<void> {
  const { error } = await db.from("shopper_session_links").upsert(
    {
      owner_id: input.ownerId,
      session_id: input.sessionId,
      shopper_account_id: input.shopperAccountId,
    },
    { onConflict: "owner_id,session_id", ignoreDuplicates: true }
  );
  if (error) console.error("[db/shopper-session-links linkShopperSession]", error);
}
