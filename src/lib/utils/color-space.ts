// sRGB [0-255] → CIELAB [L*, a*, b*]
// Standard illuminant D65

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function labF(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta ** 2) + 4 / 29;
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // sRGB → linear RGB → XYZ (D65)
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb;
  const z = 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb;

  // D65 reference white
  const xn = 0.95047, yn = 1.0, zn = 1.08883;

  const L = 116 * labF(y / yn) - 16;
  const a = 500 * (labF(x / xn) - labF(y / yn));
  const bVal = 200 * (labF(y / yn) - labF(z / zn));

  return [L, a, bVal];
}
