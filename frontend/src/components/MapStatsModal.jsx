import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import { mapImage } from "../utils/maps.js";

// Форма переноса скорборда: счёт по раундам и K/D/A четверых.
// Заточена под быстрый ввод — Tab идёт по строке K → D → A, Enter сохраняет.
const num = (v) => (v === "" || v === null || v === undefined ? "" : String(v));
const toInt = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// K/D — только убийства к смертям. Ассисты остаются отдельной цифрой и в
// коэффициент не подмешиваются. Без смертей делить не на что: показываем
// сами убийства.
function kdRatio(k, d) {
  if (!k && !d) return "—";
  return d ? (k / d).toFixed(2) : k.toFixed(2);
}

function rosterOf(team, slot) {
  if (!team) return [];
  return [
    { id: team.player_a_id, name: team.a, color: team.a_color, url: team.a_avatar, slot },
    team.player_b_id
      ? { id: team.player_b_id, name: team.b, color: team.b_color, url: team.b_avatar, slot }
      : null,
  ].filter(Boolean);
}

export default function MapStatsModal({ open, onClose, entry, mapIndex, teamA, teamB, onSave, busy, readOnly }) {
  const roster = useMemo(() => [...rosterOf(teamA, 0), ...rosterOf(teamB, 1)], [teamA, teamB]);

  const [rounds, setRounds] = useState(["", ""]);
  const [lines, setLines] = useState({});
  const [noImage, setNoImage] = useState(false);
  const firstField = useRef(null);
  // Страница фоново обновляет турнир, поэтому `entry` приходит новым объектом
  // каждые пару секунд. Заполняем поля ровно один раз на открытие, иначе
  // очередное обновление затрёт то, что админ уже набрал.
  const filledFor = useRef(null);

  useEffect(() => {
    if (!open || !entry) {
      filledFor.current = null;
      return;
    }
    const key = String(mapIndex);
    if (filledFor.current === key) return;
    filledFor.current = key;

    setRounds([num(entry.rounds?.[0]), num(entry.rounds?.[1])]);
    const next = {};
    roster.forEach((p) => {
      const saved = entry.stats?.[String(p.id)];
      next[p.id] = { k: num(saved?.k), d: num(saved?.d), a: num(saved?.a) };
    });
    setLines(next);
    setNoImage(false);
    setTimeout(() => firstField.current?.focus(), 40);
  }, [open, mapIndex, entry, roster]);

  if (!open || !entry) return null;

  const setCell = (id, field, value) =>
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value.replace(/[^\d]/g, "") } }));

  const submit = (e) => {
    e?.preventDefault();
    const stats = {};
    roster.forEach((p) => {
      const l = lines[p.id] || {};
      stats[String(p.id)] = { k: toInt(l.k), d: toInt(l.d), a: toInt(l.a) };
    });
    const hasScore = rounds[0] !== "" || rounds[1] !== "";
    onSave(mapIndex, { rounds: hasScore ? [toInt(rounds[0]), toInt(rounds[1])] : null, stats });
  };

  const total = toInt(rounds[0]) + toInt(rounds[1]);
  const hasAnyStats = Object.keys(entry.stats || {}).length > 0;
  const src = mapImage(entry.map);

  return (
    <div className="veto-backdrop" onClick={onClose}>
      <div className="veto-modal stats-modal" onClick={(e) => e.stopPropagation()}>
        <div className="stats-hero">
          {src && !noImage ? <img src={src} alt="" onError={() => setNoImage(true)} /> : null}
          <span className="mc-shade" />
          <span className="sh-name">{entry.map}</span>
          <button type="button" className="sh-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="veto-modal-body">
            <div className="score-row">
              <span className="score-label">Счёт по раундам</span>
              {readOnly ? (
                <span className="score-static">
                  {entry.rounds ? `${entry.rounds[0]} : ${entry.rounds[1]}` : "не внесён"}
                </span>
              ) : (
              <div className="score-inputs">
                <input
                  ref={firstField}
                  type="text"
                  inputMode="numeric"
                  value={rounds[0]}
                  onChange={(e) => setRounds([e.target.value.replace(/[^\d]/g, ""), rounds[1]])}
                  aria-label={`Раунды: ${teamA?.name}`}
                />
                <span className="score-sep">:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={rounds[1]}
                  onChange={(e) => setRounds([rounds[0], e.target.value.replace(/[^\d]/g, "")])}
                  aria-label={`Раунды: ${teamB?.name}`}
                />
              </div>
              )}
              <span className="score-note">
                {readOnly
                  ? entry.rounds
                    ? `${entry.rounds[0] + entry.rounds[1]} раундов`
                    : ""
                  : total
                  ? `${total} раундов`
                  : "с овертаймами — любой счёт"}
              </span>
            </div>

            <table className="stat-table">
              <thead>
                <tr>
                  <th>Игрок</th>
                  <th>K</th>
                  <th>D</th>
                  <th>A</th>
                  <th>K/D</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((p, idx) => {
                  const l = lines[p.id] || {};
                  const kd = kdRatio(toInt(l.k), toInt(l.d));
                  const newTeam = idx > 0 && roster[idx - 1].slot !== p.slot;
                  return (
                    <tr key={p.id} className={newTeam ? "team-break" : undefined}>
                      <td className="st-player">
                        <Avatar name={p.name} color={p.color} url={p.url} size={26} />
                        <span>{p.name}</span>
                      </td>
                      {["k", "d", "a"].map((f) =>
                        readOnly ? (
                          <td key={f} className="st-value">
                            {l[f] === "" || l[f] === undefined ? "—" : l[f]}
                          </td>
                        ) : (
                          <td key={f}>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={l[f] ?? ""}
                              onChange={(e) => setCell(p.id, f, e.target.value)}
                              aria-label={`${p.name}: ${f.toUpperCase()}`}
                            />
                          </td>
                        )
                      )}
                      <td className="st-kd">
                        <span className={kd === "—" ? "kd-pill empty" : "kd-pill"}>{kd}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {readOnly ? (
              hasAnyStats ? null : (
                <div className="hint">Статистику по этой карте ещё не вносили.</div>
              )
            ) : (
              <div className="hint">
                Победитель карты определится по счёту раундов. Оставьте счёт пустым,
                если хотите отметить победителя вручную.
              </div>
            )}
          </div>

          <div className="veto-modal-foot">
            <button type="button" className="btn" onClick={onClose}>
              {readOnly ? "Закрыть" : "Отмена"}
            </button>
            {readOnly ? null : (
              <button type="submit" className="btn primary" disabled={busy}>
                <Icon name="check" size={14} />
                <span>{busy ? "Сохраняем…" : "Сохранить"}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
