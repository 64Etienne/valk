#!/usr/bin/env npx tsx
/**
 * Download a debug session bundle from Supabase Storage for local inspection.
 * Usage: npm run replay -- <sessionId>
 * Env:  NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const sessionId = process.argv[2];
if (!sessionId) {
  console.error("Usage: npm run replay -- <sessionId>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
  process.exit(1);
}

async function main() {
  const supabase = createClient(url!, key!);
  const outDir = join(process.cwd(), ".debug-sessions", sessionId);
  mkdirSync(outDir, { recursive: true });

  console.log(`Downloading session ${sessionId} → ${outDir}`);

  for (const name of ["metadata.json", "video.webm"]) {
    const { data, error } = await supabase.storage
      .from("valk-debug")
      .download(`${sessionId}/${name}`);
    if (error || !data) {
      console.warn(`  ${name} not found (${error?.message ?? "no data"})`);
      continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    writeFileSync(join(outDir, name), buffer);
    console.log(`  ✓ ${name} (${buffer.length} bytes)`);
  }

  console.log("Done. Inspect the files at:", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
