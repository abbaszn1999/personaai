/**
 * ACS connection config, read once from env. Project-wide, not per-connection — see the
 * isolation model: catalogs have no create/delete API, so there is exactly one project, one
 * catalog, and one branch for the whole app, shared across every merchant.
 *
 * `GOOGLE_APPLICATION_CREDENTIALS_JSON` (inline service-account JSON, the practical option in a
 * serverless deploy target with no writable filesystem for a key file) takes precedence over
 * `GOOGLE_APPLICATION_CREDENTIALS` (a file path, for local dev) — `google-auth-library`'s
 * `GoogleAuth` falls back to that and then to ambient ADC automatically if neither is set.
 */
export interface AcsConfig {
  projectId: string;
  location: string;
  catalogId: string;
  branchId: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[acs/config] Missing required env var ${name}. See the ACS setup notes in the plan's ` +
        `"Phase 1: Project setup" section — this requires a real GCP project with the Retail API ` +
        `enabled before any ACS call can succeed.`
    );
  }
  return value;
}

/** Cheap presence check for call sites that must degrade gracefully (reads, best-effort writes)
 *  rather than throw — `getAcsConfig()` stays fail-loud for the paths that have no sane fallback. */
export function isAcsConfigured(): boolean {
  return Boolean(process.env.ACS_PROJECT_ID);
}

export function getAcsConfig(): AcsConfig {
  return {
    projectId: requireEnv("ACS_PROJECT_ID"),
    location: process.env.ACS_LOCATION ?? "global",
    catalogId: process.env.ACS_CATALOG_ID ?? "default_catalog",
    branchId: process.env.ACS_BRANCH_ID ?? "0",
  };
}

export function catalogPath(config: AcsConfig): string {
  return `projects/${config.projectId}/locations/${config.location}/catalogs/${config.catalogId}`;
}

export function branchPath(config: AcsConfig): string {
  return `${catalogPath(config)}/branches/${config.branchId}`;
}

export function defaultPlacementPath(config: AcsConfig): string {
  // ACS ships a `default_search` serving config on every catalog out of the box.
  return `${catalogPath(config)}/servingConfigs/default_search`;
}
