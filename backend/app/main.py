from fastapi import FastAPI

from .database import SessionLocal
from . import live
from .migrations import upgrade_db
from .routers import auth, game_server, matches, me, players, stats, steam_auth, tournaments, uploads, users, veto
from .seed import seed_admin

app = FastAPI(title="CS2 Local Tournaments", version="0.3.0")

# Сигналы «турнир изменился» в Pusher после каждого коммита (см. live.py).
live.install(SessionLocal)


@app.on_event("startup")
def on_startup() -> None:
    upgrade_db()  # доводит схему базы до последней миграции
    db = SessionLocal()
    try:
        seed_admin(db)
    finally:
        db.close()


@app.get("/api/live")
def live_config():
    """Публичный ключ Pusher для браузера; пусто — живых обновлений нет, только опрос."""
    if not live.enabled():
        return {}
    return {"key": live.settings.pusher_key, "cluster": live.settings.pusher_cluster}


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(steam_auth.router)
app.include_router(me.router)
app.include_router(users.router)
app.include_router(uploads.router)
app.include_router(stats.router)
app.include_router(players.router)
app.include_router(game_server.router)
app.include_router(tournaments.router)
app.include_router(matches.router)
app.include_router(veto.router)
