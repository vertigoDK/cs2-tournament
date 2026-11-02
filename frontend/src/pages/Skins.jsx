import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErrorMessage } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Icon from "../components/Icon.jsx";
import PageHead from "../components/PageHead.jsx";
import SkinPicker from "../components/SkinPicker.jsx";
import { useToast } from "../components/Toast.jsx";
import { loadCatalog, loadWeaponSkins, skinImage, wearOf } from "../utils/skins.js";

// Скины: игрок собирает набор на сайте, наш CS2-сервер забирает его
// (плагин nine cup → WeaponPaints) и выдаёт в игре по Steam ID.

const STEPS = [
  { title: "Выбираешь здесь", text: "Нож, перчатки и скины на любое оружие — прямо на сайте." },
  { title: "Заходишь на наш сервер", text: "Сервер узнаёт тебя по Steam ID, ничего вводить не нужно." },
  { title: "Играешь со своими", text: "Выбор доходит до сервера за полминуты, скины меняются сразу." },
];

export default function Skins() {
  const { auth } = useAuth();
  const { toast, toastNode } = useToast();
  const [catalog, setCatalog] = useState(null);
  const [mine, setMine] = useState(null);
  const [names, setNames] = useState({}); // defindex → [скины] для выбранных
  const [target, setTarget] = useState(null); // { mode, weapon }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadCatalog().then(setCatalog).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!auth) return;
    api
      .get("/me/skins")
      .then((res) => setMine(res.data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [auth]);

  // Чтобы показать на карточке выбранный скин, нужен файл его оружия.
  useEffect(() => {
    if (!mine) return;
    mine.skins.forEach((s) => {
      if (names[s.defindex]) return;
      loadWeaponSkins(s.defindex).then((rows) => setNames((prev) => ({ ...prev, [s.defindex]: rows })));
    });
  }, [mine, names]);

  const chosen = useMemo(() => Object.fromEntries((mine?.skins || []).map((s) => [s.defindex, s])), [mine]);

  const skinOf = (defindex) => {
    const c = chosen[defindex];
    return c ? (names[defindex] || []).find((r) => r.p === c.paint) : null;
  };

  const save = async ({ item, paint, wear, seed }) => {
    const { mode, weapon } = target;
    setBusy(true);
    try {
      let data;
      if (mode === "weapon") {
        ({ data } = await api.put(`/me/skins/${weapon.d}`, { paint, wear, seed }));
      } else if (mode === "knife") {
        ({ data } = await api.put("/me/loadout", {
          knife: item ? item.id : null,
          knife_defindex: item ? item.d : null,
          glove_defindex: mine.glove_defindex,
        }));
        if (item) ({ data } = await api.put(`/me/skins/${item.d}`, { paint, wear, seed }));
      } else {
        ({ data } = await api.put("/me/loadout", {
          knife: mine.knife,
          knife_defindex: mine.knife_defindex,
          glove_defindex: item ? item.d : null,
        }));
        if (item) ({ data } = await api.put(`/me/skins/${item.d}`, { paint, wear, seed }));
      }
      setMine(data);
      setTarget(null);
      toast("Сохранено — на сервере обновится в течение полминуты");
    } catch (err) {
      toast(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const groups = catalog?.groups.filter((g) => g.id !== "knives" && g.id !== "gloves") || [];
  const knives = catalog?.groups.find((g) => g.id === "knives")?.weapons || [];
  const gloves = catalog?.groups.find((g) => g.id === "gloves")?.weapons || [];
  const knife = knives.find((k) => k.d === mine?.knife_defindex);
  const glove = gloves.find((g) => g.d === mine?.glove_defindex);

  return (
    <main className="page">
      <PageHead
        title={auth ? "Выбрать скины" : "Выбрать скины"}
        sub="Нож, перчатки и оружие — выбираешь здесь, а в игре на нашем сервере всё уже на тебе."
        art="/img/skins.webp"
      />

      {error ? <div className="error-box">{error}</div> : null}

      {!auth ? (
        <>
          <ol className="skin-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} style={{ animationDelay: `${i * 70}ms` }}>
                <span className="mono">0{i + 1}</span>
                <b>{s.title}</b>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="hint skin-hint">
            Чтобы собрать свой набор, <Link to="/login">войди</Link> — он привяжется к твоему аккаунту.
          </p>
        </>
      ) : !catalog || !mine ? (
        <div className="skin-grid">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="bone" style={{ height: 150, borderRadius: 16 }} />
          ))}
        </div>
      ) : (
        <>
          {!mine.steam_linked ? (
            <div className="skin-warn">
              <Icon name="warning" size={16} />
              К аккаунту не привязан Steam — сервер тебя не узнает, и скины не применятся. Скинь админу ссылку на свой
              профиль Steam.
            </div>
          ) : null}

          <section className="skin-main">
            <SlotCard
              big
              label="Нож"
              title={knife ? knife.n : "Обычный нож"}
              sub={knife ? skinOf(knife.d)?.n || (chosen[knife.d] ? "…" : "Выбрать скин") : "Выбрать нож"}
              img={knife && skinOf(knife.d) ? skinImage(catalog, skinOf(knife.d).i) : ""}
              color={knife ? skinOf(knife.d)?.r : null}
              onClick={() => setTarget({ mode: "knife" })}
            />
            <SlotCard
              big
              label="Перчатки"
              title={glove ? glove.n : "Обычные перчатки"}
              sub={glove ? skinOf(glove.d)?.n || "…" : "Выбрать перчатки"}
              img={glove && skinOf(glove.d) ? skinImage(catalog, skinOf(glove.d).i) : ""}
              color={glove ? skinOf(glove.d)?.r : null}
              onClick={() => setTarget({ mode: "glove" })}
            />
          </section>

          {groups.map((g) => (
            <section key={g.id} className="section">
              <h2 className="section-title">{g.name}</h2>
              <div className="skin-grid">
                {g.weapons.map((w) => {
                  const s = skinOf(w.d);
                  const c = chosen[w.d];
                  return (
                    <SlotCard
                      key={w.d}
                              title={w.n}
                      sub={c ? `${s?.n || "…"} · ${wearOf(c.wear).short}` : "Выбрать скин"}
                      img={c && s ? skinImage(catalog, s.i) : ""}
                      color={s?.r}
                      onClick={() => setTarget({ mode: "weapon", weapon: w })}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      {target ? (
        <SkinPicker
          catalog={catalog}
          mode={target.mode}
          weapon={target.weapon}
          busy={busy}
          current={
            target.mode === "weapon"
              ? chosen[target.weapon.d] && { ...chosen[target.weapon.d], defindex: target.weapon.d }
              : target.mode === "knife"
              ? knife && { defindex: knife.d, ...(chosen[knife.d] || { paint: 0 }) }
              : glove && { defindex: glove.d, ...(chosen[glove.d] || {}) }
          }
          onSave={save}
          onClose={() => setTarget(null)}
        />
      ) : null}
      {toastNode}
    </main>
  );
}

function SlotCard({ label, title, sub, img, color, onClick, big }) {
  const empty = !img;
  return (
    <button
      type="button"
      className={`skin-card${big ? " big" : ""}${color ? " has-skin" : ""}${empty ? " empty" : ""}`}
      style={color ? { "--rarity": color } : undefined}
      onClick={onClick}
    >
      {label ? <span className="sc-label mono">{label}</span> : null}
      {empty ? null : <span className="sc-art"><img src={img} alt="" loading="lazy" /></span>}
      <b>{title}</b>
      <span className="sc-sub mono">{sub}</span>
    </button>
  );
}
