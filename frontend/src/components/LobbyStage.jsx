import { Link } from "react-router-dom";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import { mapImage } from "../utils/maps.js";

// Лобби целиком, как страница матча на Cybershoke: сверху карта и счёт, по
// бокам две команды с K/D/A, по центру сведения об игре и кнопка входа.

export const MODE_NAMES = { duel: "Дуэль 1×1", wingman: "Wingman 2×2", free: "Свободная игра" };
const STATUS = {
  waiting: "Грузим карту",
  ready: "Ждём игроков",
  live: "Идёт игра",
  finished: "Матч завершён",
  cancelled: "Отменено",
};

const when = (iso) =>
  iso ? new Date(iso + "Z").toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "—";

function TeamColumn({ lobby, team, best }) {
  const list = lobby.players.filter((p) => p.team === team);
  const win = lobby.winner === team;
  return (
    <div className={`lv-team${win ? " win" : ""}`}>
      <header>
        <b>Команда {team}</b>
        {win ? <Icon name="trophy" size={16} /> : null}
        <span className="mono">K / D / A</span>
      </header>
      {list.map((p) => (
        <Link key={p.user_id} to={`/players/${p.user_id}`} className="lv-row">
          <span className="lv-who">
            <Avatar name={p.name} color={p.avatar_color} url={p.avatar_url} size={40} />
            {p.name}
            {p.user_id === best ? <Icon name="star" size={14} className="lv-mvp" /> : null}
          </span>
          <span className="mono lv-kda">{p.kills != null ? `${p.kills}/${p.deaths}/${p.assists}` : "—"}</span>
        </Link>
      ))}
    </div>
  );
}

export default function LobbyStage({ lobby, isAdmin, onCancel, toast }) {
  const cover = mapImage(lobby.map);
  const [s1, s2] = lobby.score || [null, null];
  const active = ["waiting", "ready", "live"].includes(lobby.status);
  const hasStats = lobby.players.some((p) => p.kills != null);
  // Лучший — по убийствам, при равенстве — у кого меньше смертей.
  const best = hasStats ? [...lobby.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0]?.user_id : null;
  const connect = lobby.server_address ? `connect ${lobby.server_address}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(connect);
      toast?.("Скопировано — вставь в консоль CS2 (~)");
    } catch {
      toast?.(connect);
    }
  };

  return (
    <div className={`lv${lobby.status === "live" ? " live" : ""}${lobby.tournament_id ? " tourney" : ""}`}>
      <section className="lv-banner" style={cover ? { "--cover": `url(${cover})` } : undefined}>
        <span className="lv-status mono">
          {lobby.status === "live" ? <i className="live-dot" /> : null}
          {STATUS[lobby.status]}
        </span>
        <div className="lv-score">
          <b className={lobby.winner === 1 ? "win" : ""}>{s1 ?? "–"}</b>
          <span>:</span>
          <b className={lobby.winner === 2 ? "win" : ""}>{s2 ?? "–"}</b>
        </div>
        <span className="lv-banner-map mono">{MODE_NAMES[lobby.mode] || lobby.mode} · {lobby.map}</span>
        {lobby.tournament_id ? (
          <Link to={`/tournaments/${lobby.tournament_id}`} className="lv-tourney mono">
            <img src="/img/nav/trophy.webp" alt="" /> {lobby.tournament} · {lobby.label} →
          </Link>
        ) : null}
      </section>

      <section className="lv-grid">
        <TeamColumn lobby={lobby} team={1} best={best} />

        <aside className="lv-info">
          {active ? (
            <div className="lv-join">
              {lobby.status === "waiting" ? (
                <p className="hint">Сервер грузит карту. Адрес появится, когда всё будет готово — раньше не заходи, выкинет.</p>
              ) : connect ? (
                <>
                  <button type="button" className="lb-connect" onClick={copy} title="Скопировать">
                    <code>{connect}</code>
                    <Icon name="download" size={14} />
                  </button>
                  <p className="hint">Скопируй и вставь в консоль CS2. Кто не в составе — заходит зрителем.</p>
                </>
              ) : (
                <p className="hint">Адрес сервера не указан.</p>
              )}
            </div>
          ) : null}
          <dl>
            <div><dt>Режим</dt><dd>{MODE_NAMES[lobby.mode] || lobby.mode}</dd></div>
            <div><dt>Карта</dt><dd>{lobby.map}</dd></div>
            <div><dt>Сервер</dt><dd className="mono">{lobby.server_address || "—"}</dd></div>
            <div><dt>Создал</dt><dd>{lobby.created_by || "—"}</dd></div>
            <div><dt>{lobby.started_at ? "Начало" : "Создано"}</dt><dd>{when(lobby.started_at || lobby.created_at)}</dd></div>
            {lobby.finished_at ? <div><dt>Конец</dt><dd>{when(lobby.finished_at)}</dd></div> : null}
          </dl>
          {active && isAdmin && onCancel ? (
            <button type="button" className="btn sm danger lv-cancel" onClick={() => onCancel(lobby)}>
              Отменить лобби
            </button>
          ) : null}
        </aside>

        <TeamColumn lobby={lobby} team={2} best={best} />
      </section>
    </div>
  );
}
