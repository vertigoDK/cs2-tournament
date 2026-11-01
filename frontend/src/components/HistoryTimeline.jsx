import { Link } from "react-router-dom";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import StatusPill from "./StatusPill.jsx";
import { tournamentCover } from "../utils/maps.js";

// История турниров лентой: сверху итог, ниже турниры по датам. У каждого —
// награды и все серии с картами и счётом, без раскрывашек.

const dateParts = (iso) => {
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return {
    day: d.toLocaleDateString("ru-RU", { day: "2-digit" }),
    month: d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", ""),
    year: d.getFullYear(),
  };
};

const seriesScore = (maps) =>
  maps.reduce((s, mp) => (mp.winner === 0 || mp.winner === 1 ? ((s[mp.winner] += 1), s) : s), [0, 0]);

const word = (n, one, few, many) =>
  n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

export default function HistoryTimeline({ tournaments, currency, prizeTotal }) {
  const list = [...tournaments].sort((a, b) => (a.date < b.date ? 1 : -1));
  const matches = list.flatMap((t) => t.matches.filter((m) => m.winner !== null));
  const maps = matches.flatMap((m) => m.maps.filter((mp) => mp.winner !== null));
  const rounds = maps.reduce((sum, mp) => sum + (mp.rounds ? mp.rounds[0] + mp.rounds[1] : 0), 0);

  return (
    <div className="timeline-wrap">
      <div className={`tl-summary${prizeTotal == null ? " no-prize" : ""}`}>
        <div>
          <b>{list.length}</b>
          <span>{word(list.length, "турнир", "турнира", "турниров")}</span>
        </div>
        <div>
          <b>{matches.length}</b>
          <span>{word(matches.length, "серия", "серии", "серий")}</span>
        </div>
        <div>
          <b>{maps.length}</b>
          <span>{word(maps.length, "карта", "карты", "карт")}</span>
        </div>
        <div>
          <b>{rounds}</b>
          <span>раундов</span>
        </div>
        {prizeTotal != null ? (
          <div className="accent">
            <b>
              {Math.round(prizeTotal).toLocaleString("ru-RU")} {currency}
            </b>
            <span>разыграно</span>
          </div>
        ) : null}
      </div>

      <ol className="timeline">
        {list.map((t, i) => (
          <TimelineItem key={t.id} t={t} index={i} />
        ))}
      </ol>
    </div>
  );
}

function TimelineItem({ t, index }) {
  const { day, month, year } = dateParts(t.date);
  const played = t.matches.some((m) => m.winner !== null);
  const kind = t.status === "finished" ? "done" : played ? "live" : "soon";
  const byRound = t.matches.reduce((acc, m) => {
    (acc[m.round_label] ||= []).push(m);
    return acc;
  }, {});

  return (
    <li className={`tl-item ${kind}`} style={{ animationDelay: `${index * 80}ms` }}>
      <div className="tl-date">
        <b>{day}</b>
        <span className="mono">
          {month} {year}
        </span>
      </div>
      <span className="tl-dot" aria-hidden="true" />

      <article className="tl-card">
        <header className="tl-head">
          <img src={tournamentCover(t.id)} alt="" className="tl-cover" />
          <div className="tl-title">
            <StatusPill t={{ status: t.status, started_at: played ? t.date : null }} />
            <h3>{t.name}</h3>
            <div className="tl-facts mono">
              {t.prize_pool ? <span className="accent">{t.prize_pool}</span> : null}
              <span>2×2 · {t.teams_count} {word(t.teams_count, "команда", "команды", "команд")}</span>
              <span>
                BO{t.best_of}
                {t.final_best_of !== t.best_of ? ` · финал BO${t.final_best_of}` : ""}
              </span>
              {t.maps_pool.length ? <span>{t.maps_pool.length} карт в пуле</span> : null}
            </div>
          </div>
        </header>

        {t.champion || t.mvp || t.duel_winner ? (
          <div className="tl-awards">
            {t.champion ? (
              <div className="tl-award champ">
                <img src="/img/trophy-tight.webp" alt="" />
                <div>
                  <span className="mono">чемпион</span>
                  <b>{t.champion}</b>
                </div>
              </div>
            ) : null}
            {t.mvp ? (
              <Link to={`/players/${t.mvp.player_id}`} className="tl-award mvp">
                <Avatar name={t.mvp.display_name} color={t.mvp.avatar_color} url={t.mvp.avatar_url} size={38} />
                <div>
                  <span className="mono">mvp · рейтинг {t.mvp.rating.toFixed(2)}</span>
                  <b>{t.mvp.display_name}</b>
                </div>
              </Link>
            ) : null}
            {t.duel_winner ? (
              <div className="tl-award duel">
                <Icon name="users" size={18} />
                <div>
                  <span className="mono">дуэли 1×1</span>
                  <b>{t.duel_winner}</b>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {played ? (
          <div className="tl-series">
            {Object.entries(byRound).map(([label, list]) => (
              <div key={label} className="tl-round">
                <span className="tl-round-label mono">{label}</span>
                {list.map((m, idx) => (
                  <SeriesRow key={idx} m={m} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="tl-upcoming">
            <span className="mono">команды</span>
            <div className="tl-teams">
              {t.teams.map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>
            {t.maps_pool.length ? (
              <>
                <span className="mono">карты</span>
                <div className="tl-pool mono">{t.maps_pool.join(" · ")}</div>
              </>
            ) : null}
          </div>
        )}

        <Link to={`/tournaments/${t.id}`} className="tl-link">
          Открыть турнир <Icon name="arrowRight" size={14} />
        </Link>
      </article>
    </li>
  );
}

function SeriesRow({ m }) {
  const score = seriesScore(m.maps);
  const done = m.winner !== null;
  return (
    <div className="tl-match">
      <div className="tl-teams-line">
        <span className={`tl-team${m.winner === 0 ? " won" : done ? " lost" : ""}`}>{m.team_a || "TBD"}</span>
        <span className="tl-score mono">
          <i className={m.winner === 0 ? "won" : ""}>{score[0]}</i>:<i className={m.winner === 1 ? "won" : ""}>{score[1]}</i>
        </span>
        <span className={`tl-team right${m.winner === 1 ? " won" : done ? " lost" : ""}`}>{m.team_b || "TBD"}</span>
      </div>
      {m.maps.length ? (
        <div className="tl-maps">
          {m.maps.map((mp, i) => (
            <span
              key={i}
              className={`tl-map${mp.winner === 0 ? " left" : mp.winner === 1 ? " right" : ""}`}
              title={mp.picked_by ? `пик: ${mp.picked_by}` : undefined}
            >
              <b>{mp.map}</b>
              {mp.rounds ? (
                <span className="mono">
                  <i className={mp.winner === 0 ? "won" : ""}>{mp.rounds[0]}</i>:
                  <i className={mp.winner === 1 ? "won" : ""}>{mp.rounds[1]}</i>
                </span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      {m.bans.length ? <div className="tl-bans mono">баны: {m.bans.join(", ")}</div> : null}
    </div>
  );
}
