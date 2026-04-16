/**
 * "La bise et le soleil" — premier paragraphe de la fable d'Ésope.
 * Passage phonétiquement équilibré, standard ISO pour la phonétique française
 * (équivalent français du "Rainbow Passage" anglophone).
 * 60 mots → ~24s de lecture à 150 mpm (vitesse normale française).
 */
export const CALIBRATION_TEXT =
  "La bise et le soleil se disputaient, chacun assurant qu'il était le plus fort, quand ils ont vu un voyageur qui s'avançait, enveloppé dans son manteau. Ils sont tombés d'accord que celui qui arriverait le premier à faire ôter son manteau au voyageur serait regardé comme le plus fort.";

/**
 * Pool de virelangues — stress-test d'articulation calibré
 * pour détecter les altérations de prononciation (alcool, fatigue).
 * Cible les phonèmes les plus sensibles : fricatives, liquides, occlusives répétées.
 */
export const TWISTER_POOL: readonly string[] = [
  "Les chaussettes de l'archiduchesse sont-elles sèches, archi-sèches ?",
  "Un chasseur sachant chasser sait chasser sans son chien de chasse.",
  "Si six scies scient six cyprès, six cent six scies scient six cent six cyprès.",
  "Didon dîna, dit-on, du dos d'un dodu dindon.",
  "Trois gros rats gris dans trois grands trous creux.",
  "Je veux et j'exige d'exquises excuses.",
  "L'âne au lac a lapé l'eau au lieu de laper la lavande.",
  "Seize jacinthes sèchent dans seize sachets secs.",
];

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /\S/.test(w)).length;
}

export interface ReadingSelection {
  lines: [string, string];
  totalWords: number;
  twisterIndex: number;
}

export function pickReadingText(): ReadingSelection {
  const twisterIndex = Math.floor(Math.random() * TWISTER_POOL.length);
  const twister = TWISTER_POOL[twisterIndex];
  const lines: [string, string] = [CALIBRATION_TEXT, twister];
  return {
    lines,
    totalWords: wordCount(CALIBRATION_TEXT) + wordCount(twister),
    twisterIndex,
  };
}
