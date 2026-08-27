from fastapi import APIRouter, Depends, File, UploadFile

from .. import schemas
from ..deps import require_admin
from ..models import User
from ..uploads import save_image

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.post("/logo", response_model=schemas.UploadOut)
async def upload_logo(file: UploadFile = File(...), _: User = Depends(require_admin)):
    """Логотип команды. Загружается до создания турнира, поэтому отдельным
    запросом: сначала получаем ссылку, потом кладём её в состав команды."""
    return schemas.UploadOut(url=await save_image(file, "logos"))
