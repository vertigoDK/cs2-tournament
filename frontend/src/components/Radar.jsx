// «Пятиугольник» стиля игры: оси 1–10 относительно остальных игроков.
// `compare` — второй игрок поверх, пунктиром, чтобы сравнить формы.

export const AXES = [
  { key: "aim", label: "Стрельба", hint: "убийств за раунд" },
  { key: "survival", label: "Выживание", hint: "как часто доживает до конца раунда" },
  { key: "team", label: "Командность", hint: "ассистов за раунд" },
  { key: "wins", label: "Победы", hint: "доля выигранных карт" },
  { key: "steady", label: "Стабильность", hint: "насколько ровно играет от карты к карте" },
];

const RINGS = [2, 4, 6, 8, 10];

function point(i, value, radius, n) {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const r = (radius * Math.max(0, Math.min(10, value))) / 10;
  return [r * Math.cos(angle), r * Math.sin(angle)];
}

const path = (values, radius, n) =>
  AXES.map((a, i) => point(i, values?.[a.key] ?? 0, radius, n).map((v) => v.toFixed(1)).join(",")).join(" ");

// labels: true — крупные подписи со значениями (профиль), "compact" — мелкие
// подписи с баллом для карточек, false — без подписей.
export default function Radar({ values, compare, size = 320, labels = true, className = "" }) {
  const n = AXES.length;
  const compact = labels === "compact";
  const radius = compact ? size * 0.22 : labels ? size / 2 - 78 : size / 2 - 6;
  const gap = compact ? 10 : 26;
  // По вертикали пятиугольник несимметричен: вершина сверху на радиусе, низ —
  // на 0.81 радиуса. В компактном режиме высоту подгоняем под содержимое.
  const top = compact ? -radius - 34 : -size / 2;
  const height = compact ? radius * 1.81 + 34 + 38 : size;

  return (
    <svg
      className={`radar ${compact ? "compact " : ""}${className}`}
      viewBox={`${-size / 2} ${top} ${size} ${height}`}
      width={size}
      height={height}
      role="img"
      aria-label={AXES.map((a) => `${a.label}: ${values?.[a.key] ?? "—"}`).join(", ")}
    >
      {[...RINGS].reverse().map((level, idx) => (
        <polygon
          key={level}
          className={`radar-ring${idx % 2 ? " alt" : ""}`}
          points={path(Object.fromEntries(AXES.map((a) => [a.key, level])), radius, n)}
        />
      ))}
      {AXES.map((a, i) => {
        const [x, y] = point(i, 10, radius, n);
        return <line key={a.key} className="radar-spoke" x1="0" y1="0" x2={x} y2={y} />;
      })}

      {compare ? <polygon className="radar-shape compare" points={path(compare, radius, n)} /> : null}
      {values ? (
        <g className="radar-grow">
          <polygon className="radar-shape" points={path(values, radius, n)} />
          {AXES.map((a, i) => {
            const [x, y] = point(i, values[a.key], radius, n);
            return <circle key={a.key} className="radar-dot" cx={x} cy={y} r={labels && !compact ? 4 : 2.5} />;
          })}
        </g>
      ) : null}

      {labels
        ? AXES.map((a, i) => {
            const [x, y] = point(i, 10, radius + gap, n);
            const anchor = Math.abs(x) < 4 ? "middle" : x > 0 ? "start" : "end";
            const line = compact ? 14 : 22;
            // Сверху подпись над вершиной, снизу — под ней, сбоку — по центру.
            const dy = y < -radius ? -line + 2 : y > radius * 0.5 ? (compact ? 8 : 6) : compact ? -4 : -4;
            return (
              <g key={a.key} className="radar-label" transform={`translate(${x.toFixed(1)} ${(y + dy).toFixed(1)})`}>
                <text textAnchor={anchor} className="radar-axis">
                  {a.label}
                </text>
                <text textAnchor={anchor} y={line} className="radar-value">
                  {values?.[a.key] != null ? values[a.key].toFixed(1) : "—"}
                  {compare?.[a.key] != null ? (
                    <tspan className="radar-value-cmp"> / {compare[a.key].toFixed(1)}</tspan>
                  ) : null}
                </text>
              </g>
            );
          })
        : null}
    </svg>
  );
}
