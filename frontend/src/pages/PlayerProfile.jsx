import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import Avatar from "../components/Avatar.jsx";
import Icon from "../components/Icon.jsx";
import Radar, { AXES } from "../components/Radar.jsx";
import { Bone, SkeletonPage } from "../components/Skeleton.jsx";
import { mapImage } from "../utils/maps.js";
import { formatDay } from "../utils/time.js";
import { topAxis } from "./Players.jsx";

const fmt = (n) => Math.round(n).toLocaleString("ru-RU");
const ratio = (a, b) => (b ? a / b : a).toFixed(2);
const pct = (w, l) => (w + l ? `${Math.round((100 * w) / (w + l))}%` : "—");

// Валюту призовых берём из самих турниров («20 000 ₸» → «₸»).
const currencyOf = (history) =>
  history.map((h) => (h.prize_pool || "").replace(/[\d\s., ]/g, "").trim()).find(Boolean) || "";

const PLACE_TEXT = { Финал: "финалист", "В игре": "участвует", Участник: "участник" };

export default function PlayerProfile() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [all, setAll] = useState([]);
  const [compareId, setCompareId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setP(null);
    setCompareId("");
    api
      .get(`/players/${id}`)
      .then((res) => setP(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [id]);

  // Список — только ради сравнения: оси соперника берём из него.
  useEffect(() => {
    api.get("/players").then((res) => setAll(res.data));
  }, []);

  if (error) {
    return (
      <main className="page">
        <div className="error-box">{error}</div>
      </main>
    );
  }
  if (!p) return <ProfileSkeleton />;

  const rated = all.filter((x) => x.axes);
  const place = rated.findIndex((x) => x.id === p.id) + 1;
  const other = rated.find((x) => String(x.id) === compareId);
  const strong = topAxis(p.axes);
  const currency = currencyOf(p.history);

  const lines = [
    { label: "рейтинг", value: p.maps ? p.rating.toFixed(2) : "—", hot: p.rating >= 1.1 },
    { label: "лучшая карта (рейтинг)", value: p.best_map_rating != null ? p.best_map_rating.toFixed(2) : "—" },
    { label: "K/D", value: p.maps ? ratio(p.kills, p.deaths) : "—" },
    { label: "убийств за раунд", value: p.rounds ? (p.kills / p.rounds).toFixed(2) : "—" },
    null,
    { label: "убийств", value: fmt(p.kills) },
    { label: "смертей", value: fmt(p.deaths) },
    { label: "ассистов", value: fmt(p.assists) },
    { label: "раундов", value: fmt(p.rounds) },
    null,
    { label: "карт сыграно", value: p.maps },
    { label: "карт выиграно", value: `${p.map_wins}–${p.map_losses} · ${pct(p.map_wins, p.map_losses)}` },
    { label: "дуэли 1×1", value: p.duel_wins + p.duel_losses ? `${p.duel_wins}–${p.duel_losses}` : "—" },
    null,
    { label: "турниров", value: p.tournaments },
    { label: "титулов", value: p.titles, hot: p.titles > 0 },
    { label: "призовые", value: p.prize ? `${fmt(p.prize)} ${currency}`.trim() : "—", hot: p.prize > 0 },
  ];

  return (
    <main className="page">
      <Link to="/players" className="back">
        <Icon name="arrowLeft" size={16} /> Все игроки
      </Link>

      <section className="profile-hero">
        <Avatar name={p.display_name} color={p.avatar_color} url={p.avatar_url} size={104} />
        <div className="ph-main">
          <h1>{p.display_name}</h1>
          <p className="ph-sub">
            {strong ? (
              <>
                Сильная сторона — <b>{strong.label.toLowerCase()}</b>: {strong.hint}.
              </>
            ) : (
              "Ещё не сыграл ни одной карты с внесённой статистикой."
            )}
          </p>
          {p.titles ? (
            <div className="ph-titles">
              {Array.from({ length: p.titles }, (_, i) => (
                <img key={i} src="/img/trophy-tight.webp" alt="" title="Титул" />
              ))}
              <span className="mono">
                {p.titles} {p.titles === 1 ? "титул" : p.titles < 5 ? "титула" : "титулов"}
              </span>
            </div>
          ) : null}
        </div>
        <div className="ph-score">
          <span className="mono">общий балл</span>
          <b>{p.score != null ? p.score.toFixed(1) : "—"}</b>
          {place ? (
            <span className="mono ph-place">
              #{place} из {rated.length}
            </span>
          ) : null}
        </div>
      </section>

      <div className="profile-grid">
        <section className="panel radar-panel">
          <div className="rp-head">
            <h2 className="section-title">Стиль игры</h2>
            {rated.length > 1 && p.axes ? (
              <label className="rp-compare">
                <span className="mono">сравнить с</span>
                <select value={compareId} onChange={(e) => setCompareId(e.target.value)}>
                  <option value="">—</option>
                  {rated
                    .filter((x) => x.id !== p.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.display_name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
          </div>
          <div className="rp-chart">
            <Radar values={p.axes} compare={other?.axes} size={420} />
          </div>
          {other ? (
            <div className="rp-legend mono">
              <span className="me">{p.display_name}</span>
              <span className="them">{other.display_name}</span>
            </div>
          ) : null}
          <ul className="rp-axes">
            {AXES.map((a) => (
              <li key={a.key}>
                <b>{a.label}</b> — {a.hint}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel alltime">
          <h2 className="section-title">За всё время</h2>
          <dl>
            {lines.map((l, i) =>
              l ? (
                <div key={l.label} className="at-row">
                  <dd className={`mono${l.hot ? " hot" : ""}`}>{l.value}</dd>
                  <dt>{l.label}</dt>
                </div>
              ) : (
                <hr key={`sep-${i}`} />
              )
            )}
          </dl>
        </section>
      </div>

      {p.maps_breakdown.length ? (
        <section className="section">
          <h2 className="section-title">По картам</h2>
          <div className="map-lines">
            {p.maps_breakdown.map((m, i) => (
              <div key={m.map} className="map-line" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="ml-cover">
                  {mapImage(m.map) ? <img src={mapImage(m.map)} alt="" loading="lazy" /> : null}
                  <span>{m.map}</span>
                </div>
                <div className="ml-stat">
                  <b className={`mono ${m.rating >= 1.15 ? "hot" : m.rating < 0.85 ? "cold" : ""}`}>
                    {m.rating.toFixed(2)}
                  </b>
                  <span className="mono">рейтинг</span>
                </div>
                <div className="ml-stat">
                  <b className="mono">
                    {m.wins}–{m.losses}
                  </b>
                  <span className="mono">{pct(m.wins, m.losses)} побед</span>
                </div>
                <div className="ml-stat">
                  <b className="mono">{ratio(m.kills, m.deaths)}</b>
                  <span className="mono">
                    K/D · {m.kills}/{m.deaths}/{m.assists}
                  </span>
                </div>
                <div className="ml-bar" title="Рейтинг: шкала до 2.00">
                  <i style={{ width: `${Math.min(100, (m.rating / 2) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {p.history.length ? (
        <section className="section">
          <h2 className="section-title">Турниры</h2>
          <div className="panel p-history">
            {p.history.map((h) => (
              <Link key={h.id} to={`/tournaments/${h.id}`} className="hl-row">
                <span className="hl-date mono">{formatDay(h.date)}</span>
                <span className="hl-name">
                  <b>{h.name}</b>
                  <span>{h.team}</span>
                </span>
                <span className="hl-prize mono">{h.prize_pool}</span>
                <span className={`hl-place${h.champion ? " champ" : ""}`}>
                  {h.champion ? <img src="/img/trophy-tight.webp" alt="" /> : null}
                  {h.champion ? "чемпион" : (PLACE_TEXT[h.place] || h.place).toLowerCase()}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ProfileSkeleton() {
  return (
    <SkeletonPage>
      <Bone w={110} h={14} style={{ marginBottom: 22 }} />
      <section className="profile-hero">
        <Bone w={104} h={104} r={26} />
        <div className="ph-main">
          <Bone w="min(280px, 70%)" h={46} r={12} />
          <Bone w="min(420px, 90%)" h={14} style={{ marginTop: 16 }} />
        </div>
        <Bone w={90} h={70} r={12} />
      </section>
      <div className="profile-grid">
        <div className="panel radar-panel">
          <Bone w={300} h={300} r={150} style={{ margin: "40px auto" }} />
        </div>
        <div className="panel alltime">
          {Array.from({ length: 10 }, (_, i) => (
            <Bone key={i} w={`${80 - (i % 3) * 15}%`} h={16} style={{ marginBottom: 16 }} />
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
