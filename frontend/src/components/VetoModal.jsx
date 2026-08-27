import { stepAction } from "../utils/veto.js";
import Icon from "./Icon.jsx";
import MapCard from "./MapCard.jsx";

// Название приходит с сервера готовым: своё имя команды или «ник + ник».
const teamLabel = (t) => t?.name || "TBD";
const captainOf = (t) => (t ? t.captain_name || t.a : null);
const captainId = (t) => (t ? t.captain_id ?? t.player_a_id : null);

function mapScore(maps) {
  const s = [0, 0];
  (maps || []).forEach((m) => {
    if (m.winner === 0 || m.winner === 1) s[m.winner] += 1;
  });
  return s;
}

export default function VetoModal({
  open,
  onClose,
  match,
  teamA,
  teamB,
  mapsPool,
  bestOf,
  isAdmin,
  meId,
  tournamentStarted,
  onStart,
  onChoose,
  onMapWinner,
  onEditStats,
  onReset,
  busy,
}) {
  if (!open || !match) return null;
  const veto = match.veto;
  const status = veto?.status || "pending";
  const nextAction = status === "in_progress" ? stepAction(bestOf, veto.log.length) : null;

  const onTurnTeam = status === "in_progress" ? (veto.turn === 0 ? teamA : teamB) : null;
  const myTurn = status === "in_progress" && captainId(onTurnTeam) === meId;
  // Ходит капитан команды, чья очередь. Админ может походить за любого,
  // если капитан не в сети.
  const canChoose = status === "in_progress" && (isAdmin || myTurn);

  const amCaptain = captainId(teamA) === meId || captainId(teamB) === meId;

  return (
    <div className="veto-backdrop" onClick={onClose}>
      <div className="veto-modal" onClick={(e) => e.stopPropagation()}>
        <div className="veto-modal-head">
          <h3>Драфт карт</h3>
          <span className="bo-pill">BO{bestOf}</span>
        </div>

        <div className="veto-modal-body">
          <div className="veto-teams">
            <TeamSide team={teamA} active={status === "in_progress" && veto.turn === 0} meId={meId} />
            <span className="vs">vs</span>
            <TeamSide team={teamB} active={status === "in_progress" && veto.turn === 1} meId={meId} align="right" />
          </div>

          {status === "pending" && (
            <div className="veto-note">
              {!tournamentStarted ? (
                <>
                  <Icon name="lock" size={15} />
                  Драфт откроется после начала турнира.
                </>
              ) : isAdmin ? (
                <>Нажмите «Начать драфт» — очерёдность определится жребием, дальше карты выбирают капитаны.</>
              ) : (
                <>Ждём, пока администратор откроет драфт.</>
              )}
            </div>
          )}

          {status === "in_progress" && (
            <div className={`turn-banner ${nextAction}${myTurn ? " mine" : ""}`}>
              <Icon name={nextAction === "pick" ? "map" : "clock"} size={15} />
              {myTurn ? (
                <span>
                  <b>Ваш ход</b> — {nextAction === "pick" ? "выберите карту" : "забаньте карту"}
                </span>
              ) : (
                <span>
                  {nextAction === "pick" ? "Выбирает" : "Банит"} <b>{captainOf(onTurnTeam)}</b>
                  {amCaptain ? " — ждём соперника" : ""}
                </span>
              )}
            </div>
          )}



          {status !== "pending" && (
            <div className="map-grid">
              {(mapsPool || []).map((name) => {
                const logEntry = veto.log.find((l) => l.map === name);
                const state =
                  veto.decider === name
                    ? "decider"
                    : logEntry?.action === "pick"
                    ? "picked"
                    : logEntry?.action === "ban"
                    ? "banned"
                    : null;
                return (
                  <MapCard
                    key={name}
                    name={name}
                    state={state}
                    disabled={!canChoose || Boolean(logEntry)}
                    onClick={() => canChoose && !logEntry && onChoose(name)}
                  />
                );
              })}
            </div>
          )}

          {status === "done" && match.maps?.length ? (
            <div className="series">
              <div className="series-head">
                Результат по картам
                <span className="series-score">
                  {mapScore(match.maps)[0]} : {mapScore(match.maps)[1]}
                </span>
              </div>
              {match.maps.map((mp, mi) => (
                <div className={`series-row${mp.winner !== null ? " played" : ""}`} key={mi}>
                  <span className="sr-map">
                    <Icon name="map" size={13} />
                    {mp.map}
                    {mi === match.maps.length - 1 && match.maps.length > 1 ? (
                      <em className="sr-tag">решающая</em>
                    ) : null}
                  </span>
                  {mp.rounds ? (
                    <span className="sr-score">
                      {mp.rounds[0]}:{mp.rounds[1]}
                    </span>
                  ) : null}
                  <span className="sr-pick">
                    {(isAdmin ? [0, 1] : []).map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        className={`sr-btn${mp.winner === slot ? " won" : ""}`}
                        disabled={!isAdmin || busy}
                        onClick={() => onMapWinner(mi, slot)}
                        title={isAdmin ? "Отметить победителя карты" : undefined}
                      >
                        {teamLabel(slot === 0 ? teamA : teamB)}
                      </button>
                    ))}
                    {!isAdmin && mp.winner !== null ? (
                      <span className="sr-won">{(mp.winner === 0 ? teamA : teamB)?.name}</span>
                    ) : null}
                  </span>
                  <button type="button" className="sr-stats" onClick={() => onEditStats(mi)}>
                    <Icon name="chart" size={14} />
                    {isAdmin
                      ? Object.keys(mp.stats || {}).length
                        ? "Изменить"
                        : "Внести"
                      : "Статистика"}
                  </button>
                </div>
              ))}
              {isAdmin ? (
                <div className="series-hint">
                  «Статистика» — перенести счёт по раундам и K/D/A со скорборда:
                  победитель карты проставится сам. Кнопки с командами отмечают
                  победителя вручную, повторное нажатие снимает результат.
                </div>
              ) : null}
            </div>
          ) : null}

          {veto?.log?.length > 0 && (
            <ul className="veto-log">
              {veto.log.map((l, idx) => (
                <li key={idx}>
                  <span className={`log-act ${l.action}`}>{l.action === "pick" ? "пик" : "бан"}</span>
                  <span className="who">{captainOf(l.team === 0 ? teamA : teamB)}</span>
                  <b>{l.map}</b>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="veto-modal-foot">
          {isAdmin && status !== "pending" && (
            <button className="btn" onClick={onReset} disabled={busy}>
              Сбросить драфт
            </button>
          )}
          {isAdmin && status === "pending" && (
            <button className="btn primary" onClick={onStart} disabled={busy || !tournamentStarted}>
              Начать драфт
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamSide({ team, active, meId, align }) {
  const isMe = captainId(team) === meId;
  return (
    <span className={`veto-team${active ? " active" : ""}${align === "right" ? " right" : ""}`}>
      <b>{teamLabel(team)}</b>
      <span className="cap">
        <Icon name="star" size={11} filled />
        {captainOf(team)}
        {isMe ? " (вы)" : ""}
      </span>
    </span>
  );
}
