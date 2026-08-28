FROM python:3.12-slim

WORKDIR /app

# Некоторые хосты отдают AAAA-записи на пакетные зеркала, но контейнер видит
# только IPv4 — из-за этого apt/pip зависают. Явно предпочитаем IPv4.
RUN echo 'precedence ::ffff:0:0/96 100' >> /etc/gai.conf \
    && echo 'Acquire::ForceIPv4 "true";' > /etc/apt/apt.conf.d/99force-ipv4

RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
