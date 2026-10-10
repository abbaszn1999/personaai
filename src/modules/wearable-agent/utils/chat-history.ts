/** The server only reads the last 8 exchanges, so anything older is dead weight on every turn. */
export const MAX_SENT_MESSAGES = 40;
/** Per profile. The merchant's page shares its localStorage quota with every other script on it. */
export const MAX_PERSISTED_MESSAGES = 100;
export const MAX_RENDERED_MESSAGES = 60;

/** The newest `max` messages, oldest first. Returns the same array when it is already within the cap. */
export function takeLastMessages<T>(messages: T[], max: number): T[] {
  return messages.length > max ? messages.slice(messages.length - max) : messages;
}
