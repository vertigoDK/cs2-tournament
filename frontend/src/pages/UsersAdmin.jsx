import { useEffect, useState } from "react";
import api, { apiErrorMessage } from "../api.js";
import { useToast } from "../components/Toast.jsx";
import Avatar from "../components/Avatar.jsx";
import Icon from "../components/Icon.jsx";
import PageHead, { EmptyState } from "../components/PageHead.jsx";

export default function UsersAdmin() {
  const [users, setUsers] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Пароль возвращается с сервера только в момент создания или перевыпуска —
  // держим его на экране, пока админ не закроет карточку.
  const [issued, setIssued] = useState(null);
  const { toast, toastNode } = useToast();

  const load = () =>
    api
      .get("/users")
      .then((res) => setUsers(res.data))
      .catch((err) => setError(apiErrorMessage(err)));

  useEffect(() => {
    load();
  }, []);

  const addUser = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/users", { display_name: trimmed });
      setIssued(data);
      setName("");
      await load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (u) => {
    const question = u.password_issued
      ? `Выдать новый пароль для «${u.display_name}»? Старый перестанет работать.`
      : `Выдать пароль для «${u.display_name}»?`;
    if (!confirm(question)) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/users/${u.id}/reset-password`);
      setIssued(data);
    } catch (err) {
      toast(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async (u) => {
    if (!confirm(`Удалить участника «${u.display_name}»?`)) return;
    setBusy(true);
    try {
      await api.delete(`/users/${u.id}`);
      await load();
      toast("Участник удалён");
    } catch (err) {
      toast(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copyCreds = async () => {
    const text = `Логин: ${issued.username}\nПароль: ${issued.password}`;
    try {
      await navigator.clipboard.writeText(text);
      toast("Скопировано");
    } catch {
      toast("Не удалось скопировать — выделите вручную");
    }
  };

  return (
    <main className="page narrow">
      <PageHead
        title="Участники"
        sub="Один список на все турниры. Логин и пароль выдаются случайные и показываются один раз."
        art="/img/teams.webp"
      />

      {issued ? (
        <div className="panel panel-pad creds-card">
          <div className="creds-head">
            <b>Доступ для «{issued.display_name}»</b>
            <span>Запишите пароль сейчас — позже его не посмотреть, можно только выдать новый.</span>
          </div>
          <div className="creds-grid">
            <div className="cred">
              <span className="lbl">Логин</span>
              <code>{issued.username}</code>
            </div>
            <div className="cred">
              <span className="lbl">Пароль</span>
              <code>{issued.password}</code>
            </div>
          </div>
          <div className="row">
            <button className="btn" onClick={copyCreds}>
              Скопировать
            </button>
            <button className="btn primary" onClick={() => setIssued(null)}>
              Готово
            </button>
          </div>
        </div>
      ) : null}

      <div className="panel panel-pad" style={{ marginBottom: 18 }}>
        {error ? <div className="error-box">{error}</div> : null}
        <form onSubmit={addUser} className="row">
          <input
            type="text"
            placeholder="Ник участника"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 2 }}
          />
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            Добавить
          </button>
        </form>
        <div className="hint">
          Логин и пароль генерируются автоматически. Пароль показывается{" "}
          <b>один раз</b> — дальше он хранится только хэшем, посмотреть его нельзя,
          можно лишь выдать новый. Входить участник может и по логину, и по нику.
        </div>
      </div>

      <div className="panel panel-pad">
        {!users ? (
          <div className="spinner" />
        ) : users.length === 0 ? (
          <EmptyState art="/img/teams.webp" title="Участников ещё нет" text="Добавьте первого — из них собираются команды." />
        ) : (
          <ul className="user-list">
            {users.map((u) => (
              <li key={u.id}>
                <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} />
                <span className="u-name">
                  <span className="u-nick">
                    {u.display_name}
                    {!u.password_issued ? (
                      <span className="u-warn" title="Пароль ни разу не показывали — выдайте новый">
                        <Icon name="lock" size={11} />
                        нет пароля
                      </span>
                    ) : null}
                  </span>
                  <span className="u-login">
                    логин: <code>{u.username}</code>
                  </span>
                </span>
                <button
                  className={`btn sm${u.password_issued ? "" : " accent"}`}
                  onClick={() => resetPassword(u)}
                  disabled={busy}
                >
                  {u.password_issued ? "Новый пароль" : "Выдать пароль"}
                </button>
                <button className="btn sm danger" onClick={() => removeUser(u)} disabled={busy}>
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {toastNode}
    </main>
  );
}
