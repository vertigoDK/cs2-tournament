import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  waiting: { label: "Ждём игроков", cls: "pill-upcoming" },
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

  const active = (lobbies || []).filter((l) => l.status === "waiting" || l.status === "live");
  const done = (lobbies || []).filter((l) => l.status !== "waiting" && l.status !== "live");

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
  const isActive = lobby.status === "waiting" || lobby.status === "live";
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
          {first && connect ? (
            <button type="button" className="lb-connect" onClick={copy} title="Скопировать">
              <code>{connect}</code>
              <Icon name="download" size={14} />
            </button>
          ) : null}
          <span className="hint">
            {first
              ? "Заходи на сервер: пускаем только игроков из списка."
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

  const count = (t) => Object.values(team).filter((v) => v === t).length;
  const per = mode.per_team;
  const valid =
    per != null ? count(1) === per && count(2) === per : count(1) >= 1 && count(2) >= 1;

  const toggle = (id, t) => setTeam((prev) => {
    const next = { ...prev };
    if (next[id] === t) delete next[id];
    else next[id] = t;
    return next;
  });

  const sorted = useMemo(
    () => [...options.players].sort((a, b) => Number(b.steam_linked) - Number(a.steam_linked)),
    [options.players],
  );

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
          <div className="lm-block">
            <span className="lm-label mono">Режим</span>
            <div className="lm-chips">
              {options.modes.map((m) => (
                <button key={m.id} type="button" className={`chip${m.id === modeId ? " active" : ""}`} onClick={() => pickMode(m.id)}>
                  {m.name}
                </button>
              ))}
            </div>
            <span className="hint">{mode.hint}</span>
          </div>

          {mode.maps.length > 1 ? (
            <div className="lm-block">
              <span className="lm-label mono">Карта</span>
              <div className="lm-chips">
                {mode.maps.map((m) => (
                  <button key={m} type="button" className={`chip${m === map ? " active" : ""}`} onClick={() => setMap(m)}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="lm-block">
            <span className="lm-label mono">
              Игроки · команда 1: {count(1)}{per != null ? `/${per}` : ""} · команда 2: {count(2)}{per != null ? `/${per}` : ""}
            </span>
            {(
              <ul className="lm-players">
                {sorted.map((u) => (
                  <li key={u.id} className={u.steam_linked ? "" : "off"}>
                    <Avatar name={u.name} color={u.avatar_color} url={u.avatar_url} size={28} />
                    <b>{u.name}</b>
                    {u.steam_linked ? (
                      <span className="lm-teams">
                        {[1, 2].map((t) => (
                          <button key={t} type="button" className={`chip${team[u.id] === t ? " active" : ""}`} onClick={() => toggle(u.id, t)}>
                            К{t}
                          </button>
                        ))}
                      </span>
                    ) : (
                      <span className="hint">нет Steam ID</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
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
