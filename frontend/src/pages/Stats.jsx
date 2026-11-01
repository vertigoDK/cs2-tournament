import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "../api.js";
import Icon from "../components/Icon.jsx";
import { EmptyStats, MapsGrid, PlayersTable } from "../components/StatsTables.jsx";
import PageHead from "../components/PageHead.jsx";
import { StatsSkeleton } from "../components/Skeleton.jsx";

const TABS = [
  { id: "players", label: "Игроки", icon: "medal" },
  { id: "maps", label: "Карты", icon: "map" },
];


export default function Stats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("players");

  useEffect(() => {
    api
      .get("/stats")
      .then((res) => setData(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  if (error) {
    return (
      <main className="page">
        <div className="error-box">{error}</div>
      </main>
    );
  }
  if (!data) {
    return <StatsSkeleton />;
  }

  const hasStats = data.players.some((p) => p.maps > 0);

  return (
    <main className="page">
      <PageHead
        title="Статистика"
        sub="Показатели игроков и карт по всем турнирам. Нажмите на показатель, чтобы пересортировать, или выберите карту."
        art="/img/stats.webp"
      />

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

      {tab === "players" && (!hasStats ? <EmptyStats /> : <PlayersTable
            players={data.players}
            podium
            mapOptions={data.maps.filter((m) => m.played > 0).map((m) => m.map)}
          />)}

      {tab === "maps" &&
        (data.maps.length === 0 ? (
          <EmptyStats text="Ни одного драфта ещё не было." />
        ) : (
          <MapsGrid maps={data.maps} />
        ))}

    </main>
  );
}
