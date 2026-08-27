import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import HeroTournamentCard from "../components/HeroTournamentCard.jsx";
import Icon from "../components/Icon.jsx";

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

  if (error) {
    return (
      <main className="page">
        <div className="error-box">{error}</div>
      </main>
    );
  }

  if (!tournaments) {
    return (
      <main className="page">
        <div className="spinner" />
      </main>
    );
  }

  // На главной — только то, что происходит сейчас. Прошедшие турниры живут
  // в «Статистике», чтобы этот экран отвечал на один вопрос: что идёт?
  const current =
    tournaments.find((t) => t.status === "active") ||
    tournaments.find((t) => t.status === "setup") ||
    tournaments[0];
  const past = tournaments.filter((t) => t.id !== current?.id).length;

  return (
    <main className="page">
      {!tournaments.length ? (
        <div className="empty-state">
          <b>Турниров пока нет</b>
          <span>{isAdmin ? "Создайте первый турнир, чтобы начать." : "Попросите админа создать турнир."}</span>
          {isAdmin ? (
            <div style={{ marginTop: 16 }}>
              <Link to="/tournaments/new" className="btn primary">
                <Icon name="plus" size={14} />
                <span>Новый турнир</span>
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="section-head">
            <h2>Текущий турнир</h2>
          </div>
          <HeroTournamentCard t={current} />

          {past > 0 ? (
            <Link to="/stats" className="past-link">
              <Icon name="history" size={15} />
              Прошедших турниров: {past} — смотреть в статистике
              <Icon name="arrowRight" size={14} />
            </Link>
          ) : null}
        </>
      )}
    </main>
  );
}
