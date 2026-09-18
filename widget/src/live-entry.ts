import { createDecartClient, models } from "@decartai/sdk";
import type { DecartRuntime } from "@/modules/wearable-agent/hooks/decart-runtime";

/**
 * Entry point for `public/widget-live.js` — everything the Decart realtime SDK drags in
 * (livekit-client, zod), kept out of widget.js and fetched only when a shopper actually starts
 * a live try-on. Publishes itself on `window` because it's injected as a classic <script>;
 * decart-runtime-shim.ts is what waits for it.
 */
const runtime: DecartRuntime = { createDecartClient, models };

window.__autoshoppingDecartRuntime = runtime;
