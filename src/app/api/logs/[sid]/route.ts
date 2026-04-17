import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/logger/server-store";

/**
 * GET /api/logs/:sid — returns the full log dump for a given session ID.
 * Used by the dev to inspect exactly what happened on a user's device.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sid: string }> }
) {
  const { sid } = await params;
  const session = getSession(sid);
  if (!session) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(session);
}
