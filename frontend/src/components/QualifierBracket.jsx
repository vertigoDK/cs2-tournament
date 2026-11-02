import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../api.js";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import { BlockBones } from "./Skeleton.jsx";
import Backdrop from "./Backdrop.jsx";

const STAGE = (r, total) =>
  total - r === 1 ? "Финал" : total - r === 2 ? "Полуфинал" : total - r === 3 ? "1/4" : `Раунд ${r + 1}`;

// Подпись раунда в утешительной сетке: последний — «за N-е место», раньше —
// «места N–M · полуфинал».
function placeStage(group, r) {
  const n = group.rounds[0].length * 2;
  const last = r === group.rounds.length - 1;
  if (last) return `За ${group.place}-е место`;
  const left = group.rounds.length - r;
  return `Места ${group.place}–${group.place + n - 1} · ${left === 2 ? "полуфинал" : left === 3 ? "1/4" : `раунд ${r + 1}`}`;
}

// Типы наград за места (логика — backend/app/rewards.py). Что даёт какое
// место, задаётся в турнире: bracket.rewards.
const REWARD_TYPES = {
  perma_pickban: "Постоянный пик и бан",
  side_choice: "Выбор стороны",
  swap_opponent: "Замена соперника",
};
const mapsWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? "карте" : "картах");
export function rewardText(cfg) {
  if (cfg.type === "perma_pickban") return "Постоянный пик и бан одной карты на весь турнир";
  if (cfg.type === "side_choice") return `Выбор стороны на ${cfg.count} ${mapsWord(cfg.count)}`;
  if (cfg.type === "swap_opponent") return "Возможность поменять соперника в первом матче";
  return cfg.type;
}
// Подсказка для пустой настройки — то, что решили для зимнего турнира.
const REWARDS_HINT = [
  { place: 1, type: "perma_pickban", count: 1 },
  { place: 2, type: "side_choice", count: 3 },
  { place: 3, type: "swap_opponent", count: 1 },
];

// Итоговые места {id: место} — у кого уже определились (как qualifier_places на сервере).
function finalPlaces(qualifier) {
  const out = {};
  const groups = [{ place: 1, rounds: qualifier.rounds || [] }, ...(qualifier.places || [])];
  groups.forEach(({ place, rounds }) => {
    const f = rounds[rounds.length - 1]?.[0];
    if (!f || (f.win !== 0 && f.win !== 1)) return;
    const w = f.p[f.win];
    const l = f.p[1 - f.win];
    if (w) out[w] = place;
    if (l) out[l] = place + 1;
  });
  return out;
}

