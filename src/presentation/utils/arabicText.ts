/**
 * Normalizes Arabic text for robust button resolution and comparison:
 * - Strips all Arabic diacritics / tashkeel (Fatha, Damma, Kasra, Sukun, Shadda, Tanween, Tatweel, Superscript Alef).
 * - Normalizes Alef variants (أ, إ, آ, ٱ -> ا).
 * - Normalizes Ta Marbuta and Ha (ة -> ه).
 * - Normalizes Alef Maksura and Ya (ى -> ي).
 * - Collapses multiple spaces and trims.
 */
export function normalizeArabic(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .trim()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // Diacritics, Shadda, Tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
