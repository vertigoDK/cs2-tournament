"""Точка входа Vercel: весь FastAPI — одна функция.

vercel.json переписывает все /api/* сюда, а приложение получает исходный путь
и разводит его по роутерам само.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402,F401
