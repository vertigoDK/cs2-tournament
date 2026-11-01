// ДЕМО-РЕЖИМ «Записей». Настоящих повок, демок и нарезок пока нет, поэтому
// всё, чего не хватает, выдумывается здесь — детерминированно от карты матча,
// чтобы при каждом заходе было одно и то же. Когда появится хранилище (S3),
// этот файл заменят данные с сервера: ссылки на видео, демку и нарезки.
import { rosterOf } from "./roster.js";
import { mapSlug } from "./maps.js";

// Заглушки-ролики лежат в public/demo-media/<карта>-<0..3>.mp4 (сгенерированы
// из иллюстраций карт). Для карт без своего ролика берём Inferno.
const DEMO_MAPS = ["inferno", "nuke", "overpass", "mirage", "vertigo", "lake", "dust2", "anubis"];

export function povSrc(mapName, slot) {
  const slug = mapSlug(mapName);
  return `/demo-media/${DEMO_MAPS.includes(slug) ? slug : "inferno"}-${slot % 4}.mp4`;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// Кто выиграл какой раунд: случайный порядок, который сходится к итоговому
// счёту, последний раунд — за победителем карты.
function roundWinners(score, rand) {
  const [a, b] = score;
  if (!a && !b) return [];
  const last = a > b ? 0 : 1;
  const pool = [...Array(a - (last === 0 ? 1 : 0)).fill(0), ...Array(b - (last === 1 ? 1 : 0)).fill(1)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [...pool, last];
}

const KINDS = [
  { label: "Мультикилл ×3", short: "3K" },
  { label: "Клатч 1 на 2", short: "1v2" },
  { label: "Дабл с AWP", short: "2K" },
  { label: "Ван-тап с Deagle", short: "HS" },
  { label: "Открывающее убийство", short: "OK" },
];

// Всё, что нужно плееру по одной карте матча.
export function mapMedia(bracket, r, i, mapIndex) {
  const m = bracket.rounds[r][i];
  const entry = m.maps[mapIndex];
  const teamA = bracket.teams[m.p[0]];
  const teamB = bracket.teams[m.p[1]];
  const roster = [...rosterOf(teamA, 0), ...rosterOf(teamB, 1)].filter((p) => entry.stats?.[String(p.id)]);
  const players = (roster.length ? roster : [...rosterOf(teamA, 0), ...rosterOf(teamB, 1)]).map((p, n) => ({
    ...p,
    line: entry.stats?.[String(p.id)] || null,
    src: povSrc(entry.map, n),
  }));

  const seed = Number(entry.cybershoke_lobby) || (r + 1) * 1000 + (i + 1) * 100 + mapIndex;
  const rand = rng(seed);
  const score = entry.rounds || [0, 0];
  const rounds = roundWinners(score, rand);

  // Нарезки: у кого больше убийств — тому и больше моментов.
  const total = rounds.length || 1;
  const byKills = [...players].sort((x, y) => (y.line?.k || 0) - (x.line?.k || 0));
  const count = Math.min(4, Math.max(2, Math.round(total / 5)));
  const highlights = [];
  const used = new Set();
  for (let n = 0; n < count; n++) {
    const p = byKills[n % byKills.length];
    let round = Math.floor(rand() * total);
    while (used.has(round) && used.size < total) round = (round + 1) % total;
    used.add(round);
    // Лучшему по убийствам — моменты поярче.
    const kind = KINDS[Math.min(KINDS.length - 1, Math.floor(rand() * (n === 0 ? 2 : KINDS.length)))];
    highlights.push({
      id: `${seed}-${n}`,
      player: p,
      round,
      at: (round + 0.45) / total, // доля длины ролика
      label: kind.label,
      short: kind.short,
    });
  }
  highlights.sort((x, y) => x.round - y.round);

  return {
    key: `${r}-${i}-${mapIndex}`,
    r,
    i,
    mapIndex,
    map: entry.map,
    score,
    winner: entry.winner,
    teamA,
    teamB,
    players,
    rounds,
    highlights,
    demo: entry.cybershoke_lobby
      ? { name: `match_${entry.cybershoke_lobby}.dem`, size: 35 + Math.round(rand() * 35) }
      : null,
  };
}

// Сыгранные карты турнира: от финала к первому раунду.
export function playedMaps(bracket) {
  const out = [];
  bracket.rounds.forEach((round, r) =>
    round.forEach((m, i) =>
      (m.maps || []).forEach((entry, k) => {
        if (entry.winner != null && entry.rounds) out.push({ r, i, k });
      })
    )
  );
  // Сначала финал, внутри матча — карты по порядку.
  return out.sort((a, b) => b.r - a.r || a.i - b.i || a.k - b.k);
}

export function roundName(r, total) {
  const left = total - r;
  return left === 1 ? "Финал" : left === 2 ? "Полуфинал" : left === 3 ? "Четвертьфинал" : `Раунд ${r + 1}`;
}

export function fmtTime(sec) {
  if (!Number.isFinite(sec)) return "0:00";
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
