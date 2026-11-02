import datetime as dt
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import bracket as B
from .. import rewards as R
from .. import schemas
from ..deps import get_db, require_admin
from ..models import Role, Tournament, TournamentStatus, User
from ..hydrate import hydrate_bracket
from ..store import save_bracket, sync_status, tick_vetoes

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


def _clean_pool(maps_pool: list[str], best_of: int) -> list[str]:
    try:
        return B.clean_pool(maps_pool, best_of)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _get_or_404(db: Session, tournament_id: int) -> Tournament:
    t = db.get(Tournament, tournament_id)
    if not t:
        raise HTTPException(status_code=404, detail="Турнир не найден")
    return t


def _number(t: Tournament, db: Session | None) -> int:
    """Порядковый номер турнира среди всех — по времени создания."""
    if db is None:
        return 0
    earlier = db.query(Tournament).filter(
        (Tournament.created_at < t.created_at) | ((Tournament.created_at == t.created_at) & (Tournament.id < t.id))
    ).count()
    return earlier + 1


def _to_out(t: Tournament, db: Session | None = None) -> schemas.TournamentOut:
    """Сетку отдаём с актуальными никами и аватарками участников."""
    return schemas.TournamentOut(
        **_summary(t).model_dump(exclude={"mvp", "number"}),
        number=_number(t, db),
        rewards=R.team_rewards(t.bracket or {}),
        maps_pool=t.maps_pool,
        bracket=hydrate_bracket(db, t.bracket) if db is not None else t.bracket,
        server_time=time.time(),
        mvp=_mvp(t, db),
        server_lobbies=_server_lobbies(t, db),
    )


def _server_lobbies(t: Tournament, db: Session | None) -> list[dict]:
    if db is None or not (t.bracket or {}).get("server"):
        return []
    from ..models import Lobby

    rows = (
        db.query(Lobby)
        .filter(Lobby.tournament_id == t.id, Lobby.status.in_(("waiting", "ready", "live")))
        .order_by(Lobby.id)
        .all()
    )
    return [{"id": lo.id, "kind": lo.kind, "ref": lo.ref, "status": lo.status, "label": lo.label} for lo in rows]


def _mvp(t: Tournament, db: Session | None) -> schemas.MvpOut | None:
    """MVP показываем только у завершённого турнира — посреди турнира лидер
    ещё может смениться."""
    if db is None or t.status != TournamentStatus.finished:
        return None
    best = B.tournament_mvp(t.bracket or {})
    user = db.get(User, best["player_id"]) if best else None
    if not user:
        return None
    return schemas.MvpOut(
        display_name=user.display_name, avatar_color=user.avatar_color, avatar_url=user.avatar_url, **best
    )


@router.get("", response_model=list[schemas.TournamentSummary])
def list_tournaments(db: Session = Depends(get_db)):
    """Смотреть турниры можно без входа — вход нужен, только чтобы что-то менять."""
    rows = db.query(Tournament).order_by(Tournament.created_at.desc(), Tournament.id.desc()).all()
    return [
        _summary(t).model_copy(update={"mvp": _mvp(t, db), "number": len(rows) - i}) for i, t in enumerate(rows)
    ]


@router.get("/{tournament_id}", response_model=schemas.TournamentOut)
def get_tournament(tournament_id: int, db: Session = Depends(get_db)):
    # Страницу турнира опрашивают раз в пару секунд — заодно доигрываем ходы
    # драфта, у которых вышло время.
    return _to_out(tick_vetoes(db, _get_or_404(db, tournament_id)), db)


