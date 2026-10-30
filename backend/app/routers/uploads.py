from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from .. import schemas
from ..deps import get_db, require_admin
from ..models import Image, User
from ..uploads import save_image

router = APIRouter(prefix="/api", tags=["uploads"])


@router.post("/uploads/logo", response_model=schemas.UploadOut)
async def upload_logo(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Логотип команды. Загружается до создания турнира, поэтому отдельным
    запросом: сначала получаем ссылку, потом кладём её в состав команды."""
    url = await save_image(file, "logos", db)
    db.commit()
    return schemas.UploadOut(url=url)


@router.get("/images/{name}.png")
def get_image(name: str, db: Session = Depends(get_db)):
    """Картинки неизменяемы: при замене появляется новая с новым id. Поэтому
    кэшируем навсегда — повторно их отдаёт CDN Vercel, не трогая функцию."""
    image = db.get(Image, name)
    if not image:
        raise HTTPException(status_code=404, detail="Картинка не найдена")
    return Response(
        content=image.data,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable"},
    )
