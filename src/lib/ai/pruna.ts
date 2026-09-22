/**
 * Client for Pruna's prediction API (https://api.pruna.ai), which generates every avatar and
 * try-on render. Two models are used:
 *
 * - `p-image-edit`  — prompt-driven editing, 1-5 reference images. Builds the avatar.
 * - `p-image-try-on` — dedicated garment fitting, no prompt control. Dresses the avatar.
 *
 * Unlike an inline-content API, this is a three-call protocol: upload the inputs, create a
 * prediction, then download the result. Each step is a separate authenticated request, and
 * none of the intermediate URLs are public.
 */

const API_BASE = "https://api.pruna.ai";

/** `p-image-edit` is priced per output image. `p-image-try-on` is priced per garment input,
 *  and turbo (on for try-on) flattens that to $0.008 per garment. Both usually finish in
 *  about a second, so waiting inline is the norm — but see `runPrunaPrediction` for why the
 *  async path still has to exist. */
const TRY_SYNC_WINDOW_MS = 60_000;

const POLL_INTERVAL_MS = 1_500;

/** Ceiling on the polling phase, which is only ever reached when a prediction has already
 *  blown through the 60s Try-Sync window. Generous because the alternative — giving up on a
 *  render the shopper has already been charged nothing for but waited on — is worse than
 *  waiting a little longer. */
const POLL_TIMEOUT_MS = 180_000;

export class PrunaApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    /** Pruna's machine-readable code (`QUOTA_EXCEEDED`, `VALIDATION_ERROR`, ...) when present. */
    public code?: string
  ) {
    super(message);
    this.name = "PrunaApiError";
  }
}

/**
 * True when a call failed because the account is out of credit or over its rate limit, rather
 * than because anything was wrong with the request.
 *
 * Callers that retry per item need this distinction: an exhausted account fails *every* item
 * identically, so counting those failures against a per-item attempt limit retires the whole
 * workload over a billing problem that has nothing to do with the items themselves.
 */
export function isPrunaQuotaError(err: unknown): boolean {
  if (!(err instanceof PrunaApiError)) return false;
  if (err.status === 429) return true;
  return err.code === "QUOTA_EXCEEDED" || err.code === "RATE_LIMIT_EXCEEDED";
}

function getApiKey(): string {
  const apiKey = process.env.PRUNA_API_KEY;
  if (!apiKey) {
    throw new PrunaApiError("Pruna API key is not configured (PRUNA_API_KEY).");
  }
  return apiKey;
}

/**
 * Pruna reports failures in two unrelated shapes: `{ error: { code, message } }` for
 * transport/auth/quota problems, and a flat `{ title, detail, invalid_fields }` for 422 input
 * validation. Reading only the first would turn every schema mistake into a blank message,
 * which is exactly the case where the detail matters most.
 */
async function readError(res: Response, context: string): Promise<PrunaApiError> {
  const body = await res.json().catch(() => null);

  if (body && typeof body === "object") {
    const shaped = body as {
      error?: { code?: string; message?: string; details?: string };
      title?: string;
      detail?: string;
    };
    if (shaped.error?.message) {
      const details = shaped.error.details ? ` (${shaped.error.details})` : "";
      return new PrunaApiError(`${context}: ${shaped.error.message}${details}`, res.status, shaped.error.code);
    }
    if (shaped.detail) {
      return new PrunaApiError(`${context}: ${shaped.title ?? "Invalid input"} — ${shaped.detail}`, res.status);
    }
  }

  return new PrunaApiError(`${context}: request failed with status ${res.status}.`, res.status);
}

/**
 * Uploads one image and returns the URL to reference it by.
 *
 * Required, not incidental: every image field on every model is declared as a URI, so there is
 * no inline/base64 path to send a shopper's photo through. Uploads are deleted 30 minutes
 * after they land, which makes the returned URL unsafe to persist anywhere — treat it as
 * valid for the current render only.
 */
export async function uploadPrunaFile(
  image: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const form = new FormData();
  form.append("content", new Blob([new Uint8Array(image)], { type: contentType }), filename);

  const res = await fetch(`${API_BASE}/v1/files`, {
    method: "POST",
    headers: { apikey: getApiKey() },
    body: form,
  });

  if (!res.ok) throw await readError(res, "Uploading an image to Pruna failed");

  const body = (await res.json().catch(() => null)) as { urls?: { get?: string } } | null;
  const url = body?.urls?.get;
  if (!url) {
    throw new PrunaApiError("Pruna accepted the upload but returned no file URL.");
  }
  return url;
}

interface PredictionAccepted {
  id?: string;
  get_url?: string;
}

interface PredictionSettled {
  status?: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  generation_url?: string;
  message?: string;
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollUntilSettled(statusUrl: string, apiKey: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const res = await fetch(statusUrl, { headers: { apikey: apiKey } });
    if (!res.ok) throw await readError(res, "Checking a Pruna prediction failed");

    const body = (await res.json().catch(() => null)) as PredictionSettled | null;

    if (body?.status === "succeeded") {
      if (!body.generation_url) {
        throw new PrunaApiError("Pruna reported success but returned no image URL.");
      }
      return body.generation_url;
    }
    if (body?.status === "failed" || body?.status === "canceled") {
      throw new PrunaApiError(body.error ?? body.message ?? `Pruna prediction ${body.status}.`);
    }
  }

