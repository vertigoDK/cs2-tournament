// Держим в синхроне с backend/app/bracket.py: veto_actions(). Кто банит, а кто
// выбирает карту, определяется форматом матча (best_of), размером пула и
// номером шага — сам пользователь не выбирает действие, только карту.
//
// Порядок: до двух банов, потом все пики серии (BO3 — два, BO5 — четыре),
// потом баны, пока не останется решающая. 7 карт, BO3 — обычное вето CS2:
// бан, бан, пик, пик, бан, бан → решающая.

export const BEST_OF = [1, 3, 5];

// Пиков в серии best_of-1 плюс решающая; в BO1 — хотя бы один бан.
export const minPool = (bestOf) => Math.max(2, bestOf);
export const MIN_POOL = Object.fromEntries(BEST_OF.map((bo) => [bo, minPool(bo)]));

export function vetoActions(bestOf, poolSize) {
  const picks = Math.max(0, Math.min(bestOf - 1, poolSize - 1));
  const bans = Math.max(0, poolSize - 1 - picks);
  const lead = Math.min(2, bans);
  return [...Array(lead).fill("ban"), ...Array(picks).fill("pick"), ...Array(bans - lead).fill("ban")];
}

export function stepAction(bestOf, stepIndex, poolSize) {
  return vetoActions(bestOf, poolSize)[stepIndex] || "ban";
}

// Весь порядок драфта: ходы и решающая карта в конце.
export function vetoSequence(bestOf, poolSize) {
  return [...vetoActions(bestOf, poolSize), "decider"];
}

const WORD = { ban: "бан", pick: "пик" };

// «бан ×2, пик ×2, бан ×2 → решающая» — коротко даже для длинного вето.
export function sequenceLabel(bestOf, poolSize) {
  const groups = [];
  for (const a of vetoActions(bestOf, poolSize)) {
    const last = groups[groups.length - 1];
    if (last && last.a === a) last.n += 1;
    else groups.push({ a, n: 1 });
  }
  const body = groups.map((g) => (g.n > 1 ? `${WORD[g.a]} ×${g.n}` : WORD[g.a])).join(", ");
  return body ? `${body} → решающая` : "решающая";
}

// Секунды → «2:05».
export function formatClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
