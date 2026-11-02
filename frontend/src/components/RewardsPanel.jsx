import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";

// Награды за места в дуэлях — в окне «Готов», до начала драфта. Капитан
// своей команды (или админ за любую) закрепляет постоянные пик и бан,
// выбирает стороны на картах серии и может поменяться соперником в первом
// матче. Что даёт какое место — настройка турнира (см. backend/app/rewards.py).

const captainId = (t) => (t ? t.captain_id ?? t.player_a_id : null);
const label = (t) => t?.name || "TBD";

export default function RewardsPanel({ rewards, match, pos, bracket, mapsPool, bo, meId, isAdmin, busy, onReward }) {
  const teams = [0, 1].map((s) => (match.p[s] != null ? bracket.teams[match.p[s]] : null));
  const blocks = [0, 1]
    .map((slot) => ({ slot, team: teams[slot], items: rewards?.[String(match.p[slot])] || [] }))
    .filter((b) => b.items.length);
  if (!blocks.length) return null;

  return (
    <div className="rewards">
      {blocks.map(({ slot, team, items }) => {
        const canAct = isAdmin || captainId(team) === meId;
        const send = (payload) => onReward(isAdmin ? { ...payload, slot } : payload);
        return (
          <div className="rw-team" key={slot}>
            <div className="rw-team-head">
              <Icon name="star" size={13} filled />
              Бафы <b>{label(team)}</b>
            </div>
            {items.map((it, k) =>
              it.type === "perma_pickban" ? (
                <Perma key={k} it={it} canAct={canAct} mapsPool={mapsPool} busy={busy} send={send} />
              ) : it.type === "side_choice" ? (
                <Sides key={k} it={it} canAct={canAct} veto={match.veto} slot={slot} bo={bo} busy={busy} send={send} />
              ) : it.type === "swap_opponent" ? (
                <Swap
                  key={k}
                  it={it}
                  canAct={canAct}
                  pos={pos}
                  slot={slot}
                  match={match}
                  bracket={bracket}
                  busy={busy}
                  send={send}
                />
              ) : null
            )}
          </div>
        );
      })}
    </div>
  );
}

function Perma({ it, canAct, mapsPool, busy, send }) {
  const [pick, setPick] = useState("");
  const [ban, setBan] = useState("");
  if (it.perma) {
    return (
      <div className="rw-row">
        <span className="rw-name">Постоянные пик и бан</span>
        <span className="rw-value">
          пик <b>{it.perma.pick}</b> · бан <b>{it.perma.ban}</b>
          <i className="mono">на весь турнир, ставятся сами</i>
        </span>
      </div>
    );
  }
  return (
    <div className="rw-row">
      <span className="rw-name">Постоянные пик и бан</span>
      {canAct ? (
        <span className="rw-form">
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">всегда пикать…</option>
            {mapsPool.filter((m) => m !== ban).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select value={ban} onChange={(e) => setBan(e.target.value)}>
            <option value="">всегда банить…</option>
            {mapsPool.filter((m) => m !== pick).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn sm primary"
            disabled={busy || !pick || !ban}
            onClick={() =>
              confirm(`Закрепить на весь турнир: всегда пик ${pick}, всегда бан ${ban}? Поменять потом нельзя.`) &&
              send({ kind: "perma", pick, ban })
            }
          >
            Закрепить
          </button>
        </span>
      ) : (
        <span className="rw-value muted">ещё не выбраны</span>
      )}
    </div>
  );
}

function Sides({ it, canAct, veto, slot, bo, busy, send }) {
  const saved = veto?.sides?.[String(slot)] || {};
  const [sel, setSel] = useState(saved);
  useEffect(() => setSel(veto?.sides?.[String(slot)] || {}), [veto?.sides, slot]);
  const savedCount = Object.keys(saved).length;
  const left = it.total - it.used + savedCount - Object.keys(sel).length;
  const dirty = JSON.stringify(sel) !== JSON.stringify(saved);
  const toggle = (k, side) =>
    setSel((s) => {
      const next = { ...s };
      if (next[k] === side) delete next[k];
      else if (next[k] || left > 0) next[k] = side;
      return next;
    });

  return (
    <div className="rw-row">
      <span className="rw-name">
        Выбор стороны <i className="mono">осталось {Math.max(0, left)} из {it.total}</i>
      </span>
      <span className="rw-form rw-sides">
        {Array.from({ length: bo }, (_, k) => (
          <span className="rw-map" key={k}>
            <span className="mono">карта {k + 1}</span>
            {["CT", "T"].map((side) => (
              <button
                key={side}
                type="button"
                className={`rw-side${sel[k] === side ? " on" : ""}`}
                disabled={!canAct || busy || (!sel[k] && left <= 0)}
                onClick={() => toggle(String(k), side)}
              >
                {side}
              </button>
            ))}
          </span>
        ))}
        {canAct && dirty ? (
          <button type="button" className="btn sm primary" disabled={busy} onClick={() => send({ kind: "sides", sides: sel })}>
            Сохранить стороны
          </button>
        ) : null}
      </span>
    </div>
  );
}

function Swap({ it, canAct, pos, slot, match, bracket, busy, send }) {
  const [target, setTarget] = useState("");
  if (pos.r !== 0) return null;
  if (it.used) {
    return (
      <div className="rw-row">
        <span className="rw-name">Замена соперника</span>
        <span className="rw-value muted">использована</span>
      </div>
    );
  }
  // Команды из других матчей первого раунда, которые ещё не начались.
  const options = [];
  bracket.rounds[0].forEach((m, i) => {
    if (i === pos.i || m.win != null) return;
    const st = m.veto?.status || "pending";
    if (st !== "pending" && st !== "ready_check") return;
    m.p.forEach((idx, s) => {
      if (idx != null) options.push({ value: `${i}-${s}`, name: bracket.teams[idx].name, i, s });
    });
  });
  const opp = bracket.teams[match.p[1 - slot]];
  const chosen = options.find((o) => o.value === target);
  return (
    <div className="rw-row">
      <span className="rw-name">Замена соперника</span>
      {canAct ? (
        <span className="rw-form">
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">сыграть вместо {opp?.name} с…</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn sm primary"
            disabled={busy || !chosen}
            onClick={() =>
              confirm(`Поменяться: ваш соперник станет ${chosen.name}, а ${opp?.name} уйдёт в их матч. Один раз за турнир.`) &&
              send({ kind: "swap", other: chosen.i, other_slot: chosen.s })
            }
          >
            Поменяться
          </button>
        </span>
      ) : (
        <span className="rw-value muted">может поменять соперника в первом матче</span>
      )}
    </div>
  );
}
