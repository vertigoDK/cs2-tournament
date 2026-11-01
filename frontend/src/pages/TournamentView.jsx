import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Bracket from "../components/Bracket.jsx";
import VetoModal from "../components/VetoModal.jsx";
import MapStatsModal from "../components/MapStatsModal.jsx";
import TournamentStatsModal from "../components/TournamentStatsModal.jsx";
import StartAnnounce from "../components/StartAnnounce.jsx";
import { useToast } from "../components/Toast.jsx";
import Icon from "../components/Icon.jsx";
import StatusPill from "../components/StatusPill.jsx";
import MvpCard from "../components/MvpCard.jsx";
import QualifierBracket, { QualifierSetup } from "../components/QualifierBracket.jsx";
import { tournamentCover } from "../utils/maps.js";
import { TournamentSkeleton } from "../components/Skeleton.jsx";

export default function TournamentView() {
  const { id } = useParams();
  const { auth, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast, toastNode } = useToast();

  const [t, setT] = useState(null);
  // Расхождение часов браузера и сервера: таймер драфта считается по серверу.
  // Ответ только что пришёл, поэтому разница посчитана с точностью до задержки сети.
  const serverOffset = useMemo(() => (t?.server_time ? t.server_time - Date.now() / 1000 : 0), [t]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [vetoTarget, setVetoTarget] = useState(null); // {r, i}
  const [statsMap, setStatsMap] = useState(null); // индекс карты серии
  const [statsOpen, setStatsOpen] = useState(false);
  const [qualifierSetup, setQualifierSetup] = useState(false);

  // Пока идёт своё действие, фоновое обновление не должно перетереть ответ.
  const busyRef = useRef(false);
  // И пока админ вбивает статистику — тоже: незачем менять состояние под руками.
  const editingRef = useRef(false);
  editingRef.current = statsMap !== null;

  const load = () =>
    api
      .get(`/tournaments/${id}`)
      .then((res) => setT(res.data))
      .catch((err) => setError(apiErrorMessage(err)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Ссылка вида ?veto=1-0 открывает драфт нужного матча сразу — по ней
  // капитана сюда и приводит DraftRedirect.
  const vetoParam = searchParams.get("veto");
  useEffect(() => {
    if (!vetoParam) return;
    const [r, i] = vetoParam.split("-").map(Number);
    if (Number.isInteger(r) && Number.isInteger(i)) setVetoTarget({ r, i });
  }, [vetoParam]);

  // Турнир смотрят несколько человек сразу, а карты на драфте капитаны
  // выбирают по очереди — соперник должен видеть ход почти сразу. Поэтому во
  // время активного драфта опрашиваем чаще, в остальное время реже.
  const draftLive = Boolean(
    t?.bracket?.rounds?.some((round) => round.some((m) => m.veto?.status === "in_progress"))
  );

  useEffect(() => {
    const tick = () => {
      if (busyRef.current || editingRef.current || document.hidden) return;
      api
        .get(`/tournaments/${id}`)
        .then((res) => {
          if (!busyRef.current && !editingRef.current) setT(res.data);
        })
        .catch(() => {
          /* сеть моргнула — просто ждём следующего тика */
        });
    };
    const timer = setInterval(tick, draftLive ? 2000 : 5000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [id, draftLive]);

  const runAction = async (fn, okMsg) => {
    setBusy(true);
    busyRef.current = true;
    try {
      const { data } = await fn();
      setT(data);
      if (okMsg) toast(okMsg);
    } catch (err) {
      toast(apiErrorMessage(err));
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };

  // Всё, что стирает результаты, — только после подтверждения: один случайный
  // клик не должен уносить сыгранный турнир.
  const onPick = (r, i, slot) => {
    const m = t.bracket.rounds[r][i];
    if (m.win !== null && !m.bye) {
      const msg =
        m.win === slot
          ? "Снять результат матча? Вместе с ним сбросится вся ветка дальше по сетке."
          : "Отдать победу другой команде? Результаты дальше по сетке сбросятся.";
      if (!confirm(msg)) return;
    }
    runAction(() => api.post(`/tournaments/${id}/matches/${r}/${i}/pick`, { slot }));
  };

  const onReset = () => {
    if (
      !confirm(
        `Сбросить ВСЕ результаты турнира «${t.name}»?\n\nСчёт по картам, статистика игроков и драфты будут удалены. Отменить это нельзя.`
      )
    )
      return;
    runAction(() => api.post(`/tournaments/${id}/reset`), "Результаты сброшены");
  };

  // Дуэли 1×1: создать/пересобрать, внести результат, удалить.
  const onCreateQualifier = async (payload) => {
    if (t.bracket.qualifier && !confirm("Пересобрать дуэли? Все их результаты удалятся.")) return;
    await runAction(() => api.post(`/tournaments/${id}/qualifier`, payload), "Сетка дуэлей готова");
    setQualifierSetup(false);
  };
  const onSetDuel = async (r, i, payload) => {
    setBusy(true);
    busyRef.current = true;
    try {
      const { data } = await api.put(`/tournaments/${id}/qualifier/${r}/${i}`, payload);
      setT(data);
      return true;
    } catch (err) {
      toast(apiErrorMessage(err));
      return false;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  };
  const onDeleteQualifier = () => {
    if (!confirm("Удалить отборочные дуэли вместе с результатами?")) return;
    runAction(() => api.delete(`/tournaments/${id}/qualifier`), "Дуэли удалены");
  };

  const onStart = () => runAction(() => api.post(`/tournaments/${id}/start`), "Турнир начался");

  const onUnstart = () =>
    runAction(() => api.post(`/tournaments/${id}/unstart`), "Старт отменён, отсчёт вернулся");

  const onDelete = async () => {
    if (!confirm(`Удалить турнир «${t.name}»? Это необратимо.`)) return;
    setBusy(true);
    try {
      await api.delete(`/tournaments/${id}`);
      navigate("/");
    } catch (err) {
      toast(apiErrorMessage(err));
      setBusy(false);
    }
  };

  const onOpenVeto = (r, i) => setVetoTarget({ r, i });
  const onCloseVeto = () => {
    setVetoTarget(null);
    // Убираем ?veto из адреса, иначе эффект тут же откроет модалку заново.
    if (searchParams.has("veto")) {
      const next = new URLSearchParams(searchParams);
      next.delete("veto");
      setSearchParams(next, { replace: true });
    }
  };

  const onVetoStart = () =>
    runAction(() => api.post(`/tournaments/${id}/matches/${vetoTarget.r}/${vetoTarget.i}/veto/start`));
  const onVetoChoose = (map) =>
    runAction(() => api.post(`/tournaments/${id}/matches/${vetoTarget.r}/${vetoTarget.i}/veto/choose`, { map }));
  const onMapWinner = (mapIndex, slot) => {
    const entry = t.bracket.rounds[vetoTarget.r][vetoTarget.i].maps?.[mapIndex];
    if (entry?.winner === slot && !confirm(`Снять результат карты ${entry.map}? Итог матча пересчитается.`)) return;
    if (entry?.winner != null && entry.winner !== slot && !confirm(`Отдать карту ${entry.map} другой команде?`)) return;
    return runAction(() =>
      api.post(`/tournaments/${id}/matches/${vetoTarget.r}/${vetoTarget.i}/maps/${mapIndex}/winner`, { slot })
    );
  };

  const onSaveMapStats = async (mapIndex, body) => {
    await runAction(() =>
      api.put(`/tournaments/${id}/matches/${vetoTarget.r}/${vetoTarget.i}/maps/${mapIndex}/stats`, body)
    );
    setStatsMap(null);
  };

  const onVetoReset = () => {
    if (!confirm("Сбросить драфт этого матча? Карты серии и их результаты тоже удалятся.")) return;
    runAction(() => api.post(`/tournaments/${id}/matches/${vetoTarget.r}/${vetoTarget.i}/veto/reset`));
  };

  if (error) {
    return (
      <main className="page">
        <div className="error-box">{error}</div>
      </main>
    );
  }
  if (!t) {
    return <TournamentSkeleton />;
  }

  // Идущие драфты — кнопкой наверху, чтобы не искать матч в сетке.
  const liveDrafts = t.bracket.rounds.flatMap((round, r) =>
    round
      .map((m, i) => ({ m, r, i }))
      .filter(({ m }) => m.veto?.status === "in_progress")
      .map(({ m, r, i }) => ({
        r,
        i,
        label: m.p.map((slot) => (slot != null ? t.bracket.teams[slot]?.name : "TBD")).join(" vs "),
      }))
  );

  const vetoMatch = vetoTarget ? t.bracket.rounds[vetoTarget.r]?.[vetoTarget.i] ?? null : null;
  const teamA = vetoMatch && vetoMatch.p[0] != null ? t.bracket.teams[vetoMatch.p[0]] : null;
  const teamB = vetoMatch && vetoMatch.p[1] != null ? t.bracket.teams[vetoMatch.p[1]] : null;

  return (
    <main className="page">
      <Link to="/" className="back">
        <Icon name="arrowLeft" size={16} /> Все турниры
      </Link>

      <section className="t-hero">
        <div className="t-hero-body">
          <StatusPill t={t} />
          <h1>{t.name}</h1>
          <dl className="t-facts">
            <div>
              <dt>Призовой</dt>
              <dd className="accent">{t.prize_pool || "—"}</dd>
            </div>
            <div>
              <dt>Формат</dt>
              <dd>
                2×2 · BO{t.bracket.best_of || 1}
                {t.bracket.final_best_of && t.bracket.final_best_of !== (t.bracket.best_of || 1)
                  ? ` · финал BO${t.bracket.final_best_of}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Команды</dt>
              <dd>{t.bracket.teams.length}</dd>
            </div>
            <div>
              <dt>Стадия</dt>
              <dd>
                {t.status === "finished"
                  ? "Завершён"
                  : t.status === "setup" && !t.started_at
                  ? "Не начат"
                  : t.matches_total
                  ? `${t.stage || "—"} · ${t.matches_played}/${t.matches_total}`
                  : t.stage || "—"}
              </dd>
            </div>
          </dl>
        </div>
        <img src={tournamentCover(t.id)} alt="" className="t-hero-art" />
      </section>

      <div className="t-actions">
        {liveDrafts.map((d) => (
          <button key={`${d.r}-${d.i}`} className="btn live-draft" onClick={() => onOpenVeto(d.r, d.i)}>
            <span className="live-dot" />
            <span>
              Смотреть драфт{liveDrafts.length > 1 ? <span className="ld-teams"> · {d.label}</span> : null}
            </span>
          </button>
        ))}
        {t.status !== "setup" ? (
          <button className="btn" onClick={() => setStatsOpen(true)}>
            <Icon name="medal" size={15} />
            <span>Статистика турнира</span>
          </button>
        ) : null}
        {isAdmin ? (
          <>
            {t.status !== "finished" && !t.started_at ? (
              <button className="btn primary" onClick={onStart} disabled={busy}>
                <Icon name="play" size={14} filled />
                <span>Начать турнир</span>
              </button>
            ) : null}
            <Link to={`/tournaments/${id}/edit`} className="btn">
              Редактировать
            </Link>
            {!t.bracket.qualifier ? (
              <button className="btn" onClick={() => setQualifierSetup(true)} disabled={busy}>
                <Icon name="users" size={14} />
                <span>Дуэли 1×1</span>
              </button>
            ) : null}
            {t.started_at && t.status !== "finished" ? (
              <button className="btn" onClick={onUnstart} disabled={busy}>
                Отменить старт
              </button>
            ) : null}
            <button className="btn" onClick={onReset} disabled={busy}>
              Сбросить результаты
            </button>
            <button className="btn danger" onClick={onDelete} disabled={busy}>
              <Icon name="trash" size={14} />
              <span>Удалить</span>
            </button>
          </>
        ) : null}
      </div>

      <StartAnnounce
        startsAt={t.starts_at}
        startedAt={t.started_at}
        finished={t.status === "finished"}
      />

      {t.champion || t.mvp ? (
        <div className="t-awards">
          {t.champion ? (
            <div className="champ-banner">
              <img src="/img/trophy-tight.webp" alt="" />
              <div>
                <span className="mono">Чемпион</span>
                <b>{t.champion}</b>
              </div>
            </div>
          ) : null}
          {t.mvp ? <MvpCard mvp={t.mvp} /> : null}
        </div>
      ) : null}

      {t.bracket.qualifier?.rounds?.length ? (
        <QualifierBracket
          qualifier={t.bracket.qualifier}
          isAdmin={isAdmin}
          busy={busy}
          onSetDuel={onSetDuel}
          onRebuild={() => setQualifierSetup(true)}
          onDelete={onDeleteQualifier}
        />
      ) : null}

      {qualifierSetup ? (
        <QualifierSetup
          tournament={t}
          existing={t.bracket.qualifier}
          busy={busy}
          onClose={() => setQualifierSetup(false)}
          onCreate={onCreateQualifier}
        />
      ) : null}

      <section className="section">
        <h2 className="section-title">Сетка</h2>
        <Bracket
          key={id}
          bracket={t.bracket}
          isAdmin={isAdmin}
          started={Boolean(t.started_at) || t.status !== "setup"}
          onPick={onPick}
          onOpenVeto={onOpenVeto}
        />
      </section>

      <VetoModal
        open={Boolean(vetoMatch)}
        onClose={onCloseVeto}
        match={vetoMatch}
        teamA={teamA}
        teamB={teamB}
        mapsPool={t.maps_pool}
        bestOf={t.bracket.best_of || 1}
        isAdmin={isAdmin}
        meId={auth?.id}
        serverOffset={serverOffset}
        tournamentStarted={Boolean(t.started_at) || t.status !== "setup"}
        onStart={onVetoStart}
        onChoose={onVetoChoose}
        onMapWinner={onMapWinner}
        onEditStats={setStatsMap}
        onReset={onVetoReset}
        busy={busy}
      />

      <MapStatsModal
        open={statsMap !== null}
        onClose={() => setStatsMap(null)}
        entry={statsMap !== null ? vetoMatch?.maps?.[statsMap] : null}
        mapIndex={statsMap}
        teamA={teamA}
        teamB={teamB}
        onSave={onSaveMapStats}
        readOnly={!isAdmin}
        busy={busy}
      />

      <TournamentStatsModal
        open={statsOpen}
        onClose={() => setStatsOpen(false)}
        tournamentId={id}
        tournamentName={t.name}
      />

      {toastNode}
    </main>
  );
}
