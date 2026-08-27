import { useEffect, useState } from "react";
import { breakdownCountdown, formatLocal, msUntil } from "../utils/time.js";

const pad2 = (n) => String(n).padStart(2, "0");

export default function CountdownBlocks({ startsAt }) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!startsAt) return;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [startsAt]);

  if (!startsAt) return null;

  const b = breakdownCountdown(msUntil(startsAt));

  if (!b) {
    return (
      <div className="hero-live-banner">
        <span className="live-dot" /> Турнир начался · {formatLocal(startsAt)}
      </div>
    );
  }

  const units = [
    b.days ? { v: b.days, l: "дней" } : null,
    { v: b.hours, l: "часов" },
    { v: b.mins, l: "минут" },
    { v: b.secs, l: "секунд" },
  ].filter(Boolean);

  return (
    <div className="hud" aria-label={`До старта: ${formatLocal(startsAt)}`}>
      {units.map((u, idx) => (
        <div className="hud-unit" key={idx}>
          <b>{pad2(u.v)}</b>
          <span>{u.l}</span>
        </div>
      ))}
      <span className="hud-label">
        до старта
        <br />
        {formatLocal(startsAt)}
      </span>
    </div>
  );
}
