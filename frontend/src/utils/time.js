// Админ всегда вводит время старта турнира по времени Алматы/Астаны (UTC+5),
// независимо от того, в каком часовом поясе находится его собственный браузер.
// Храним и передаём на бэкенд честный UTC-момент — тогда у зрителя в любом
// другом поясе (например, в Москве, UTC+3) время и обратный отсчёт
// автоматически посчитаются верно, потому что браузер сам переводит
// UTC-момент в локальное время при отображении.

const ALMATY_OFFSET_MIN = 5 * 60;

// "YYYY-MM-DDTHH:mm" (как отдаёт <input type="datetime-local">), трактуется
// как время в UTC+5 -> UTC ISO-строка для отправки на бэкенд.
export function almatyLocalToUtcIso(naive) {
  if (!naive) return null;
  const [datePart, timePart] = naive.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = (timePart || "00:00").split(":").map(Number);
  const asIfUtcMs = Date.UTC(y, mo - 1, d, h, mi, 0);
  const utcMs = asIfUtcMs - ALMATY_OFFSET_MIN * 60 * 1000;
  return new Date(utcMs).toISOString();
}

// Обратное преобразование: UTC ISO-строка с бэкенда -> "YYYY-MM-DDTHH:mm" по
// времени UTC+5, для предзаполнения поля datetime-local при редактировании.
export function utcIsoToAlmatyLocal(iso) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() + ALMATY_OFFSET_MIN * 60 * 1000;
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes()
  )}`;
}

// Отображение момента в собственном (локальном) времени зрителя — браузер
// сам знает свой часовой пояс, поэтому доп. параметры не нужны.
export function formatLocal(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

export function msUntil(iso) {
  if (!iso) return null;
  return new Date(iso).getTime() - Date.now();
}

export function breakdownCountdown(ms) {
  if (ms == null || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    mins: Math.floor((s % 3600) / 60),
    secs: s % 60,
  };
}

// Короткая дата для карточек: «12 нояб.».
export function formatDay(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}
