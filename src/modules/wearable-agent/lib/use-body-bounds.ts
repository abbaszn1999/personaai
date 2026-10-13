"use client";

import * as React from "react";
import { findBodyBounds, type BodyBounds } from "./body-bounds";

/** Width of the small copy the picture is scanned at — a few ms, plenty for a 1K avatar. */
const SCAN_WIDTH = 120;

interface ScannedImage {
  bounds: BodyBounds | null;
  /** The picture's natural width / height. */
  aspect: number;
}

/** Results by image URL: an avatar is scanned once, however many times it is shown. */
const scanned = new Map<string, ScannedImage>();
/** Avatars can be data URLs of several hundred KB, so only the latest few are kept. */
const MAX_SCANNED = 12;

function remember(url: string, result: ScannedImage) {
  scanned.set(url, result);
  if (scanned.size > MAX_SCANNED) {
    const oldest = scanned.keys().next().value;
    if (oldest !== undefined) scanned.delete(oldest);
  }
}

function scan(image: HTMLImageElement): ScannedImage {
  const aspect = image.naturalWidth / image.naturalHeight;
  try {
    const width = SCAN_WIDTH;
    const height = Math.max(16, Math.round(width / aspect));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { bounds: null, aspect };
    context.drawImage(image, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);
    return { bounds: findBodyBounds(data, width, height), aspect };
  } catch {
    // A cross-origin picture without CORS headers taints the canvas — no marks, never wrong ones.
    return { bounds: null, aspect };
  }
}

/**
 * Where the person stands in the avatar at `url`, plus the picture's aspect ratio. Null while
 * it loads or when no body could be found — callers draw nothing in that case.
 */
export function useBodyBounds(url: string | null): ScannedImage | null {
  const [, refresh] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    if (!url || scanned.has(url)) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
      remember(url, scan(image));
      if (!cancelled) refresh();
    };
    image.onerror = () => {
      remember(url, { bounds: null, aspect: 3 / 4 });
      if (!cancelled) refresh();
    };
    image.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return url ? (scanned.get(url) ?? null) : null;
}
