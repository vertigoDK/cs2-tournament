import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import Icon from "../components/Icon.jsx";
import Avatar from "../components/Avatar.jsx";
import MediaTheater from "../components/MediaTheater.jsx";
import { mapImage } from "../utils/maps.js";
import { mapMedia, playedMaps, roundName } from "../utils/mediaDemo.js";

// «Записи» турнира: повки игроков, нарезки и демки по каждой сыгранной карте.
// Пока это демо-режим — ролики-заглушки, см. utils/mediaDemo.js.
export default function TournamentMedia() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [error, setError] = useState("");
  const [sel, setSel] = useState(null);
  const [seek, setSeek] = useState(null);

  useEffect(() => {
    api
      .get(`/tournaments/${id}`)
      .then((res) => setT(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [id]);

  const list = useMemo(() => (t ? playedMaps(t.bracket) : []), [t]);
  const all = useMemo(() => (t ? list.map(({ r, i, k }) => mapMedia(t.bracket, r, i, k)) : []), [t, list]);

  useEffect(() => {
    if (!sel && all.length) setSel(all[0].key);
  }, [all, sel]);

  if (error) {
    return (
      <main className="page">
        <div className="error-box">{error}</div>
      </main>
    );
  }
  if (!t) return <main className="page" />;

  const media = all.find((m) => m.key === sel) || all[0];
  const top = all
    .flatMap((m) => m.highlights.map((h) => ({ ...h, media: m })))
    .sort((a, b) => (b.player.line?.k || 0) - (a.player.line?.k || 0))
    .slice(0, 6);

  const open = (m, h) => {
    setSel(m.key);
    setSeek(h ? { player: h.player.id, at: h.at - 0.02, n: Date.now() } : null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Карты, сгруппированные по матчам, — для списка внизу.
  const matches = [];
  all.forEach((m) => {
    const key = `${m.r}-${m.i}`;
    let g = matches.find((x) => x.key === key);
    if (!g) matches.push((g = { key, r: m.r, i: m.i, teamA: m.teamA, teamB: m.teamB, maps: [] }));
    g.maps.push(m);
  });

  return (
    <main className="page media-page">
      <Link to={`/tournaments/${id}`} className="back">
        <Icon name="arrowLeft" size={16} /> {t.name}
      </Link>

      <div className="media-head">
        <h1>Записи</h1>
        <span className="demo-badge mono">демо-режим</span>
      </div>
      <p className="lead">
        Повки игроков, нарезки и демки по каждой карте. Сейчас вместо настоящих повок — ролики-заглушки:
        так будет выглядеть страница, когда видео начнут загружать.
      </p>

      {!media ? (
        <div className="empty-media">
          <Icon name="film" size={28} />
          <p>В турнире ещё нет сыгранных карт — записывать пока нечего.</p>
        </div>
      ) : (
        <>
          <div className="media-now">
            <span className="mono muted">
              {roundName(media.r, t.bracket.rounds.length)} · карта {media.mapIndex + 1} ·
            </span>
            <b>{media.map}</b>
          </div>
          <MediaTheater media={media} seek={seek} />

          {top.length ? (
            <section className="section">
              <h2 className="section-title">Лучшие моменты турнира</h2>
              <div className="top-clips">
                {top.map((h) => (
                  <button key={h.id} className="top-clip" onClick={() => open(h.media, h)}>
                    <span className="tc-art">
                      <img src={mapImage(h.media.map)} alt="" loading="lazy" />
                      <span className="tc-tag mono">{h.short}</span>
                      <span className="tc-play">
                        <Icon name="play" size={16} filled />
                      </span>
                    </span>
                    <span className="tc-body">
                      <span className="tc-who">
                        <Avatar name={h.player.name} color={h.player.color} url={h.player.url} size={22} />
                        <b>{h.player.name}</b>
                      </span>
                      <span className="tc-what">{h.label}</span>
                      <span className="tc-where mono">
                        {h.media.map} · раунд {h.round + 1}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="section">
            <h2 className="section-title">Все карты</h2>
            <div className="media-matches">
              {matches.map((g) => (
                <div key={g.key} className="media-match">
                  <div className="mm-head">
                    <span className="mono muted">{roundName(g.r, t.bracket.rounds.length)}</span>
                    <b>
                      {g.teamA?.name} <span className="muted">vs</span> {g.teamB?.name}
                    </b>
                  </div>
                  <div className="mm-maps">
                    {g.maps
                      .slice()
                      .sort((a, b) => a.mapIndex - b.mapIndex)
                      .map((m) => (
                        <button
                          key={m.key}
                          className={`mm-map${m.key === media.key ? " active" : ""}`}
                          onClick={() => open(m)}
                        >
                          <span className="mm-art">
                            <img src={mapImage(m.map)} alt="" loading="lazy" />
                            <span className="mm-score mono">
                              {m.score[0]}:{m.score[1]}
                            </span>
                            {m.key === media.key ? <span className="mm-now mono">смотрите</span> : null}
                          </span>
                          <span className="mm-name">{m.map}</span>
                          <span className="mm-meta mono">
                            {m.players.length} повки · {m.highlights.length} нарезки{m.demo ? " · демка" : ""}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
