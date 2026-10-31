// Статус турнира одной плашкой. «Идёт» — единственный оранжевый статус:
// на него и должен падать взгляд.
export function statusKind(t) {
  if (t.status === "finished") return "finished";
  if (t.status === "active" || t.started_at) return "live";
  return "upcoming";
}

const LABEL = { live: "Идёт", upcoming: "Анонс", finished: "Завершён" };

export default function StatusPill({ t }) {
  const kind = statusKind(t);
  return (
    <span className={`pill pill-${kind}`}>
      {kind === "live" ? <i className="live-dot" /> : null}
      {LABEL[kind]}
    </span>
  );
}
