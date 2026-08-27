import { Link } from "react-router-dom";
import CountdownBlocks from "./CountdownBlocks.jsx";
import Icon from "./Icon.jsx";

const STATUS_LABEL = { setup: "Подготовка", active: "Идёт", finished: "Завершён" };

export default function HeroTournamentCard({ t }) {
  const finished = t.status === "finished";
  // Завершённый турнир «идущим» уже не считается, даже если старт был отмечен.
  const live = !finished && (Boolean(t.started_at) || t.status === "active");

  return (
    <Link to={`/tournaments/${t.id}`} className={`hero${live ? " live" : ""}${finished ? " done" : ""}`}>
      <div className="hero-main">
        <div className="hero-top">
          <span className={`status-chip ${t.status}`}>
            {live ? <span className="live-dot" /> : null}
            {STATUS_LABEL[t.status] || t.status}
          </span>
          <span className="hero-meta">создан {new Date(t.created_at).toLocaleDateString("ru-RU")}</span>
        </div>

        <h2 className="hero-title">{t.name}</h2>

        <div className="hero-facts">
          {t.prize_pool ? (
            <Fact icon="trophy" tone="gold" value={t.prize_pool} label="призовой фонд" />
          ) : null}
          <Fact icon="users" value={`${t.teams_count}`} label="команд" />
          {finished && t.champion ? (
            <Fact icon="medal" tone="gold" value={t.champion} label="чемпионы" />
          ) : (
            <Fact
              icon="chart"
              value={t.stage || "—"}
              label={t.matches_total ? `матчей сыграно ${t.matches_played} из ${t.matches_total}` : "стадия"}
            />
          )}
        </div>

        <span className="hero-cta">
          Открыть сетку <Icon name="arrowRight" size={15} />
        </span>
      </div>

      <div className="hero-side">
        {finished ? (
          <div className="hero-done">
            <Icon name="trophy" size={22} />
            <b>{t.champion || "Завершён"}</b>
            <span>победители</span>
          </div>
        ) : live ? (
          <div className="hero-live">
            <span className="live-dot" />
            Идёт сейчас
          </div>
        ) : (
          <CountdownBlocks startsAt={t.starts_at} />
        )}
      </div>
    </Link>
  );
}

function Fact({ icon, value, label, tone }) {
  return (
    <div className={`fact${tone ? ` ${tone}` : ""}`}>
      <Icon name={icon} size={16} />
      <span className="fact-text">
        <b>{value}</b>
        <span>{label}</span>
      </span>
    </div>
  );
}
