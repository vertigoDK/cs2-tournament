"""Приём картинок: аватарки участников и логотипы команд.

Файлы кладём в тот же том, что и базу, поэтому они переживают пересоздание
контейнера. Каждую картинку ужимаем до 256px и пересохраняем в PNG: во-первых,
это отсекает мегабайтные скриншоты, во-вторых — пересохранение через Pillow
выбрасывает любую постороннюю нагрузку из исходного файла.
"""

import io
import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

MAX_BYTES = 6 * 1024 * 1024
MAX_SIDE = 256

UPLOAD_ROOT = Path("data/uploads")
PUBLIC_PREFIX = "/uploads"


def _folder(kind: str) -> Path:
    if kind not in ("avatars", "logos"):
        raise HTTPException(status_code=400, detail="Неизвестный тип изображения")
    path = UPLOAD_ROOT / kind
    path.mkdir(parents=True, exist_ok=True)
    return path


async def save_image(file: UploadFile, kind: str) -> str:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Файл пустой")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Файл больше 6 МБ")

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Это не картинка или формат не поддерживается")

    # Прозрачность у логотипов важна, поэтому приводим всё к RGBA.
    image = image.convert("RGBA")
    image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)

    folder = _folder(kind)
    name = f"{secrets.token_hex(8)}.png"
    image.save(folder / name, format="PNG", optimize=True)
    return f"{PUBLIC_PREFIX}/{kind}/{name}"


def delete_image(url: str | None) -> None:
    """Удаляет ранее загруженный файл, если он наш и всё ещё существует."""
    if not url or not url.startswith(f"{PUBLIC_PREFIX}/"):
        return
    relative = url[len(PUBLIC_PREFIX) + 1 :]
    target = (UPLOAD_ROOT / relative).resolve()
    root = UPLOAD_ROOT.resolve()
    # Защита от «../»: удаляем только внутри своей папки.
    if root in target.parents and target.is_file():
        target.unlink(missing_ok=True)
