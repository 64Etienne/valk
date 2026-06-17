import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/client";

export async function POST(request: NextRequest) {
  const supabase = getServerSupabase();
  if (!supabase) {
    // Telemetry disabled when Supabase not configured — succeed silently
    return NextResponse.json({ ok: true, skipped: true }, { status: 204 });
  }
  try {
    const body = await request.json();
    const { error } = await supabase.from("valk_telemetry").insert({
      ...body,
      created_at: new Date(Date.now() - (Date.now() % 3600000)).toISOString(),
    });
    if (error) {
      console.warn("telemetry insert failed:", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn("telemetry route error:", err);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
