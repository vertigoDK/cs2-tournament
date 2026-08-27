import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import bracket as B
from .. import schemas
from ..deps import get_current_user, get_db, require_admin
from ..models import Role, Tournament, TournamentStatus, User
from ..hydrate import hydrate_bracket
from ..store import save_bracket, sync_status

router = APIRouter(prefix="/api/tournaments", tags=["tournaments"])


def _to_utc_naive(value: dt.datetime) -> dt.datetime:
    """Normalize an incoming datetime to naive UTC for storage. The client always
    sends either a proper UTC-offset ISO string, or (already-UTC) naive values —
    either way we store naive UTC and treat every stored value as UTC."""
    if value.tzinfo is not None:
        value = value.astimezone(dt.timezone.utc).replace(tzinfo=None)
    return value


def _iso_utc(value: dt.datetime | None) -> str | None:
    return (value.isoformat() + "Z") if value else None


def _resolve_teams(db: Session, teams_in: list[schemas.TeamIn]) -> list[dict]:
    """Turn {player_a_id, player_b_id} pairs into bracket team dicts, validating
    that every participant exists and nobody is drafted onto two teams at once.

    Ники и цвета аватарок кладём в саму сетку снимком: турнир — это протокол,
    он не должен переписываться задним числом, если человек потом сменит ник.
    """
    used: set[int] = set()
    resolved = []
    for t in teams_in:
        if t.player_a_id == t.player_b_id:
            raise HTTPException(status_code=400, detail="Участник не может быть в паре сам с собой")
        for pid in (t.player_a_id, t.player_b_id):
            if pid in used:
                raise HTTPException(status_code=400, detail="Участник не может быть в двух командах одновременно")
            used.add(pid)
        pa = db.get(User, t.player_a_id)
        pb = db.get(User, t.player_b_id)
        if not pa or not pb or pa.role != Role.player or pb.role != Role.player:
            raise HTTPException(status_code=400, detail="Участник не найден — проверьте список участников")
        captain_id = t.captain_id or pa.id
        if captain_id not in (pa.id, pb.id):
            raise HTTPException(status_code=400, detail="Капитаном может быть только игрок этой команды")
        custom = (t.name or "").strip()
        resolved.append(
            {
                "a": pa.display_name,
                "b": pb.display_name,
                "player_a_id": pa.id,
                "player_b_id": pb.id,
                "a_color": pa.avatar_color,
                "b_color": pb.avatar_color,
                "a_avatar": pa.avatar_url,
                "b_avatar": pb.avatar_url,
                "captain_id": captain_id,
                "captain_name": pa.display_name if captain_id == pa.id else pb.display_name,
                # Пусто — команда называется «ник + ник» (см. bracket.team_name).
                "custom_name": custom or None,
                "logo_url": t.logo_url or None,
            }
        )
    return resolved


def _progress(bracket: dict) -> tuple[str | None, int, int]:
    """Текущая стадия и прогресс — чтобы в списке турниров было видно,
    на чём всё остановилось, без открытия сетки."""
    rounds = bracket.get("rounds") or []
    if not rounds:
        return None, 0, 0

    played = total = 0
    stage = None
    for r, round_ in enumerate(rounds):
        for m in round_:
            if m.get("bye"):
                continue  # проход без игры матчем не считается
            total += 1
            if m.get("win") is not None:
                played += 1
            elif stage is None and m["p"][0] is not None and m["p"][1] is not None:
                stage = B.round_label(r, len(rounds))
    if stage is None and played < total:
        # Все определённые матчи сыграны, следующий раунд ещё не собрался.
        for r, round_ in enumerate(rounds):
            if any(m.get("win") is None and not m.get("bye") for m in round_):
                stage = B.round_label(r, len(rounds))
                break
    return stage, played, total


def _summary(t: Tournament) -> schemas.TournamentSummary:
    bracket = t.bracket or {}
    stage, played, total = _progress(bracket)
    champ = B.champion(bracket) if bracket.get("rounds") else None
    return schemas.TournamentSummary(
        id=t.id, name=t.name, prize_pool=t.prize_pool, status=t.status.value,
        mode=t.mode, created_at=t.created_at.isoformat(),
        starts_at=_iso_utc(t.starts_at), started_at=_iso_utc(t.started_at),
        teams_count=len(bracket.get("teams", [])),
        stage=stage, matches_played=played, matches_total=total,
        champion=champ["name"] if champ else None,
    )


def _get_or_404(db: Session, tournament_id: int) -> Tournament:
    t = db.get(Tournament, tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="Турнир не найден")
    return t


