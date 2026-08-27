"""Поиск и сверка участников по имени.

Сравнивать ники средствами SQLite нельзя: его `lower()` знает только
латиницу и оставляет кириллицу как есть — «Кэп» и «кэп» для базы разные
строки. Ников у нас десятки, поэтому сверяем в Python через `casefold()`,
который корректно работает с любым алфавитом.
"""

from sqlalchemy.orm import Session

from .models import User


def normalize(name: str) -> str:
    return (name or "").strip().casefold()


def find_by_login(db: Session, entered: str) -> User | None:
    """Пускаем и по выданному логину, и по нику — люди помнят себя по нику."""
    entered = (entered or "").strip()
    if not entered:
        return None

    exact = db.query(User).filter(User.username == entered).first()
    if exact:
        return exact

    target = normalize(entered)
    for user in db.query(User).all():
        if normalize(user.display_name) == target:
            return user
    return None


def display_name_taken(db: Session, name: str, exclude_id: int | None = None) -> bool:
    target = normalize(name)
    for user in db.query(User).all():
        if user.id == exclude_id:
            continue
        if normalize(user.display_name) == target:
            return True
    return False
