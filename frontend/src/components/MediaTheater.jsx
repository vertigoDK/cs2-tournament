import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import Icon from "./Icon.jsx";
import { fmtTime } from "../utils/mediaDemo.js";
import { mapImage } from "../utils/maps.js";

const SPEEDS = [1, 1.5, 2, 0.5];

// Кинотеатр одной карты: повка выбранного игрока со своим плеером, таймлайн
// по раундам с отметками нарезок и режим 2×2 — все четыре повки сразу,
// синхронно. Переключение игрока сохраняет момент: смотришь тот же раунд
// глазами другого.
export default function MediaTheater({ media, seek }) {
  const { players, rounds, highlights, teamA, teamB, score } = media;
  const [pov, setPov] = useState(0);
  const [grid, setGrid] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [hover, setHover] = useState(null);
  const frame = useRef(null);
  const videos = useRef([]);
  const resumeAt = useRef(null);

  const main = () => videos.current[pov];

  // Новая карта — с начала, с первого игрока.
  useEffect(() => {
    setPov(0);
    setTime(0);
    setPlaying(false);
    resumeAt.current = null;
  }, [media.key]);

  // Внешний переход к нарезке (из списка ниже страницы).
  useEffect(() => {
    if (!seek) return;
    jumpTo(seek.player, seek.at, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seek]);

  // В режиме 2×2 остальные ролики подтягиваются к главному.
  useEffect(() => {
    if (!grid) return;
    const id = setInterval(() => {
      const m = main();
      if (!m) return;
      videos.current.forEach((v, n) => {
        if (!v || n === pov) return;
        if (Math.abs(v.currentTime - m.currentTime) > 0.25) v.currentTime = m.currentTime;
        if (m.paused !== v.paused) (m.paused ? v.pause() : v.play().catch(() => {}));
      });
    }, 500);
    return () => clearInterval(id);
  }, [grid, pov]);

  useEffect(() => {
    videos.current.forEach((v) => v && (v.playbackRate = speed));
  }, [speed, pov, grid]);

  const togglePlay = () => {
    const m = main();
    if (!m) return;
    if (m.paused) m.play().catch(() => {});
    else m.pause();
  };

  const jumpTo = (playerId, frac, autoplay) => {
    const n = players.findIndex((p) => p.id === playerId);
    const target = n >= 0 ? n : pov;
    const v = videos.current[target];
    const ready = target === pov && v && v.readyState >= 1 && v.src.endsWith(players[target].src);
    if (ready) {
      v.currentTime = Math.max(0, frac) * v.duration;
      if (autoplay) v.play().catch(() => {});
    } else {
      // Ролик ещё грузится (другой игрок или другая карта) — применим, когда загрузится.
      resumeAt.current = { frac: Math.max(0, frac), play: autoplay };
      setPov(target);
    }
  };

  const switchPov = (n) => {
    if (n === pov) return;
    const m = main();
    resumeAt.current = { at: m?.currentTime || 0, play: m ? !m.paused : false };
    if (grid) {
      // В 2×2 все уже идут — просто делаем этот главным.
      setPov(n);
      setGrid(false);
      return;
    }
    setPov(n);
  };

  const onLoaded = (n) => (e) => {
    const v = e.currentTarget;
    v.playbackRate = speed;
    if (n !== pov) return;
    setDuration(v.duration);
    if (resumeAt.current) {
      const { at, frac } = resumeAt.current;
      v.currentTime = frac != null ? frac * v.duration : at;
      if (resumeAt.current.play) v.play().catch(() => {});
      resumeAt.current = null;
    }
  };

  const onScrub = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (main() && duration) main().currentTime = frac * duration;
  };

  const onHover = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover({ frac, round: Math.min(rounds.length - 1, Math.floor(frac * rounds.length)) });
  };

  const fullscreen = () => {
    const el = frame.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  // Горячие клавиши: пробел — пауза, 1–4 — повка, G — 2×2.
  useEffect(() => {
    const onKey = (e) => {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (/^Digit[1-4]$/.test(e.code)) {
        const n = Number(e.code.slice(5)) - 1;
        if (n < players.length) switchPov(n);
      } else if (e.code === "KeyG") setGrid((g) => !g);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const frac = duration ? time / duration : 0;
  const cur = players[pov];
  const curRound = rounds.length ? Math.min(rounds.length - 1, Math.floor(frac * rounds.length)) : 0;
  const scoreSoFar = rounds.slice(0, curRound).reduce((acc, w) => (acc[w]++, acc), [0, 0]);

  return (
    <div className="theater">
      <div className={`th-frame${grid ? " grid" : ""}`} ref={frame}>
        <div className="th-screens">
          {players.map((p, n) =>
            grid || n === pov ? (
              <div
                key={`${media.key}-${p.id}`}
                className={`th-screen${n === pov ? " main" : ""}`}
                onClick={() => (grid ? switchPov(n) : togglePlay())}
              >
                <video
                  ref={(el) => (videos.current[n] = el)}
                  src={p.src}
                  poster={mapImage(media.map)}
                  muted
                  playsInline
                  preload="auto"
                  onLoadedMetadata={onLoaded(n)}
                  onTimeUpdate={n === pov ? (e) => setTime(e.currentTarget.currentTime) : undefined}
                  onPlay={n === pov ? () => setPlaying(true) : undefined}
                  onPause={n === pov ? () => setPlaying(false) : undefined}
                  onEnded={n === pov ? () => setPlaying(false) : undefined}
                />
                <div className="th-hud">
                  <span className={`th-pov team-${p.slot}`}>
                    <Avatar name={p.name} color={p.color} url={p.url} size={grid ? 20 : 26} />
                    <b>{p.name}</b>
                    {!grid ? <span className="mono">POV</span> : null}
                  </span>
                  {grid ? <span className="th-key mono">{n + 1}</span> : null}
                </div>
                <span className="th-cross" aria-hidden="true" />
              </div>
            ) : null
          )}
        </div>

        {!grid ? (
          <div className="th-scorebug">
            <span className="team-0">{teamA?.name}</span>
            <b className="mono">
              {scoreSoFar[0]}<i>:</i>{scoreSoFar[1]}
            </b>
            <span className="team-1">{teamB?.name}</span>
            <em className="mono">
              раунд {curRound + 1} из {rounds.length} · итог {score[0]}:{score[1]}
            </em>
          </div>
        ) : null}

        {!playing && !grid ? (
          <button className="th-bigplay" onClick={togglePlay} aria-label="Смотреть">
            <Icon name="play" size={30} filled />
          </button>
        ) : null}

        <div className="th-controls">
          <button className="th-btn" onClick={togglePlay} aria-label={playing ? "Пауза" : "Смотреть"}>
            <Icon name={playing ? "pause" : "play"} size={18} filled={!playing} />
          </button>
          <span className="th-time mono">
            {fmtTime(time)} / {fmtTime(duration)}
          </span>

          <div className="th-track" onClick={onScrub} onMouseMove={onHover} onMouseLeave={() => setHover(null)}>
            <div className="th-rounds">
              {rounds.map((w, n) => (
                <span key={n} className={`th-round team-${w}${n === curRound ? " now" : ""}`} />
              ))}
            </div>
            <div className="th-progress" style={{ width: `${frac * 100}%` }} />
            {highlights.map((h) => (
              <button
                key={h.id}
                className="th-mark"
                style={{ left: `${h.at * 100}%` }}
                title={`${h.player.name} · ${h.label} · раунд ${h.round + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  jumpTo(h.player.id, h.at - 0.02, true);
                }}
              />
            ))}
            {hover ? (
              <span className="th-tip mono" style={{ left: `${hover.frac * 100}%` }}>
                Раунд {hover.round + 1}
                {rounds[hover.round] != null
                  ? ` · ${(rounds[hover.round] === 0 ? teamA : teamB)?.name}`
                  : ""}
              </span>
            ) : null}
          </div>

          <button className="th-btn mono" onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}>
            {speed}×
          </button>
          <button
            className={`th-btn${grid ? " on" : ""}`}
            onClick={() => setGrid((g) => !g)}
            title="Все повки сразу (G)"
          >
            <Icon name={grid ? "single" : "grid"} size={17} />
          </button>
          <button className="th-btn" onClick={fullscreen} title="Во весь экран">
            <Icon name="expand" size={17} />
          </button>
        </div>
      </div>

      <aside className="th-side">
        <h3 className="th-h mono">Повки</h3>
        {[0, 1].map((slot) => (
          <div key={slot} className="th-team">
            <span className={`th-team-name team-${slot}`}>{(slot === 0 ? teamA : teamB)?.name}</span>
            {players.map((p, n) =>
              p.slot === slot ? (
                <button
                  key={p.id}
                  className={`th-player${n === pov ? " active" : ""}`}
                  onClick={() => switchPov(n)}
                >
                  <Avatar name={p.name} color={p.color} url={p.url} size={30} />
                  <span className="th-pname">{p.name}</span>
                  <span className="th-kda mono">
                    {p.line ? `${p.line.k}/${p.line.d}/${p.line.a}` : "—"}
                  </span>
                  <span className="th-num mono">{n + 1}</span>
                </button>
              ) : null
            )}
          </div>
        ))}

        <h3 className="th-h mono">Нарезки</h3>
        <div className="th-clips">
          {highlights.map((h) => (
            <button key={h.id} className="th-clip" onClick={() => jumpTo(h.player.id, h.at - 0.02, true)}>
              <span className="th-clip-tag mono">{h.short}</span>
              <span className="th-clip-body">
                <b>{h.player.name}</b>
                <span>
                  {h.label} · раунд {h.round + 1}
                </span>
              </span>
              <Icon name="play" size={13} filled />
            </button>
          ))}
        </div>

        <h3 className="th-h mono">Демка</h3>
        {media.demo ? (
          <div className="th-demo">
            <Icon name="film" size={18} />
            <span className="th-demo-body">
              <b className="mono">{media.demo.name}</b>
              <span>~{media.demo.size} МБ · для CS2, Allstar, Leetify</span>
            </span>
            <button className="btn sm" disabled title="В демо-режиме файлов нет">
              <Icon name="download" size={13} /> .dem
            </button>
          </div>
        ) : (
          <p className="muted th-none">Демку к этой карте не загружали.</p>
        )}
        <p className="th-keys mono">пробел — пауза · 1–4 — повка · G — 2×2</p>
      </aside>
    </div>
  );
}
