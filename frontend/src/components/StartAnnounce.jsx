import { useEffect, useState } from "react";
import { breakdownCountdown, formatLocal, msUntil } from "../utils/time.js";
import Icon from "./Icon.jsx";

const pad2 = (n) => String(n).padStart(2, "0");

// Анонс старта: не мелкий бейдж в строке мета-данных, а отдельная полоса —
// это главная информация о турнире, пока он не начался.
export default function StartAnnounce({ startsAt, startedAt, finished }) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!startsAt || startedAt || finished) return;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [startsAt, startedAt, finished]);

  if (finished) return null;

  if (startedAt) {
    return (
      <div className="announce live">
        <span className="live-dot" />
        <span className="ann-main">Турнир идёт</span>
        <span className="ann-note">начался {formatLocal(startedAt)}</span>
      </div>
    );
  }

  if (!startsAt) return null;

  const b = breakdownCountdown(msUntil(startsAt));

  if (!b) {
    return (
      <div className="announce due">
        <Icon name="clock" size={18} />
        <span className="ann-main">Время старта наступило</span>
        <span className="ann-note">{formatLocal(startsAt)}</span>
      </div>
    );
  }

  const units = [
    b.days ? { v: b.days, l: "дн" } : null,
    { v: b.hours, l: "ч" },
    { v: b.mins, l: "мин" },
    { v: b.secs, l: "сек" },
  ].filter(Boolean);

  return (
    <div className="announce">
      <span className="ann-label">
        <Icon name="clock" size={15} />
        До старта
      </span>
      <span className="ann-clock">
        {units.map((u, i) => (
          <span className="ann-unit" key={i}>
            <b>{pad2(u.v)}</b>
            <i>{u.l}</i>
          </span>
        ))}
      </span>
      <span className="ann-note">{formatLocal(startsAt)}</span>
    </div>
  );
}
