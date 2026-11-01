import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiErrorMessage } from "../api.js";

// Сюда сервер возвращает после Steam: /login/steam#token=…&next=…
// Токен во фрагменте — на сервер он не уходит. Забираем, чистим адрес, входим.
export default function SteamCallback() {
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token = hash.get("token");
    const next = hash.get("next") || "/";
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setError("Steam не вернул данные для входа.");
      return;
    }
    loginWithToken(token)
      .then(() => navigate(next.startsWith("/") && !next.startsWith("//") ? next : "/", { replace: true }))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [loginWithToken, navigate]);

  return (
    <div className="login">
      <div className="login-panel">
        <h1>Вход через Steam</h1>
        {error ? (
          <>
            <div className="error-box">{error}</div>
            <Link to="/login" className="back login-guest">
              Попробовать ещё раз
            </Link>
          </>
        ) : (
          <p className="lead">Входим…</p>
        )}
      </div>
    </div>
  );
}
