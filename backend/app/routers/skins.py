"""Скины игрока: выбор на сайте, раздаёт в игре плагин WeaponPaints на нашем
сервере (выбор он забирает через /api/server/skins).

Каталог скинов — статика фронтенда (frontend/public/skins, см.
scripts/build_skins_catalog.py). Здесь храним только выбор: defindex
предмета → номер раскраски, износ и паттерн.
"""

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_current_user, get_db
from ..models import Loadout, SkinChoice, User

router = APIRouter(prefix="/api/me", tags=["skins"])

# Ножи в WeaponPaints задаются названием предмета.
KNIFE_NAME = re.compile(r"^weapon_(knife(_[a-z0-9]+)*|bayonet)$")


def loadout_out(db: Session, user: User) -> schemas.LoadoutOut:
    lo = db.get(Loadout, user.id)
    skins = db.query(SkinChoice).filter(SkinChoice.user_id == user.id).all()
    return schemas.LoadoutOut(
        steam_linked=bool(user.steam_id),
        knife=lo.knife if lo else None,
        knife_defindex=lo.knife_defindex if lo else None,
        glove_defindex=lo.glove_defindex if lo else None,
        skins=[schemas.SkinOut(defindex=s.defindex, paint=s.paint, wear=s.wear, seed=s.seed) for s in skins],
    )


@router.get("/skins", response_model=schemas.LoadoutOut)
def my_skins(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return loadout_out(db, user)


@router.put("/skins/{defindex}", response_model=schemas.LoadoutOut)
def set_skin(defindex: int, payload: schemas.SkinIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Скин на предмет. paint=0 — стандартный вид, выбор удаляется."""
    if not 1 <= defindex <= 65535:
        raise HTTPException(status_code=400, detail="Неизвестный предмет")
    row = db.query(SkinChoice).filter(SkinChoice.user_id == user.id, SkinChoice.defindex == defindex).first()
    if payload.paint == 0:
        if row:
            db.delete(row)
    else:
        row = row or SkinChoice(user_id=user.id, defindex=defindex)
        row.paint, row.wear, row.seed = payload.paint, payload.wear, payload.seed
        db.add(row)
    db.commit()
    return loadout_out(db, user)


@router.put("/loadout", response_model=schemas.LoadoutOut)
def set_loadout(payload: schemas.LoadoutIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Какой нож и какие перчатки носить. Пустое поле — стандартные."""
    if payload.knife is not None and not KNIFE_NAME.match(payload.knife):
        raise HTTPException(status_code=400, detail="Неизвестный нож")
    lo = db.get(Loadout, user.id) or Loadout(user_id=user.id)
    lo.knife = payload.knife
    lo.knife_defindex = payload.knife_defindex if payload.knife else None
    lo.glove_defindex = payload.glove_defindex
    db.add(lo)
    db.commit()
    return loadout_out(db, user)
