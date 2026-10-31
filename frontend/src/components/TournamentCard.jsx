import { Link } from "react-router-dom";
import StatusPill, { statusKind } from "./StatusPill.jsx";
import { tournamentCover } from "../utils/maps.js";
import { formatDay } from "../utils/time.js";

export default function TournamentCard({ t, index = 0 }) {
  const date = t.started_at || t.starts_at || t.created_at;
  return (
    <Link to={`/tournaments/${t.id}`} className="card" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="card-cover">
        <img src={tournamentCover(t.id)} alt="" loading="lazy" />
        <StatusPill t={t} />
      </div>
      <div className="card-body">
        <h3>{t.name}</h3>
        <div className="card-meta mono">
          <span>{formatDay(date)}</span>
          <span>{t.teams_count} команд</span>
          {t.matches_total ? (
            <span>
              {t.matches_played}/{t.matches_total} матчей
            </span>
          ) : null}
        </div>
        <div className="card-foot">
          <span className="prize mono">{t.prize_pool || "без призового"}</span>
          {t.champion ? (
            <span className="champ">
              <span className="champ-label">чемпион</span> {t.champion}
            </span>
          ) : statusKind(t) === "live" && t.stage ? (
            <span className="champ-label">{t.stage}</span>
          ) : statusKind(t) === "upcoming" && t.starts_at ? (
            <span className="champ-label muted-label">старт {formatDay(t.starts_at)}</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
