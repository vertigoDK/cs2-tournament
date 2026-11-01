import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import HeroTournamentCard from "../components/HeroTournamentCard.jsx";
import TournamentCard from "../components/TournamentCard.jsx";
import PageHead, { EmptyState } from "../components/PageHead.jsx";
import Icon from "../components/Icon.jsx";
import { DashboardSkeleton } from "../components/Skeleton.jsx";

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [tournaments, setTournaments] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/tournaments")
      .then((res) => setTournaments(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  // Главную держат открытой, пока ждут старта: статус, счёт и новые турниры
  // подтягиваются сами. Реже, чем на странице турнира, — тут нет драфта.
  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      api
        .get("/tournaments")
        .then((res) => {
          setTournaments(res.data);
          setError("");
        })
        .catch(() => {
          /* сеть моргнула — просто ждём следующего тика */
        });
    };
    const timer = setInterval(tick, 10000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  if (error) {
    return (
      <main className="page">
        <div className="error-box">{error}</div>
      </main>
    );
  }

  if (!tournaments) {
    return <DashboardSkeleton />;
  }

  // Наверху — то, что происходит сейчас: идущий турнир, иначе ближайший анонс.
  const current =
    tournaments.find((t) => t.status === "active") ||
    tournaments.find((t) => t.status === "setup") ||
    tournaments[0];
  const rest = tournaments.filter((t) => t.id !== current?.id);

  return (
    <main className="page">
      <PageHead
        title="Турниры"
        sub={
          <>
            Сетки, драфт карт и результаты. Команды <span className="mono accent">2×2</span>, серии BO1, BO3 и BO5.
          </>
        }
      />

      {!tournaments.length ? (
        <EmptyState
          title="Турниров пока нет"
          text={isAdmin ? "Создайте первый турнир, чтобы начать." : "Попросите админа создать турнир."}
        >
          {isAdmin ? (
            <Link to="/tournaments/new" className="btn primary">
              <Icon name="plus" size={15} /> Новый турнир
            </Link>
          ) : null}
        </EmptyState>
      ) : (
        <>
          <HeroTournamentCard t={current} />

          {rest.length ? (
            <section className="section">
              <h2 className="section-title">Все турниры</h2>
              <div className="grid">
                {rest.map((t, i) => (
                  <TournamentCard key={t.id} t={t} index={i} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