// Отборочные дуэли 1×1 перед основной сеткой. Своего титула у них нет —
// по итогу составляют пары или посев, поэтому показываем их внутри турнира.
// Админ кликает по дуэли, чтобы внести или исправить результат.
export default function QualifierBracket({
  serverLobbies = [],
  qualifier,
  rewards,
  isAdmin,
  busy,
  onSetDuel,
  onRebuild,
  onDelete,
  onAddPlaces,
  onRemovePlaces,
  onSaveRewards,
}) {
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [editing, setEditing] = useState(null); // {g, r, i}; g = -1 — основная сетка
  const rounds = qualifier.rounds || [];
  const people = qualifier.people || {};
  const final = rounds[rounds.length - 1]?.[0];
  const winner = final && final.win != null ? people[final.p[final.win]] : null;
  const person = (pid) => (pid ? people[pid] || { name: "?" } : null);
  const groupRounds = (g) => (g === -1 ? rounds : qualifier.places[g].rounds);
  const duel = editing ? groupRounds(editing.g)[editing.r][editing.i] : null;
  const placed = finalPlaces(qualifier);
  const standings = Object.entries(placed)
    .map(([pid, place]) => ({ pid, place }))
    .sort((a, b) => a.place - b.place);

  // Дуэли, которые сейчас на нашем сервере: «g:r:i» → лобби.
  const onServer = Object.fromEntries(
    serverLobbies.filter((l) => l.kind === "duel").map((l) => [`${l.ref.g}:${l.ref.r}:${l.ref.i}`, l]),
  );

  // Одна дуэль-карточка; g — сетка, где она лежит.
  const renderDuel = (g, r, m, i) => {
    const lobby = onServer[`${g}:${r}:${i}`];
    const ready = m.p[0] && m.p[1];
    const bye = (m.p[0] == null) !== (m.p[1] == null) && m.win != null;
    const editable = isAdmin && ready;
    return (
      <div className={`q-wrap${lobby ? " on-server" : ""}`} key={i}>
      {lobby ? <ServerTag lobby={lobby} /> : null}
      <button
        type="button"
        className={`q-match${editable ? " editable" : ""}${lobby ? " on-server" : ""}`}
        disabled={!editable}
        onClick={() => editable && setEditing({ g, r, i })}
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
      </div>
    );
  };

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
              {!qualifier.places && onAddPlaces ? (
                <button type="button" className="btn sm" onClick={onAddPlaces} disabled={busy}>
                  <Icon name="plus" size={13} /> Добавить игры за места
                </button>
              ) : null}
              {qualifier.places?.some((g) => g.place > 3) && onRemovePlaces ? (
                <button type="button" className="btn sm" onClick={() => onRemovePlaces(true)} disabled={busy}>
                  Оставить только матч за 3-е место
                </button>
              ) : null}
              {qualifier.places && onRemovePlaces ? (
                <button type="button" className="btn sm danger" onClick={() => onRemovePlaces(false)} disabled={busy}>
                  <Icon name="trash" size={13} /> Убрать игры за места
                </button>
              ) : null}
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
              <div className="q-matches">{round.map((m, i) => renderDuel(-1, r, m, i))}</div>
            </div>
          ))}
        </div>
      </div>

      {qualifier.places?.length ? (
        <div className="q-places">
          <div className="q-places-head mono">за места</div>
          <div className="q-scroll">
            <div className="q-grid q-grid-places">
              {qualifier.places
                .map((group, g) => ({ group, g }))
                .sort((a, b) => a.group.place - b.group.place)
                .map(({ group, g }) => (
                  <div className="q-place-group" key={g}>
                    {group.rounds.map((round, r) => (
                      <div className="q-round" key={r}>
                        <div className="round-title">{placeStage(group, r)}</div>
                        <div className="q-matches">{round.map((m, i) => renderDuel(g, r, m, i))}</div>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        </div>
      ) : null}

      {standings.length ? (
        <div className="q-standings">
          <div className="q-places-head mono">итоговые места</div>
          <ol className="q-standings-list">
            {standings.map(({ pid, place }) => {
              const p = person(Number(pid));
              return (
                <li key={pid} className={`q-standing${place === 1 ? " first" : ""}`}>
                  <span className="q-place mono">{place}</span>
                  <Avatar name={p?.name} color={p?.color} url={p?.avatar} size={24} />
                  <span className="q-name">{p?.name}</span>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {rewards?.length || isAdmin ? (
        <div className="q-buffs">
          <div className="q-places-head mono">
            награды за места
            {isAdmin && onSaveRewards ? (
              <button type="button" className="btn sm q-buffs-edit" onClick={() => setRewardsOpen(true)} disabled={busy}>
                Настроить
              </button>
            ) : null}
          </div>
          {rewards?.length ? (
            <div className="q-buffs-table">
              {rewards.map((cfg) => {
                const s = standings.find((x) => x.place === cfg.place);
                const p = s ? person(Number(s.pid)) : null;
                return (
                  <div className="q-buff" key={`${cfg.place}-${cfg.type}`}>
                    <span className="q-buff-place mono">{cfg.place}</span>
                    <span className="q-buff-text">{rewardText(cfg)}</span>
                    <span className="q-buff-who">
                      {p ? (
                        <span className="q-buff-person">
                          <Avatar name={p.name} color={p.color} url={p.avatar} size={20} />
                          {p.name}
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted q-buffs-empty">Награды за места не заданы.</p>
          )}
        </div>
      ) : null}

      {rewardsOpen ? (
        <RewardsEditor
          initial={rewards?.length ? rewards : REWARDS_HINT}
          busy={busy}
          onClose={() => setRewardsOpen(false)}
          onSave={async (list) => {
            if (await onSaveRewards(list)) setRewardsOpen(false);
          }}
        />
      ) : null}

      {duel ? (
        <DuelModal
          duel={duel}
          a={person(duel.p[0])}
          b={person(duel.p[1])}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            if (await onSetDuel(editing.r, editing.i, payload, editing.g)) setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

// Подпись над матчем, который сейчас на нашем сервере; ведёт в его лобби.
export function ServerTag({ lobby }) {
  const text = { waiting: "грузим карту", ready: "ждём игроков", live: "идёт игра" }[lobby.status] || lobby.status;
  return (
    <Link to={`/lobbies/${lobby.id}`} className={`srv-tag${lobby.status === "live" ? " live" : ""}`}>
      <i className="live-dot" /> на сервере · {text}
    </Link>
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
    <Backdrop onClose={onClose}>
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
    </Backdrop>
  );
}

// Создание дуэлей: кто участвует, на какой карте, в каком порядке.
export function QualifierSetup({ tournament, existing, busy, onClose, onCreate }) {
  const members = tournament.bracket.teams.flatMap((t) => [t.player_a_id, t.player_b_id, ...(t.subs || [])]).filter(Boolean);
  const [users, setUsers] = useState(null);
  const [picked, setPicked] = useState(() => existing?.rounds?.[0]?.flatMap((m) => m.p).filter(Boolean) || [...new Set(members)]);
  const [places, setPlaces] = useState(true);
  const [map, setMap] = useState(existing?.map || "aim_map_s2");
  const [mode, setMode] = useState("random");
  const [note, setNote] = useState(existing?.note || "");

  useEffect(() => {
    api.get("/users").then((res) => setUsers(res.data));
  }, []);

  const toggle = (id) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <Backdrop onClose={onClose}>
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
              <BlockBones rows={3} />
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
          <label className="check-row">
            <input type="checkbox" checked={places} onChange={(e) => setPlaces(e.target.checked)} />
            <span>
              Разыгрывать все места — проигравшие играют за 3-е, 5–8-е и т.д., у каждого своё место
            </span>
          </label>
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
            onClick={() => onCreate({ player_ids: picked, mode, map: map.trim() || "aim_map_s2", note: note.trim(), places })}
          >
            {existing ? "Пересобрать" : "Создать сетку дуэлей"}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// Настройка наград за места: место → тип награды (и сколько карт для выбора стороны).
function RewardsEditor({ initial, busy, onClose, onSave }) {
  const [rows, setRows] = useState(() => initial.map((r) => ({ count: 1, ...r })));
  const set = (k, patch) => setRows((rs) => rs.map((r, n) => (n === k ? { ...r, ...patch } : r)));

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Backdrop onClose={onClose}>
      <div className="veto-modal duel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="veto-modal-head">
          <h3>Награды за места</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="veto-modal-body">
          <div className="hint">
            Награду получает игрок за место в дуэлях, а использует капитан его команды — в окне «Готов» перед
            драфтом.
          </div>
          <div className="rw-editor">
            {rows.map((row, k) => (
              <div className="rw-editor-row" key={k}>
                <label className="field">
                  <span>Место</span>
                  <input
                    type="number"
                    min="1"
                    max="64"
                    value={row.place}
                    onChange={(e) => set(k, { place: Number(e.target.value) || 1 })}
                  />
                </label>
                <label className="field">
                  <span>Награда</span>
                  <select value={row.type} onChange={(e) => set(k, { type: e.target.value })}>
                    {Object.entries(REWARD_TYPES).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                {row.type === "side_choice" ? (
                  <label className="field">
                    <span>Карт</span>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={row.count}
                      onChange={(e) => set(k, { count: Number(e.target.value) || 1 })}
                    />
                  </label>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="btn sm danger rw-editor-del"
                  onClick={() => setRows((rs) => rs.filter((_, n) => n !== k))}
                  aria-label="Убрать"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn sm"
            onClick={() =>
              setRows((rs) => [...rs, { place: (rs[rs.length - 1]?.place || 0) + 1, type: "side_choice", count: 1 }])
            }
          >
            <Icon name="plus" size={13} /> Добавить награду
          </button>
        </div>
        <div className="veto-modal-foot">
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={busy} onClick={() => onSave(rows)}>
            Сохранить
          </button>
        </div>
      </div>
    </Backdrop>
  );
}
