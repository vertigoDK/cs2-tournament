import { ServerTag } from "./QualifierBracket.jsx";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Avatar from "./Avatar.jsx";
import { computeMatchWidth } from "../utils/measure.js";
import Icon from "./Icon.jsx";

function roundName(r, total) {
  const left = total - r;
  if (left === 1) return "Финал";
  if (left === 2) return "Полуфинал";
  if (left === 3) return "1/4 финала";
  return `Раунд ${r + 1}`;
}

const initial = (name) => (name || "").trim().charAt(0).toUpperCase() || "?";

// У сеток, созданных до появления капитанов, поля нет — капитаном считаем первого.
const isCaptain = (team, playerId) => (team.captain_id ?? team.player_a_id) === playerId;

function Duo({ team }) {
  if (!team) {
    return (
      <span className="duo">
        <span className="ava">?</span>
        <span className="ava">?</span>
      </span>
    );
  }
  // У команды со своим логотипом он и заменяет пару аватарок.
  if (team.logo_url) {
    return (
      <span className="duo">
        <TeamLogo url={team.logo_url} name={team.name} />
      </span>
    );
  }
  return (
    <span className="duo">
      <Avatar name={team.a} color={team.a_color} url={team.a_avatar} size={34} />
      {team.b ? <Avatar name={team.b} color={team.b_color} url={team.b_avatar} size={34} /> : null}
    </span>
  );
}

function TeamLogo({ url, name }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className="ava">{initial(name)}</span>;
  return (
    <span className="ava has-image team-logo" title={name}>
      <img src={url} alt="" onError={() => setBroken(true)} />
    </span>
  );
}

function Roster({ team }) {
  return (
    <>
      <span className={isCaptain(team, team.player_a_id) ? "cap" : undefined}>{team.a}</span>
      {team.b ? <span className="plus">+</span> : null}
      {team.b ? (
        <span className={isCaptain(team, team.player_b_id) ? "cap" : undefined}>{team.b}</span>
      ) : null}
    </>
  );
}

function Slot({ team, seed, isWin, isLose, isTbd, clickable, onClick }) {
  const cls = ["slot", isTbd && "tbd", isWin && "win", isLose && "lose", !clickable && !isTbd && "readonly"]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} onClick={clickable ? onClick : undefined}>
      <span className="seed">{team ? seed : "—"}</span>
      <Duo team={team} />
      <span className="team">
        {/* Со своим названием оно главное, а состав уходит во вторую строку. */}
        <div className="nm">{team ? team.custom_name || <Roster team={team} /> : "TBD"}</div>
        <div className="sub">
          {!team ? (
            "ждёт победителя"
          ) : team.custom_name ? (
            <>
              <Icon name="star" size={10} filled />
              <Roster team={team} />
            </>
          ) : team.subs_info?.length ? (
            <>ещё играли: {team.subs_info.map((s) => s.name).join(", ")}</>
          ) : (
            <>
              <Icon name="star" size={10} filled /> капитан:{" "}
              {team.captain_name || (isCaptain(team, team.player_a_id) ? team.a : team.b)}
            </>
          )}
        </div>
      </span>
      <span className="check">{isWin ? <Icon name="check" size={15} /> : null}</span>
    </div>
  );
}

function vetoLabel(match, started) {
  const veto = match.veto;
  if (!veto || veto.status === "pending") return started ? "Драфт карт" : "Драфт после старта";
  if (veto.status === "ready_check") return "Ждём капитанов";
  if (veto.status === "in_progress") return "Драфт идёт";
  const maps = match.maps || [];
  const played = maps.filter((m) => m.winner === 0 || m.winner === 1).length;
  return played ? `Счёт ${score(maps).join(":")}` : `${maps.length} карт${maps.length === 1 ? "а" : "ы"}`;
}

function score(maps) {
  const s = [0, 0];
  (maps || []).forEach((m) => {
    if (m.winner === 0 || m.winner === 1) s[m.winner] += 1;
  });
  return s;
}

