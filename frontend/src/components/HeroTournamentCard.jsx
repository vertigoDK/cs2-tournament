import { Link } from "react-router-dom";
import CountdownBlocks from "./CountdownBlocks.jsx";
import Icon from "./Icon.jsx";
import MvpCard from "./MvpCard.jsx";
import StatusPill, { statusKind } from "./StatusPill.jsx";
import { tournamentCover } from "../utils/maps.js";
import CupTip from "./CupTip.jsx";
import { formatLocal } from "../utils/time.js";

// Текущий турнир на главной: крупная карточка с обложкой справа.
export default function HeroTournamentCard({ t }) {
  const kind = statusKind(t);

  return (
    <Link to={`/tournaments/${t.id}`} className={`featured ${kind}`}>
      <div className="featured-body">
        <StatusPill t={t} />
        <h2>{t.name}</h2>

        <dl className="t-facts">
          {t.prize_pool ? (
            <div>
              <dt>Призовой</dt>
              <dd className="accent">{t.prize_pool}</dd>
            </div>
          ) : null}
          <div>
            <dt>Команды</dt>
            <dd>{t.teams_count}</dd>
          </div>
          {kind === "finished" ? null : (
            <div>
              <dt>{kind === "live" ? "Стадия" : "Старт"}</dt>
              <dd>{kind === "live" ? t.stage || "—" : t.starts_at ? formatLocal(t.starts_at) : "не назначен"}</dd>
            </div>
          )}
          {t.matches_total && kind !== "upcoming" ? (
            <div>
              <dt>Матчи</dt>
              <dd>
                {t.matches_played}/{t.matches_total}
              </dd>
            </div>
          ) : null}
        </dl>

        {kind === "upcoming" ? <CountdownBlocks startsAt={t.starts_at} /> : null}

        {kind === "finished" && (t.champion || t.mvp) ? (
          <div className="t-awards">
            {t.champion ? (
              <div className="champ-banner">
                <CupTip id={t.id} name={t.name} date={t.started_at || t.starts_at || t.created_at} team={t.champion} prize={t.prize_pool} />
                <div>
                  <span className="mono">Чемпион</span>
                  <b>{t.champion}</b>
                </div>
              </div>
            ) : null}
            {t.mvp ? <MvpCard mvp={t.mvp} number={t.number} tournament={{ name: t.name, date: t.started_at || t.starts_at || t.created_at }} /> : null}
          </div>
        ) : null}

        <span className="featured-cta">
          Открыть сетку <Icon name="arrowRight" size={16} />
        </span>
      </div>
      <img src={tournamentCover(t.id)} alt="" className="featured-art" />
    </Link>
  );
}
