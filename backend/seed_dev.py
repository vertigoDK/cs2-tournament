"""Наполняет локальную базу тестовыми данными для разработки.

Всё создаётся через настоящее API от имени админа — сетки, драфты и
статистика получаются ровно такими, какими их делает сам сайт:

- 12 участников;
- два завершённых турнира (BO1 и BO3) с драфтами, счётом и K/D/A —
  чтобы была заполнена статистика;
- идущий турнир: часть матчей сыграна, в одном прямо сейчас идёт драфт;
- предстоящий турнир с обратным отсчётом.

Запуск из папки backend/:  python seed_dev.py

Работает только с локальной SQLite и только на пустой базе — боевую базу
этим скриптом не задеть.
"""

import datetime as dt
import random
import sys

from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app
from app.models import AVATAR_COLORS

NICKS = [
    "ikoshka", "faf", "Alice", "kefir", "vertigoDK", "Твой ночной кошмар",
    "patrick", "nikitos", "zeus_only", "molotov", "ArtemKa", "deagle_mom",
]
TEAM_NAMES = ["team_kto", "Кефирные", "Ночные совы", "AWP или бан", "Два стула", "Спидраннеры"]

# Wingman: играют до 9 раундов.
WIN_ROUNDS = 9

rng = random.Random(42)


def main() -> None:
    settings = get_settings()
    if not settings.database_url.startswith("sqlite"):
        sys.exit("Сид только для локальной SQLite — DATABASE_URL указывает не на неё.")

    with TestClient(app) as client:
        api = Api(client, settings.admin_username, settings.admin_password)
        if api.get("/api/tournaments"):
            sys.exit("В базе уже есть турниры — сид рассчитан на пустую базу.")

        players = [api.post("/api/users", {"display_name": nick}) for nick in NICKS]
        ids = [p["id"] for p in players]
        # Цвет аватарки каждый выбирает себе сам — заходим под каждым.
        for n, p in enumerate(players):
            Api(client, p["username"], p["password"]).patch("/api/me", {"avatar_color": AVATAR_COLORS[n % len(AVATAR_COLORS)]})
        print("Участники (логин / пароль):")
        for p in players:
            print(f"  {p['display_name']:<20} {p['username']:<16} {p['password']}")

        finished_bo1 = api.create("Осенний кубок", "5 000 ₸", ids[:8], best_of=1, days=-21)
        play_all(api, finished_bo1)

        finished_bo3 = api.create("Кубок кефира", "Ящик кефира", ids[4:12], best_of=3, days=-7, names=True)
        play_all(api, finished_bo3)

        live = api.create("Ноябрьский мейджор", "10 000 ₸", ids, best_of=3, days=0, names=True)
        play_live(api, live)

        api.create("Зимний турнир", "15 000 ₸", ids[:8], best_of=1, days=3, start=False)

        print("\nГотово: 4 турнира — 2 завершённых, 1 идёт, 1 предстоящий.")
        print(f"Админ: {settings.admin_username} / {settings.admin_password}")


class Api:
    def __init__(self, client: TestClient, username: str, password: str):
        self.client = client
        token = self._check(client.post("/api/auth/login", data={"username": username, "password": password}))
        self.headers = {"Authorization": f"Bearer {token['access_token']}"}

    @staticmethod
    def _check(response):
        if response.status_code >= 400:
            sys.exit(f"{response.request.method} {response.request.url} -> {response.status_code}: {response.text}")
        return response.json() if response.content else None

    def get(self, path):
        return self._check(self.client.get(path, headers=self.headers))

    def post(self, path, body=None):
        return self._check(self.client.post(path, json=body, headers=self.headers))

    def patch(self, path, body):
        return self._check(self.client.patch(path, json=body, headers=self.headers))

    def put(self, path, body):
        return self._check(self.client.put(path, json=body, headers=self.headers))

    def create(self, name, prize, player_ids, best_of, days, names=False, start=True):
        """Турнир из пар подряд: (1, 2), (3, 4), … Капитан — первый в паре."""
        teams = []
        for n, (a, b) in enumerate(zip(player_ids[::2], player_ids[1::2])):
            team = {"player_a_id": a, "player_b_id": b, "captain_id": a}
            if names:
                team["name"] = TEAM_NAMES[n % len(TEAM_NAMES)]
            teams.append(team)
        starts_at = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0) + dt.timedelta(days=days)
        t = self.post("/api/tournaments", {
            "name": name, "prize_pool": prize, "teams": teams,
            "best_of": best_of, "starts_at": starts_at.isoformat(),
        })
        if start:
            t = self.post(f"/api/tournaments/{t['id']}/start")
        return t


