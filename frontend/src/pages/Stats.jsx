import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import Avatar from "../components/Avatar.jsx";
import Icon from "../components/Icon.jsx";
import { mapImage } from "../utils/maps.js";

const TABS = [
  { id: "players", label: "Игроки", icon: "medal" },
  { id: "prizes", label: "Призовые", icon: "trophy" },
  { id: "maps", label: "Карты", icon: "map" },
  { id: "history", label: "История", icon: "history" },
];

const money = (value) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value || 0);

// По какому столбцу сортировать таблицу игроков.
const SORTS = [
  { id: "kills", label: "Килы", get: (p) => p.kills },
  { id: "kd", label: "K/D", get: (p) => p.kd },
  { id: "kpr", label: "Килов в раунде", get: (p) => p.kpr },
  { id: "map_wins", label: "Побед на картах", get: (p) => p.map_wins },
  { id: "titles", label: "Титулы", get: (p) => p.titles },
];

export default function Stats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("players");
  const [sort, setSort] = useState("kills");

  useEffect(() => {
    api
      .get("/stats")
      .then((res) => setData(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  const players = useMemo(() => {
    if (!data) return [];
    const cmp = SORTS.find((s) => s.id === sort) || SORTS[0];
    return [...data.players].sort(
      (a, b) => cmp.get(b) - cmp.get(a) || a.display_name.localeCompare(b.display_name)
    );
  }, [data, sort]);

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

      {tab === "players" &&
        (!hasStats ? (
          <EmptyStats />
        ) : (
          <>
            <div className="sort-bar">
              <span>Сортировка</span>
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`chip${sort === s.id ? " active" : ""}`}
                  onClick={() => setSort(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="panel table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Игрок</th>
                    <th>Карт</th>
                    <th>K</th>
                    <th>D</th>
                    <th>A</th>
                    <th>K/D</th>
                    <th title="Килов в раунде">KPR</th>
                    <th>Карты W-L</th>
                    <th>Титулы</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, idx) => (
                    <tr key={p.id}>
                      <td className="dt-player">
                        <span className="dt-rank">{idx + 1}</span>
                        <Avatar name={p.display_name} color={p.avatar_color} url={p.avatar_url} size={26} />
                        <span className="dt-name">{p.display_name}</span>
                      </td>
                      <td>{p.maps}</td>
                      <td>{p.kills}</td>
                      <td>{p.deaths}</td>
                      <td>{p.assists}</td>
                      <td className="num strong">{p.kd.toFixed(2)}</td>
                      <td className="num">{p.kpr.toFixed(2)}</td>
                      <td>
                        {p.map_wins}–{p.map_losses}
                      </td>
                      <td>{p.titles || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ))}

      {tab === "prizes" && <Prizes data={data} />}

      {tab === "maps" &&
        (data.maps.length === 0 ? (
          <EmptyStats text="Ни одного драфта ещё не было." />
        ) : (
          <div className="map-stat-grid">
            {data.maps.map((m) => (
              <MapStatCard key={m.map} stat={m} />
            ))}
          </div>
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

function EmptyStats({ text }) {
  return (
    <div className="empty-state">
      <b>Данных пока нет</b>
      <span>{text || "Статистика появится, когда админ внесёт результаты сыгранных карт."}</span>
    </div>
  );
}

function MapStatCard({ stat }) {
  const [noImage, setNoImage] = useState(false);
  const src = mapImage(stat.map);
  return (
    <div className="map-stat">
      <div className="ms-image">
        {src && !noImage ? <img src={src} alt="" onError={() => setNoImage(true)} /> : null}
        <span className="mc-shade" />
        <span className="mc-name">{stat.map}</span>
      </div>
      <div className="ms-rows">
        <span>
          <b>{stat.played}</b> сыграна
        </span>
        <span className="pick">
          <b>{stat.picked}</b> пиков
        </span>
        <span className="ban">
          <b>{stat.banned}</b> банов
        </span>
      </div>
    </div>
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
