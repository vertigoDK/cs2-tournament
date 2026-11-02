#!/usr/bin/env python3
"""Консоль игрового сервера через вебсокет панели: история + живой поток.

    .venv/bin/python cs2-server/console.py --server 6a18910c [--seconds 60] [--grep текст]

Нужен пакет websockets (есть в .venv вместе с uvicorn).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time

import httpx
import websockets

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import altyn  # noqa: E402

ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


async def main(server: str, seconds: int, grep: str | None) -> None:
    key = altyn.env_read()["ALTYN_API_KEY"]
    r = httpx.get(f"https://panel.altyn.games/api/client/servers/{server}/websocket",
                  headers={"Authorization": f"Bearer {key}", "Accept": "application/json"})
    r.raise_for_status()
    d = r.json()["data"]
    async with websockets.connect(d["socket"], origin="https://panel.altyn.games", max_size=None) as ws:
        await ws.send(json.dumps({"event": "auth", "args": [d["token"]]}))
        end = time.time() + seconds
        sent_logs = False
        while time.time() < end:
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=max(1, end - time.time())))
            except asyncio.TimeoutError:
                break
            if msg["event"] == "auth success" and not sent_logs:
                await ws.send(json.dumps({"event": "send logs", "args": [None]}))
                sent_logs = True
            elif msg["event"] == "console output":
                for line in msg["args"]:
                    line = ANSI.sub("", line)
                    if not grep or any(g in line.lower() for g in grep.lower().split("|")):
                        print(time.strftime("%H:%M:%S"), line, flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--server", required=True)
    ap.add_argument("--seconds", type=int, default=8)
    ap.add_argument("--grep")
    a = ap.parse_args()
    asyncio.run(main(a.server, a.seconds, a.grep))
