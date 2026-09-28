/** A store on the internet can only deliver webhooks to a public https address. */
export function isPublicCallback(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && !["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname) && !hostname.endsWith(".local");
  } catch {
    return false;
  }
}
