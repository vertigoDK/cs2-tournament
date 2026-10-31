import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiErrorMessage } from "../api.js";
import Icon from "../components/Icon.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
      navigate(location.state?.from || "/", { replace: true });
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
        <p className="lead">Турниры CS2 2×2 среди своих. Логин и пароль выдаёт админ.</p>

        {error ? <div className="error-box">{error}</div> : null}
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
          <button className="btn primary lg" disabled={busy} type="submit">
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
