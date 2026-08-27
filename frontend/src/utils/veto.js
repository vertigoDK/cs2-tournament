// Держим в синхроне с backend/app/bracket.py: step_action(). Кто банит, а кто
// выбирает карту, определяется форматом серии (best_of) и номером шага —
// сам пользователь не выбирает действие, только карту.
const BO3_PATTERN = ["ban", "ban", "pick", "pick"];

export function stepAction(bestOf, stepIndex) {
  if (bestOf === 3) return BO3_PATTERN[stepIndex % BO3_PATTERN.length];
  return "ban";
}

export function sequenceLabel(bestOf) {
  return bestOf === 3 ? "бан, бан, пик, пик → решающая карта" : "бан, бан, бан, бан → решающая карта";
}
