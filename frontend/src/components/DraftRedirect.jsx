import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api.js";
import { onLive } from "../utils/live.js";

const POLL_MS = 6000;

// Капитан не должен искать свой матч в сетке: как только для него открыт
// драфт, его бросает прямо в пик/бан. Живёт в Layout, поэтому работает с
// любой страницы — и сразу после входа, и если драфт открыли, пока человек
// смотрел статистику.
export default function DraftRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  // На какой драфт уже перекидывали. Иначе закрыть модалку было бы нельзя:
  // следующий же опрос возвращал бы человека обратно.
  const lastKey = useRef(null);
  // Свежий путь нужен внутри интервала, но перезапускать опрос на каждый
  // переход не хочется — держим его в ref.
  const pathRef = useRef(location);
  pathRef.current = location;

  useEffect(() => {
    let alive = true;

    const tick = () => {
      if (document.hidden) return;
      api
        .get("/me/active-veto")
        .then(({ data }) => {
          if (!alive || !data) return;
          const key = `${data.tournament_id}-${data.round}-${data.index}`;
          if (lastKey.current === key) return;
          lastKey.current = key;
          navigate(`/tournaments/${data.tournament_id}?veto=${data.round}-${data.index}`, {
            replace: pathRef.current.pathname === `/tournaments/${data.tournament_id}`,
          });
        })
        .catch(() => {
          /* сеть моргнула — проверим на следующем тике */
        });
    };

    tick();
    const timer = setInterval(tick, POLL_MS);
    // Вкладку могли свернуть до начала драфта — проверяем при возвращении.
    document.addEventListener("visibilitychange", tick);
    // Админ открыл драфт — капитана перебрасывает сразу, а не через 6 секунд.
    const offLive = onLive("tournaments", tick);
    return () => {
      offLive();
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [navigate]);

  return null;
}
