// Карточки матчей должны быть одной ширины (иначе колонки сетки выглядят
// рваными), но эта ширина должна подстраиваться под самое длинное название
// команды в турнире — чтобы ники не обрезались многоточием. Меряем реальную
// ширину текста тем же шрифтом, которым он отрисовывается.

// Должен совпадать с --body в styles.css, иначе ширина карточек
// в сетке посчитается по другому шрифту и ники всё равно обрежутся.
const FONT_STACK = '"Manrope Variable", system-ui, sans-serif';
// Победитель подсвечивается жирным (700), поэтому меряем по жирному варианту —
// иначе карточка «подпрыгивала» бы по ширине после выбора победителя.
const NAME_FONT = `700 15px ${FONT_STACK}`;

// Всё, что в слоте занимает место помимо самого названия (см. styles.css):
// паддинги 14+14, три gap'а по 11, бейдж посева 26, два аватара внахлёст 51,
// галочка 12, плюс поля вокруг разделителя «+».
const SLOT_CHROME = 36 + 39 + 30 + 58 + 16 + 8;

const MIN_WIDTH = 330;
const MAX_WIDTH = 560;

let ctx = null;

function measureText(text, font) {
  if (typeof document === "undefined") return text.length * 8;
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function computeMatchWidth(teams) {
  const widest = (teams || []).reduce((max, t) => {
    const label = t.b ? `${t.a} + ${t.b}` : t.a;
    return Math.max(max, measureText(label, NAME_FONT));
  }, 0);
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, widest + SLOT_CHROME)));
}
