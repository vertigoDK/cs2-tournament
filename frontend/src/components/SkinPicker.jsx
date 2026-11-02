import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { loadWeaponSkins, skinImage, WEARS, wearOf } from "../utils/skins.js";

// Окно выбора скина. Три вида:
//   weapon — скины одного оружия;
//   knife  — сначала какой нож, потом скин на него;
//   glove  — сначала какие перчатки, потом раскраска (стандартного вида у
//            перчаток нет, только «как у всех» — без выбора).
// onSave получает { item, paint, wear, seed }, где item — выбранный предмет
// каталога (для ножа и перчаток), null — «стандартный».
export default function SkinPicker({ catalog, mode, weapon, current, onSave, onClose, busy }) {
  const types = mode === "knife" ? group(catalog, "knives") : mode === "glove" ? group(catalog, "gloves") : null;
  const [item, setItem] = useState(() =>
    mode === "weapon" ? weapon : types?.find((w) => w.d === current?.defindex) || null
  );
  const [skins, setSkins] = useState(null);
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState(null);
  const [wear, setWear] = useState(current?.wear ?? 0.01);
  const [seed, setSeed] = useState(current?.seed ?? 0);
  // Выбор на момент открытия: родитель пересоздаёт объект на каждом рендере.
  const initial = useRef(current);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!item) return;
    let alive = true;
    setSkins(null);
    loadWeaponSkins(item.d).then((rows) => {
      if (!alive) return;
      // У перчаток нет «стандартного» скина — без раскраски их не надеть.
      // У обычного оружия в каталоге нет стандартного вида — добавляем, чтобы
      // скин можно было снять.
      let list = mode === "glove" ? rows.filter((r) => r.p) : rows;
      if (mode === "weapon" && !list.some((r) => r.p === 0)) {
        list = [{ p: 0, n: "Стандартный", r: "", i: item.b || item.i, min: 0, max: 1 }, ...list];
      }
      setSkins(list);
      const cur = initial.current;
      const keep = cur && cur.defindex === item.d ? list.find((r) => r.p === cur.paint) : null;
      setPick(keep || null);
    });
    return () => {
      alive = false;
    };
  }, [item, mode]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (skins || []).filter((s) => !q || s.n.toLowerCase().includes(q));
  }, [skins, query]);

  // Износ держим в пределах, которые у этого скина бывают.
  const min = pick?.min ?? 0;
  const max = pick?.max ?? 1;
  const w = Math.min(Math.max(wear, min), max);

  const title =
    mode === "knife" ? "Нож" : mode === "glove" ? "Перчатки" : weapon?.n;

  const saveBtn = pick ? (
    <button
      type="button"
      className="btn primary sp-save"
      disabled={busy}
      onClick={() => onSave({ item, paint: pick.p, wear: pick.p ? w : 0.01, seed: pick.p ? seed : 0 })}
    >
      <Icon name="check" size={14} />
      <span>{busy ? "Сохраняем…" : "Надеть"}</span>
    </button>
  ) : null;

  return (
    <div className="veto-backdrop" onClick={onClose}>
      <div className="veto-modal skin-picker" onClick={(e) => e.stopPropagation()}>
        <div className="veto-modal-head">
          <h3>{title}</h3>
          {item && types ? (
            <button type="button" className="btn sm sp-back" onClick={() => setItem(null)}>
              <Icon name="arrowLeft" size={14} /> {mode === "knife" ? "другой нож" : "другие перчатки"}
            </button>
          ) : null}
          <button type="button" className="modal-close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="veto-modal-body">
          {!item && types ? (
            <div className="sp-grid">
              <button type="button" className="sp-tile plain" onClick={() => onSave({ item: null, paint: 0 })}>
                <span className="sp-none">
                  <Icon name="close" size={22} />
                </span>
                <b>{mode === "knife" ? "Стандартный нож" : "Стандартные"}</b>
                <span className="mono">как у всех</span>
              </button>
              {types.map((t) => (
                <button key={t.d} type="button" className="sp-tile" onClick={() => setItem(t)}>
                  <img src={skinImage(catalog, t.i)} alt="" loading="lazy" />
                  <b>{t.n}</b>
                  <span className="mono">{t.c} скинов</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="sp-search">
                <Icon name="search" size={15} />
                <input
                  type="text"
                  placeholder="Поиск по названию"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                {item && types ? <span className="mono">{item.n}</span> : null}
              </div>
              {!skins ? (
                <div className="sk-block">
                  {[92, 78, 64].map((x) => (
                    <span key={x} className="bone" style={{ width: `${x}%`, height: 14 }} />
                  ))}
                </div>
              ) : (
                <div className="sp-grid">
                  {shown.map((s) => (
                    <button
                      key={s.p}
                      type="button"
                      className={`sp-tile${pick?.p === s.p ? " active" : ""}`}
                      style={{ "--rarity": s.r }}
                      onClick={() => setPick(s)}
                    >
                      <img src={skinImage(catalog, s.i)} alt="" loading="lazy" />
                      <b>{s.p ? s.n : "Стандартный"}</b>
                    </button>
                  ))}
                  {!shown.length ? <p className="hint">Ничего не нашлось.</p> : null}
                </div>
              )}
            </>
          )}
        </div>

        {pick ? (
          <div className="veto-modal-foot sp-foot">
            <img src={skinImage(catalog, pick.i)} alt="" />
            <div className="sp-pick">
              <b style={{ color: pick.r }}>{pick.p ? pick.n : "Стандартный"}</b>
              {pick.p ? (
                <div className="sp-controls">
                  <label>
                    <span className="mono">
                      износ {w.toFixed(3)} · {wearOf(w).short}
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step="0.001"
                      value={w}
                      onChange={(e) => setWear(Number(e.target.value))}
                    />
                  </label>
                  <label className="sp-seed">
                    <span className="mono">паттерн</span>
                    <input
                      type="number"
                      min="0"
                      max="1000"
                      value={seed}
                      onChange={(e) => setSeed(Math.max(0, Math.min(1000, Number(e.target.value) || 0)))}
                    />
                  </label>
                  {saveBtn}
                </div>
              ) : null}
              {pick.p ? <span className="sp-wear-name">{wearOf(w).name}</span> : null}
            </div>
            {pick.p ? null : saveBtn}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function group(catalog, id) {
  return catalog.groups.find((g) => g.id === id)?.weapons || [];
}

export { WEARS };
