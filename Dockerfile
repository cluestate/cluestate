# Stage 1: Build React Platform UI
FROM node:20-alpine AS admin-builder

WORKDIR /app/admin

COPY admin/package*.json ./
RUN npm ci || npm install

COPY admin/ ./
RUN npm run build

# Stage 2: Production Python Application
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy project metadata & source code
COPY pyproject.toml .
COPY README.md .
COPY src/ src/

# Copy compiled Platform UI from stage 1
COPY --from=admin-builder /app/src/cluestate/static/ src/cluestate/static/

# Install Python package including PostgreSQL driver support
RUN pip install --no-cache-dir ".[postgres]"

# Create data directory for persistent SQLite volumes
RUN mkdir -p /app/data

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import httpx; r = httpx.get('http://localhost:8000/api/health'); r.raise_for_status()"

# Run
CMD ["cluestate", "serve", "--host", "0.0.0.0", "--port", "8000"]
