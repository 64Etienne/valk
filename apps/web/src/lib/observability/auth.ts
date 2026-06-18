import { timingSafeEqual } from "node:crypto";

/** Comparaison à temps constant (anti timing-attack), sûre sur null/longueurs. */
function safeEqual(a: string | null, b: string): boolean {
  if (a == null) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Gate des endpoints d'observabilité (lecture). Vrai si la requête fournit le
 * bon `VALK_DEBUG_KEY` — via le header `x-valk-debug-key` (voie primaire) ou la
 * query `?key=` (commodité pour la page navigateur `/debug`). **Fail-closed** :
 * si la clé serveur n'est pas configurée on refuse, sauf en dev local explicite
 * (`VALK_DEBUG_OPEN=1` ET hors production).
 */
export function checkDebugKey(req: Request): boolean {
  const expected = process.env.VALK_DEBUG_KEY;
  if (!expected) {
    return (
      process.env.NODE_ENV !== "production" &&
      process.env.VALK_DEBUG_OPEN === "1"
    );
  }
  const headerKey = req.headers.get("x-valk-debug-key");
  let queryKey: string | null = null;
  try {
    queryKey = new URL(req.url).searchParams.get("key");
  } catch {
    /* URL non parsable — ignore la voie query */
  }
  return safeEqual(headerKey, expected) || safeEqual(queryKey, expected);
}

/** En-têtes limitant la propagation d'une clé passée en query (referrer/cache). */
export const NO_LEAK_HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
};

/** Réponse 401 standard pour les accès non autorisés aux endpoints gatés. */
export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json", ...NO_LEAK_HEADERS },
  });
}
