/**
 * The one type more than one wearable agent needs.
 *
 * Everything else about a chat turn is persona's own (see `persona/types.ts`); this is here
 * because `fit-analysis` reasons about the shopper's body without knowing anything about
 * conversations, tools or retrieval.
 */

/** Body profile fields the agent reasons about and can update, mirroring the fields
 *  already collected in TryOnProfile — the client sends these fresh on every turn since
 *  this agent, like the rest of the app's history, is stateless server-side. */
export interface WearableChatProfileContext {
  heightCm: number | null;
  weightKg: number | null;
  chestCm: number | null;
  waistCm: number | null;
  shoeSizeEu: number | null;
  /** Needed to regenerate the avatar via update_measurements — absent once the shopper has
   *  discarded/never had a source photo (e.g. an account resumed after a refresh). */
  photoBase64: string | null;
  photoMimeType: string | null;
  avatarUrl: string | null;
  /** True when the shopper uploaded their own photo as their avatar instead of generating
   *  one — matches the existing "custom" skip-regeneration behavior. */
  isCustomAvatar: boolean;
}
