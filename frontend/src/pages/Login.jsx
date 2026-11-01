import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiErrorMessage } from "../api.js";
import Icon from "../components/Icon.jsx";

// Почему не получилось войти через Steam (сервер возвращает ?steam=…).
const STEAM_ERRORS = {
  unknown: "Этот Steam-аккаунт не привязан ни к одному игроку. Скинь админу свой Steam ID — он привяжет.",
  invalid: "Steam не подтвердил вход. Попробуй ещё раз.",
  cancel: "Вход через Steam отменён.",
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = location.state?.from || params.get("next") || "/";
  const steamError = STEAM_ERRORS[params.get("steam")];
  const steamId = params.get("sid");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-panel">
        <div className="brand login-brand">
          <span className="brand-mark">
            <img src="/img/logo-light.png" alt="" />
          </span>
          <span className="brand-word">thirteen</span>
        </div>

        <h1>Вход</h1>
        <p className="lead">Турниры CS2 2×2 среди своих. Войди через Steam или по логину и паролю от админа.</p>

        {steamError ? (
          <div className="error-box">
            {steamError}
            {steamId ? <span className="steam-id mono">Steam ID: {steamId}</span> : null}
          </div>
        ) : null}
        {error ? <div className="error-box">{error}</div> : null}

        <a className="btn lg steam-btn" href={`/api/auth/steam/login?next=${encodeURIComponent(from)}`}>
          <SteamMark />
          <span>Войти через Steam</span>
        </a>
        <div className="login-or mono">или</div>

        <form onSubmit={submit} className="login-form">
          <label className="field">
            <span>Логин или ник</span>
            <input
              type="text"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="btn lg" disabled={busy} type="submit">
            {busy ? "Входим…" : "Войти"}
          </button>
        </form>
        <Link to="/" className="back login-guest">
          Смотреть турниры без входа <Icon name="arrowRight" size={15} />
        </Link>
      </div>

      <div className="login-art">
        <img src="/img/door.webp" alt="Приоткрытая дверь с номером 13" />
        <p className="mono">Играем до тринадцати.</p>
      </div>
    </div>
  );
}

// Значок Steam, упрощённый: «поршень» — круг с рычагом и шарниром.
function SteamMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <circle cx="15.6" cy="8.9" r="3.1" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
      <circle cx="15.6" cy="8.9" r="1.3" fill="var(--ink)" />
      <path d="M13.3 10.9 8.4 14.6" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="7.6" cy="15.3" r="2.2" fill="none" stroke="var(--ink)" strokeWidth="1.6" />
    </svg>
  );
}
