import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import Avatar from "../components/Avatar.jsx";
import Icon from "../components/Icon.jsx";
import { BlockBones } from "../components/Skeleton.jsx";
import { mapImage } from "../utils/maps.js";

// Страница одного лобби: счёт сверху, две колонки команд с K/D/A и справа
// от них сведения об игре. Лобби — отдельная игра, в общую статистику она не идёт.

const MODE = { duel: "Дуэль 1×1", wingman: "Wingman 2×2", free: "Свободная игра" };
const STATUS = { waiting: "Грузим карту", ready: "Ждём игроков", live: "Идёт игра", finished: "Матч завершён", cancelled: "Отменено" };

const when = (iso) =>
  iso ? new Date(iso + "Z").toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "—";

export default function LobbyView() {
  const { id } = useParams();
  const [lobby, setLobby] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get(`/lobbies/${id}`)
      .then((res) => setLobby(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(() => !document.hidden && load(), 6000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <main className="page"><div className="error-box">{error}</div></main>;
  if (!lobby) return <main className="page"><BlockBones rows={4} /></main>;

  const cover = mapImage(lobby.map);
  const [s1, s2] = lobby.score || [null, null];
  const hasStats = lobby.players.some((p) => p.kills != null);
  // Лучший в лобби — по убийствам, при равенстве — у кого меньше смертей.
  const best = hasStats
    ? [...lobby.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0]?.user_id
    : null;

  return (
    <main className="page">
      <Link to="/lobbies" className="back">
        <Icon name="arrowLeft" size={16} /> Все лобби
      </Link>

      <section className="lv-banner" style={cover ? { "--cover": `url(${cover})` } : undefined}>
        <span className="lv-status mono">{STATUS[lobby.status]}</span>
        <div className="lv-score">
          <b className={lobby.winner === 1 ? "win" : ""}>{s1 ?? "–"}</b>
          <span>:</span>
          <b className={lobby.winner === 2 ? "win" : ""}>{s2 ?? "–"}</b>
        </div>
      </section>

      <section className="lv-grid">
        {[1, 2].map((t) => (
          <div key={t} className={`lv-team${lobby.winner === t ? " win" : ""}`}>
            <header>
              <b>Команда {t}</b>
              {lobby.winner === t ? <Icon name="trophy" size={16} /> : null}
              <span className="mono">K / D / A</span>
            </header>
            {lobby.players
              .filter((p) => p.team === t)
              .map((p) => (
                <Link key={p.user_id} to={`/players/${p.user_id}`} className="lv-row">
                  <span className="lv-who">
                    <Avatar name={p.name} color={p.avatar_color} url={p.avatar_url} size={34} />
                    {p.name}
                    {p.user_id === best ? <Icon name="star" size={14} className="lv-mvp" /> : null}
                  </span>
                  <span className="mono lv-kda">{p.kills != null ? `${p.kills}/${p.deaths}/${p.assists}` : "—"}</span>
                </Link>
              ))}
          </div>
        ))}

        <aside className="lv-info">
          <dl>
            <div><dt>Режим</dt><dd>{MODE[lobby.mode] || lobby.mode}</dd></div>
            <div><dt>Карта</dt><dd>{lobby.map}</dd></div>
            <div><dt>Сервер</dt><dd className="mono">{lobby.server_address || "—"}</dd></div>
            <div><dt>Создал</dt><dd>{lobby.created_by || "—"}</dd></div>
            <div><dt>Начало</dt><dd>{when(lobby.started_at || lobby.created_at)}</dd></div>
            {lobby.finished_at ? <div><dt>Конец</dt><dd>{when(lobby.finished_at)}</dd></div> : null}
          </dl>
          <p className="hint">Это отдельная игра: в статистику, рейтинг и историю турниров она не идёт.</p>
        </aside>
      </section>
    </main>
  );
}
