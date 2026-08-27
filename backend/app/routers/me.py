from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import bracket as B
from .. import schemas
from ..deps import get_current_user, get_db
from ..models import AVATAR_COLORS, Tournament, TournamentStatus, User
from ..hydrate import hydrate_bracket
from ..people import display_name_taken
from ..uploads import delete_image, save_image

router = APIRouter(prefix="/api/me", tags=["me"])


def _me_out(user: User) -> schemas.MeOut:
    return schemas.MeOut(
        id=user.id, username=user.username, role=user.role.value,
        display_name=user.display_name, avatar_color=user.avatar_color,
        avatar_url=user.avatar_url,
    )


@router.get("", response_model=schemas.MeOut)
def read_me(user: User = Depends(get_current_user)):
    return _me_out(user)


@router.patch("", response_model=schemas.MeOut)
def update_profile(
    payload: schemas.ProfilePatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.clear_avatar:
        delete_image(user.avatar_url)
        user.avatar_url = None

    if payload.avatar_color is not None:
        if payload.avatar_color not in AVATAR_COLORS:
            raise HTTPException(status_code=400, detail="Неизвестный цвет аватара")
        user.avatar_color = payload.avatar_color

    if payload.display_name is not None:
        name = payload.display_name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Ник не может быть пустым")
        if display_name_taken(db, name, exclude_id=user.id):
            raise HTTPException(status_code=409, detail="Такой ник уже занят")
        user.display_name = name

    db.commit()
    db.refresh(user)
    return _me_out(user)


@router.post("/avatar", response_model=schemas.MeOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Свою аватарку каждый ставит сам — админ тут не нужен."""
    url = await save_image(file, "avatars")
    delete_image(user.avatar_url)  # старую не копим
    user.avatar_url = url
    db.commit()
    db.refresh(user)
    return _me_out(user)


def _my_team_index(bracket: dict, user_id: int) -> int | None:
    for idx, team in enumerate(bracket.get("teams", [])):
        if user_id in (team.get("player_a_id"), team.get("player_b_id")):
            return idx
    return None


def _partner_name(team: dict, user_id: int) -> str | None:
    if team.get("player_a_id") == user_id:
        return team.get("b") or None
    if team.get("player_b_id") == user_id:
        return team.get("a") or None
    return None


def _match_map(match: dict) -> str | None:
    """Что играем: для BO1 — решающая карта, для BO3 — выбранные плюс децидер."""
    veto = match.get("veto") or {}
    if veto.get("status") != "done":
        return None
    picks = veto.get("picks") or []
    decider = veto.get("decider")
    if picks:
        return ", ".join([*picks, decider]) if decider else ", ".join(picks)
    return decider


@router.get("/cabinet", response_model=schemas.CabinetOut)
def cabinet(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Всё, что относится лично к вошедшему: его матчи и сводная статистика.

    Составы и результаты живут внутри JSON-сетки турнира, поэтому проходим по
    турнирам и вытаскиваем матчи, где участвует команда этого человека.
    """
    tournaments = db.query(Tournament).order_by(Tournament.created_at.desc()).all()

    stats = schemas.CabinetStats(tournaments=0, matches_played=0, wins=0, losses=0, titles=0)
    current: schemas.CabinetMatch | None = None
    history: list[schemas.CabinetMatch] = []

    for t in tournaments:
        bracket = hydrate_bracket(db, t.bracket)
        rounds = bracket.get("rounds") or []
        teams = bracket.get("teams") or []
        my_idx = _my_team_index(bracket, user.id)
        if my_idx is None:
            continue

        stats.tournaments += 1
        partner = _partner_name(teams[my_idx], user.id)

        champion = B.champion(bracket) if rounds else None
        if champion and champion.get("seed") == teams[my_idx].get("seed"):
            stats.titles += 1

        total_rounds = len(rounds)
        for r, round_ in enumerate(rounds):
            for match in round_:
                if my_idx not in match.get("p", []):
                    continue
                if match.get("bye"):
                    continue  # проход без игры — это не сыгранный матч

                slot = match["p"].index(my_idx)
                other_idx = match["p"][1 - slot]
                opponent = teams[other_idx]["name"] if other_idx is not None else None

                win = match.get("win")
                if win is None:
                    result = "pending"
                elif win == slot:
                    result = "win"
                else:
                    result = "loss"

                entry = schemas.CabinetMatch(
                    tournament_id=t.id,
                    tournament_name=t.name,
                    round_label=B.round_label(r, total_rounds),
                    opponent=opponent,
                    partner=partner,
                    map=_match_map(match),
                    result=result,
                )

                if result == "pending":
                    # Ближайший несыгранный матч в незавершённом турнире —
                    # это то, что человек хочет видеть первым.
                    if current is None and t.status != TournamentStatus.finished and opponent:
                        current = entry
                else:
                    stats.matches_played += 1
                    if result == "win":
                        stats.wins += 1
                    else:
                        stats.losses += 1
                    history.append(entry)

    return schemas.CabinetOut(stats=stats, current=current, history=history)
