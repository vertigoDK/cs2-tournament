import { cupOf } from "../utils/cups.js";
import { Medal } from "./Medal.jsx";

// «За победу»: что заберёт команда-чемпион, пока турнир не сыгран, —
// кубок турнира, призовой фонд (делится поровну на двоих) и титул в профиль,
// а лучшему по рейтингу — медаль MVP с номером турнира.
export default function WinnerReward({ name, prizePool, number }) {
  const cup = cupOf(name);
  const amount = Number(String(prizePool || "").replace(/[^\d]/g, "")) || 0;
  const currency = String(prizePool || "").replace(/[\d\s., ]/g, "").trim();
  const each = amount ? `${Math.round(amount / 2).toLocaleString("ru-RU")}${currency ? ` ${currency}` : ""}` : "";

  if (cup.beta) {
    return (
      <section className="reward reward-beta">
        <div className="rw-art">
          <img src={cup.img} alt="" />
        </div>
        <div className="rw-head">
          <span className="rw-kicker mono">за участие</span>
          <b className="rw-cup">{cup.name}</b>
          <span className="rw-note">{cup.note}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="reward">
      <div className="rw-art">
        <img src={cup.img} alt="" />
      </div>
      <div className="rw-head">
        <span className="rw-kicker mono">за победу</span>
        <b className="rw-cup">{cup.name}</b>
        {cup.note ? <span className="rw-note">{cup.note}</span> : null}
      </div>
      <ul className="rw-list">
        {amount ? (
          <li className="rw-prize">
            <span className="mono">призовые</span>
            <b className="mono">{prizePool}</b>
            <i>по {each} каждому из пары</i>
          </li>
        ) : null}
        <li>
          <span className="mono">титул</span>
          <b>+1 чемпионство</b>
          <i>кубок навсегда в профиле у обоих игроков</i>
        </li>
        {number ? (
          <li className="rw-mvp">
            <Medal number={number} size={44} />
            <span className="rw-mvp-text">
              <span className="mono">лучшему игроку</span>
              <b>Медаль MVP</b>
              <i>№{number} — за лучший рейтинг за турнир</i>
            </span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
