import { useEffect, useState } from "react";
import api from "../api.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";

const STAGE = (r, total) =>
  total - r === 1 ? "Финал" : total - r === 2 ? "Полуфинал" : total - r === 3 ? "1/4" : `Раунд ${r + 1}`;

// Отборочные дуэли 1×1 перед основной сеткой. Своего титула у них нет —
// по итогу составляют пары или посев, поэтому показываем их внутри турнира.
// Админ кликает по дуэли, чтобы внести или исправить результат.
export default function QualifierBracket({ qualifier, isAdmin, busy, onSetDuel, onRebuild, onDelete }) {
  const [editing, setEditing] = useState(null); // {r, i}
  const rounds = qualifier.rounds || [];
  const people = qualifier.people || {};
  const final = rounds[rounds.length - 1]?.[0];
  const winner = final && final.win != null ? people[final.p[final.win]] : null;
  const person = (pid) => (pid ? people[pid] || { name: "?" } : null);
  const duel = editing ? rounds[editing.r][editing.i] : null;

  return (
    <section className="section">
      <h2 className="section-title">
        Отборочные дуэли · {qualifier.mode || "1×1"}
        {qualifier.map ? ` · ${qualifier.map}` : ""}
      </h2>
      {qualifier.note || winner || isAdmin ? (
        <div className="q-note">
          {winner ? (
            <span className="q-winner">
              <Icon name="trophy" size={14} /> Лучший в дуэлях: <b>{winner.name}</b>
            </span>
          ) : null}
          {qualifier.note ? <span>{qualifier.note}</span> : null}
          {isAdmin ? (
            <span className="q-admin">
              <button type="button" className="btn sm" onClick={onRebuild} disabled={busy}>
                Пересобрать
              </button>
              <button type="button" className="btn sm danger" onClick={onDelete} disabled={busy}>
                <Icon name="trash" size={13} /> Удалить дуэли
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="q-scroll">
        <div className="q-grid">
          {rounds.map((round, r) => (
            <div className="q-round" key={r}>
              <div className="round-title">{STAGE(r, rounds.length)}</div>
              <div className="q-matches">
                {round.map((m, i) => {
                  const ready = m.p[0] && m.p[1];
                  const bye = (m.p[0] == null) !== (m.p[1] == null) && r === 0;
                  const editable = isAdmin && ready;
                  return (
                    <button
                      type="button"
                      className={`q-match${editable ? " editable" : ""}`}
                      key={i}
                      disabled={!editable}
                      onClick={() => editable && setEditing({ r, i })}
                      title={editable ? "Внести результат" : undefined}
                    >
                      {m.p.map((pid, slot) => {
                        const p = person(pid);
                        const won = m.win === slot;
                        return (
                          <span className={`q-side${won ? " win" : m.win != null ? " lose" : ""}`} key={slot}>
                            {p ? <Avatar name={p.name} color={p.color} url={p.avatar} size={26} /> : <span className="ava">–</span>}
                            <span className="q-name">{p ? p.name : bye ? "bye" : "TBD"}</span>
                            <span className="q-score mono">{m.score?.[slot] ?? (won && !m.score ? "✓" : "–")}</span>
                          </span>
                        );
                      })}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {duel ? (
        <DuelModal
          duel={duel}
          a={person(duel.p[0])}
          b={person(duel.p[1])}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            if (await onSetDuel(editing.r, editing.i, payload)) setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

function DuelModal({ duel, a, b, busy, onClose, onSave }) {
  const [score, setScore] = useState([duel.score?.[0] ?? "", duel.score?.[1] ?? ""]);
  const num = (v) => (v === "" ? null : Number(v));
  const tie = score[0] !== "" && score[0] === score[1];

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = (win = null) => {
    const filled = score[0] !== "" && score[1] !== "";
    onSave({ score: filled ? [num(score[0]), num(score[1])] : null, win: filled ? win : win });
  };

  return (
    <div className="veto-backdrop" onClick={onClose}>
      <div className="veto-modal duel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="veto-modal-head">
          <h3>Результат дуэли</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="veto-modal-body">
          <div className="duel-row">
            {[a, b].map((p, slot) => (
              <label className="duel-side" key={slot}>
                <Avatar name={p.name} color={p.color} url={p.avatar} size={40} />
                <b>{p.name}</b>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="0"
                  autoFocus={slot === 0}
                  value={score[slot]}
                  onChange={(e) => setScore((s) => s.map((v, k) => (k === slot ? e.target.value : v)))}
                />
              </label>
            ))}
          </div>
          <div className="hint">
            Победитель определится по счёту. Без счёта или при равном счёте — отметьте победителя кнопкой.
          </div>
        </div>
        <div className="veto-modal-foot">
          {duel.win != null ? (
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => confirm("Снять результат дуэли? Дальше по сетке дуэлей тоже всё сбросится.") && onSave({ score: null, win: null })}
            >
              Снять результат
            </button>
          ) : null}
          <span className="spacer" />
          {(score[0] === "" || tie) &&
            [a, b].map((p, slot) => (
              <button key={slot} className="btn" disabled={busy} onClick={() => save(slot)}>
                Победил {p.name}
              </button>
            ))}
          {score[0] !== "" && score[1] !== "" && !tie ? (
            <button className="btn primary" disabled={busy} onClick={() => save(null)}>
              <Icon name="check" size={14} /> Сохранить
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Создание дуэлей: кто участвует, на какой карте, в каком порядке.
export function QualifierSetup({ tournament, existing, busy, onClose, onCreate }) {
  const members = tournament.bracket.teams.flatMap((t) => [t.player_a_id, t.player_b_id, ...(t.subs || [])]).filter(Boolean);
  const [users, setUsers] = useState(null);
  const [picked, setPicked] = useState(() => existing?.rounds?.[0]?.flatMap((m) => m.p).filter(Boolean) || [...new Set(members)]);
  const [map, setMap] = useState(existing?.map || "aim_map_s2");
  const [mode, setMode] = useState("random");
  const [note, setNote] = useState(existing?.note || "");

  useEffect(() => {
    api.get("/users").then((res) => setUsers(res.data));
  }, []);

  const toggle = (id) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="veto-backdrop" onClick={onClose}>
      <div className="veto-modal duel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="veto-modal-head">
          <h3>{existing ? "Пересобрать дуэли" : "Дуэли 1×1"}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="veto-modal-body">
          <div className="field">
            <label>Участники · {picked.length}</label>
            {!users ? (
              <div className="spinner" />
            ) : (
              <div className="duel-people">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={`chip${picked.includes(u.id) ? " active" : ""}`}
                    onClick={() => toggle(u.id)}
                  >
                    {u.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="form-row">
            <label className="field">
              <span>Карта</span>
              <input type="text" value={map} onChange={(e) => setMap(e.target.value)} />
            </label>
            <div className="field">
              <label>Пары в первом раунде</label>
              <div className="segmented">
                {[
                  ["random", "случайно"],
                  ["order", "по порядку выбора"],
                ].map(([v, l]) => (
                  <button key={v} type="button" className={mode === v ? "active" : undefined} onClick={() => setMode(v)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="field">
            <span>Подпись — на что влияют дуэли (необязательно)</span>
            <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <div className="veto-modal-foot">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button
            className="btn primary"
            disabled={busy || picked.length < 2}
            onClick={() => onCreate({ player_ids: picked, mode, map: map.trim() || "aim_map_s2", note: note.trim() })}
          >
            {existing ? "Пересобрать" : "Создать сетку дуэлей"}
          </button>
        </div>
      </div>
    </div>
  );
}
