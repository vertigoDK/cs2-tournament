#!/usr/bin/env python3
"""Наш CS2-сервер на Altyn (Pterodactyl): снимок плагинов, установка с нуля, проверка.

    .venv/bin/python cs2-server/altyn.py snapshot --server 6a18910c
    .venv/bin/python cs2-server/altyn.py setup    --server NEWID [--no-restart]
    .venv/bin/python cs2-server/altyn.py deploy   --server ID      # только наши плагины (быстро)
    .venv/bin/python cs2-server/altyn.py status   --server NEWID
    .venv/bin/python cs2-server/altyn.py command  --server NEWID "css_plugins list"

Всё идёт через API панели (ключ ALTYN_API_KEY из .env): ни SFTP, ни SSH не нужны.
Подробности и грабли — в cs2-server/README.md.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote

import httpx

ROOT = Path(__file__).resolve().parent.parent
ENV = ROOT / ".env"
VENDOR = ROOT / "cs2-server" / "vendor"
CSS = "/game/csgo/addons/counterstrikesharp"
SITE = "https://cs2-tournament-virid.vercel.app"

# Что снимаем с рабочего сервера и потом ставим на новый (пути внутри counterstrikesharp/).
VENDOR_DIRS = [
    "plugins/WeaponPaints", "plugins/MenuManagerCore", "plugins/PlayerSettings",
    "shared/AnyBaseLib", "shared/MenuManagerApi", "shared/PlayerSettingsApi",
    "configs/plugins/WeaponPaints", "configs/plugins/MenuManagerCore", "configs/plugins/PlayerSettings",
]
SKIP = (".pdb", ".sqlite")


# ───────── .env ─────────
def env_read() -> dict[str, str]:
    out = {}
    for line in ENV.read_text().splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line)
        if m:
            out[m[1]] = m[2]
    return out


def env_set(key: str, value: str) -> None:
    text = ENV.read_text()
    if re.search(rf"^{key}=", text, re.M):
        text = re.sub(rf"^{key}=.*$", lambda _: f"{key}={value}", text, flags=re.M)
    else:
        text = text.rstrip("\n") + f"\n{key}={value}\n"
    ENV.write_text(text)


# ───────── панель ─────────
class Panel:
    def __init__(self, key: str, server: str):
        self.base = f"https://panel.altyn.games/api/client/servers/{server}"
        self.http = httpx.Client(
            headers={"Authorization": f"Bearer {key}", "Accept": "application/json"}, timeout=120
        )

    def call(self, method: str, path: str, ok=(200, 201, 202, 204), **kw) -> httpx.Response:
        for _ in range(8):
            r = self.http.request(method, self.base + path, **kw)
            if r.status_code != 429:  # панель режет частые запросы — ждём и повторяем
                break
            time.sleep(float(r.headers.get("Retry-After", 15)) + 1)
        if r.status_code not in ok:
            raise SystemExit(f"{method} {path} → {r.status_code}: {r.text[:300]}")
        return r

    # состояние
    def state(self) -> str:
        return self.call("GET", "/resources").json()["attributes"]["current_state"]

    def power(self, signal: str) -> None:
        self.call("POST", "/power", json={"signal": signal})

    def wait_state(self, want: str, timeout: int = 300) -> None:
        end = time.time() + timeout
        while time.time() < end:
            if self.state() == want:
                return
            time.sleep(4)
        raise SystemExit(f"сервер не стал {want} за {timeout} с")

    def command(self, cmd: str) -> None:
        self.call("POST", "/command", json={"command": cmd})

    # файлы
    def ls(self, directory: str) -> list[dict]:
        r = self.call("GET", "/files/list", params={"directory": directory}, ok=(200, 404, 500))
        return [x["attributes"] for x in r.json().get("data", [])] if r.status_code == 200 else []

    def read(self, path: str) -> bytes:
        return self.call("GET", "/files/contents", params={"file": path}).content

    def mkdir(self, path: str) -> None:
        parent, _, name = path.rstrip("/").rpartition("/")
        self.call("POST", "/files/create-folder", json={"root": parent or "/", "name": name}, ok=(200, 204, 400, 422, 500))

    def upload(self, directory: str, files: dict[str, bytes]) -> None:
        if not files:
            return
        url = self.call("GET", "/files/upload").json()["attributes"]["url"]
        # В url уже есть ?token=…, поэтому directory дописываем, а не передаём params.
        r = httpx.post(
            f"{url}&directory={quote(directory)}", timeout=300,
            files=[("files", (n, b)) for n, b in files.items()],
        )
        if r.status_code >= 300:
            raise SystemExit(f"upload в {directory} → {r.status_code}: {r.text[:200]}")

    def walk(self, directory: str):
        for it in self.ls(directory):
            full = f"{directory}/{it['name']}"
            if it["is_file"]:
                yield full
            else:
                yield from self.walk(full)

    def put_tree(self, remote_dir: str, files: dict[str, bytes]) -> None:
        """files: относительный путь → содержимое; недостающие папки создаём."""
        by_dir: dict[str, dict[str, bytes]] = {}
        for rel, data in files.items():
            d, _, name = rel.rpartition("/")
            by_dir.setdefault(f"{remote_dir}/{d}".rstrip("/"), {})[name] = data
        for d in sorted(by_dir, key=len):
            parts = d[len(CSS):].strip("/").split("/") if d.startswith(CSS) else []
            cur = CSS
            for p in parts:
                cur += "/" + p
                self.mkdir(cur)
            self.upload(d, by_dir[d])


def make_panel(server: str) -> Panel:
    key = env_read().get("ALTYN_API_KEY")
    if not key:
        raise SystemExit("В .env нет ALTYN_API_KEY")
    return Panel(key, server)


# ───────── команды ─────────
def cmd_snapshot(a) -> None:
    p = make_panel(a.server)
    n = 0
    for d in VENDOR_DIRS:
        for full in p.walk(f"{CSS}/{d}"):
            if full.endswith(SKIP):
                continue
            rel = full[len(CSS) + 1:]
            data = p.read(full)
            if rel == "configs/plugins/WeaponPaints/WeaponPaints.json":
                conf = json.loads(data)
                conf.update(DatabaseHost="", DatabasePort=3306, DatabaseUser="", DatabasePassword="", DatabaseName="")
                data = json.dumps(conf, indent=2).encode()
            dest = VENDOR / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            n += 1
    core = json.loads(p.read(f"{CSS}/configs/core.json"))
    (VENDOR / "core.json").write_text(json.dumps(core, indent=4))
    print(f"Снято файлов: {n} → {VENDOR}")


def database(p: Panel, env: dict[str, str]) -> dict:
    """Своя MySQL-база сервера для WeaponPaints: создаём или берём существующую."""
    dbs = p.call("GET", "/databases", params={"include": "password"}).json()["data"]
    if dbs:
        a = dbs[0]["attributes"]
        # Пароль виден только в include=password; на всякий случай берём его оттуда.
        pw = a["relationships"]["password"]["attributes"]["password"]
    else:
        r = p.call("POST", "/databases", params={"include": "password"}, json={"database": "skins", "remote": "%"})
        a = r.json()["attributes"]
        pw = a["relationships"]["password"]["attributes"]["password"]
    host = a["host"]
    return {"host": host["address"], "port": host["port"], "user": a["username"], "password": pw, "name": a["name"]}


def build_plugin(name: str) -> dict[str, bytes]:
    proj = ROOT / "cs2-plugins" / name
    subprocess.run(["dotnet", "build", "-c", "Release", str(proj)], check=True, stdout=subprocess.DEVNULL)
    out = proj / "bin" / "Release" / "net10.0"
    return {
        f.name: f.read_bytes()
        for f in out.iterdir()
        if f.is_file() and not f.name.endswith(".pdb") and not f.name.startswith("CounterStrikeSharp")
    }


def our_plugins(env: dict[str, str], db: dict) -> dict[str, bytes]:
    """Наши плагины (NineCupSkins, NineCupLobby) и их конфиги — относительные пути внутри counterstrikesharp/."""
    files: dict[str, bytes] = {}
    for plugin in ("NineCupSkins", "NineCupLobby"):
        for name, data in build_plugin(plugin).items():
            files[f"plugins/{plugin}/{name}"] = data
    files["configs/plugins/NineCupSkins/NineCupSkins.json"] = json.dumps({
        "SiteUrl": SITE, "ServerKey": env["NINECUP_SERVER_KEY"],
        "DatabaseHost": db["host"], "DatabasePort": db["port"], "DatabaseUser": db["user"],
        "DatabasePassword": db["password"], "DatabaseName": db["name"], "RefreshSeconds": 30,
    }, indent=2).encode()
    files["configs/plugins/NineCupLobby/NineCupLobby.json"] = json.dumps({
        "SiteUrl": SITE, "ServerKey": env["NINECUP_SERVER_KEY"], "RefreshSeconds": 15, "KickStrangers": True,
    }, indent=2).encode()
    return files


def cmd_setup(a) -> None:
    env = env_read()
    for k in ("CS2_GSLT", "STEAM_WEB_API_KEY", "NINECUP_SERVER_KEY"):
        if not env.get(k):
            raise SystemExit(f"В .env нет {k}")
    if not (VENDOR / "plugins" / "WeaponPaints" / "WeaponPaints.dll").exists():
        raise SystemExit("Нет cs2-server/vendor — сначала снимок: altyn.py snapshot --server <рабочий>, "
                         "или скачай плагины по README.")
    p = make_panel(a.server)

    print("1/6 переменные запуска")
    for k, v in {"STEAM_ACC": env["CS2_GSLT"], "STEAM_API_KEY": env["STEAM_WEB_API_KEY"],
                 "INSTALL_CSS": "1", "INSTALL_METAMOD": "0", "SERVER_MODE": "vanilla"}.items():
        p.call("PUT", "/startup/variable", json={"key": k, "value": v}, ok=(200, 204, 422))

    print("2/6 ждём, пока установится CounterStrikeSharp")
    if p.state() == "offline":
        p.power("start")
    end = time.time() + 600
    while time.time() < end and not any(i["name"] == "plugins" for i in p.ls(CSS)):
        time.sleep(8)
    if not any(i["name"] == "plugins" for i in p.ls(CSS)):
        raise SystemExit("CounterStrikeSharp не появился за 10 минут — смотри консоль в панели")

    print("3/6 база данных")
    db = database(p, env)
    env_set("SKINS_DB_URL", f"mysql://{db['user']}:{db['password']}@{db['host']}:{db['port']}/{db['name']}")

    print("4/6 плагины")
    files = {str(f.relative_to(VENDOR)): f.read_bytes() for f in VENDOR.rglob("*") if f.is_file() and f.name != "core.json"}
    wp = json.loads(files["configs/plugins/WeaponPaints/WeaponPaints.json"])
    wp.update(DatabaseHost=db["host"], DatabasePort=db["port"], DatabaseUser=db["user"],
              DatabasePassword=db["password"], DatabaseName=db["name"])
    files["configs/plugins/WeaponPaints/WeaponPaints.json"] = json.dumps(wp, indent=2).encode()
    files.update(our_plugins(env, db))
    p.put_tree(CSS, files)

    print("5/6 core.json (FollowCS2ServerGuidelines=false — нужно WeaponPaints)")
    core = json.loads((VENDOR / "core.json").read_text())
    core["FollowCS2ServerGuidelines"] = False
    p.upload(f"{CSS}/configs", {"core.json": json.dumps(core, indent=4).encode()})

    if a.no_restart:
        print("6/6 перезапуск пропущен (--no-restart): новые плагины заработают после рестарта")
        return
    print("6/6 перезапуск")
    p.power("restart")
    time.sleep(10)
    p.wait_state("running")
    time.sleep(60)
    p.command("css_plugins list")
    print("Готово. Проверь в консоли панели: должны быть NineCupSkins, WeaponPaints, MenuManager, PlayerSettings.")
    print("Заходи по адресу из панели; выбор скинов подтянется с сайта сам (≤30 с).")


def cmd_deploy(a) -> None:
    """Пересобрать и залить только наши плагины; новые папки подхватываем командой load."""
    env = env_read()
    p = make_panel(a.server)
    db = database(p, env)
    have = {i["name"] for i in p.ls(f"{CSS}/plugins")}
    p.put_tree(CSS, our_plugins(env, db))
    for plugin in ("NineCupSkins", "NineCupLobby"):
        # Уже загруженный плагин перезагружается сам (hot reload), новый — только по команде.
        if plugin not in have:
            p.command(f"css_plugins load {plugin}")
    print("Готово. Логи: status --server", a.server)


def cmd_status(a) -> None:
    p = make_panel(a.server)
    res = p.call("GET", "/resources").json()["attributes"]
    print("состояние:", res["current_state"], "| память МБ:", res["resources"]["memory_bytes"] // 2**20)
    plugins = [i["name"] for i in p.ls(f"{CSS}/plugins") if not i["is_file"]]
    print("плагины:", ", ".join(plugins) or "—")
    cfg = p.read(f"{CSS}/configs/core.json")
    print("FollowCS2ServerGuidelines:", json.loads(cfg).get("FollowCS2ServerGuidelines"))
    logs = sorted(i["name"] for i in p.ls(f"{CSS}/logs") if i["name"].startswith("log-all"))
    if logs:
        tail = p.read(f"{CSS}/logs/{logs[-1]}").decode(errors="replace").splitlines()[-8:]
        print("лог:\n  " + "\n  ".join(t[:200] for t in tail))


def cmd_command(a) -> None:
    make_panel(a.server).command(a.text)
    print("отправлено")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name, fn in (("snapshot", cmd_snapshot), ("setup", cmd_setup), ("deploy", cmd_deploy), ("status", cmd_status), ("command", cmd_command)):
        s = sub.add_parser(name)
        s.add_argument("--server", required=True, help="идентификатор сервера (8 символов из ссылки панели)")
        if name == "setup":
            s.add_argument("--no-restart", action="store_true")
        if name == "command":
            s.add_argument("text")
        s.set_defaults(fn=fn)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
