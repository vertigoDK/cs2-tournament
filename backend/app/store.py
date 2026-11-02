"""Единая точка сохранения турнирной сетки.

Сетка лежит в JSON-колонке, а SQLAlchemy не отслеживает изменения внутри
таких значений: правки во вложенных структурах (результат матча, пик/бан)
он просто не замечает и UPDATE не отправляет. Поэтому любое изменение
сетки проходит через `save_bracket`, который помечает колонку изменённой
явно — иначе результаты молча теряются при следующей загрузке страницы.
"""

import time

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from . import bracket as B
from .models import Tournament, TournamentStatus


def sync_status(t: Tournament) -> None:
    """Статус турнира — производное от сетки и факта старта.

    Турнир считается идущим, если появился первый результат или админ запустил
    его вручную (кнопкой «Начать турнир»), не дожидаясь объявленного времени.
    """
    if B.is_finished(t.bracket):
        t.status = TournamentStatus.finished
    elif t.started_at is not None or B.has_any_result(t.bracket):
        t.status = TournamentStatus.active
    else:
        t.status = TournamentStatus.setup


def save_bracket(db: Session, t: Tournament, bracket: dict) -> Tournament:
    t.bracket = bracket
    flag_modified(t, "bracket")
    sync_status(t)
    db.commit()
    db.refresh(t)
    # Турнир на нашем сервере: заводим лобби под матчи, которым пора играть.
    from .server_sync import sync_lobbies

    sync_lobbies(db, t)
    return t


def tick_vetoes(db: Session, t: Tournament) -> Tournament:
    """Доигрывает просроченные ходы драфта (у кого кончился таймер) и
    сохраняет, если что-то изменилось. Вызывается при чтении турнира —
    отдельного фонового процесса, который следил бы за часами, нет."""
    if t.bracket and B.veto_tick(t.bracket, time.time()):
        return save_bracket(db, t, t.bracket)
    return t
