import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import api, { apiErrorMessage } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Avatar from "../components/Avatar.jsx";
import Icon from "../components/Icon.jsx";
import PageHead, { EmptyState } from "../components/PageHead.jsx";
import { ListBones } from "../components/Skeleton.jsx";
import { useToast } from "../components/Toast.jsx";
import { mapImage } from "../utils/maps.js";

// Лобби на нашем CS2-сервере: админ собирает игроков и карту, сервер пускает
// только их, играет и присылает счёт. Смотреть может любой.

const STATUS = {
  waiting: { label: "Грузим карту", cls: "pill-upcoming" },
  ready: { label: "Ждём игроков", cls: "pill-upcoming" },
  live: { label: "Идёт игра", cls: "pill-live" },
  finished: { label: "Сыграно", cls: "pill-finished" },
  cancelled: { label: "Отменено", cls: "pill-finished" },
};

const fmt = (iso) =>
  new Date(iso + "Z").toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Lobbies() {
  const { isAdmin } = useAuth();
  const { toast, toastNode } = useToast();
  const [lobbies, setLobbies] = useState(null);
  const [options, setOptions] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get("/lobbies")
      .then((res) => setLobbies(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  useEffect(() => {
    load();
    api.get("/lobbies/options").then((res) => setOptions(res.data));
    // Статус и счёт меняет сервер — перечитываем, пока страница открыта.
    const t = setInterval(() => !document.hidden && load(), 6000);
    return () => clearInterval(t);
  }, [load]);

  const cancel = async (lobby) => {
    if (!confirm("Отменить лобби? Сервер перестанет его ждать.")) return;
    try {
      await api.post(`/lobbies/${lobby.id}/cancel`);
      toast("Лобби отменено");
      load();
    } catch (err) {
      toast(apiErrorMessage(err));
    }
  };

  const ACTIVE = ["waiting", "ready", "live"];
  const active = (lobbies || []).filter((l) => ACTIVE.includes(l.status));
  const done = (lobbies || []).filter((l) => !ACTIVE.includes(l.status));

  return (
    <main className="page">
      <PageHead
        title="Лобби"
        sub="Игры на нашем сервере: админ собирает состав и карту, мы заходим и играем. Счёт попадает сюда сам."
        art="/img/door.webp"
      >
        {isAdmin ? (
          <button type="button" className="btn primary head-action" onClick={() => setCreating(true)} disabled={!options}>
            <Icon name="plus" size={15} /> Создать лобби
          </button>
        ) : null}
      </PageHead>

      {error ? <div className="error-box">{error}</div> : null}

      {!lobbies ? (
        <ListBones rows={3} />
      ) : (
        <>
          <section className="section">
            <h2 className="section-title">Сейчас</h2>
            {active.length ? (
              <div className="lobby-list">
                {active.map((l, i) => (
                  <LobbyCard key={l.id} lobby={l} first={i === 0} isAdmin={isAdmin} onCancel={cancel} toast={toast} />
                ))}
              </div>
            ) : (
              <EmptyState
                art="/img/door.webp"
                title="Лобби нет"
                text={isAdmin ? "Создай лобби — игроки увидят адрес сервера." : "Когда админ создаст лобби, оно появится здесь."}
              />
            )}
          </section>

          {done.length ? (
            <section className="section">
              <h2 className="section-title">Прошедшие</h2>
              <div className="lobby-list compact">
                {done.map((l) => (
                  <LobbyCard key={l.id} lobby={l} compact />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      {creating && options ? (
        <CreateLobby
          options={options}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            toast("Лобби создано");
            load();
          }}
        />
      ) : null}
      {toastNode}
    </main>
  );
}

function Team({ players, team, score, win }) {
  const list = players.filter((p) => p.team === team);
  return (
    <div className={`lb-team${win ? " win" : ""}`}>
      <span className="lb-team-title mono">
        Команда {team}
        {score != null ? <b>{score}</b> : null}
      </span>
      {list.map((p) => (
        <span key={p.user_id} className="lb-player">
          <Avatar name={p.name} color={p.avatar_color} url={p.avatar_url} size={26} />
          {p.name}
        </span>
      ))}
    </div>
  );
}

function LobbyCard({ lobby, first, compact, isAdmin, onCancel, toast }) {
  const st = STATUS[lobby.status];
  const cover = mapImage(lobby.map);
  const isActive = ["waiting", "ready", "live"].includes(lobby.status);
  const connect = lobby.server_address ? `connect ${lobby.server_address}` : "";
  const [s1, s2] = lobby.score || [null, null];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(connect);
      toast("Скопировано — вставь в консоль CS2 (~)");
    } catch {
      toast(connect);
    }
  };

  return (
    <article className={`lobby${compact ? " compact" : ""}${lobby.status === "live" ? " live" : ""}`}>
      <div className="lobby-main">
        <div className="lobby-head">
          <span className={`pill ${st.cls}`}>
            {lobby.status === "live" ? <i className="live-dot" /> : null}
            {st.label}
          </span>
          <Link to={`/lobbies/${lobby.id}`} className="lobby-mode">{modeName(lobby.mode)}</Link>
          <span className="lobby-map mono">
            {cover ? <img src={cover} alt="" onError={(e) => (e.currentTarget.style.display = "none")} /> : null}
            {lobby.map}
          </span>
          <span className="lobby-when mono">{fmt(lobby.finished_at || lobby.started_at || lobby.created_at)}</span>
        </div>

        <div className="lobby-teams">
          <Team players={lobby.players} team={1} score={s1} win={lobby.winner === 1} />
          <span className="lb-vs mono">vs</span>
          <Team players={lobby.players} team={2} score={s2} win={lobby.winner === 2} />
        </div>
      </div>

      {isActive && !compact ? (
        <div className="lobby-foot">
          {first && connect && lobby.status !== "waiting" ? (
            <button type="button" className="lb-connect" onClick={copy} title="Скопировать">
              <code>{connect}</code>
              <Icon name="download" size={14} />
            </button>
          ) : null}
          <span className="hint">
            {first
              ? lobby.status === "waiting"
                ? "Сервер грузит карту — адрес появится, когда всё будет готово (не заходи раньше, выкинет)."
                : "Заходи на сервер."
              : "В очереди: сервер сыграет это лобби после предыдущего."}
          </span>
          {isAdmin ? (
            <button type="button" className="btn sm danger lb-cancel" onClick={() => onCancel(lobby)}>
              Отменить
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

const MODE_NAMES = { duel: "Дуэль 1×1", wingman: "Wingman 2×2", free: "Свободная игра" };
const modeName = (m) => MODE_NAMES[m] || m;

function CreateLobby({ options, onClose, onCreated }) {
  const [modeId, setModeId] = useState("duel");
  const mode = options.modes.find((m) => m.id === modeId);
  const [map, setMap] = useState(mode.maps[0]);
  const [address, setAddress] = useState(options.server_address || "");
  const [team, setTeam] = useState({}); // user_id → 1 | 2
  const [adding, setAdding] = useState(0); // в какой команде открыт список игроков
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pickMode = (id) => {
    const m = options.modes.find((x) => x.id === id);
    setModeId(id);
    setMap(m.maps[0]);
    setTeam({});
  };

  const per = mode.per_team;
  const members = (t) => options.players.filter((u) => team[u.id] === t);
  const pool = options.players.filter((u) => !team[u.id]);
  const valid = per != null ? members(1).length === per && members(2).length === per : members(1).length >= 1 && members(2).length >= 1;

  const add = (u, t) => {
    setTeam((prev) => ({ ...prev, [u.id]: t }));
    setAdding(0);
  };
  const remove = (id) => setTeam((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  });

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post("/lobbies", {
        mode: modeId,
        map,
        server_address: address,
        players: Object.entries(team).map(([id, t]) => ({ user_id: Number(id), team: t })),
      });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="veto-backdrop" onClick={onClose}>
      <div className="veto-modal lobby-modal" onClick={(e) => e.stopPropagation()}>
        <div className="veto-modal-head">
          <h3>Новое лобби</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="veto-modal-body lm-body">
          <div className="lm-modes">
            {options.modes.map((m) => (
              <button key={m.id} type="button" className={`lm-mode${m.id === modeId ? " active" : ""}`} onClick={() => pickMode(m.id)}>
                <b>{m.name}</b>
                <span>{m.hint}</span>
              </button>
            ))}
          </div>

          {mode.maps.length > 1 ? (
            <div className="lm-block">
              <span className="lm-label mono">Карта</span>
              <div className="lm-maps">
                {mode.maps.map((m) => {
                  const img = mapImage(m);
                  return (
                    <button key={m} type="button" className={`lm-map${m === map ? " active" : ""}`} onClick={() => setMap(m)}>
                      {img ? <img src={img} alt="" loading="lazy" /> : null}
                      <span>{m}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="lm-block">
            <span className="lm-label mono">Составы{per != null ? ` · по ${per} в команде` : ""}</span>
            <div className="lm-teams2">
              {[1, 2].map((t) => {
                const room = per == null || members(t).length < per;
                return (
                  <div key={t} className="lm-team">
                    <b>Команда {t}</b>
                    {members(t).map((u) => (
                      <span key={u.id} className="lm-chip placed">
                        <Avatar name={u.name} color={u.avatar_color} url={u.avatar_url} size={22} />
                        {u.name}
                        <button type="button" title="Убрать" onClick={() => remove(u.id)}>×</button>
                      </span>
                    ))}
                    {room ? (
                      <button type="button" className={`lm-add${adding === t ? " open" : ""}`} onClick={() => setAdding(adding === t ? 0 : t)}>
                        <Icon name="plus" size={14} /> Добавить игрока
                      </button>
                    ) : null}
                    {adding === t ? (
                      <div className="lm-pool">
                        {pool.map((u) => (
                          <button key={u.id} type="button" className="lm-chip" disabled={!u.steam_linked} title={u.steam_linked ? "" : "К аккаунту не привязан Steam"} onClick={() => add(u, t)}>
                            <Avatar name={u.name} color={u.avatar_color} url={u.avatar_url} size={22} />
                            {u.name}
                            {!u.steam_linked ? <small>нет Steam</small> : null}
                          </button>
                        ))}
                        {!pool.length ? <span className="lm-empty">все выбраны</span> : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <label className="lm-block">
            <span className="lm-label mono">Адрес сервера</span>
            <input type="text" value={address} placeholder="ast.altyn.games:55292" onChange={(e) => setAddress(e.target.value)} />
          </label>

          {error ? <div className="error-box">{error}</div> : null}
        </div>

        <div className="veto-modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn primary" disabled={!valid || busy} onClick={submit}>
            <Icon name="check" size={14} /> {busy ? "Создаём…" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}
