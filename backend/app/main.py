from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .database import SessionLocal, engine, init_db
from .migrate import run_migrations
from .routers import auth, matches, me, stats, tournaments, uploads, users, veto
from .seed import seed_admin

settings = get_settings()

app = FastAPI(title="CS2 Local Tournaments", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()          # создаёт недостающие таблицы
    run_migrations(engine)  # доводит уже существующие до актуальной схемы
    db = SessionLocal()
    try:
        seed_admin(db)
    finally:
        db.close()


# Загруженные картинки отдаём статикой из того же тома, где лежит база.
_uploads = Path("data/uploads")
_uploads.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=_uploads), name="uploads")


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
