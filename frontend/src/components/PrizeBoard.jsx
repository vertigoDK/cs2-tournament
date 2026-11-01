import { Link } from "react-router-dom";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import { formatDay } from "../utils/time.js";
import { cupOf } from "../utils/cups.js";
import CupTip from "./CupTip.jsx";

// Призовые: сколько разыграно, кто сколько забрал и за что, следующий приз.
// Фонд турнира делится поровну между двумя игроками команды-чемпиона.

const money = (v) => Math.round(v || 0).toLocaleString("ru-RU");
// Полоса долей лежит на тёмной плашке — цвета подобраны под неё.
const SHARE_COLORS = ["var(--accent)", "var(--paper)", "#ff9b7a", "#a9a49a", "#ffc9b5", "#6b6760"];

export default function PrizeBoard({ players, tournaments, currency, prizeTotal }) {
  const cur = currency ? ` ${currency}` : "";
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));

  // Разбивка по турнирам: за какой турнир сколько получил каждый.
  const wins = {};
  tournaments
    .filter((t) => t.prize_amount && t.champion_ids.length)
    .forEach((t) => {
      const share = t.prize_amount / t.champion_ids.length;
      t.champion_ids.forEach((pid) => {
        (wins[pid] ||= []).push({ id: t.id, name: t.name, date: t.date, share, team: t.champion });
      });
    });

  const earners = players
    .filter((p) => p.prize > 0)
    .sort((a, b) => b.prize - a.prize || a.display_name.localeCompare(b.display_name));
  const others = players.filter((p) => !(p.prize > 0));
  const paidTournaments = tournaments.filter((t) => t.prize_amount && t.champion_ids.length).length;
  const next = tournaments
    .filter((t) => t.status !== "finished" && t.prize_amount)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  return (
    <section className="prizes">
      <div className="pz-top">
        <div className="pz-total">
          <span className="mono">разыграно за всё время</span>
          <b>
            {money(prizeTotal)}
            {cur}
          </b>
          <span className="pz-sub">
            {paidTournaments} {paidTournaments === 1 ? "турнир" : paidTournaments < 5 ? "турнира" : "турниров"} с
            призовым · {earners.length} {earners.length === 1 ? "игрок" : earners.length < 5 ? "игрока" : "игроков"} с
            выплатой
          </span>
          {earners.length ? (
            <div className="pz-share" aria-label="Кто сколько забрал">
              {earners.map((p, i) => (
                <i
                  key={p.id}
                  style={{ flexGrow: p.prize, background: SHARE_COLORS[i % SHARE_COLORS.length] }}
                  title={`${p.display_name}: ${money(p.prize)}${cur}`}
                />
              ))}
            </div>
          ) : null}
          {earners.length ? (
            <div className="pz-legend mono">
              {earners.map((p, i) => (
                <span key={p.id}>
                  <i style={{ background: SHARE_COLORS[i % SHARE_COLORS.length] }} />
                  {p.display_name} {Math.round((100 * p.prize) / (prizeTotal || 1))}%
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {next ? (
          <Link to={`/tournaments/${next.id}`} className="pz-next">
            <img src={cupOf(next.name).img} alt="" />
            <span className="mono">следующий призовой</span>
            <b>
              {money(next.prize_amount)}
              {cur}
            </b>
            <span className="pz-next-name">
              {next.name} · {formatDay(next.date)}
            </span>
            <span className="pz-next-cta">
              Открыть турнир <Icon name="arrowRight" size={14} />
            </span>
          </Link>
        ) : null}
      </div>

      {earners.length ? (
        <div className="pz-earners">
          {earners.map((p, i) => (
            <div key={p.id} className={`pz-card${i === 0 ? " first" : ""}`} style={{ animationDelay: `${i * 60}ms` }}>
              <div className="pz-card-head">
                <span className="pz-rank mono">#{i + 1}</span>
                <Link to={`/players/${p.id}`} className="pz-player">
                  <Avatar name={p.display_name} color={p.avatar_color} url={p.avatar_url} size={44} />
                  <b>{p.display_name}</b>
                </Link>
                <span className="pz-trophies">
                  {(wins[p.id] || []).map((w) => (
                    <CupTip
                      key={w.id}
                      id={w.id}
                      name={w.name}
                      date={w.date}
                      team={w.team}
                      prize={`+${money(w.share)}${cur}`}
                      prizeLabel="выплата"
                    />
                  ))}
                </span>
              </div>
              <div className="pz-amount">
                {money(p.prize)}
                <span>{cur}</span>
              </div>
              <ul className="pz-wins">
                {(wins[p.id] || []).map((w) => (
                  <li key={w.id}>
                    <Link to={`/tournaments/${w.id}`}>
                      <span className="pz-win-name">{w.name}</span>
                      <span className="pz-win-team">{w.team}</span>
                    </Link>
                    <b className="mono">
                      +{money(w.share)}
                      {cur}
                    </b>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="hint">Пока никто не выигрывал турниров с призовым фондом.</div>
      )}

      {others.length && earners.length ? (
        <div className="pz-others">
          <span className="mono">ещё без выплат</span>
          <div>
            {others.map((p) => (
              <Link key={p.id} to={`/players/${p.id}`} title={p.display_name}>
                <Avatar name={p.display_name} color={p.avatar_color} url={p.avatar_url} size={32} />
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <p className="hint">Призовой фонд турнира делится поровну между двумя игроками команды-чемпиона.</p>
    </section>
  );
}
