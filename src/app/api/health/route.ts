export const dynamic = "force-dynamic";

/** Render's health check. Answers from the process alone: a database or Gemini blip must not get a
 *  healthy instance pulled out of rotation. */
export async function GET() {
  return Response.json({ ok: true });
}
