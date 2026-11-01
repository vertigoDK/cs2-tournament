import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Avatar, { AVATAR_COLORS, COLOR_LABELS } from "../components/Avatar.jsx";
import { useToast } from "../components/Toast.jsx";
import Icon from "../components/Icon.jsx";
import PageHead, { EmptyState } from "../components/PageHead.jsx";
import { BlockBones } from "../components/Skeleton.jsx";
import CountdownBlocks from "../components/CountdownBlocks.jsx";
import CupTip from "../components/CupTip.jsx";
import MedalTip from "../components/Medal.jsx";
import { cupOf } from "../utils/cups.js";
import { formatLocal } from "../utils/time.js";

const ratio = (a, b) => (b ? a / b : a).toFixed(2);

export default function Cabinet() {
  const { auth, updateProfile } = useAuth();
  const { toast, toastNode } = useToast();

  const [data, setData] = useState(null);
  const [player, setPlayer] = useState(null);
  const [place, setPlace] = useState(null);
  const [steam, setSteam] = useState(null);
  const [veto, setVeto] = useState(null);
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
    // Статистика и награды — те же, что в публичном профиле.
    if (auth?.id) {
      api.get(`/players/${auth.id}`).then((res) => setPlayer(res.data)).catch(() => {});
      api
        .get("/players")
        .then((res) => {
          const rated = res.data.filter((x) => x.axes);
          const n = rated.findIndex((x) => x.id === auth.id) + 1;
          setPlace(n ? { n, of: rated.length } : null);
        })
        .catch(() => {});
    }
    api.get("/me/steam").then((res) => setSteam(res.data)).catch(() => setSteam({}));
    api.get("/me/active-veto").then((res) => setVeto(res.data)).catch(() => {});
  }, [auth?.id]);

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
      setSteam((s) => (s ? { ...s, avatar_from_steam: false } : s));
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
      setSteam((s) => (s ? { ...s, avatar_from_steam: false } : s));
      toast("Аватар убран");
    } catch (err) {
      toast(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const steamAvatar = async () => {
    setUploading(true);
    try {
      const { data: me } = await api.post("/me/avatar/steam");
      updateProfile({ avatarUrl: me.avatar_url });
      setSteam((s) => ({ ...s, avatar_from_steam: true }));
      toast("Поставили аватарку из Steam");
    } catch (err) {
      toast(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const stats = data?.stats;
  const cups = player ? player.history.filter((h) => h.champion) : [];
  const mvps = player?.mvps || [];

  return (
    <main className="page narrow">
      <PageHead title="Личный кабинет" sub="Ник, аватар, ваша статистика и матчи." art="/img/mouse.webp" />

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
              <input ref={fileInput} type="file" accept="image/*" hidden onChange={pickAvatar} />
            </div>
          </div>
          {auth?.id ? (
            <Link to={`/players/${auth.id}`} className="btn sm profile-public">
              Мой профиль <Icon name="arrowRight" size={13} />
            </Link>
          ) : null}
        </div>

        <form onSubmit={saveProfile}>
          <div className="field">
            <label htmlFor="nick">Ник</label>
            <input id="nick" type="text" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={80} />
            <div className="hint">Так вас видно в сетке и в составах команд.</div>
          </div>

          {!auth?.avatarUrl ? (
            <div className="field">
              <label>Цвет аватара</label>
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
          ) : null}

          <button className="btn primary" type="submit" disabled={!dirty || saving || !nick.trim()}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </form>

        <SteamBlock steam={steam} busy={uploading} onUseAvatar={steamAvatar} />
      </div>

      {!data ? (
        <BlockBones rows={4} />
      ) : (
        <>
          {data.upcoming ? (
            <Upcoming
              u={data.upcoming}
              first={data.current?.tournament_id === data.upcoming.tournament_id ? data.current : null}
              veto={veto?.tournament_id === data.upcoming.tournament_id ? veto : null}
            />
          ) : null}

          {data.current && data.current.tournament_id !== data.upcoming?.tournament_id ? (
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
                  <span className="nm-side">вы{data.current.partner ? ` + ${data.current.partner}` : ""}</span>
                  <span className="nm-x">vs</span>
                  <span className="nm-side opp">{data.current.opponent}</span>
                </div>
              </Link>
            </>
          ) : null}

          <div className="section-head">
            <h2>Награды</h2>
          </div>
          {cups.length || mvps.length ? (
            <div className="panel panel-pad cab-awards">
              {cups.length ? (
                <div className="cab-award-group">
                  <span className="cab-award-label mono">
                    кубки · {cups.length}
                  </span>
                  <div className="cab-award-row">
                    {cups.map((h) => (
                      <CupTip key={h.id} id={h.id} name={h.name} date={h.date} team={h.team} prize={h.prize_pool} />
                    ))}
                  </div>
                </div>
              ) : null}
              {mvps.length ? (
                <div className="cab-award-group">
                  <span className="cab-award-label mono">медали MVP · {mvps.length}</span>
                  <div className="cab-award-row">
                    {mvps.map((m) => (
                      <MedalTip key={m.id} mvp={m} size={46} />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="panel panel-pad cab-awards empty">
              <img src="/img/trophy-tight.webp" alt="" />
              <p>
                Пока без наград. За победу в турнире здесь появится его кубок, а лучшему по рейтингу — медаль MVP.
              </p>
            </div>
          )}

          <div className="section-head">
            <h2>Статистика</h2>
          </div>
          <div className="stat-row">
            <Stat value={player?.maps ? player.rating.toFixed(2) : "—"} label="рейтинг" tone={player?.rating >= 1.1 ? "win" : ""} />
            <Stat value={player?.maps ? ratio(player.kills, player.deaths) : "—"} label="K/D" />
            <Stat value={place ? `#${place.n}` : "—"} label={place ? `место из ${place.of}` : "место"} />
            <Stat value={stats.titles} label="титулов" tone="gold" />
          </div>
          <div className="stat-row stat-row-sm">
            <Stat value={stats.tournaments} label="турниров" />
            <Stat value={`${stats.wins}–${stats.losses}`} label="серии: победы–поражения" />
            <Stat value={player ? `${player.map_wins}–${player.map_losses}` : "—"} label="карты: победы–поражения" />
            <Stat value={mvps.length} label="MVP" />
          </div>
          {player?.maps_breakdown?.length ? <BestMap maps={player.maps_breakdown} /> : null}

          <div className="section-head">
            <h2>История матчей</h2>
          </div>
          {data.history.length === 0 ? (
            <EmptyState art="/img/c4.webp" title="Сыгранных матчей пока нет" text="Как только сыграете первый — он появится здесь." />
          ) : (
            <div className="panel panel-pad">
              <ul className="match-log">
                {data.history.map((m, idx) => (
                  <li key={idx}>
                    <Link to={`/tournaments/${m.tournament_id}`} className="ml-row">
                      <span className={`res ${m.result}`}>{m.result === "win" ? "W" : "L"}</span>
                      <span className="ml-main">
                        <span className="ml-opp">
                          <span className="muted">vs</span> {m.opponent}
                        </span>
                        <span className="ml-meta">
                          {m.tournament_name} · {m.round_label}
                          {m.partner ? ` · с ${m.partner}` : ""}
                        </span>
                      </span>
                      {m.maps.length ? (
                        <span className="ml-maps">
                          {m.maps.map((x, k) => (
                            <span key={k} className={`ml-map${x.won ? " won" : x.won === false ? " lost" : ""}`}>
                              {x.map}
                              <b className="mono">
                                {x.mine}:{x.theirs}
                              </b>
                            </span>
                          ))}
                        </span>
                      ) : null}
                      {m.series ? (
                        <span className={`ml-series mono ${m.result}`}>
                          {m.series[0]}:{m.series[1]}
                        </span>
                      ) : null}
                    </Link>
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

function SteamBlock({ steam, busy, onUseAvatar }) {
  if (!steam) return null;
  if (!steam.steam_id) {
    return (
      <div className="steam-block off">
        <span className="steam-block-title mono">steam</span>
        <p>
          Steam не привязан — войти через Steam не получится. Скинь админу ссылку на свой профиль Steam, он привяжет.
        </p>
      </div>
    );
  }
  return (
    <div className="steam-block">
      <span className="steam-block-title mono">steam</span>
      <div className="steam-block-body">
        {steam.avatar ? <img src={steam.avatar} alt="" className="steam-ava" /> : <span className="steam-ava" />}
        <div className="steam-who">
          <b>{steam.persona || "Профиль Steam"}</b>
          <span className="mono">{steam.steam_id}</span>
        </div>
        <div className="steam-actions">
          {steam.avatar_from_steam ? (
            <span className="steam-ok mono">
              <Icon name="check" size={13} /> аватарка из Steam
            </span>
          ) : steam.avatar ? (
            <button type="button" className="btn sm" onClick={onUseAvatar} disabled={busy}>
              Взять аватарку из Steam
            </button>
          ) : null}
          <a className="btn sm" href={steam.profile_url} target="_blank" rel="noreferrer">
            Открыть в Steam <Icon name="arrowRight" size={13} />
          </a>
        </div>
      </div>
      <p className="hint">Через этот аккаунт можно входить на сайт кнопкой «Войти через Steam».</p>
    </div>
  );
}

function Upcoming({ u, first, veto }) {
  const started = Boolean(u.started_at);
  const cup = cupOf(u.name);
  return (
    <>
      <div className="section-head">
        <h2>Ближайший турнир</h2>
      </div>
      <div className="panel panel-pad cab-next">
        <div className="cn-head">
          <img src={cup.img} alt="" className="cn-cup" />
          <div className="cn-title">
            <span className={`status-chip ${started ? "active" : "setup"}`}>
              {started ? (
                <>
                  <span className="live-dot" /> идёт
                </>
              ) : (
                "анонс"
              )}
            </span>
            <Link to={`/tournaments/${u.tournament_id}`} className="cn-name">
              {u.name}
            </Link>
            <span className="cn-meta mono">
              {u.prize_pool ? <span className="accent">{u.prize_pool}</span> : null}
              <span>
                BO{u.best_of}
                {u.final_best_of !== u.best_of ? ` · финал BO${u.final_best_of}` : ""}
              </span>
              <span>{u.teams_count} команды</span>
              {!started && u.starts_at ? <span>{formatLocal(u.starts_at)}</span> : null}
            </span>
          </div>
        </div>

        {!started && u.starts_at ? <CountdownBlocks startsAt={u.starts_at} /> : null}

        <dl className="cn-facts">
          <div>
            <dt className="mono">твоя команда</dt>
            <dd>{u.team}</dd>
          </div>
          <div>
            <dt className="mono">напарник</dt>
            <dd>
              {u.partner_id ? <Link to={`/players/${u.partner_id}`}>{u.partner}</Link> : u.partner || "—"}
            </dd>
          </div>
          <div>
            <dt className="mono">капитан</dt>
            <dd>{u.is_captain ? <span className="accent">ты — драфтишь карты</span> : u.captain || "—"}</dd>
          </div>
          {first ? (
            <div>
              <dt className="mono">{started ? "следующий матч" : "первый соперник"}</dt>
              <dd>
                {first.opponent} <span className="muted">· {first.round_label}</span>
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="cn-actions">
          {veto ? (
            <Link to={`/tournaments/${veto.tournament_id}?veto=${veto.round}-${veto.index}`} className="btn primary live-draft">
              <span className="live-dot" />
              {veto.my_turn ? "Твой ход в драфте" : "Идёт драфт — открыть"}
            </Link>
          ) : null}
          <Link to={`/tournaments/${u.tournament_id}`} className="btn">
            Открыть сетку <Icon name="arrowRight" size={14} />
          </Link>
        </div>
      </div>
    </>
  );
}

function BestMap({ maps }) {
  const played = maps.filter((m) => m.wins + m.losses > 0);
  if (!played.length) return null;
  const best = [...played].sort((a, b) => b.rating - a.rating)[0];
  const most = [...played].sort((a, b) => b.wins + b.losses - (a.wins + a.losses))[0];
  return (
    <div className="cab-maps mono">
      <span>
        лучшая карта <b>{best.map}</b> · рейтинг <i>{best.rating.toFixed(2)}</i>
      </span>
      {most.map !== best.map ? (
        <span>
          чаще всего <b>{most.map}</b> · {most.wins}–{most.losses}
        </span>
      ) : null}
    </div>
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
