import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { verifyPassword } from "@/modules/auth/lib/helpers";
import { sessionOptions, type SessionData } from "@/modules/auth/lib/session";
import { getPasswordHash, deleteUser } from "@/lib/db/users";
import { deleteAllSessionsForUser, getSessionStartedAt } from "@/lib/db/sessions";
import { getOrCreateBillingAccount, listLiveSubscriptions } from "@/lib/db/billing";
import { getStripe } from "@/lib/stripe/client";

const RECENT_SIGN_IN_MS = 15 * 60_000;

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { password?: unknown; confirm?: unknown };

    // Re-auth for password accounts
    if (user.provider === "credentials") {
      const { password } = body;
      if (typeof password !== "string" || !password) {
        return Response.json({ error: "Password required to delete account" }, { status: 400 });
      }

      const passwordHash = await getPasswordHash(user.id);
      if (!passwordHash) {
        return Response.json({ error: "Account not found" }, { status: 404 });
      }

      const valid = await verifyPassword(password, passwordHash);
      if (!valid) {
        return Response.json({ error: "Incorrect password" }, { status: 401 });
      }
    } else {
      // No password to ask for, so a Google account proves it is really its owner by having signed
      // in moments ago — a cookie left on a shared or stolen device is not enough to delete it.
      if (body.confirm !== "delete") {
        return Response.json({ error: 'Type "delete" to confirm.' }, { status: 400 });
      }
      const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
      const startedAt = session.sid
        ? await getSessionStartedAt(session.sid, (sessionOptions.ttl ?? 0) * 1000)
        : null;
      if (startedAt === null || Date.now() - startedAt > RECENT_SIGN_IN_MS) {
        return Response.json(
          {
            error:
              "For your security, sign out and sign in with Google again, then delete your account within 15 minutes.",
            reauthRequired: true,
          },
          { status: 403 },
        );
      }
    }

    // Cancel external billing before removing the local identity. Payment/order audit rows keep
    // their Stripe identifiers with a null user_id; the one-to-one customer mapping cascades.
    const [billingAccount, subscriptions] = await Promise.all([
      getOrCreateBillingAccount(user.id),
      listLiveSubscriptions(user.id),
    ]);
    if (billingAccount?.stripeCustomerId) {
      for (const subscription of subscriptions) {
        await getStripe().subscriptions.cancel(subscription.stripeSubscriptionId);
      }
    }

    // Delete sessions + user (workspace/customer mapping cascades; audit rows are retained).
    await deleteAllSessionsForUser(user.id);
    await deleteUser(user.id);

    // Clear iron-session cookie
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    session.destroy();

    return Response.json({ success: true });
  } catch (err) {
    console.error("[account DELETE]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
