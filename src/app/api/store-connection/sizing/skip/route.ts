/**
 * The Stage 1 shortcut was retired: every store now completes Stages 2–5.
 *
 * Keep an explicit response at the former endpoint so stale browser bundles or external callers get
 * a clear permanent answer instead of mistaking a generic 404 for a temporary routing problem.
 */
export async function POST() {
  return Response.json(
    { error: "Skipping sizing stages is no longer supported." },
    { status: 410 }
  );
}

export async function DELETE() {
  return Response.json(
    { error: "Skipping sizing stages is no longer supported." },
    { status: 410 }
  );
}
