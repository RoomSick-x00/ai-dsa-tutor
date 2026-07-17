FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM python:3.11-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY --from=frontend-build /app/frontend/out ./frontend/out

EXPOSE 8000

CMD ["sh", "-c", "cd /app/backend && uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
