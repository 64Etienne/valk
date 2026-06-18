/**
 * Gate des endpoints d'observabilité (lecture). Renvoie vrai si la requête
 * fournit le bon `VALK_DEBUG_KEY` — via le header `x-valk-debug-key` ou la
 * query `?key=`. **Fail-closed** : si la clé serveur n'est pas configurée, on
 * refuse, sauf `VALK_DEBUG_OPEN=1` (commodité dev local explicite).
 */
export function checkDebugKey(req: Request): boolean {
  const expected = process.env.VALK_DEBUG_KEY;
  if (!expected) {
    return process.env.VALK_DEBUG_OPEN === "1";
  }
  const headerKey = req.headers.get("x-valk-debug-key");
  let queryKey: string | null = null;
  try {
    queryKey = new URL(req.url).searchParams.get("key");
  } catch {
    /* URL non parsable — ignore la voie query */
  }
  return headerKey === expected || queryKey === expected;
}

/** Réponse 401 standard pour les accès non autorisés aux endpoints gatés. */
export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
