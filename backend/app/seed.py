from sqlalchemy.orm import Session

from .config import get_settings
from .models import DEFAULT_AVATAR_COLOR, Role, User
from .security import hash_password

settings = get_settings()


def seed_admin(db: Session) -> None:
    """Единственный аккаунт, который создаётся сам — админский.

    Всех остальных заводит админ через раздел «Участники», логин и пароль там
    выдаются случайные.
    """
    existing = db.query(User).filter(User.username == settings.admin_username).first()
    if existing:
        return
    db.add(
        User(
            username=settings.admin_username,
            password_hash=hash_password(settings.admin_password),
            role=Role.admin,
            display_name=settings.admin_username,
            avatar_color=DEFAULT_AVATAR_COLOR,
            password_issued=True,  # задан в .env, известен администратору
        )
    )
    db.commit()
