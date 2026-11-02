# nine cup — плагин для нашего CS2-сервера

CounterStrikeSharp 1.0.379 (.NET 10). Связывает сервер с сайтом через
`/api/server/*` (backend/app/routers/game_server.py).

Что делает:
- пускает только участников турнира (по Steam ID с сайта) и `ExtraAllowed`;
- проводит дуэли 1×1 на aim_map_s2: до 13, овертаймы, без заморозки;
- после дуэли отправляет счёт на сайт, пишет в чат итог и следующую пару.

Команды в чате: `!ready`, `!unready`, `!duel` (текущая пара и места);
админам (`Admins`): `!start` — без !ready, `!stop` — отменить дуэль.

Сборка и выкладка:

```sh
dotnet build -c Release
# bin/Release/net10.0/NineCup.dll → game/csgo/addons/counterstrikesharp/plugins/NineCup/
```

Конфиг: `game/csgo/addons/counterstrikesharp/configs/plugins/NineCup/NineCup.json`.
`ServerKey` — с сайта (админ: GET /api/server/key). В репозиторий не кладём.