export default function Bracket({ bracket, serverLobbies = [], isAdmin, started, onPick, onOpenVeto }) {
  // Матчи, у которых сейчас карта на нашем сервере: «r:i» → лобби.
  const onServer = Object.fromEntries(
    serverLobbies.filter((l) => l.kind === "match").map((l) => [`${l.ref.r}:${l.ref.i}`, l]),
  );
  const scrollRef = useRef(null);
  const nodeRefs = useRef({});
  const championRef = useRef(null);
  const [paths, setPaths] = useState([]);

  const rounds = bracket.rounds;
  const teams = bracket.teams;
  const R = rounds.length;

  const finalMatch = rounds[R - 1]?.[0];
  const championIdx = finalMatch && finalMatch.win !== null ? finalMatch.p[finalMatch.win] : null;
  const championTeam = championIdx != null ? teams[championIdx] : null;

  // Ширина карточек считается замером текста, а веб-шрифт подгружается позже —
  // до этого замер идёт по системному и получается уже. Пересчитываем, когда
  // шрифты готовы.
  const [fontsReady, setFontsReady] = useState(() => document.fonts?.status === "loaded");
  useLayoutEffect(() => {
    if (fontsReady || !document.fonts) return;
    let alive = true;
    document.fonts.ready.then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, [fontsReady]);

  const matchWidth = useMemo(() => computeMatchWidth(teams), [teams, fontsReady]);

  useLayoutEffect(() => {
    const recompute = () => {
      const track = scrollRef.current?.querySelector(".bracket");
      const base = track?.getBoundingClientRect();
      if (!base) return;
      const next = [];
      rounds.forEach((round, r) => {
        if (!rounds[r + 1]) return;
        round.forEach((m, i) => {
          const a = nodeRefs.current[`${r}-${i}`];
          const b = nodeRefs.current[`${r + 1}-${Math.floor(i / 2)}`];
          if (!a || !b) return;
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          const x1 = ra.right - base.left;
          const y1 = ra.top + ra.height / 2 - base.top;
          const x2 = rb.left - base.left;
          const y2 = rb.top + rb.height / 2 - base.top;
          const mid = x1 + (x2 - x1) / 2;
          // Прямые углы вместо кривых — так читаются турнирные сетки в эспорте.
          const r0 = Math.min(10, Math.abs(y2 - y1) / 2);
          const dir = y2 > y1 ? 1 : -1;
          const d =
            Math.abs(y2 - y1) < 1
              ? `M ${x1} ${y1} H ${x2}`
              : `M ${x1} ${y1} H ${mid - r0} Q ${mid} ${y1} ${mid} ${y1 + r0 * dir} ` +
                `V ${y2 - r0 * dir} Q ${mid} ${y2} ${mid + r0} ${y2} H ${x2}`;
          next.push({ key: `${r}-${i}`, d, done: m.win !== null });
        });
      });

      // Колонка победителя не входит в раунды, поэтому линию к ней тянем
      // отдельно — иначе карточка чемпионов висит в воздухе.
      const finalNode = nodeRefs.current[`${rounds.length - 1}-0`];
      if (finalNode && championRef.current) {
        const ra = finalNode.getBoundingClientRect();
        const rb = championRef.current.getBoundingClientRect();
        const x1 = ra.right - base.left;
        const y1 = ra.top + ra.height / 2 - base.top;
        const x2 = rb.left - base.left;
        const y2 = rb.top + rb.height / 2 - base.top;
        const mid = x1 + (x2 - x1) / 2;
        const r0 = Math.min(10, Math.abs(y2 - y1) / 2);
        const dir = y2 > y1 ? 1 : -1;
        next.push({
          key: "champion",
          done: true,
          d:
            Math.abs(y2 - y1) < 1
              ? `M ${x1} ${y1} H ${x2}`
              : `M ${x1} ${y1} H ${mid - r0} Q ${mid} ${y1} ${mid} ${y1 + r0 * dir} ` +
                `V ${y2 - r0 * dir} Q ${mid} ${y2} ${mid + r0} ${y2} H ${x2}`,
        });
      }

      setPaths(next);
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [bracket, matchWidth]);

  return (
    <div className="bracket-scroll" ref={scrollRef}>
      <div className="bracket" style={{ "--match-w": `${matchWidth}px` }}>
        <svg className="links">
          {paths.map((p) => (
            <path
              key={p.key}
              d={p.d}
              className={`${p.done ? "done" : ""}${p.key === "champion" ? " champion-link" : ""}`}
            />
          ))}
        </svg>

        {rounds.map((round, r) => (
          <div className="round" key={r}>
            <div className="round-title">
              <span>{roundName(r, R)}</span>
            </div>
            <div className="round-matches">
              {round.map((m, i) => {
              const teamA = m.p[0] != null ? teams[m.p[0]] : null;
              const teamB = m.p[1] != null ? teams[m.p[1]] : null;
              // «Идёт» — только после старта турнира: до него матчи просто ждут.
              const ready = started && teamA && teamB && m.win === null && !m.bye;
              const bothKnown = Boolean(teamA && teamB) && !m.bye;
              const vetoDone = m.veto?.status === "done";
              const lobby = onServer[`${r}:${i}`];
              return (
                <div
                  className={`match${ready ? " live" : ""}${lobby ? " on-server" : ""}`}
                  key={i}
                  ref={(el) => {
                    if (el) nodeRefs.current[`${r}-${i}`] = el;
                  }}
                >
                  {lobby ? <ServerTag lobby={lobby} /> : null}
                  <div className="match-head">
                    <span className="match-no">
                      R{r + 1}·M{i + 1}
                      {/* Формат показываем, только если он не такой, как у остальных (обычно финал). */}
                      {m.bo && m.bo !== (bracket.best_of || 1) ? <span className="tag bo-tag">BO{m.bo}</span> : null}
                    </span>
                    {m.bye ? (
                      <span className="tag">bye</span>
                    ) : bothKnown ? (
                      <button
                        type="button"
                        className={`veto-btn${vetoDone ? " done" : ""}${
                          m.veto?.status === "in_progress" || m.veto?.status === "ready_check" ? " live" : ""
                        }`}
                        onClick={() => onOpenVeto(r, i)}
                      >
                        {vetoDone ? <Icon name="map" size={13} /> : null}
                        {!started && !vetoDone ? <Icon name="lock" size={12} /> : null}
                        {vetoLabel(m, started)}
                        <Icon name="chevronRight" size={12} className="vb-chev" />
                      </button>
                    ) : null}
                  </div>
                  <Slot
                    team={teamA}
                    seed={teamA?.seed}
                    isWin={m.win === 0}
                    isLose={m.win !== null && m.win !== 0 && Boolean(teamA)}
                    isTbd={!teamA}
                    clickable={isAdmin && teamA && !m.bye}
                    onClick={() => onPick(r, i, 0)}
                  />
                  <Slot
                    team={teamB}
                    seed={teamB?.seed}
                    isWin={m.win === 1}
                    isLose={m.win !== null && m.win !== 1 && Boolean(teamB)}
                    isTbd={!teamB}
                    clickable={isAdmin && teamB && !m.bye}
                    onClick={() => onPick(r, i, 1)}
                  />

                  {m.maps?.length ? (
                    <button type="button" className="match-maps" onClick={() => onOpenVeto(r, i)}>
                      {m.maps.map((mp, mi) => (
                        <span
                          key={mi}
                          className={`mm${mp.winner === 0 ? " a" : mp.winner === 1 ? " b" : ""}`}
                          title={
                            mp.winner === null
                              ? `${mp.map} — не сыграна`
                              : `${mp.map} — победа: ${(mp.winner === 0 ? teamA : teamB)?.name}`
                          }
                        >
                          <i>{mp.map}</i>
                          {mp.winner !== null ? <b>{(mp.winner === 0 ? teamA : teamB)?.seed}</b> : null}
                        </span>
                      ))}
                    </button>
                  ) : null}
                </div>
                );
              })}
            </div>
          </div>
        ))}

        {championTeam ? (
          <div className="round">
            <div className="round-title">
              <span>Победитель</span>
            </div>
            <div className="round-matches">
              <div className="match champion" ref={championRef}>
              <div className="match-head">
                <span className="match-no">
                  <Icon name="trophy" size={13} /> Чемпионы
                </span>
              </div>
              <div className="slot win">
                <span className="seed">{championTeam.seed}</span>
                <Duo team={championTeam} />
                <span className="team">
                  <div className="nm">{championTeam.name}</div>
                  <div className="sub">
                    {championTeam.custom_name ? <Roster team={championTeam} /> : "чемпионы турнира"}
                  </div>
                </span>
                <span className="check">
                  <Icon name="check" size={15} />
                </span>
              </div>
            </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
