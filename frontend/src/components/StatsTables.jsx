import { useMemo, useState } from "react";
import Avatar from "./Avatar.jsx";
import { mapImage } from "../utils/maps.js";

// Одни и те же таблицы показывает страница «Статистика» (по всем турнирам)
// и карточка отдельного турнира — отличаются только данными.

// По какому столбцу сортировать таблицу игроков.
export const SORTS = [
  { id: "kills", label: "Килы", get: (p) => p.kills },
  { id: "kd", label: "K/D", get: (p) => p.kd },
  { id: "kpr", label: "Килов в раунде", get: (p) => p.kpr },
  { id: "map_wins", label: "Побед на картах", get: (p) => p.map_wins },
  { id: "titles", label: "Титулы", get: (p) => p.titles },
];

export function EmptyStats({ text }) {
  return (
    <div className="empty-state">
      <b>Данных пока нет</b>
      <span>{text || "Статистика появится, когда админ внесёт результаты сыгранных карт."}</span>
    </div>
  );
}

export function PlayersTable({ players, showTitles = true }) {
  const [sort, setSort] = useState("kills");

  const rows = useMemo(() => {
    const cmp = SORTS.find((s) => s.id === sort) || SORTS[0];
    return [...players].sort(
      (a, b) => cmp.get(b) - cmp.get(a) || a.display_name.localeCompare(b.display_name)
    );
  }, [players, sort]);

  const sorts = showTitles ? SORTS : SORTS.filter((s) => s.id !== "titles");

  return (
    <>
      <div className="sort-bar">
        <span>Сортировка</span>
        {sorts.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip${sort === s.id ? " active" : ""}`}
            onClick={() => setSort(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="panel table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Игрок</th>
              <th>Карт</th>
              <th>K</th>
              <th>D</th>
              <th>A</th>
              <th>K/D</th>
              <th title="Килов в раунде">KPR</th>
              <th>Карты W-L</th>
              {showTitles ? <th>Титулы</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((p, idx) => (
              <tr key={p.id}>
                <td className="dt-player">
                  <span className="dt-rank">{idx + 1}</span>
                  <Avatar name={p.display_name} color={p.avatar_color} url={p.avatar_url} size={26} />
                  <span className="dt-name">{p.display_name}</span>
                </td>
                <td>{p.maps}</td>
                <td>{p.kills}</td>
                <td>{p.deaths}</td>
                <td>{p.assists}</td>
                <td className="num strong">{p.kd.toFixed(2)}</td>
                <td className="num">{p.kpr.toFixed(2)}</td>
                <td>
                  {p.map_wins}–{p.map_losses}
                </td>
                {showTitles ? <td>{p.titles || "—"}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function MapsGrid({ maps }) {
  return (
    <div className="map-stat-grid">
      {maps.map((m) => (
        <MapStatCard key={m.map} stat={m} />
      ))}
    </div>
  );
}

function MapStatCard({ stat }) {
  const [noImage, setNoImage] = useState(false);
  const src = mapImage(stat.map);
  return (
    <div className="map-stat">
      <div className="ms-image">
        {src && !noImage ? <img src={src} alt="" onError={() => setNoImage(true)} /> : null}
        <span className="mc-shade" />
        <span className="mc-name">{stat.map}</span>
      </div>
      <div className="ms-rows">
        <span>
          <b>{stat.played}</b> сыграна
        </span>
        <span className="pick">
          <b>{stat.picked}</b> пиков
        </span>
        <span className="ban">
          <b>{stat.banned}</b> банов
        </span>
      </div>
    </div>
  );
}