def play_all(api: Api, t: dict) -> None:
    rounds = len(t["bracket"]["rounds"])
    for r in range(rounds):
        t = api.get(f"/api/tournaments/{t['id']}")
        for i, match in enumerate(t["bracket"]["rounds"][r]):
            if playable(match):
                play_match(api, t["id"], r, i)


def play_live(api: Api, t: dict) -> None:
    """Первый раунд почти сыгран: последний матч — посреди драфта."""
    first = [i for i, m in enumerate(t["bracket"]["rounds"][0]) if playable(m)]
    for i in first[:-1]:
        play_match(api, t["id"], 0, i)
    last = first[-1]
    base = f"/api/tournaments/{t['id']}/matches/0/{last}"
    api.post(f"{base}/veto/start")
    for _ in range(2):
        veto_step(api, base)


def playable(match: dict) -> bool:
    return not match["bye"] and None not in match["p"] and match["win"] is None


def veto_step(api: Api, base: str) -> dict:
    tid = base.split("/")[3]
    r, i = (int(x) for x in base.split("/")[-2:])
    veto = api.get(f"/api/tournaments/{tid}")["bracket"]["rounds"][r][i]["veto"]
    return api.post(f"{base}/veto/choose", {"map": rng.choice(veto["remaining"])})


def play_match(api: Api, tid: int, r: int, i: int) -> None:
    base = f"/api/tournaments/{tid}/matches/{r}/{i}"
    api.post(f"{base}/veto/start")
    t = None
    while True:
        t = veto_step(api, base)
        if t["bracket"]["rounds"][r][i]["veto"]["status"] == "done":
            break

    bracket = t["bracket"]
    match = bracket["rounds"][r][i]
    teams = [bracket["teams"][idx] for idx in match["p"]]
    need = 2 if bracket["best_of"] == 3 else 1
    # Сильнее та команда, у которой выше «форма» — так у серий есть фаворит.
    favourite = rng.choice([0, 1])
    wins = [0, 0]
    for map_index in range(len(match["maps"])):
        if max(wins) >= need:
            break
        winner = favourite if rng.random() < 0.65 else 1 - favourite
        wins[winner] += 1
        rounds, stats = scoreboard(teams, winner)
        api.put(f"{base}/maps/{map_index}/stats", {"rounds": rounds, "stats": stats})


def scoreboard(teams: list[dict], winner: int) -> tuple[list[int], dict]:
    """Правдоподобный скорборд wingman: убийства одной команды = смерти другой."""
    loser_rounds = rng.randint(2, WIN_ROUNDS - 2)
    rounds = [0, 0]
    rounds[winner], rounds[1 - winner] = WIN_ROUNDS, loser_rounds
    total = WIN_ROUNDS + loser_rounds

    kills = []
    for side in (0, 1):
        edge = 1.15 if side == winner else 0.85
        kills.append([max(1, round(rng.uniform(0.45, 1.0) * total * edge)) for _ in range(2)])

    stats = {}
    for side in (0, 1):
        enemy_kills = sum(kills[1 - side])
        share = rng.uniform(0.35, 0.65)
        deaths = [round(enemy_kills * share), enemy_kills - round(enemy_kills * share)]
        team = teams[side]
        for n, pid in enumerate((team["player_a_id"], team["player_b_id"])):
            stats[str(pid)] = {"k": kills[side][n], "d": deaths[n], "a": rng.randint(0, 5)}
    return rounds, stats


if __name__ == "__main__":
    main()
