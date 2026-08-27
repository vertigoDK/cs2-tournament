"""Подстановка актуальных данных участников в турнирную сетку.

В сетке хранятся id игроков, а рядом — их ник, цвет и аватарка на момент
создания команд. Идентификаторы и есть источник правды: ник и фото человек
меняет у себя в кабинете один раз, и они должны обновиться везде, а не
только там, где список читается напрямую из профилей.

Своё название команды при этом остаётся снимком: оно принадлежит турниру,
а не человеку, и задним числом переписываться не должно.
"""

from sqlalchemy.orm import Session

from . import bracket as B
from .models import User


def hydrate_bracket(db: Session, bracket: dict | None) -> dict:
    if not bracket:
        return bracket or {}
    teams = bracket.get("teams") or []
    ids = {
        pid
        for t in teams
        for pid in (t.get("player_a_id"), t.get("player_b_id"), t.get("captain_id"))
        if pid
    }
    if not ids:
        return bracket

    people = {u.id: u for u in db.query(User).filter(User.id.in_(ids)).all()}

    # Копируем только состав: раунды не трогаем, чтобы случайно не записать
    # обновлённую копию обратно в базу.
    fresh = dict(bracket)
    fresh["teams"] = [dict(t) for t in teams]

    for team in fresh["teams"]:
        a = people.get(team.get("player_a_id"))
        if a:
            team["a"] = a.display_name
            team["a_color"] = a.avatar_color
            team["a_avatar"] = a.avatar_url
        b = people.get(team.get("player_b_id"))
        if b:
            team["b"] = b.display_name
            team["b_color"] = b.avatar_color
            team["b_avatar"] = b.avatar_url

        captain = people.get(team.get("captain_id"))
        if captain:
            team["captain_name"] = captain.display_name

        # Отображаемое имя пересобираем: своё название в приоритете,
        # иначе — из свежих ников.
        team["name"] = B.team_name(team.get("a", ""), team.get("b", ""), team.get("custom_name"))

    return fresh
