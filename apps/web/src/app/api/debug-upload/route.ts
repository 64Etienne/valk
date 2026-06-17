import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const expected = process.env.VALK_DEBUG_KEY;
  if (!expected) {
    return NextResponse.json({ error: "Debug disabled" }, { status: 404 });
  }
  const url = new URL(request.url);
  const providedKey =
    request.headers.get("x-valk-debug") || url.searchParams.get("key");
  if (providedKey !== expected) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "Storage unavailable" },
      { status: 500 }
    );
  }

  try {
    const form = await request.formData();
    const sessionId = form.get("sessionId") as string | null;
    if (!sessionId || !/^[a-f0-9-]{36}$/.test(sessionId)) {
      return NextResponse.json(
        { error: "Invalid session ID" },
        { status: 400 }
      );
    }
    const metadata = form.get("metadata") as File | null;
    const video = form.get("video") as File | null;

    if (metadata) {
      const buffer = await metadata.arrayBuffer();
      await supabase.storage
        .from("valk-debug")
        .upload(`${sessionId}/metadata.json`, buffer, {
          contentType: "application/json",
          upsert: true,
        });
    }
    if (video) {
      const buffer = await video.arrayBuffer();
      await supabase.storage
        .from("valk-debug")
        .upload(`${sessionId}/video.webm`, buffer, {
          contentType: video.type,
          upsert: true,
        });
    }

    return NextResponse.json({ ok: true, sessionId });
  } catch (err) {
    console.error("debug upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