def _to_out(t: Tournament, db: Session | None = None) -> schemas.TournamentOut:
    """Сетку отдаём с актуальными никами и аватарками участников."""
    return schemas.TournamentOut(
        **_summary(t).model_dump(),
        maps_pool=t.maps_pool,
        bracket=hydrate_bracket(db, t.bracket) if db is not None else t.bracket,
    )


@router.get("", response_model=list[schemas.TournamentSummary])
def list_tournaments(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.query(Tournament).order_by(Tournament.created_at.desc()).all()
    return [_summary(t) for t in rows]


@router.get("/{tournament_id}", response_model=schemas.TournamentOut)
def get_tournament(tournament_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _to_out(_get_or_404(db, tournament_id), db)


@router.post("", response_model=schemas.TournamentOut, status_code=201)
def create_tournament(payload: schemas.TournamentCreate, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if len(payload.teams) < 2:
        raise HTTPException(status_code=400, detail="Нужно минимум 2 команды")
    maps_pool = payload.maps_pool or None
    from ..models import DEFAULT_MAPS
    teams = _resolve_teams(db, payload.teams)
    bracket = B.build_bracket(teams, payload.mode, maps_pool or DEFAULT_MAPS, payload.best_of)
    t = Tournament(
        name=payload.name,
        prize_pool=payload.prize_pool,
        mode=payload.mode,
        maps_pool=maps_pool or DEFAULT_MAPS,
        bracket=bracket,
        created_by=user.id,
        starts_at=_to_utc_naive(payload.starts_at) if payload.starts_at else None,
    )
    sync_status(t)
    db.add(t)
    db.commit()
    db.refresh(t)
    return _to_out(t, db)


@router.patch("/{tournament_id}", response_model=schemas.TournamentOut)
def patch_tournament(tournament_id: int, payload: schemas.TournamentPatch, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = _get_or_404(db, tournament_id)
    if payload.name is not None:
        t.name = payload.name
    if payload.prize_pool is not None:
        t.prize_pool = payload.prize_pool
    if payload.status is not None:
        t.status = TournamentStatus(payload.status)
    if payload.clear_starts_at:
        t.starts_at = None
    elif payload.starts_at is not None:
        t.starts_at = _to_utc_naive(payload.starts_at)
    db.commit()
    db.refresh(t)
    return _to_out(t, db)


@router.post("/{tournament_id}/regenerate", response_model=schemas.TournamentOut)
def regenerate_tournament(tournament_id: int, payload: schemas.TournamentRegenerate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = _get_or_404(db, tournament_id)
    if len(payload.teams) < 2:
        raise HTTPException(status_code=400, detail="Нужно минимум 2 команды")
    from ..models import DEFAULT_MAPS
    maps_pool = payload.maps_pool or t.maps_pool or DEFAULT_MAPS
    teams = _resolve_teams(db, payload.teams)
    t.mode = payload.mode
    t.maps_pool = maps_pool
    save_bracket(db, t, B.build_bracket(teams, payload.mode, maps_pool, payload.best_of))
    return _to_out(t, db)


@router.post("/{tournament_id}/reset", response_model=schemas.TournamentOut)
def reset_tournament(tournament_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = _get_or_404(db, tournament_id)
    bracket = dict(t.bracket)
    B.reset_results(bracket)
    t.started_at = None
    save_bracket(db, t, bracket)
    return _to_out(t, db)


@router.post("/{tournament_id}/start", response_model=schemas.TournamentOut)
def start_tournament(tournament_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Запустить турнир, не дожидаясь объявленного времени.

    Обратный отсчёт останавливается, турнир переходит в статус «идёт».
    """
    t = _get_or_404(db, tournament_id)
    if t.status == TournamentStatus.finished:
        raise HTTPException(status_code=400, detail="Турнир уже завершён")
    if t.started_at is None:
        t.started_at = dt.datetime.utcnow()
    sync_status(t)
    db.commit()
    db.refresh(t)
    return _to_out(t, db)


@router.post("/{tournament_id}/unstart", response_model=schemas.TournamentOut)
def unstart_tournament(tournament_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Отменить преждевременный старт — вернуть обратный отсчёт."""
    t = _get_or_404(db, tournament_id)
    t.started_at = None
    sync_status(t)
    db.commit()
    db.refresh(t)
    return _to_out(t, db)


@router.delete("/{tournament_id}", status_code=204)
def delete_tournament(tournament_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = _get_or_404(db, tournament_id)
    db.delete(t)
    db.commit()
