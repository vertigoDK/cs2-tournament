import { useEffect, useState } from "react";
import { formatClock, stepAction, vetoSequence } from "../utils/veto.js";
import Icon from "./Icon.jsx";
import MapCard from "./MapCard.jsx";
import DraftStats from "./DraftStats.jsx";
import MatchSummary from "./MatchSummary.jsx";

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
  serverOffset = 0,
  tournamentStarted,
  onStart,
  onChoose,
  onMapWinner,
  onEditStats,
  onReset,
  busy,
}) {
  // Esc закрывает окно — как любое модальное окно.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const running = open && match?.veto?.status === "in_progress" && Boolean(match?.veto?.bank);
  const now = useNow(running, serverOffset);

  if (!open || !match) return null;
  const veto = match.veto;
  const status = veto?.status || "pending";
  // У каждого матча свой формат: финал может быть BO5 при BO3 в остальных.
  const bo = match.bo || bestOf;
  const poolSize = (mapsPool || []).length;
  const nextAction = status === "in_progress" ? stepAction(bo, veto.log.length, poolSize) : null;
  const clock = (side) => bankLeft(veto, side, now);

  const onTurnTeam = status === "in_progress" ? (veto.turn === 0 ? teamA : teamB) : null;
  const myTurn = status === "in_progress" && captainId(onTurnTeam) === meId;
  // Ходит капитан команды, чья очередь. Админ может походить за любого,
  // если капитан не в сети.
  const canChoose = status === "in_progress" && (isAdmin || myTurn);

  const amCaptain = captainId(teamA) === meId || captainId(teamB) === meId;

  return (
    <div className="veto-backdrop" onClick={onClose}>
      <div className="veto-modal draft" onClick={(e) => e.stopPropagation()}>
        <div className="veto-modal-head">
          <h3>Драфт карт</h3>
          <span className="pool-count mono">{(mapsPool || []).length} карт в пуле</span>
          <span className="bo-pill">BO{bo}</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="veto-modal-body">
          <div className="veto-teams">
            <TeamSide team={teamA} active={status === "in_progress" && veto.turn === 0} meId={meId} clock={clock(0)} />
            <span className="vs">vs</span>
            <TeamSide
              team={teamB}
              active={status === "in_progress" && veto.turn === 1}
              meId={meId}
              align="right"
              clock={clock(1)}
            />
          </div>

          {status === "pending" && <img src="/img/draft.webp" alt="" className="veto-art" />}

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
              {clock(veto.turn) != null ? (
                <span className={`turn-clock mono${clock(veto.turn) <= 30 ? " low" : ""}`}>
                  {formatClock(clock(veto.turn))}
                </span>
              ) : null}
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



          {veto?.skipped ? (
            <div className="veto-note">
              <Icon name="map" size={15} />
              Драфта не было — карты для этого матча выбрали без пиков и банов.
            </div>
          ) : null}

          {status !== "pending" && !veto?.skipped && (
            <VetoSteps veto={veto} bestOf={bo} poolSize={poolSize} teamA={teamA} teamB={teamB} />
          )}

          {status !== "pending" && !veto?.skipped && (
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

          {status !== "done" ? <DraftStats teamA={teamA} teamB={teamB} mapsPool={mapsPool} /> : null}

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
                    {mi === match.maps.length - 1 && match.maps.length > 1 && !veto?.skipped ? (
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

          {status === "done" ? (
            <>
              <MatchSummary match={match} teamA={teamA} teamB={teamB} />
              <DraftStats teamA={teamA} teamB={teamB} mapsPool={mapsPool} collapsible />
            </>
          ) : null}
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

function TeamSide({ team, active, meId, align, clock }) {
  const isMe = captainId(team) === meId;
  return (
    <span className={`veto-team${active ? " active" : ""}${align === "right" ? " right" : ""}`}>
      {clock != null ? (
        <span className={`team-clock mono${clock <= 30 ? " low" : ""}${clock <= 0 ? " out" : ""}`}>
          {clock <= 0 ? "время вышло · авто" : formatClock(clock)}
        </span>
      ) : null}
      <b>{teamLabel(team)}</b>
      <span className="cap">
        <Icon name="star" size={11} filled />
        {captainOf(team)}
        {isMe ? " (вы)" : ""}
      </span>
    </span>
  );
}

// Полоса порядка драфта: все ходы по очереди, сделанные — с картой, текущий
// подсвечен. На большом пуле сразу видно, сколько ещё банить до пиков.
function VetoSteps({ veto, bestOf, poolSize, teamA, teamB }) {
  const steps = vetoSequence(bestOf, poolSize);
  const log = veto.log || [];
  // Очередь чередуется каждый ход, начиная с того, кому выпал жребий.
  const first = log.length ? log[0].team : veto.turn;
  const current = veto.status === "in_progress" ? log.length : -1;

  return (
    <ol className="veto-steps">
      {steps.map((action, i) => {
        const done = action === "decider" ? veto.decider : log[i]?.map;
        const team = action === "decider" ? null : (first + i) % 2 === 0 ? teamA : teamB;
        return (
          <li
            key={i}
            className={`vs-step ${action}${done ? " done" : ""}${i === current ? " current" : ""}`}
          >
            <span className="vs-act mono">
              {action === "decider" ? "решающая" : `${i + 1} · ${action === "pick" ? "пик" : "бан"}`}
            </span>
            <span className="vs-map">{done || (action === "decider" ? "—" : "…")}</span>
            {log[i]?.auto ? <span className="vs-auto mono">авто</span> : null}
            {team ? <span className="vs-who">{captainOf(team)}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

// Текущее время по часам сервера (секунды). Тикает раз в секунду, пока идёт
// драфт с таймером: смещение компенсирует расхождение часов браузера и сервера.
function useNow(running, serverOffset) {
  const [now, setNow] = useState(() => Date.now() / 1000 + serverOffset);
  useEffect(() => {
    setNow(Date.now() / 1000 + serverOffset);
    if (!running) return;
    const id = setInterval(() => setNow(Date.now() / 1000 + serverOffset), 1000);
    return () => clearInterval(id);
  }, [running, serverOffset]);
  return now;
}

// Сколько секунд осталось у команды: её запас минус время текущего хода, если
// ходит она. null — драфт без таймера.
function bankLeft(veto, side, now) {
  if (!veto?.bank || side == null) return null;
  const left = veto.bank[side] - (veto.status === "in_progress" && veto.turn === side ? now - veto.turn_started_at : 0);
  return Math.max(0, left);
}
