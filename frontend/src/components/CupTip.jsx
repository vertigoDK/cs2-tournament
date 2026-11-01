import { cupOf } from "../utils/cups.js";
import HoverCard from "./HoverCard.jsx";

export const fullDay = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }).replace(" г.", "")
    : "";

// Кубок турнира; при наведении — карточка: что за кубок, какой турнир, когда,
// за какую команду и какой был фонд. С id — ещё и ссылка на турнир.
export default function CupTip({ id, name, date, team, prize, prizeLabel = "фонд", className = "" }) {
  const cup = cupOf(name);
  return (
    <HoverCard
      to={id ? `/tournaments/${id}` : undefined}
      label={`${cup.name} — ${name}`}
      className={className}
      card={<CupCard cup={cup} name={name} date={date} team={team} prize={prize} prizeLabel={prizeLabel} />}
    >
      <img src={cup.img} alt="" />
    </HoverCard>
  );
}

function CupCard({ cup, name, date, team, prize, prizeLabel }) {
  return (
    <>
      <span className="cup-tip-art">
        <img src={cup.img} alt="" />
      </span>
      <span className="cup-tip-body">
        <span className="cup-tip-kicker mono">кубок</span>
        <b className="cup-tip-name">{cup.name}</b>
        {cup.note ? <span className="cup-tip-note">{cup.note}</span> : null}
        <span className="cup-tip-rows mono">
          <Row k="турнир" v={name} />
          {date ? <Row k="дата" v={fullDay(date)} /> : null}
          {team ? <Row k="команда" v={team} /> : null}
          {prize ? <Row k={prizeLabel} v={<em>{prize}</em>} /> : null}
        </span>
      </span>
    </>
  );
}

export function Row({ k, v }) {
  return (
    <span>
      <i>{k}</i>
      {v}
    </span>
  );
}
