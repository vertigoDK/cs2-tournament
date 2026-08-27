import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiErrorMessage } from "../api.js";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
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
      navigate("/");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <div className="login-wrap">
        <div className="login-box panel panel-pad">
          <h1>CS2 Турниры</h1>
          <p className="sub">Войдите под своей учётной записью</p>
          {error ? <div className="error-box">{error}</div> : null}
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="u">Логин</label>
              <input
                id="u"
                type="text"
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="p">Пароль</label>
              <input
                id="p"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button className="btn primary" style={{ width: "100%" }} disabled={busy} type="submit">
              {busy ? "Входим…" : "Войти"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
