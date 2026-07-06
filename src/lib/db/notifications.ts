import { db } from "@/lib/supabase/server";

export async function getNotificationPreferences(userId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db
    .from("users")
    .select("notification_preferences")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("[db/notifications getNotificationPreferences]", error);
    return {};
  }

  return data?.notification_preferences ?? {};
}

export async function updateNotificationPreferences(
  userId: string,
  preferences: Record<string, unknown>
): Promise<boolean> {
  const { error } = await db
    .from("users")
    .update({ notification_preferences: preferences, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    console.error("[db/notifications updateNotificationPreferences]", error);
    return false;
  }

  return true;
}
