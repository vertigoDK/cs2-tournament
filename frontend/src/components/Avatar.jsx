import { useState } from "react";

export const AVATAR_COLORS = ["sand", "sky", "moss", "clay", "plum", "steel", "amber", "rose"];

export const COLOR_LABELS = {
  sand: "Песок",
  sky: "Небо",
  moss: "Мох",
  clay: "Глина",
  plum: "Слива",
  steel: "Сталь",
  amber: "Янтарь",
  rose: "Роза",
};

const initial = (name) => (name || "").trim().charAt(0).toUpperCase() || "?";

export default function Avatar({ name, color = "sand", url, size }) {
  // Если картинка не открылась (файл удалили, сеть отвалилась) — молча
  // возвращаемся к инициалу, а не показываем битую иконку.
  const [broken, setBroken] = useState(false);
  const style = size ? { width: size, height: size, fontSize: Math.round(size * 0.42) } : undefined;

  if (url && !broken) {
    return (
      <span className="ava has-image" style={style} title={name}>
        <img src={url} alt="" onError={() => setBroken(true)} />
      </span>
    );
  }

  return (
    <span className="ava" data-color={color} style={style} title={name}>
      {initial(name)}
    </span>
  );
}
