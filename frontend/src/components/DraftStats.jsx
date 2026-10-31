import { useEffect, useState } from "react";
import api from "../api.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";

// Статистика по картам для всех игроков матча — капитанам во время драфта:
// своя, напарника и двух соперников. Всегда раскрыта под картами.
export default function DraftStats({ teamA, teamB, mapsPool }) {
  const [data, setData] = useState(null);

  const players = [teamA, teamB].flatMap((team, side) =>
    team
      ? [
          { id: team.player_a_id, name: team.a, color: team.a_color, url: team.a_avatar, side },
          { id: team.player_b_id, name: team.b, color: team.b_color, url: team.b_avatar, side },
        ].filter((p) => p.id)
      : []
  );
  const ids = players.map((p) => p.id).join(",");

  useEffect(() => {
    if (!ids) return;
    let alive = true;
    api.get("/stats/player-maps", { params: { ids } }).then((res) => alive && setData(res.data));
    return () => {
      alive = false;
    };
  }, [ids]);

  if (!players.length) return null;

  return (
    <div className="draft-stats open">
      <div className="ds-toggle">
        <Icon name="chart" size={15} />
        Статистика игроков по картам
      </div>

      {!data ? (
          <div className="spinner" />
        ) : (
          <div className="ds-wrap">
            <table className="ds-table">
              <thead>
                <tr>
                  <th />
                  {players.map((p) => (
                    <th key={p.id} className={`ds-player side-${p.side}`}>
                      <Avatar name={p.name} color={p.color} url={p.url} size={26} />
                      <span>{p.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(mapsPool || []).map((map) => (
                  <tr key={map}>
                    <td className="ds-map">{map}</td>
                    {players.map((p) => {
                      const row = data[String(p.id)]?.[map];
                      if (!row) {
                        return (
                          <td key={p.id} className={`ds-cell ds-none side-${p.side}`}>
                            —
                          </td>
                        );
                      }
                      const games = row.wins + row.losses;
                      const tone = row.rating >= 1.15 ? "hot" : row.rating < 0.85 ? "cold" : "";
                      return (
                        <td key={p.id} className={`ds-cell side-${p.side}`} title={`K/D/A ${row.kills}/${row.deaths}/${row.assists} · раундов ${row.rounds}`}>
                          <b className={`ds-rating mono ${tone}`}>{row.rating.toFixed(2)}</b>
                          <span className="ds-wl mono">
                            {row.wins}–{row.losses}
                            {games ? ` · ${Math.round((100 * row.wins) / games)}%` : ""}
                          </span>
                          <span className="ds-kd mono">
                            {row.kills}/{row.deaths}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hint">
              Рейтинг (как у MVP): 1.00 — средний игрок. Под ним — победы–поражения на карте, винрейт и K/D. По всем
              турнирам, дуэли 1×1 не входят. «—» — на этой карте ещё не играл.
            </div>
          </div>
      )}
    </div>
  );
}
