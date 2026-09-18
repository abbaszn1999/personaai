/**
 * Loads the Decart realtime SDK on demand.
 *
 * The SDK pulls in a full WebRTC stack (livekit-client + zod, ~665KB unminified) for a feature
 * only shoppers who actually tap "live try-on" ever use, so it must never sit on the initial
 * download path. A static import put all of it in front of every shopper on a merchant page.
 *
 * `widget.js` swaps this module for widget/src/decart-runtime-shim.ts (see the alias in
 * scripts/build-widget.mjs), because esbuild cannot code-split an IIFE bundle and would inline
 * the dynamic import right back into it. Both implementations must keep this exact signature —
 * the hook is shared by the dashboard and the embed, and a divergence here would work in
 * testing and silently fail on a merchant's own site.
 */
type DecartSdkModule = typeof import("@decartai/sdk");

export interface DecartRuntime {
  createDecartClient: DecartSdkModule["createDecartClient"];
  models: DecartSdkModule["models"];
}

export async function loadDecartRuntime(): Promise<DecartRuntime> {
  const sdk = await import("@decartai/sdk");
  return { createDecartClient: sdk.createDecartClient, models: sdk.models };
}
