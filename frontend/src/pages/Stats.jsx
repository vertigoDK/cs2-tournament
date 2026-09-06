import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import Avatar from "../components/Avatar.jsx";
import Icon from "../components/Icon.jsx";
import { EmptyStats, MapsGrid, PlayersTable } from "../components/StatsTables.jsx";

const TABS = [
  { id: "players", label: "Игроки", icon: "medal" },
  { id: "prizes", label: "Призовые", icon: "trophy" },
  { id: "maps", label: "Карты", icon: "map" },
  { id: "history", label: "История", icon: "history" },
];

const money = (value) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value || 0);

export default function Stats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("players");

  useEffect(() => {
    api
      .get("/stats")
      .then((res) => setData(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  if (error) {
    return (
      <main className="page">
        <div className="error-box">{error}</div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="page">
        <div className="spinner" />
      </main>
    );
  }

  const hasStats = data.players.some((p) => p.maps > 0);

  return (
    <main className="page">
      <div className="section-head">
        <h2>Статистика</h2>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "players" && (!hasStats ? <EmptyStats /> : <PlayersTable players={data.players} />)}

      {tab === "prizes" && <Prizes data={data} />}

      {tab === "maps" &&
        (data.maps.length === 0 ? (
          <EmptyStats text="Ни одного драфта ещё не было." />
        ) : (
          <MapsGrid maps={data.maps} />
        ))}

      {tab === "history" &&
        (data.tournaments.length === 0 ? (
          <EmptyStats text="Турниров пока не было." />
        ) : (
          <div className="history-list">
            {data.tournaments.map((t) => (
              <TournamentHistory key={t.id} t={t} />
            ))}
          </div>
        ))}
    </main>
  );
}

function Prizes({ data }) {
  // Фонд турнира делится между двумя игроками команды-победителя,
  // поэтому сумма у человека — это половина каждого выигранного фонда.
  const earners = data.players.filter((p) => p.prize > 0).sort((a, b) => b.prize - a.prize);
  const cur = data.currency;

  if (!earners.length) {
    return <EmptyStats text="Пока никто не выигрывал турниров с призовым фондом." />;
  }

  const max = earners[0].prize;

  return (
    <>
      <div className="prize-summary">
        <div className="ps-item">
          <b>
            {money(data.prize_total)} {cur}
          </b>
          <span>разыграно всего</span>
        </div>
        <div className="ps-item">
          <b>{earners.length}</b>
          <span>получили выплату</span>
        </div>
      </div>

      <div className="panel table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Игрок</th>
              <th>Титулы</th>
              <th>Заработано</th>
              <th className="bar-col">Доля</th>
            </tr>
          </thead>
          <tbody>
            {earners.map((p, idx) => (
              <tr key={p.id}>
                <td className="dt-player">
                  <span className="dt-rank">{idx + 1}</span>
                  <Avatar name={p.display_name} color={p.avatar_color} url={p.avatar_url} size={26} />
                  <span className="dt-name">{p.display_name}</span>
                </td>
                <td>{p.titles}</td>
                <td className="num strong">
                  {money(p.prize)} {cur}
                </td>
                <td className="bar-col">
                  <span className="bar">
                    <span className="bar-fill" style={{ width: `${(p.prize / max) * 100}%` }} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="hint" style={{ marginTop: 12 }}>
        Призовой фонд каждого турнира делится поровну между двумя игроками
        команды-победителя.
      </div>
    </>
  );
}

const STATUS_LABEL = { setup: "подготовка", active: "идёт", finished: "завершён" };

function TournamentHistory({ t }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="hist">
      <button type="button" className="hist-head" onClick={() => setOpen((v) => !v)}>
        <span className={`status-chip ${t.status}`}>{STATUS_LABEL[t.status] || t.status}</span>
        <span className="hist-name">{t.name}</span>
        {t.champion ? (
          <span className="hist-champ">
            <Icon name="trophy" size={14} />
            {t.champion}
          </span>
        ) : null}
        <span className="hist-meta">
          {t.teams_count} команд · {new Date(t.created_at).toLocaleDateString("ru-RU")}
        </span>
        <Icon name="chevronDown" size={16} className={open ? "flip" : undefined} />
      </button>

      {open ? (
        <div className="hist-body">
          {t.matches.length === 0 ? (
            <div className="hist-empty">Матчи ещё не сыграны.</div>
          ) : (
            t.matches.map((m, idx) => (
              <div className="hist-match" key={idx}>
                <div className="hm-top">
                  <span className="hm-round">{m.round_label}</span>
                  <span className={`hm-team${m.winner === 0 ? " won" : ""}`}>{m.team_a || "TBD"}</span>
                  <span className="hm-vs">vs</span>
                  <span className={`hm-team${m.winner === 1 ? " won" : ""}`}>{m.team_b || "TBD"}</span>
                </div>

                {m.maps.length ? (
                  <ul className="hm-maps">
                    {m.maps.map((mp, mi) => (
                      <li key={mi}>
                        <Icon name="map" size={13} />
                        <b>{mp.map}</b>
                        {mp.rounds ? (
                          <span className="hm-score">
                            {mp.rounds[0]}:{mp.rounds[1]}
                          </span>
                        ) : null}
                        {mp.picked_by ? <span className="hm-pick">пик: {mp.picked_by}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {m.bans.length ? <div className="hm-bans">Баны: {m.bans.join(", ")}</div> : null}
              </div>
            ))
          )}
          <Link to={`/tournaments/${t.id}`} className="hist-link">
            Открыть сетку <Icon name="arrowRight" size={14} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
