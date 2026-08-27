import { useEffect, useState } from "react";
import { formatCountdown, formatLocal, msUntil } from "../utils/time.js";
import Icon from "./Icon.jsx";

export default function Countdown({ startsAt }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startsAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startsAt]);

  if (!startsAt) return null;

  const ms = msUntil(startsAt);
  void now; // triggers a re-render every second so the countdown ticks
  const label = formatCountdown(ms);

  return (
    <span className="prize-tag" style={{ background: "var(--seed-bg)", color: "var(--seed-fg)" }}>
      <Icon name="clock" size={13} />
      {label ? `Начало через ${label}` : "Турнир начался"} · {formatLocal(startsAt)}
    </span>
  );
}
