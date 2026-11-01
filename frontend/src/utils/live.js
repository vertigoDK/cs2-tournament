// Мгновенные обновления: сервер шлёт в Pusher «турнир изменился», и страница
// сразу перечитывает данные, не дожидаясь очередного опроса. Опрос остаётся
// запасным вариантом — если Pusher не настроен или связь моргнула.
import api from "../api.js";

let clientPromise = null;

function client() {
  if (!clientPromise) {
    clientPromise = api
      .get("/live")
      .then(async ({ data }) => {
        if (!data?.key) return null;
        const { default: Pusher } = await import("pusher-js");
        return new Pusher(data.key, { cluster: data.cluster });
      })
      .catch(() => null);
  }
  return clientPromise;
}

// Подписка на канал: fn вызывается на каждое «updated». Возвращает отписку —
// её удобно вернуть из useEffect вместе с остальной уборкой.
export function onLive(channelName, fn) {
  let off = () => {};
  let cancelled = false;
  client().then((pusher) => {
    if (!pusher || cancelled) return;
    const channel = pusher.channel(channelName) || pusher.subscribe(channelName);
    const handler = () => fn();
    channel.bind("updated", handler);
    off = () => channel.unbind("updated", handler);
  });
  return () => {
    cancelled = true;
    off();
  };
}
