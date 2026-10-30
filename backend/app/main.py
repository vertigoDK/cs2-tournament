from fastapi import FastAPI

from .database import SessionLocal, init_db
from .routers import auth, matches, me, stats, tournaments, uploads, users, veto
from .seed import seed_admin

app = FastAPI(title="CS2 Local Tournaments", version="0.3.0")


@app.on_event("startup")
def on_startup() -> None:
    init_db()  # создаёт недостающие таблицы
    db = SessionLocal()
    try:
        seed_admin(db)
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(me.router)
app.include_router(users.router)
app.include_router(uploads.router)
app.include_router(stats.router)
app.include_router(tournaments.router)
app.include_router(matches.router)
app.include_router(veto.router)