  throw new PrunaApiError("Pruna did not finish generating this image in time. Please try again.");
}

/** Generated content is served from an authenticated endpoint, so it has to be pulled through
 *  the server — a `generation_url` handed to a browser would just 401. */
async function downloadGeneration(url: string, apiKey: string): Promise<{ image: Buffer; mimeType: string }> {
  const res = await fetch(url, { headers: { apikey: apiKey } });
  if (!res.ok) throw await readError(res, "Downloading a Pruna result failed");

  return {
    image: Buffer.from(await res.arrayBuffer()),
    mimeType: res.headers.get("content-type") ?? "image/jpeg",
  };
}

export type PrunaImageModel = "p-image-edit" | "p-image-try-on";

/**
 * Runs one prediction end to end and returns the finished image bytes.
 *
 * Sends `Try-Sync` because both models normally finish in about a second, so the round trip
 * usually collapses into this single request. That header is a request, not a guarantee: the
 * documented 201 body is a union, and a prediction that overruns the 60-second window comes
 * back in the *async* shape regardless of what was asked for. Handling only the synchronous
 * branch would therefore work right up until the service is under load and then fail
 * intermittently, which is why the polling fallback below is not dead code.
 */
export async function runPrunaPrediction(
  model: PrunaImageModel,
  input: Record<string, unknown>
): Promise<{ image: Buffer; mimeType: string }> {
  const apiKey = getApiKey();

  const res = await fetch(`${API_BASE}/v1/predictions`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
      Model: model,
      "Try-Sync": "true",
    },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(TRY_SYNC_WINDOW_MS + 15_000),
  });

  if (!res.ok) throw await readError(res, `Pruna ${model} request failed`);

  const body = (await res.json().catch(() => null)) as (PredictionAccepted & PredictionSettled) | null;
  if (!body) {
    throw new PrunaApiError(`Pruna ${model} returned an unreadable response.`);
  }

  if (body.status === "succeeded" && body.generation_url) {
    return downloadGeneration(body.generation_url, apiKey);
  }
  if (body.status === "failed" || body.status === "canceled") {
    throw new PrunaApiError(body.error ?? body.message ?? `Pruna ${model} prediction ${body.status}.`);
  }

  const statusUrl = body.get_url ?? (body.id ? `${API_BASE}/v1/predictions/status/${body.id}` : null);
  if (!statusUrl) {
    throw new PrunaApiError(`Pruna ${model} returned neither a result nor a prediction to track.`);
  }

  const generationUrl = await pollUntilSettled(statusUrl, apiKey);
  return downloadGeneration(generationUrl, apiKey);
}

export interface PrunaEditInput {
  prompt: string;
  /** 1-5 reference URLs; the first is the primary image being edited. */
  imageUrls: string[];
  aspectRatio?: "match_input_image" | "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3";
  seed?: number;
}

/**
 * Prompt-driven image edit.
 *
 * `turbo` is pinned off. It defaults on and buys a fraction of a second, but the model card is
 * explicit that it degrades complex edits — and the only thing this is used for is holding a
 * real person's face and body proportions steady, which is precisely that case.
 */
export async function editPrunaImage(input: PrunaEditInput): Promise<{ image: Buffer; mimeType: string }> {
  if (input.imageUrls.length === 0 || input.imageUrls.length > 5) {
    throw new PrunaApiError(`p-image-edit accepts 1-5 reference images, got ${input.imageUrls.length}.`);
  }

  return runPrunaPrediction("p-image-edit", {
    prompt: input.prompt,
    images: input.imageUrls,
    aspect_ratio: input.aspectRatio ?? "match_input_image",
    turbo: false,
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  });
}

/** One garment reference image per category — Pruna classifies the category from the image
 *  itself, so no labels are sent, but two items of the same category in one request are
 *  unsupported. */
export const MAX_TRY_ON_GARMENTS = 11;

export interface PrunaTryOnInput {
  personImageUrl: string;
  garmentImageUrls: string[];
  /** Experimental, and only meaningful for non-flatlay references that contain several items. */
  prompt?: string;
  seed?: number;
}

/**
 * Fits garments onto a person image.
 *
 * Asks for PNG because the result is chroma-keyed immediately afterwards, and JPEG ringing
 * around the subject's edges is exactly the artifact that turns a clean cut-out into a fringed
 * one. `preserve_input_size` is left at its default: matching the person image's dimensions is
 * what keeps a dressed render drop-in compatible with the avatar it came from.
 *
 * `turbo` is pinned on. It is the flat $0.008-per-garment rate, and Pruna recommends it up to
 * four or five garments, which covers the looks this fits. Avatar edits stay off turbo: that
 * flag does not change the `p-image-edit` price, and it is the case Pruna says to disable.
 */
export async function prunaTryOn(input: PrunaTryOnInput): Promise<{ image: Buffer; mimeType: string }> {
  if (input.garmentImageUrls.length === 0) {
    throw new PrunaApiError("p-image-try-on requires at least one garment image.");
  }

  return runPrunaPrediction("p-image-try-on", {
    person_image: input.personImageUrl,
    garment_images: input.garmentImageUrls.slice(0, MAX_TRY_ON_GARMENTS),
    output_format: "png",
    turbo: true,
    ...(input.prompt ? { prompt: input.prompt } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  });
}
