import { useEffect, useRef, useState } from "react";
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

const STATUS_LABEL = { setup: "подготовка", active: "идёт", finished: "завершён" };

export default function TournamentView() {
  const { id } = useParams();
  const { auth, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast, toastNode } = useToast();

  const [t, setT] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [vetoTarget, setVetoTarget] = useState(null); // {r, i}
  const [statsMap, setStatsMap] = useState(null); // индекс карты серии
  const [statsOpen, setStatsOpen] = useState(false);

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

  const onPick = (r, i, slot) => runAction(() => api.post(`/tournaments/${id}/matches/${r}/${i}/pick`, { slot }));

  const onReset = () =>
    runAction(() => api.post(`/tournaments/${id}/reset`), "Результаты сброшены");

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
  const onMapWinner = (mapIndex, slot) =>
    runAction(() =>
      api.post(`/tournaments/${id}/matches/${vetoTarget.r}/${vetoTarget.i}/maps/${mapIndex}/winner`, { slot })
    );

  const onSaveMapStats = async (mapIndex, body) => {
    await runAction(() =>
      api.put(`/tournaments/${id}/matches/${vetoTarget.r}/${vetoTarget.i}/maps/${mapIndex}/stats`, body)
    );
    setStatsMap(null);
  };

  const onVetoReset = () =>
    runAction(() => api.post(`/tournaments/${id}/matches/${vetoTarget.r}/${vetoTarget.i}/veto/reset`));

  if (error) {
    return (
      <main className="page">
        <div className="error-box">{error}</div>
      </main>
    );
  }
  if (!t) {
    return (
      <main className="page">
        <div className="spinner" />
      </main>
    );
  }

  const vetoMatch = vetoTarget ? t.bracket.rounds[vetoTarget.r]?.[vetoTarget.i] ?? null : null;
  const teamA = vetoMatch && vetoMatch.p[0] != null ? t.bracket.teams[vetoMatch.p[0]] : null;
  const teamB = vetoMatch && vetoMatch.p[1] != null ? t.bracket.teams[vetoMatch.p[1]] : null;

  return (
    <main className="page">
      <div className="t-head">
        <div>
          <h1>{t.name}</h1>
          <div className="meta-row">
            <span className={`status-chip ${t.status}`}>
              {t.started_at && t.status === "active" ? <span className="live-dot" /> : null}
              {STATUS_LABEL[t.status] || t.status}
            </span>
            <span>{t.bracket.teams.length} команд</span>
            {t.prize_pool ? (
              <span className="prize-tag">
                <Icon name="trophy" size={14} /> {t.prize_pool}
              </span>
            ) : null}
          </div>
        </div>
        <div className="actions">
          {t.status !== "setup" ? (
            <button className="btn" onClick={() => setStatsOpen(true)}>
              <Icon name="medal" size={14} />
              <span>Статистика</span>
            </button>
          ) : null}
          {isAdmin ? (
            <>
              <Link to={`/tournaments/${id}/edit`} className="btn">
                Редактировать
              </Link>
              {t.status !== "finished" && !t.started_at ? (
                <button className="btn accent" onClick={onStart} disabled={busy}>
                  <Icon name="play" size={14} filled />
                  <span>Начать турнир</span>
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
                Удалить
              </button>
            </>
          ) : null}
        </div>
      </div>

      <StartAnnounce
        startsAt={t.starts_at}
        startedAt={t.started_at}
        finished={t.status === "finished"}
      />

      <Bracket
        key={id}
        bracket={t.bracket}
        isAdmin={isAdmin}
        started={Boolean(t.started_at) || t.status !== "setup"}
        onPick={onPick}
        onOpenVeto={onOpenVeto}
      />

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
