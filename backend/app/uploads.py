"""Приём картинок: аватарки участников и логотипы команд.

Файлы кладём в тот же том, что и базу, поэтому они переживают пересоздание
контейнера. Каждую картинку ужимаем до 256px и пересохраняем в PNG: во-первых,
это отсекает мегабайтные скриншоты, во-вторых — пересохранение через Pillow
выбрасывает любую постороннюю нагрузку из исходного файла.

Показываем картинки всегда в квадратных плитках, поэтому к квадрату приводим
здесь же, при загрузке, — каждая по своему правилу (см. `_to_square`).
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

    folder = _folder(kind)

    # Прозрачность у логотипов важна, поэтому приводим всё к RGBA.
    image = image.convert("RGBA")
    image = _to_square(image, kind)
    image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)

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
