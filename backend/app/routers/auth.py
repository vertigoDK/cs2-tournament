from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_current_user, get_db
from ..people import find_by_login
from ..models import User
from ..security import create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=schemas.TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = find_by_login(db, form.username)
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")
    token = create_access_token(user.username, user.role.value)
    return schemas.TokenOut(
        access_token=token,
        id=user.id,
        role=user.role.value,
        username=user.username,
        display_name=user.display_name,
        avatar_color=user.avatar_color,
        avatar_url=user.avatar_url,
    )


@router.get("/me", response_model=schemas.MeOut)
def me(user: User = Depends(get_current_user)):
    return schemas.MeOut(
        id=user.id,
        username=user.username,
        role=user.role.value,
        display_name=user.display_name,
        avatar_color=user.avatar_color,
        avatar_url=user.avatar_url,
    )
