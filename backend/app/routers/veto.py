from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import bracket as B
from .. import schemas
from ..deps import get_current_user, get_db, require_admin
from ..models import Role, Tournament, TournamentStatus, User
from ..store import save_bracket

router = APIRouter(prefix="/api/tournaments/{tournament_id}/matches/{r}/{i}/veto", tags=["veto"])


def _get_tournament(db: Session, tournament_id: int) -> Tournament:
    t = db.get(Tournament, tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="Турнир не найден")
    return t


def _check_bounds(bracket: dict, r: int, i: int) -> None:
    if r < 0 or r >= len(bracket["rounds"]) or i < 0 or i >= len(bracket["rounds"][r]):
        raise HTTPException(status_code=404, detail="Матч не найден")


def _require_underway(t: Tournament) -> None:
    """Драфт карт — часть матча, а матчей до старта турнира не бывает."""
    if t.started_at is None and t.status == TournamentStatus.setup:
        raise HTTPException(status_code=400, detail="Пик/бан будет доступен после начала турнира")


def _team_captain_id(bracket: dict, team_idx: int | None) -> int | None:
    if team_idx is None:
        return None
    team = bracket["teams"][team_idx]
    # У сеток, созданных до появления капитанов, его нет — считаем первого игрока.
    return team.get("captain_id") or team.get("player_a_id")


def _require_can_choose(t: Tournament, bracket: dict, r: int, i: int, user: User) -> None:
    """Ход делает капитан команды, чья сейчас очередь. Админ может походить за
    любого — иногда капитан не в сети, и турнир не должен из-за этого встать."""
    if user.role == Role.admin:
        return
    match = bracket["rounds"][r][i]
    veto = match.get("veto") or {}
    turn = veto.get("turn")
    if turn is None:
        raise HTTPException(status_code=403, detail="Сейчас не ваш ход")

    captains = {_team_captain_id(bracket, idx) for idx in match["p"] if idx is not None}
    if user.id not in captains:
        raise HTTPException(status_code=403, detail="Карты выбирают капитаны команд")
    if _team_captain_id(bracket, match["p"][turn]) != user.id:
        raise HTTPException(status_code=403, detail="Сейчас ход соперника")


def _mutate(db: Session, tournament_id: int, r: int, i: int, action) -> Tournament:
    t = _get_tournament(db, tournament_id)
    bracket = dict(t.bracket)
    _check_bounds(bracket, r, i)
    try:
        action(bracket)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return save_bracket(db, t, bracket)


@router.post("/start", response_model=schemas.TournamentOut)
def start_veto(tournament_id: int, r: int, i: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Открывает драфт: дальше карты выбирают сами капитаны."""
    t = _get_tournament(db, tournament_id)
    _require_underway(t)
    t = _mutate(db, tournament_id, r, i, lambda br: B.veto_start(br, r, i))
    from .tournaments import _to_out
    return _to_out(t, db)


@router.post("/choose", response_model=schemas.TournamentOut)
def choose_map(
    tournament_id: int,
    r: int,
    i: int,
    payload: schemas.VetoChooseRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    t = _get_tournament(db, tournament_id)
    _require_underway(t)
    bracket = t.bracket
    _check_bounds(bracket, r, i)
    _require_can_choose(t, bracket, r, i, user)
    t = _mutate(db, tournament_id, r, i, lambda br: B.veto_choose(br, r, i, payload.map))
    from .tournaments import _to_out
    return _to_out(t, db)


@router.post("/reset", response_model=schemas.TournamentOut)
def reset_veto(tournament_id: int, r: int, i: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = _mutate(db, tournament_id, r, i, lambda br: B.veto_reset(br, r, i))
    from .tournaments import _to_out
    return _to_out(t, db)
