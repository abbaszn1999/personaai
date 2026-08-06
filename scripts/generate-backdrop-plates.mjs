// One-time setup script — NOT run per-request, NOT part of the credit system.
//
// The 4 existing files in public/avatars/ are full studio photos with the model
// already baked into the backdrop. This script runs each one through a single
// Gemini image-edit call that removes the person and photorealistically fills in
// the empty studio space, producing 4 clean "empty scene" plates that the app then
// composites subject-only avatar/try-on cutouts on top of at request time.
//
// Usage: npm run generate:backdrops   (requires GEMINI_API_KEY in .env.local)

import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const SOURCE_PHOTOS = [
  "avatar-studio-male-1.png",
  "avatar-studio-male-2.png",
  "avatar-studio-female-1.png",
  "avatar-studio-female-2.png",
];
const OUTPUT_DIR = path.join(PUBLIC_DIR, "avatars", "backgrounds");

const REMOVE_PERSON_PROMPT =
  "Remove the person entirely from this photo. Naturally reconstruct and fill in the empty studio space " +
  "exactly as if no one had ever stood there — preserve the spiral staircase, floor reflections, wall " +
  "texture, and lighting/shadow direction exactly as they are elsewhere in the frame, with photorealistic, " +
  "seamless inpainting and no visible artifacts.";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set — add it to .env.local before running this script.");
    process.exit(1);
  }

  const model = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3-pro-image-preview";
  const ai = new GoogleGenAI({ apiKey });

  await mkdir(OUTPUT_DIR, { recursive: true });

  for (let i = 0; i < SOURCE_PHOTOS.length; i++) {
    const sourceFile = SOURCE_PHOTOS[i];
    const outputFile = path.join(OUTPUT_DIR, `backdrop-${i + 1}.png`);
    console.log(`[${i + 1}/${SOURCE_PHOTOS.length}] Generating backdrop from ${sourceFile}...`);

    const sourceBuffer = await readFile(path.join(PUBLIC_DIR, "avatars", sourceFile));
    const sourceBase64 = sourceBuffer.toString("base64");

    // Uses the stable models.generateContent API (not interactions.create) — the newer
    // Interactions API is Beta and rejects response_format.delivery: "inline" for images
    // with a 400 in practice, despite being documented as valid. See src/lib/ai/gemini.ts.
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: REMOVE_PERSON_PROMPT },
            { inlineData: { data: sourceBase64, mimeType: "image/png" } },
          ],
        },
      ],
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          // Must match AVATAR_ASPECT_RATIO in src/lib/agents/persona-agent.ts so the subject
          // cutout and this backdrop plate line up exactly when composited in the UI.
          aspectRatio: "3:4",
          imageSize: "2K",
        },
      },
    });

    const imagePart = (response.candidates?.[0]?.content?.parts ?? []).find((part) => part.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      throw new Error(`Gemini did not return an image for ${sourceFile}`);
    }

    const rawBuffer = Buffer.from(imagePart.inlineData.data, "base64");
    const pngBuffer = await sharp(rawBuffer).png().toBuffer();
    await writeFile(outputFile, pngBuffer);
    console.log(`  -> saved ${path.relative(PUBLIC_DIR, outputFile)}`);
  }

  console.log("Done. 4 backdrop plates saved to public/avatars/backgrounds/.");
}

main().catch((err) => {
  console.error("Failed to generate backdrop plates:", err);
  process.exit(1);
});
