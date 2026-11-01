import Avatar from "./Avatar.jsx";
import { playerRating, rosterOf } from "../utils/roster.js";

// Итог матча по игрокам: K/D/A и рейтинг за все внесённые карты серии.
// Показывается под результатами карт, когда есть хоть одна статистика.
export default function MatchSummary({ match, teamA, teamB }) {
  const maps = (match.maps || []).filter((m) => Object.keys(m.stats || {}).length);
  if (!maps.length) return null;

  const rows = [...rosterOf(teamA, 0), ...rosterOf(teamB, 1)]
    .map((p) => {
      const line = { ...p, k: 0, d: 0, a: 0, rounds: 0, maps: 0 };
      maps.forEach((m) => {
        const s = m.stats[String(p.id)];
        if (!s) return;
        line.k += s.k || 0;
        line.d += s.d || 0;
        line.a += s.a || 0;
        line.rounds += (m.rounds || []).reduce((x, y) => x + y, 0);
        line.maps += 1;
      });
      line.rating = playerRating(line.k, line.d, line.rounds);
      return line;
    })
    .filter((p) => p.maps);

  // Лучший по рейтингу в матче; без счёта раундов рейтинга нет — тогда по K−D.
  const score = (p) => (p.rounds ? p.rating : p.k - p.d);
  const best = rows.reduce((top, p) => (!top || score(p) > score(top) ? p : top), null);
  const partial = maps.length < (match.maps || []).filter((m) => m.winner !== null).length;

  return (
    <div className="series match-sum">
      <div className="series-head">
        Статистика матча
        <span className="ms-sub">
          {maps.length} {maps.length === 1 ? "карта" : maps.length < 5 ? "карты" : "карт"}
          {partial ? " · не все внесены" : ""}
        </span>
      </div>
      <table className="ms-table">
        <thead>
          <tr>
            <th>Игрок</th>
            <th>K</th>
            <th>D</th>
            <th>A</th>
            <th>+/−</th>
            <th>K/D</th>
            <th>Рейтинг</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1].map((slot) => [
            <tr key={`team-${slot}`} className={`ms-team side-${slot}`}>
              <td colSpan={7}>
                {(slot === 0 ? teamA : teamB)?.name}
                {match.win === slot ? <span className="ms-win">победа</span> : null}
              </td>
            </tr>,
            ...rows
              .filter((p) => p.slot === slot)
              .sort((x, y) => score(y) - score(x))
              .map((p) => {
                const diff = p.k - p.d;
                return (
                  <tr key={p.id} className={`side-${slot}`}>
                    <td>
                      <div className="ms-player">
                        <Avatar name={p.name} color={p.color} url={p.url} size={26} />
                        <span>{p.name}</span>
                        {best && p.id === best.id && rows.length > 1 ? <em className="ms-best">MVP</em> : null}
                      </div>
                    </td>
                    <td className="mono">{p.k}</td>
                    <td className="mono">{p.d}</td>
                    <td className="mono">{p.a}</td>
                    <td className={`mono ${diff > 0 ? "pos" : diff < 0 ? "neg" : ""}`}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                    <td className="mono">{(p.d ? p.k / p.d : p.k).toFixed(2)}</td>
                    <td className="mono">
                      {p.rounds ? (
                        <b className={p.rating >= 1.15 ? "hot" : p.rating < 0.85 ? "cold" : ""}>{p.rating.toFixed(2)}</b>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              }),
          ])}
        </tbody>
      </table>
    </div>
  );
}
