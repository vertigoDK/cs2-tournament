from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_current_user, get_db, require_admin
from ..models import DEFAULT_AVATAR_COLOR, Role, User
from ..people import display_name_taken
from ..steam import refresh_avatars
from ..security import generate_password, generate_username, hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


def _unique_username(db: Session) -> str:
    for _ in range(50):
        candidate = generate_username()
        if not db.query(User).filter(User.username == candidate).first():
            return candidate
    raise HTTPException(status_code=500, detail="Не удалось сгенерировать логин, попробуйте ещё раз")


@router.get("", response_model=list[schemas.UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Список участников. Виден всем — из него собираются команды, а ники
    показываются в сетке."""
    rows = db.query(User).filter(User.role == Role.player).order_by(User.display_name).all()
    return [
        schemas.UserOut(
            id=u.id, username=u.username, display_name=u.display_name,
            avatar_color=u.avatar_color, avatar_url=u.avatar_url, role=u.role.value,
            password_issued=bool(u.password_issued),
        )
        for u in rows
    ]


@router.post("", response_model=schemas.CredentialsOut, status_code=201)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    name = payload.display_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Укажите ник участника")
    if display_name_taken(db, name):
        raise HTTPException(status_code=409, detail="Участник с таким ником уже есть")

    username = _unique_username(db)
    password = generate_password()
    user = User(
        username=username,
        password_hash=hash_password(password),
        role=Role.player,
        display_name=name,
        avatar_color=DEFAULT_AVATAR_COLOR,
        password_issued=True,  # пароль показываем прямо сейчас
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    # Единственный момент, когда пароль существует в открытом виде.
    return schemas.CredentialsOut(
        id=user.id, display_name=user.display_name, username=username, password=password
    )


@router.post("/steam-avatars", response_model=schemas.SteamAvatarsOut)
def steam_avatars(force: bool = False, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Подтягивает аватарки из Steam (см. `steam.refresh_avatars`).

    Раз в сутки то же самое делает крон, кнопка — чтобы не ждать.
    """
    return schemas.SteamAvatarsOut(**refresh_avatars(db, force=force))


@router.post("/{user_id}/reset-password", response_model=schemas.CredentialsOut)
def reset_password(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Пароли хранятся хэшем, поэтому забытый пароль не показать — только
    выдать новый."""
    user = db.get(User, user_id)
    if not user or user.role != Role.player:
        raise HTTPException(status_code=404, detail="Участник не найден")
    password = generate_password()
    user.password_hash = hash_password(password)
    user.password_issued = True
    db.commit()
    return schemas.CredentialsOut(
        id=user.id, display_name=user.display_name, username=user.username, password=password
    )


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Участник не найден")
    if user.role == Role.admin:
        raise HTTPException(status_code=400, detail="Нельзя удалить администратора")
    db.delete(user)
    db.commit()
