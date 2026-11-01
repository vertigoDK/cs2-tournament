import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import Avatar from "../components/Avatar.jsx";
import PageHead, { EmptyState } from "../components/PageHead.jsx";
import Radar, { AXES } from "../components/Radar.jsx";
import { Bone, SkeletonPage } from "../components/Skeleton.jsx";

const kd = (p) => (p.deaths ? p.kills / p.deaths : p.kills).toFixed(2);

// Сильная сторона игрока — ось с наибольшим баллом.
export function topAxis(axes) {
  if (!axes) return null;
  return AXES.reduce((best, a) => (!best || axes[a.key] > axes[best.key] ? a : best), null);
}

export default function Players() {
  const [players, setPlayers] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/players")
      .then((res) => setPlayers(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  if (error) {
    return (
      <main className="page">
        <div className="error-box">{error}</div>
      </main>
    );
  }
  if (!players) return <PlayersSkeleton />;

  const rated = players.filter((p) => p.axes);
  const rest = players.filter((p) => !p.axes);

  return (
    <main className="page">
      <PageHead
        title="Игроки"
        sub="Стиль игры каждого: пять осей, по 10 баллов. Баллы — относительно остальных игроков компании: 10 у лучшего, 1 у худшего."
        art="/img/teams.webp"
      />

      {!players.length ? (
        <EmptyState art="/img/teams.webp" title="Игроков пока нет" text="Они появятся, когда админ добавит участников." />
      ) : (
        <div className="player-grid">
          {rated.map((p, i) => (
            <PlayerCard key={p.id} p={p} place={i + 1} index={i} />
          ))}
          {rest.map((p, i) => (
            <PlayerCard key={p.id} p={p} index={rated.length + i} />
          ))}
        </div>
      )}
    </main>
  );
}

function PlayerCard({ p, place, index }) {
  const strong = topAxis(p.axes);
  return (
    <Link
      to={`/players/${p.id}`}
      className={`player-card${p.axes ? "" : " idle"}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="pc-head">
        <Avatar name={p.display_name} color={p.avatar_color} url={p.avatar_url} size={46} />
        <div className="pc-name">
          <b>{p.display_name}</b>
          <span className="mono">
            {strong ? (
              <>
                сильная сторона · <i>{strong.label.toLowerCase()}</i>
              </>
            ) : (
              "ещё не играл"
            )}
          </span>
        </div>
        {place ? <span className="pc-place mono">#{place}</span> : null}
      </div>

      <div className="pc-body">
        <Radar values={p.axes} size={150} labels={false} />
        <div className="pc-score">
          <span className="mono">общий балл</span>
          <b>{p.score != null ? p.score.toFixed(1) : "—"}</b>
        </div>
      </div>

      <dl className="pc-facts mono">
        <div>
          <dt>рейтинг</dt>
          <dd className={p.rating >= 1.1 ? "accent" : ""}>{p.maps ? p.rating.toFixed(2) : "—"}</dd>
        </div>
        <div>
          <dt>K/D</dt>
          <dd>{p.maps ? kd(p) : "—"}</dd>
        </div>
        <div>
          <dt>карт</dt>
          <dd>{p.maps}</dd>
        </div>
        <div>
          <dt>титулов</dt>
          <dd>{p.titles}</dd>
        </div>
      </dl>
    </Link>
  );
}

function PlayersSkeleton() {
  return (
    <SkeletonPage>
      <section className="page-head with-art">
        <div>
          <Bone w="min(260px, 60%)" h={50} r={12} />
          <Bone w="min(500px, 90%)" h={16} style={{ marginTop: 20 }} />
          <Bone w="min(380px, 70%)" h={16} style={{ marginTop: 10 }} />
        </div>
        <Bone className="page-head-art" h={200} r={24} style={{ width: "100%" }} />
      </section>
      <div className="player-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="player-card sk" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="pc-head">
              <Bone w={46} h={46} r={13} />
              <div className="pc-name">
                <Bone w={110} h={18} r={6} />
                <Bone w={150} h={10} style={{ marginTop: 8 }} />
              </div>
            </div>
            <div className="pc-body">
              <Bone w={150} h={150} r={75} />
              <Bone w={70} h={44} r={10} />
            </div>
            <Bone w="100%" h={34} r={10} />
          </div>
        ))}
      </div>
    </SkeletonPage>
  );
}
