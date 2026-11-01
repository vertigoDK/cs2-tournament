import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import { almatyLocalToUtcIso, utcIsoToAlmatyLocal } from "../utils/time.js";
import { BEST_OF, minPool, sequenceLabel } from "../utils/veto.js";
import { mapImage } from "../utils/maps.js";
import Icon from "../components/Icon.jsx";
import PageHead from "../components/PageHead.jsx";
import { FormSkeleton } from "../components/Skeleton.jsx";

// Пул 2×2 на Cybershoke; держим в синхроне с backend/app/map_catalog.py.
const DEFAULT_MAPS = [
  "Nuke",
  "Inferno",
  "Dust2",
  "Mirage",
  "Train",
  "Anubis",
  "Rialto",
  "Overpass",
  "Vertigo",
  "Lake",
  "Eldorado",
  "Debris",
];

export default function TournamentForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [prizePool, setPrizePool] = useState("");
  const [mode, setMode] = useState("seed");
  const [pool, setPool] = useState(DEFAULT_MAPS);
  const [bestOf, setBestOf] = useState(3);
  // Финал часто играют дольше остальных матчей.
  const [finalBo, setFinalBo] = useState(5);
  // Время на весь драфт, у каждой команды половина; 0 — без таймера.
  const [vetoMinutes, setVetoMinutes] = useState(7);
  const [startsAtLocal, setStartsAtLocal] = useState(""); // "YYYY-MM-DDTHH:mm" по времени UTC+5

  const [players, setPlayers] = useState(null);
  // draft team = {player_a_id, player_b_id, a, b} — names cached at add-time
  const [teams, setTeams] = useState([]);
  const [pickA, setPickA] = useState("");
  const [pickB, setPickB] = useState("");

  const [error, setError] = useState("");
  // Как было при открытии формы: сетку пересобираем, только если поменялось
  // то, из чего она строится, — иначе правка названия стирала бы результаты.
  const original = useRef(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPlayers = api.get("/users").then((res) => setPlayers(res.data));
    const loadTournament = isEdit
      ? api.get(`/tournaments/${id}`).then((res) => {
          const t = res.data;
          setName(t.name);
          setPrizePool(t.prize_pool || "");
          setMode(t.mode || "seed");
          setPool(t.maps_pool || DEFAULT_MAPS);
          setBestOf(t.bracket.best_of || 1);
          setFinalBo(t.bracket.final_best_of || t.bracket.best_of || 1);
          setVetoMinutes(Math.round((t.bracket.veto_time || 0) / 60));
          setStartsAtLocal(utcIsoToAlmatyLocal(t.starts_at));
          setTeams(
            t.bracket.teams.map((tm) => ({
              player_a_id: tm.player_a_id,
              player_b_id: tm.player_b_id,
              a: tm.a,
              b: tm.b,
              captain_id: tm.captain_id || tm.player_a_id,
              name: tm.custom_name || "",
              logo_url: tm.logo_url || null,
            }))
          );
          original.current = {
            shape: bracketShape({
              mode: t.mode || "seed",
              teams: t.bracket.teams.map((tm) => ({
                player_a_id: tm.player_a_id,
                player_b_id: tm.player_b_id,
                captain_id: tm.captain_id || tm.player_a_id,
                name: tm.custom_name || "",
                logo_url: tm.logo_url || null,
              })),
              pool: t.maps_pool || DEFAULT_MAPS,
              bestOf: t.bracket.best_of || 1,
              finalBo: t.bracket.final_best_of || t.bracket.best_of || 1,
            }),
            hasResults: t.status !== "setup" || Boolean(t.started_at),
          };
        })
      : Promise.resolve();

    Promise.all([loadPlayers, loadTournament])
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const usedIds = useMemo(() => {
    const s = new Set();
    teams.forEach((t) => {
      s.add(t.player_a_id);
      s.add(t.player_b_id);
    });
    return s;
  }, [teams]);

  const available = useMemo(() => (players || []).filter((p) => !usedIds.has(p.id)), [players, usedIds]);

  // Карты старых турниров, которых нет в каталоге, не теряем — показываем рядом.
  const allMaps = useMemo(() => [...DEFAULT_MAPS, ...pool.filter((m) => !DEFAULT_MAPS.includes(m))], [pool]);
  // В пул уходит в порядке каталога: так же карты стоят в драфте.
  const mapsPool = allMaps.filter((m) => pool.includes(m));
  const toggleMap = (name) =>
    setPool((prev) => (prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name]));
  const needMaps = minPool(Math.max(bestOf, finalBo));

  const addTeam = () => {
    if (!pickA || !pickB || pickA === pickB) return;
    const pa = players.find((p) => String(p.id) === pickA);
    const pb = players.find((p) => String(p.id) === pickB);
    if (!pa || !pb) return;
    setTeams((prev) => [
      ...prev,
      {
        player_a_id: pa.id,
        player_b_id: pb.id,
        a: pa.display_name,
        b: pb.display_name,
        captain_id: pa.id,
        name: "",
        logo_url: null,
      },
    ]);
    setPickA("");
    setPickB("");
  };

  const removeTeam = (idx) => setTeams((prev) => prev.filter((_, i) => i !== idx));

  const setCaptain = (idx, playerId) =>
    setTeams((prev) => prev.map((t, i) => (i === idx ? { ...t, captain_id: playerId } : t)));

  const setTeamField = (idx, patch) =>
    setTeams((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));

  const uploadLogo = async (idx, file) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/uploads/logo", form);
      setTeamField(idx, { logo_url: data.url });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // Порядок команд — это посев: первая в списке получает первый номер.
  const moveTeam = (idx, dir) =>
    setTeams((prev) => {
      const to = idx + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (teams.length < 2) {
      setError("Нужно минимум 2 команды");
      return;
    }
    if (mapsPool.length < needMaps) {
      setError(`Для BO${Math.max(bestOf, finalBo)} нужно минимум ${needMaps} карт в пуле`);
      return;
    }
    const payloadTeams = teams.map((t) => ({
      player_a_id: t.player_a_id,
      player_b_id: t.player_b_id,
      captain_id: t.captain_id,
      name: t.name?.trim() || null,
      logo_url: t.logo_url || null,
    }));
    const startsAtIso = almatyLocalToUtcIso(startsAtLocal);
    setBusy(true);
    try {
      const shape = bracketShape({ mode, teams: payloadTeams, pool: mapsPool, bestOf, finalBo });
      const rebuild = !isEdit || shape !== original.current?.shape;
      if (
        isEdit &&
        rebuild &&
        original.current?.hasResults &&
        !confirm(
          "Вы поменяли состав, посев, пул карт или формат серий. Сетка соберётся заново, и ВСЕ результаты турнира удалятся. Продолжить?"
        )
      ) {
        setBusy(false);
        return;
      }
      if (isEdit && rebuild) {
        await api.post(`/tournaments/${id}/regenerate`, {
          mode,
          teams: payloadTeams,
          maps_pool: mapsPool,
          best_of: bestOf,
          final_best_of: finalBo,
          veto_time: vetoMinutes * 60,
        });
      }
      if (isEdit) {
        await api.patch(`/tournaments/${id}`, {
          name,
          prize_pool: prizePool,
          starts_at: startsAtIso,
          clear_starts_at: !startsAtIso,
          veto_time: vetoMinutes * 60,
        });
        navigate(`/tournaments/${id}`);
      } else {
        const { data } = await api.post("/tournaments", {
          name,
          prize_pool: prizePool,
          mode,
          teams: payloadTeams,
          maps_pool: mapsPool,
          best_of: bestOf,
          final_best_of: finalBo,
          veto_time: vetoMinutes * 60,
          starts_at: startsAtIso,
        });
        navigate(`/tournaments/${data.id}`);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <FormSkeleton />;
  }

  const noPlayers = (players || []).length === 0;

  return (
    <main className="page narrow">
      <PageHead
        title={isEdit ? "Редактировать турнир" : "Новый турнир"}
        sub="Название, призовой, время старта по Алматы, формат серий и составы команд 2×2."
        art="/img/draft.webp"
      />
      <div className="panel panel-pad">
        {error ? <div className="error-box">{error}</div> : null}

        {noPlayers ? (
          <div className="error-box">
            Сначала добавьте участников — <Link to="/users">открыть список участников</Link>.
          </div>
        ) : null}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="name">Название турнира</label>
            <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="field">
            <label htmlFor="prize">Призовой фонд</label>
            <input
              id="prize"
              type="text"
              placeholder="например: 20 000 ₸"
              value={prizePool}
              onChange={(e) => setPrizePool(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="startsAt">Дата и время начала</label>
            <input
              id="startsAt"
              type="datetime-local"
              value={startsAtLocal}
              onChange={(e) => setStartsAtLocal(e.target.value)}
            />
            <div className="hint">
              Время указывается по Алматы/Астане (UTC+5) — у зрителей в других часовых поясах (например,
              Москва) отобразится и отсчитается верно само.
            </div>
          </div>

          <div className="field">
            <label htmlFor="mode">Посев команд</label>
            <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="seed">По порядку добавления (1–8, 4–5, 2–7, 3–6)</option>
              <option value="order">Парами подряд (1–2, 3–4, …)</option>
              <option value="random">Случайный</option>
            </select>
          </div>

          <div className="field">
            <label>Команды (2 участника на команду)</label>

            <div className="row" style={{ marginBottom: 8 }}>
              <select value={pickA} onChange={(e) => setPickA(e.target.value)} disabled={noPlayers}>
                <option value="">Участник 1…</option>
                {available
                  .filter((p) => String(p.id) !== pickB)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
              </select>
              <select value={pickB} onChange={(e) => setPickB(e.target.value)} disabled={noPlayers}>
                <option value="">Участник 2…</option>
                {available
                  .filter((p) => String(p.id) !== pickA)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="btn"
                onClick={addTeam}
                disabled={!pickA || !pickB || pickA === pickB}
              >
                Добавить
              </button>
            </div>

            {teams.length > 0 ? (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {teams.map((t, idx) => (
                  <li className={`team-row${idx ? " sep" : ""}`} key={idx}>
                    <span className="seed" style={{ flex: "none" }}>
                      {idx + 1}
                    </span>
                    <TeamLogoPicker
                      team={t}
                      busy={busy}
                      onPick={(file) => uploadLogo(idx, file)}
                      onClear={() => setTeamField(idx, { logo_url: null })}
                    />
                    <span className="team-draft">
                      <button
                        type="button"
                        className={`cap-pick${t.captain_id === t.player_a_id ? " active" : ""}`}
                        onClick={() => setCaptain(idx, t.player_a_id)}
                        title="Назначить капитаном"
                      >
                        {t.captain_id === t.player_a_id ? <Icon name="star" size={12} filled /> : null}
                        {t.a}
                      </button>
                      <span className="team-plus">+</span>
                      <button
                        type="button"
                        className={`cap-pick${t.captain_id === t.player_b_id ? " active" : ""}`}
                        onClick={() => setCaptain(idx, t.player_b_id)}
                        title="Назначить капитаном"
                      >
                        {t.captain_id === t.player_b_id ? <Icon name="star" size={12} filled /> : null}
                        {t.b}
                      </button>
                    </span>
                    <span className="team-order">
                      <button
                        type="button"
                        className="ord-btn"
                        onClick={() => moveTeam(idx, -1)}
                        disabled={idx === 0}
                        title="Поднять выше"
                        aria-label={`Поднять команду ${idx + 1} выше`}
                      >
                        <Icon name="arrowUp" size={14} />
                      </button>
                      <button
                        type="button"
                        className="ord-btn"
                        onClick={() => moveTeam(idx, 1)}
                        disabled={idx === teams.length - 1}
                        title="Опустить ниже"
                        aria-label={`Опустить команду ${idx + 1} ниже`}
                      >
                        <Icon name="arrowDown" size={14} />
                      </button>
                    </span>
                    <button type="button" className="btn sm danger" onClick={() => removeTeam(idx)}>
                      Убрать
                    </button>

                    <input
                      className="team-name-input"
                      type="text"
                      maxLength={60}
                      placeholder="Название команды — необязательно"
                      value={t.name || ""}
                      onChange={(e) => setTeamField(idx, { name: e.target.value })}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hint">Команды пока не добавлены.</div>
            )}
            <div className="hint">
              {teams.length >= 2 ? `${teams.length} команд(ы) добавлено. ` : "Нужно минимум 2 команды. "}
              Отмеченный звёздочкой — капитан: он выбирает карты на драфте, нажмите
              на ник, чтобы назначить. Стрелками меняется порядок — это посев, номер
              слева определяет, кто с кем встретится в первом раунде. Название и
              логотип необязательны: без них команда зовётся «ник + ник».
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label>Обычные матчи</label>
              <Segmented options={BEST_OF} value={bestOf} onChange={setBestOf} format={(v) => `BO${v}`} />
            </div>
            <div className="field">
              <label>Финал</label>
              <Segmented options={BEST_OF} value={finalBo} onChange={setFinalBo} format={(v) => `BO${v}`} />
            </div>
          </div>

          <div className="field">
            <label>Время на драфт</label>
            <Segmented
              options={[0, 3, 5, 7, 10]}
              value={vetoMinutes}
              onChange={setVetoMinutes}
              format={(v) => (v ? `${v} мин` : "без таймера")}
            />
            <div className="hint">
              {vetoMinutes
                ? `У каждой команды ${formatHalf(vetoMinutes)} на все свои ходы — время идёт только в её ход. Не успела — оставшиеся баны и пики за неё делаются случайно.`
                : "Капитаны ходят без ограничения по времени."}
            </div>
          </div>

          <div className="field">
            <div className="pool-head">
              <label>Пул карт · {mapsPool.length} из {allMaps.length}</label>
              <button type="button" className="btn sm" onClick={() => setPool(allMaps)}>
                Все
              </button>
              <button type="button" className="btn sm" onClick={() => setPool([])}>
                Снять все
              </button>
            </div>
            <div className="pool-grid">
              {allMaps.map((name) => (
                <PoolTile key={name} name={name} selected={pool.includes(name)} onClick={() => toggleMap(name)} />
              ))}
            </div>
            <div className="hint">
              {mapsPool.length >= needMaps ? (
                <>
                  Вето: обычные матчи (BO{bestOf}) — {sequenceLabel(bestOf, mapsPool.length)}
                  {finalBo !== bestOf ? `; финал (BO${finalBo}) — ${sequenceLabel(finalBo, mapsPool.length)}` : ""}.
                </>
              ) : (
                `Для BO${Math.max(bestOf, finalBo)} нужно минимум ${needMaps} карт.`
              )}
            </div>
          </div>

          <div className="row">
            <button type="button" className="btn" onClick={() => navigate(-1)}>
              Отмена
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Сохраняем…" : isEdit ? "Пересобрать сетку" : "Создать турнир"}
            </button>
          </div>
          {isEdit ? (
            <div className="hint" style={{ marginTop: 10 }}>
              <Icon name="warning" size={13} /> Пересборка сетки сбросит все текущие результаты и пик/баны.
            </div>
          ) : null}
        </form>
      </div>
    </main>
  );
}

function TeamLogoPicker({ team, busy, onPick, onClear }) {
  const input = useRef(null);
  return (
    <span className="logo-pick">
      {team.logo_url ? (
        <>
          <img src={team.logo_url} alt="" className="logo-preview" />
          <button
            type="button"
            className="logo-clear"
            onClick={onClear}
            title="Убрать логотип"
            aria-label="Убрать логотип"
          >
            <Icon name="trash" size={12} />
          </button>
        </>
      ) : (
        <button
          type="button"
          className="logo-add"
          onClick={() => input.current?.click()}
          disabled={busy}
          title="Загрузить логотип команды"
          aria-label="Загрузить логотип команды"
        >
          <Icon name="image" size={15} />
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          onPick(file);
        }}
      />
    </span>
  );
}

// «2:30» для половины от минут на драфт.
function formatHalf(minutes) {
  const sec = minutes * 30;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function Segmented({ options, value, onChange, format }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          className={value === o ? "active" : undefined}
          onClick={() => onChange(o)}
        >
          {format(o)}
        </button>
      ))}
    </div>
  );
}

function PoolTile({ name, selected, onClick }) {
  const [noImage, setNoImage] = useState(false);
  const src = mapImage(name);
  return (
    <button
      type="button"
      className={`map-card pool-tile${selected ? " selected" : ""}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="mc-art">
        {src && !noImage ? <img src={src} alt="" loading="lazy" onError={() => setNoImage(true)} /> : null}
        <span className="pool-check">{selected ? <Icon name="check" size={13} /> : null}</span>
      </span>
      <span className="mc-name">{name}</span>
    </button>
  );
}

// Всё, из чего строится сетка, одной строкой — чтобы понять, менялось ли это.
function bracketShape({ mode, teams, pool, bestOf, finalBo }) {
  const team = (t) => [t.player_a_id, t.player_b_id, t.captain_id, (t.name || "").trim(), t.logo_url || null];
  return JSON.stringify([mode, teams.map(team), [...pool].sort(), bestOf, finalBo]);
}
