import { useState } from "react";
import { mapImage } from "../utils/maps.js";
import Icon from "./Icon.jsx";

// Плитка карты в драфте: иллюстрация сверху, название полосой снизу.
// Если обложки для карты нет, остаётся пустая «бумага» с названием, поэтому
// добавление новой карты в пул не ломает интерфейс.
export default function MapCard({ name, state, disabled, onClick }) {
  const [noImage, setNoImage] = useState(false);
  const src = mapImage(name);

  const label =
    state === "decider" ? "решающая" : state === "picked" ? "пик" : state === "banned" ? "бан" : null;

  return (
    <button
      type="button"
      className={`map-card${state ? ` ${state}` : ""}${noImage ? " no-image" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={name}
    >
      <span className="mc-art">
        {src && !noImage ? (
          <img src={src} alt="" loading="lazy" onError={() => setNoImage(true)} />
        ) : null}
        {label ? (
          <span className={`mc-tag ${state}`}>
            {state === "decider" ? <Icon name="star" size={11} filled /> : null}
            {state === "picked" ? <Icon name="check" size={11} /> : null}
            {label}
          </span>
        ) : null}
      </span>
      <span className="mc-name">{name}</span>
    </button>
  );
}
