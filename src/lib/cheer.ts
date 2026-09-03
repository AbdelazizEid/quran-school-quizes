export const CORRECT_CHEERS = ["أحسنت، ما شاء الله!", "ممتاز!", "إجابة موفقة!", "بارك الله فيك!"];
export const WRONG_PATS = ["قريب! السؤال الجاي لك", "محاولة طيبة، واصل", "لا بأس، أنت تتقدم"];

export function pickOne<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function streakCheer(streak: number): string {
  if (streak >= 5) return "أسطوري!";
  if (streak >= 3) return "مذهل!";
  return "سلسلة متتالية";
}
