# CS2-сервер nine cup (Altyn)

Для меня, на случай если сервер удалён и создан заново. Пользователь удаляет его между играми,
чтобы не платить за простой (4.15 ₸/час), а выбор скинов живёт на сайте и от сервера не зависит.

## Что на сервере

- Панель: https://panel.altyn.games (Pterodactyl), продукт «CS2 Custom (Vanilla)», 4 ГБ, нода AST-1 (Астана).
  Яйцо само ставит CS2, Metamod и CounterStrikeSharp (INSTALL_CSS=1).
- Плагины: WeaponPaints (build-472) + MenuManagerCS2, PlayerSettingsCS2, AnyBaseLibCS2 — это выдача скинов.
  Наш `cs2-plugins/NineCupSkins` раз в 30 с (и при заходе игрока) забирает выбор с сайта
  (`GET /api/server/skins`, заголовок `X-Server-Key`) и пишет его в MySQL WeaponPaints, затем `wp_refresh`.
- `core.json`: `FollowCS2ServerGuidelines=false` — без этого WeaponPaints не работает. Риск: Valve может
  забанить GSLT (тогда на сервер не зайти, нужен новый токен на steamcommunity.com/dev/managegameservers).
- Плагин дуэлей `cs2-plugins/NineCup` собран, но НЕ ставится (пользователь отложил).

## Пересоздание с нуля (≈5 минут)

1. Пользователь создаёт сервер в панели и присылает: id (8 символов из URL панели),
   игровой адрес:порт. SSH/SFTP не нужны, всё идёт через API панели.
2. Если сервер, с которого брали снимок, жив — `altyn.py snapshot --server <старый>` (обновить `vendor/`).
   Каталог `cs2-server/vendor/` в git не лежит (сторонние бинарники, ~120 МБ), он только на ноутбуке.
   Если его нет — скачать вручную и положить как в «Состав vendor» ниже.
3. `.venv/bin/python cs2-server/altyn.py setup --server NEWID`
   - ставит переменные запуска (GSLT → STEAM_ACC, Steam Web API key → STEAM_API_KEY);
   - ждёт установки CounterStrikeSharp (сервер стартует сам);
   - создаёт/берёт MySQL-базу панели, обновляет `SKINS_DB_URL` в `.env`;
   - собирает и заливает NineCupSkins, WeaponPaints и зависимости, конфиги с реквизитами базы;
   - патчит `core.json`, перезапускает, делает `css_plugins list`.
   `--no-restart` — только залить файлы.
4. `altyn.py status --server NEWID` — состояние, плагины, хвост лога.
   `altyn.py command --server NEWID "wp_refresh <steamid>"` — команда в консоль.
5. Игроку: `connect адрес:порт`, `!ws` — подсказка, `!wp` — обновить скины.

Скрипт проверен 2026-11-02 на живом сервере (`--no-restart`, файлы те же) и на загрузке бинарников
туда-обратно. Полный путь «новый пустой сервер + рестарт» в деле ещё не проходил — если что-то
не сойдётся, смотреть консоль панели.

## Секреты (`.env`, в git не попадают)

ALTYN_API_KEY (панель → аккаунт → API), CS2_GSLT, STEAM_WEB_API_KEY, NINECUP_SERVER_KEY
(= HMAC от SECRET_KEY, отдаёт `GET /api/server/key` админу), SKINS_DB_URL (пишет скрипт).
Пароль и реквизиты базы никогда не коммитить.

## Плагины nine cup

- `NineCupLobby` — лобби с сайта: пускает участников, грузит карту и режим (`map`, а не `changelevel`:
  иначе режим wingman не включается; воркшоп-карты — `host_workshop_map`), статус ready/live/finished,
  ножевой раунд в wingman, `!ready` / `!switch` / `!stay`, админам (`NINECUP_ADMINS` в .env) — `!start`
  с ботами и `!stop`. Сторож кадров пишет в лог зависания > 50 мс (процессор, GC, последнее событие).
- `NineCupSkins` — мост сайт → база WeaponPaints; `css_ncdiag` — замер связи с базой и сайтом.
- `altyn.py deploy --server ID --only NineCupLobby` — залить один плагин, не трогая второй
  (перезапуск NineCupSkins заново выдаёт всем оружие с анимацией).
- `console.py --server ID --seconds N --grep "a|b"` — консоль сервера через вебсокет панели
  (нужен пакет websockets; в .venv его нет — запускать из отдельного venv).

## Грабли

- Панель режет частые запросы (429) — скрипт ждёт и повторяет, снимок идёт минуту-две.
- Upload: в signed-URL уже есть `?token=`, поэтому `&directory=` дописываем руками, не через `params`.
- Новые папки плагинов подхватываются только после `css_plugins load <Имя>` или рестарта.
- Пустой сервер «спит», таймеры плагинов стоят — поэтому NineCupSkins синхронизируется ещё и при заходе игрока.
- MySQL базы доступен только с самого игрового сервера (не с Vercel и не с ноутбука) — потому и нужен плагин-мост.
- Клиент на Mac, свёрнутый во время игры, ловит кик «overflow» (клиент перестаёт принимать пакеты) —
  это не сервер и не плагины.
- Запуск: режим 0/0, режим лобби ставит плагин. TV_ENABLE=0 и `+sv_hibernate_when_empty 0` ставит setup.
- WeaponPaints не сбрасывает нож/перчатки, если записи в базе нет, и `wp_refresh` переодевает раньше,
  чем дочитает базу (и молчит между раундами) — поэтому стандартные пишем явно, а после захода
  обновляем один раз через 5 с. `wp_refresh` проигрывает анимацию доставания — не вызывать по таймеру.
- Файл режима wingman ставит `bot_quota 1` — ботов для `!start` выравнивает сам плагин.
- 2026-11-02: зависания 1–2 с в начале раунда после частой смены карт; на одной карте — только 50–60 мс.

## Состав vendor (то, что снимает snapshot)

`plugins/{WeaponPaints,MenuManagerCore,PlayerSettings}`, `shared/{AnyBaseLib,MenuManagerApi,PlayerSettingsApi}`,
`configs/plugins/{WeaponPaints,MenuManagerCore,PlayerSettings}` (в WeaponPaints.json реквизиты базы
обнулены, подставляет setup) и `core.json`. Источники: GitHub Nereziel/cs2-WeaponPaints (release build-472),
NickFox007/MenuManagerCS2, NickFox007/PlayerSettingsCS2, NickFox007/AnyBaseLibCS2.
