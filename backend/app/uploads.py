"""Приём картинок: аватарки участников и логотипы команд.

Картинки храним в самой базе (таблица `images`) — на Vercel нет постоянного
диска. Каждую картинку ужимаем до 256px и пересохраняем в PNG: во-первых,
это отсекает мегабайтные скриншоты, во-вторых — пересохранение через Pillow
выбрасывает любую постороннюю нагрузку из исходного файла.

Показываем картинки всегда в квадратных плитках, поэтому к квадрату приводим
здесь же, при загрузке, — каждая по своему правилу (см. `_to_square`).
"""

import io
import secrets

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from . import models

# Vercel не пропускает в функцию тело запроса больше 4.5 МБ.
MAX_BYTES = 4 * 1024 * 1024
MAX_SIDE = 256

PUBLIC_PREFIX = "/api/images"


def _edge_color(image: Image.Image) -> tuple[int, int, int, int]:
    """Фон картинки — цвет её краёв.

    У логотипов вроде «светлый знак на сплошной подложке» края одного цвета, и
    дополнить ими квадрат незаметно. Если края разношёрстные (фото, градиент)
    или прозрачные — честнее прозрачный фон, чем случайный цвет из угла.
    """
    w, h = image.size
    points = [
        (0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),      # углы
        (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2),  # середины сторон
    ]
    colors = [image.getpixel(p) for p in points]
    first = colors[0]
    if first[3] < 250:
        return (0, 0, 0, 0)
    # Допуск на артефакты JPEG: края считаем однотонными, если расходятся слабо.
    for c in colors[1:]:
        if c[3] < 250 or any(abs(a - b) > 12 for a, b in zip(first[:3], c[:3])):
            return (0, 0, 0, 0)
    return first


def _to_square(image: Image.Image, kind: str) -> Image.Image:
    """Приводит картинку к квадрату — плитки в интерфейсе квадратные.

    Аватарку режем по центру: у портрета важна середина, а поля вокруг лица
    смотрелись бы странно. Логотип, наоборот, режется плохо (у широкого знака
    обрезалось бы название команды), поэтому вписываем его целиком и добиваем
    до квадрата фоном самой картинки.
    """
    w, h = image.size
    if w == h:
        return image

    if kind == "avatars":
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        return image.crop((left, top, left + side, top + side))

    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), _edge_color(image))
    canvas.paste(image, ((side - w) // 2, (side - h) // 2), image)
    return canvas


async def save_image(file: UploadFile, kind: str, db: Session) -> str:
    """Сохраняет картинку и возвращает ссылку на неё. Коммит — за вызывающим."""
    if kind not in ("avatars", "logos"):
        raise HTTPException(status_code=400, detail="Неизвестный тип изображения")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Файл пустой")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Файл больше 4 МБ")

    return store_image(raw, kind, db)


def store_image(raw: bytes, kind: str, db: Session, image_id: str | None = None) -> str:
    """Ужимает байты картинки и кладёт в базу. Коммит — за вызывающим."""
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Это не картинка или формат не поддерживается")

    # Прозрачность у логотипов важна, поэтому приводим всё к RGBA.
    image = image.convert("RGBA")
    image = _to_square(image, kind)
    image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)

    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True)
    name = image_id or secrets.token_hex(8)
    db.add(models.Image(id=name, data=out.getvalue()))
    return f"{PUBLIC_PREFIX}/{name}.png"


def image_id(url: str | None) -> str | None:
    """id картинки из её ссылки, если ссылка наша."""
    if not url or not url.startswith(f"{PUBLIC_PREFIX}/"):
        return None
    return url[len(PUBLIC_PREFIX) + 1 :].removesuffix(".png")


def delete_image(db: Session, url: str | None) -> None:
    """Удаляет ранее загруженную картинку, если она наша. Коммит — за вызывающим."""
    name = image_id(url)
    if name:
        db.query(models.Image).filter(models.Image.id == name).delete()
