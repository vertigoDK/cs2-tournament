// Каталог скинов — статика из scripts/build_skins_catalog.py: список оружия
// (catalog.json) и скины каждого оружия отдельным файлом (w/<defindex>.json).

let catalogPromise = null;
const weaponCache = new Map();

export function loadCatalog() {
  catalogPromise ||= fetch("/skins/catalog.json").then((r) => {
    if (!r.ok) throw new Error("Каталог скинов не загрузился");
    return r.json();
  });
  return catalogPromise;
}

export function loadWeaponSkins(defindex) {
  if (!weaponCache.has(defindex)) {
    weaponCache.set(
      defindex,
      fetch(`/skins/w/${defindex}.json`).then((r) => {
        if (!r.ok) throw new Error("Скины не загрузились");
        return r.json();
      })
    );
  }
  return weaponCache.get(defindex);
}

export const skinImage = (catalog, i) => (i ? (i.startsWith("http") ? i : catalog.img + i) : "");

// Состояние предмета по износу — как в игре.
export const WEARS = [
  { max: 0.07, name: "Прямо с завода", short: "FN" },
  { max: 0.15, name: "Немного поношенное", short: "MW" },
  { max: 0.38, name: "После полевых испытаний", short: "FT" },
  { max: 0.45, name: "Поношенное", short: "WW" },
  { max: 1, name: "Закалённое в боях", short: "BS" },
];

export const wearOf = (v) => WEARS.find((w) => v <= w.max) || WEARS[WEARS.length - 1];
