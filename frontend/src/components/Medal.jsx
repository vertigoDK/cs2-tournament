import HoverCard from "./HoverCard.jsx";
import { Row, fullDay } from "./CupTip.jsx";

// Медаль MVP: одна на всех, в круге — порядковый номер турнира.
export function Medal({ number, size = 40 }) {
  return (
    <span className="medal" style={{ "--mw": `${size}px` }}>
      <img src="/img/medals/mvp.webp" alt="" />
      <b>{number}</b>
    </span>
  );
}

// Медаль с карточкой при наведении: за какой турнир и с какой игрой.
// mvp: { id?, name, number, date, rating, kills, deaths, assists, maps, player? }
export default function MedalTip({ mvp, size, link = true }) {
  return (
    <HoverCard
      to={link && mvp.id ? `/tournaments/${mvp.id}` : undefined}
      label={`MVP турнира №${mvp.number} — ${mvp.name}`}
      className="medal-link"
      card={
        <>
          <span className="cup-tip-art">
            <Medal number={mvp.number} size={52} />
          </span>
          <span className="cup-tip-body">
            <span className="cup-tip-kicker mono">медаль</span>
            <b className="cup-tip-name">MVP турнира №{mvp.number}</b>
            <span className="cup-tip-note">
              {mvp.player ? `${mvp.player} — ` : ""}лучший рейтинг за весь турнир
            </span>
            <span className="cup-tip-rows mono">
              <Row k="турнир" v={mvp.name} />
              {mvp.date ? <Row k="дата" v={fullDay(mvp.date)} /> : null}
              <Row k="рейтинг" v={<em>{mvp.rating.toFixed(2)}</em>} />
              <Row k="K/D/A" v={`${mvp.kills}/${mvp.deaths}/${mvp.assists} · ${mvp.maps} карт`} />
            </span>
          </span>
        </>
      }
    >
      <Medal number={mvp.number} size={size} />
    </HoverCard>
  );
}
