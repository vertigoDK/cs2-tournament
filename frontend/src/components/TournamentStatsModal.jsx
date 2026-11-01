import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "../api.js";
import Icon from "./Icon.jsx";
import { EmptyStats, MapsGrid, PlayersTable } from "./StatsTables.jsx";
import { BlockBones } from "./Skeleton.jsx";

// Те же таблицы, что и на странице «Статистика», но по одному турниру:
// бэкенд считает сводку тем же проходом, отличается только фильтр.
const TABS = [
  { id: "players", label: "Игроки", icon: "medal" },
  { id: "maps", label: "Карты", icon: "map" },
];

export default function TournamentStatsModal({ open, onClose, tournamentId, tournamentName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("players");

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError("");
    setTab("players");
    api
      .get("/stats", { params: { tournament_id: tournamentId } })
      .then((res) => setData(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [open, tournamentId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasStats = Boolean(data?.players.some((p) => p.maps > 0));

  return (
    <div className="veto-backdrop" onClick={onClose}>
      <div className="veto-modal tstats-modal" onClick={(e) => e.stopPropagation()}>
        <div className="veto-modal-head">
          <h3>Статистика турнира</h3>
          <span className="tstats-name">{tournamentName}</span>
        </div>

        <div className="veto-modal-body">
          {error ? <div className="error-box">{error}</div> : null}
          {!data && !error ? <BlockBones rows={5} /> : null}

          {data ? (
            <>
              <div className="tabs">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`tab${tab === t.id ? " active" : ""}`}
                    onClick={() => setTab(t.id)}
                  >
                    <Icon name={t.icon} size={15} />
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === "players" &&
                (!hasStats ? (
                  <EmptyStats text="Админ ещё не вносил результаты карт этого турнира." />
                ) : (
                  <PlayersTable players={data.players} showTitles={false} />
                ))}

              {tab === "maps" &&
                (data.maps.length === 0 ? (
                  <EmptyStats text="В этом турнире ещё не было драфта." />
                ) : (
                  <MapsGrid maps={data.maps} />
                ))}
            </>
          ) : null}
        </div>

        <div className="veto-modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
