import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Avatar, { AVATAR_COLORS, COLOR_LABELS } from "../components/Avatar.jsx";
import { useToast } from "../components/Toast.jsx";
import Icon from "../components/Icon.jsx";

export default function Cabinet() {
  const { auth, updateProfile } = useAuth();
  const { toast, toastNode } = useToast();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [nick, setNick] = useState(auth?.displayName || "");
  const [color, setColor] = useState(auth?.avatarColor || "sand");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    api
      .get("/me/cabinet")
      .then((res) => setData(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  const dirty = nick.trim() !== auth?.displayName || color !== auth?.avatarColor;

  const saveProfile = async (e) => {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      const { data: me } = await api.patch("/me", {
        display_name: nick.trim(),
        avatar_color: color,
      });
      updateProfile({ displayName: me.display_name, avatarColor: me.avatar_color });
      toast("Профиль обновлён");
    } catch (err) {
      toast(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const pickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // чтобы тот же файл можно было выбрать снова
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data: me } = await api.post("/me/avatar", form);
      updateProfile({ avatarUrl: me.avatar_url });
      toast("Аватар обновлён");
    } catch (err) {
      toast(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    setUploading(true);
    try {
      const { data: me } = await api.patch("/me", { clear_avatar: true });
      updateProfile({ avatarUrl: me.avatar_url });
      toast("Аватар убран");
    } catch (err) {
      toast(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const stats = data?.stats;

  return (
    <main className="page narrow">
      <div className="section-head">
        <h2>Личный кабинет</h2>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="panel panel-pad profile-card">
        <div className="profile-top">
          <Avatar name={nick || auth?.displayName} color={color} url={auth?.avatarUrl} size={64} />
          <div className="profile-id">
            <div className="profile-nick">{auth?.displayName}</div>
            <div className="profile-login">логин: {auth?.username}</div>
            <div className="avatar-actions">
              <button
                type="button"
                className="btn sm"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                <Icon name="image" size={13} />
                {uploading ? "Загружаем…" : auth?.avatarUrl ? "Заменить фото" : "Загрузить фото"}
              </button>
              {auth?.avatarUrl ? (
                <button type="button" className="btn sm danger" onClick={removeAvatar} disabled={uploading}>
                  Убрать
                </button>
              ) : null}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={pickAvatar}
              />
            </div>
          </div>
        </div>

        <form onSubmit={saveProfile}>
          <div className="field">
            <label htmlFor="nick">Ник</label>
            <input id="nick" type="text" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={80} />
            <div className="hint">Так вас видно в сетке и в составах команд.</div>
          </div>

          <div className="field">
            <label>Цвет аватара{auth?.avatarUrl ? " (пока стоит фото — не виден)" : ""}</label>
            <div className="swatches">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`swatch${c === color ? " active" : ""}`}
                  data-color={c}
                  onClick={() => setColor(c)}
                  title={COLOR_LABELS[c]}
                  aria-label={COLOR_LABELS[c]}
                  aria-pressed={c === color}
                />
              ))}
            </div>
          </div>

          <button className="btn primary" type="submit" disabled={!dirty || saving || !nick.trim()}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </form>
      </div>

      {!data ? (
        <div className="spinner" />
      ) : (
        <>
          <div className="section-head">
            <h2>Статистика</h2>
          </div>
          <div className="stat-row">
            <Stat value={stats.tournaments} label="турниров" />
            <Stat value={stats.wins} label="побед" tone="win" />
            <Stat value={stats.losses} label="поражений" />
            <Stat value={stats.titles} label="титулов" tone="gold" />
          </div>

          {data.current ? (
            <>
              <div className="section-head">
                <h2>Следующий матч</h2>
              </div>
              <Link to={`/tournaments/${data.current.tournament_id}`} className="panel panel-pad next-match">
                <div className="nm-top">
                  <span className="status-chip active">
                    <span className="live-dot" />
                    {data.current.round_label}
                  </span>
                  <span className="nm-tournament">{data.current.tournament_name}</span>
                </div>
                <div className="nm-vs">
                  <span className="nm-side">
                    вы{data.current.partner ? ` + ${data.current.partner}` : ""}
                  </span>
                  <span className="nm-x">vs</span>
                  <span className="nm-side opp">{data.current.opponent}</span>
                </div>
                {data.current.map ? <div className="nm-map"><Icon name="map" size={14} /> {data.current.map}</div> : null}
              </Link>
            </>
          ) : null}

          <div className="section-head">
            <h2>История матчей</h2>
          </div>
          {data.history.length === 0 ? (
            <div className="empty-state">
              <b>Сыгранных матчей пока нет</b>
              <span>Как только сыграете первый — он появится здесь.</span>
            </div>
          ) : (
            <div className="panel panel-pad">
              <ul className="match-log">
                {data.history.map((m, idx) => (
                  <li key={idx}>
                    <span className={`res ${m.result}`}>{m.result === "win" ? "W" : "L"}</span>
                    <span className="ml-main">
                      <span className="ml-opp">{m.opponent}</span>
                      <span className="ml-meta">
                        {m.tournament_name} · {m.round_label}
                        {m.map ? ` · ${m.map}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {toastNode}
    </main>
  );
}

function Stat({ value, label, tone }) {
  return (
    <div className={`stat-tile${tone ? ` ${tone}` : ""}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
