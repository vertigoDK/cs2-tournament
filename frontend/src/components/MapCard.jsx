import { useState } from "react";
import { mapImage } from "../utils/maps.js";
import Icon from "./Icon.jsx";

// Карточка карты в драфте: прямоугольная, с картинкой — как в про-сцене CS.
// Если картинки для карты нет, остаётся аккуратная подложка с названием,
// поэтому добавление новой карты в пул не ломает интерфейс.
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
      {src && !noImage ? (
        <img src={src} alt="" loading="lazy" onError={() => setNoImage(true)} />
      ) : null}

      <span className="mc-shade" />

      {label ? (
        <span className={`mc-tag ${state}`}>
          {state === "decider" ? <Icon name="star" size={11} filled /> : null}
          {state === "picked" ? <Icon name="check" size={11} /> : null}
          {label}
        </span>
      ) : null}

      <span className="mc-name">{name}</span>
    </button>
  );
}
