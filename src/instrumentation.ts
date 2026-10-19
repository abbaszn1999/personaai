/**
 * Runs once when the server boots: guards the process against stray network failures, then
 * starts the background catalog worker.
 *
 * `register` must finish before requests are served, so the worker is only kicked off here —
 * it deliberately does not await it.
 */
export async function register(): Promise<void> {
  // Imported dynamically and behind the runtime check so the Edge bundle never pulls in
  // Node-only code (process handlers, the Supabase service client, image transcoding).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { installProcessGuards } = await import("@/lib/runtime/process-guards");
  installProcessGuards();

  const { isCatalogWorkerEnabled, startCatalogWorker } = await import("@/lib/catalog/worker");
  if (!isCatalogWorkerEnabled()) return;

  startCatalogWorker();
}