@router.post("", response_model=schemas.TournamentOut, status_code=201)
def create_tournament(payload: schemas.TournamentCreate, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if len(payload.teams) < 2:
        raise HTTPException(status_code=400, detail="Нужно минимум 2 команды")
    maps_pool = payload.maps_pool or None
    from ..models import DEFAULT_MAPS
    teams = _resolve_teams(db, payload.teams)
    final_bo = payload.final_best_of or payload.best_of
    maps_pool = _clean_pool(maps_pool or DEFAULT_MAPS, max(payload.best_of, final_bo))
    bracket = B.build_bracket(teams, payload.mode, maps_pool, payload.best_of, final_bo, payload.veto_time)
    t = Tournament(
        name=payload.name,
        prize_pool=payload.prize_pool,
        mode=payload.mode,
        maps_pool=maps_pool,
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
    if payload.veto_time is not None:
        bracket = dict(t.bracket)
        bracket["veto_time"] = payload.veto_time
        save_bracket(db, t, bracket)
    db.commit()
    db.refresh(t)
    return _to_out(t, db)


@router.post("/{tournament_id}/regenerate", response_model=schemas.TournamentOut)
def regenerate_tournament(tournament_id: int, payload: schemas.TournamentRegenerate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = _get_or_404(db, tournament_id)
    if len(payload.teams) < 2:
        raise HTTPException(status_code=400, detail="Нужно минимум 2 команды")
    from ..models import DEFAULT_MAPS
    final_bo = payload.final_best_of or payload.best_of
    maps_pool = _clean_pool(payload.maps_pool or t.maps_pool or DEFAULT_MAPS, max(payload.best_of, final_bo))
    teams = _resolve_teams(db, payload.teams)
    t.mode = payload.mode
    t.maps_pool = maps_pool
    save_bracket(
        db, t, B.build_bracket(teams, payload.mode, maps_pool, payload.best_of, final_bo, payload.veto_time)
    )
    return _to_out(t, db)


@router.post("/{tournament_id}/qualifier", response_model=schemas.TournamentOut)
def create_qualifier(tournament_id: int, payload: schemas.QualifierCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Отборочные дуэли 1×1. Существующие заменяются целиком."""
    t = _get_or_404(db, tournament_id)
    known = {u.id for u in db.query(User).filter(User.id.in_(payload.player_ids)).all()}
    if missing := [pid for pid in payload.player_ids if pid not in known]:
        raise HTTPException(status_code=400, detail=f"Неизвестные участники: {missing}")
    bracket = dict(t.bracket)
    try:
        bracket["qualifier"] = B.build_qualifier(
            payload.player_ids, payload.mode, payload.map, payload.note, places=payload.places
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_bracket(db, t, bracket)
    return _to_out(t, db)


@router.put("/{tournament_id}/qualifier/{r}/{i}", response_model=schemas.TournamentOut)
def set_duel(
    tournament_id: int,
    r: int,
    i: int,
    payload: schemas.DuelResult,
    g: int = -1,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """g — сетка: -1 основная, иначе номер утешительной (за места)."""
    t = _get_or_404(db, tournament_id)
    bracket = dict(t.bracket)
    if not bracket.get("qualifier"):
        raise HTTPException(status_code=404, detail="У турнира нет дуэлей")
    try:
        B.qualifier_set_result(bracket["qualifier"], r, i, payload.score, payload.win, g)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_bracket(db, t, bracket)
    return _to_out(t, db)


@router.post("/{tournament_id}/qualifier/places", response_model=schemas.TournamentOut)
def add_qualifier_places(tournament_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Игры за места к уже созданным дуэлям, не стирая результатов."""
    t = _get_or_404(db, tournament_id)
    bracket = dict(t.bracket)
    if not bracket.get("qualifier"):
        raise HTTPException(status_code=404, detail="У турнира нет дуэлей")
    try:
        B.qualifier_add_places(bracket["qualifier"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_bracket(db, t, bracket)
    return _to_out(t, db)


@router.put("/{tournament_id}/rewards", response_model=schemas.TournamentOut)
def set_rewards(
    tournament_id: int, payload: list[schemas.RewardIn], db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    """Что дают места в дуэлях — задаётся для каждого турнира."""
    t = _get_or_404(db, tournament_id)
    bracket = dict(t.bracket)
    try:
        bracket["rewards"] = R.validate_config([p.model_dump() for p in payload])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_bracket(db, t, bracket)
    return _to_out(t, db)


@router.delete("/{tournament_id}/qualifier/places", response_model=schemas.TournamentOut)
def remove_qualifier_places(
    tournament_id: int, keep_third: bool = False, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    """Убрать игры за места — основная сетка дуэлей остаётся. keep_third —
    оставить только матч за 3-е место."""
    t = _get_or_404(db, tournament_id)
    bracket = dict(t.bracket)
    if not bracket.get("qualifier"):
        raise HTTPException(status_code=404, detail="У турнира нет дуэлей")
    try:
        B.qualifier_remove_places(bracket["qualifier"], keep_upto=3 if keep_third else 0)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    save_bracket(db, t, bracket)
    return _to_out(t, db)


@router.delete("/{tournament_id}/qualifier", response_model=schemas.TournamentOut)
def delete_qualifier(tournament_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    t = _get_or_404(db, tournament_id)
    bracket = dict(t.bracket)
    bracket.pop("qualifier", None)
    save_bracket(db, t, bracket)
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


@router.post("/{tournament_id}/server", response_model=schemas.TournamentOut)
def set_server(
    tournament_id: int, payload: schemas.TournamentServerIn, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    """«Играем на нашем сервере»: включили — лобби под дуэли и матчи после драфта
    создаются сами (server_sync); выключили — ждущие лобби турнира убираем."""
    from ..server_sync import stop_lobbies

    t = _get_or_404(db, tournament_id)
    bracket = dict(t.bracket or {})
    bracket["server"] = payload.on
    t = save_bracket(db, t, bracket)
    if not payload.on:
        stop_lobbies(db, t)
    return _to_out(t, db)
