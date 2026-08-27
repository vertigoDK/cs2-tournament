from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import bracket as B
from .. import schemas
from ..deps import get_db, require_admin
from ..models import Tournament, User
from ..store import save_bracket

router = APIRouter(prefix="/api/tournaments/{tournament_id}/matches", tags=["matches"])


def _get_tournament(db: Session, tournament_id: int) -> Tournament:
    t = db.get(Tournament, tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="Турнир не найден")
    return t


def _check_bounds(bracket: dict, r: int, i: int) -> None:
    if r < 0 or r >= len(bracket["rounds"]) or i < 0 or i >= len(bracket["rounds"][r]):
        raise HTTPException(status_code=404, detail="Матч не найден")


@router.post("/{r}/{i}/maps/{map_index}/winner", response_model=schemas.TournamentOut)
def set_map_winner(
    tournament_id: int,
    r: int,
    i: int,
    map_index: int,
    payload: schemas.MapWinnerRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Победитель отдельной карты серии. Итог матча пересчитывается сам."""
    t = _get_tournament(db, tournament_id)
    bracket = dict(t.bracket)
    _check_bounds(bracket, r, i)
    try:
        B.set_map_winner(bracket, r, i, map_index, payload.slot)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_bracket(db, t, bracket)
    from .tournaments import _to_out
    return _to_out(t, db)


@router.put("/{r}/{i}/maps/{map_index}/stats", response_model=schemas.TournamentOut)
def set_map_stats(
    tournament_id: int,
    r: int,
    i: int,
    map_index: int,
    payload: schemas.MapStatsRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Перенос скорборда карты: счёт по раундам и K/D/A каждого игрока."""
    t = _get_tournament(db, tournament_id)
    bracket = dict(t.bracket)
    _check_bounds(bracket, r, i)
    stats = {k: v.model_dump() for k, v in payload.stats.items()} if payload.stats is not None else None
    try:
        B.set_map_stats(bracket, r, i, map_index, payload.rounds, stats)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_bracket(db, t, bracket)
    from .tournaments import _to_out
    return _to_out(t, db)


@router.post("/{r}/{i}/pick", response_model=schemas.TournamentOut)
def pick_winner(tournament_id: int, r: int, i: int, payload: schemas.PickRequest, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = _get_tournament(db, tournament_id)
    bracket = dict(t.bracket)
    _check_bounds(bracket, r, i)
    try:
        B.pick_winner(bracket, r, i, payload.slot)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_bracket(db, t, bracket)
    from .tournaments import _to_out
    return _to_out(t, db)
