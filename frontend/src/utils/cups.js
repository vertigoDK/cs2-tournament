// Свой кубок у каждого турнира — по названию: «Рофло турик» получает
// шутовской, «Битва за киреешку» — кубок с сухариками, зимний — ледяной.
// Турнир, под который кубок не нарисован, получает обычный.
const CUPS = [
  {
    test: /рофл/i,
    img: "/img/cups/roflo.webp",
    name: "Шутовской кубок",
    note: "за турнир, который никто не воспринимал всерьёз",
  },
  {
    test: /кир+и?е+ш/i,
    img: "/img/cups/kireeshka.webp",
    name: "Кубок киреешки",
    note: "полный сухариков, как и обещали",
  },
  {
    test: /зим/i,
    img: "/img/cups/winter.webp",
    name: "Ледяной кубок",
    note: "с сосульками и снегом по краям",
  },
];

const DEFAULT = { img: "/img/trophy-tight.webp", name: "Кубок турнира", note: "" };

export function cupOf(tournamentName) {
  return CUPS.find((c) => c.test.test(tournamentName || "")) || DEFAULT;
}
