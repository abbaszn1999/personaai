/**
 * Starts the background catalog worker when the server boots.
 *
 * `register` runs once per server instance and must finish before requests are served, so this
 * only kicks the loop off — it deliberately does not await it.
 */
export async function register(): Promise<void> {
  // Imported dynamically and behind the runtime check so the Edge bundle never pulls in the
  // worker's Node-only dependencies (the Supabase service client, image transcoding).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { isCatalogWorkerEnabled, startCatalogWorker } = await import("@/lib/catalog/worker");
  if (!isCatalogWorkerEnabled()) return;

  startCatalogWorker();
}
