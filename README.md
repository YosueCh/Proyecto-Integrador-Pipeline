# Biblioteca – Proyecto Integrador (Parcial 2): CI/CD, pruebas E2E y observabilidad

Aplicación web (frontend + API REST) con login, desplegada en AWS EC2 mediante GitHub Actions
**solo si pasan las pruebas** (Jest + Playwright), y monitoreada con OpenTelemetry y OpenObserve.

## Arquitectura

```
git push (main)
   │
   ▼
GitHub Actions ── unitarias (Jest, cobertura ≥ 70 %)
   │                 └─▶ e2e (Playwright: API por HTTP + frontend en Chromium y Firefox)
   │                          ├─ falla ─▶ registra "fallo" en OpenObserve y NO abre SSH a EC2
   │                          └─ pasa  ─▶ imágenes a Docker Hub ─▶ SSH a EC2 ─▶ docker compose up
   │                                                                              └─▶ registra "despliegue" en OpenObserve
   ▼
AWS EC2 (docker compose)
 ┌───────────┐   /api   ┌───────────┐  OTLP   ┌────────────────┐  OTLP/HTTP  ┌─────────────┐
 │ frontend  │─────────▶│ backend   │────────▶│ otel-collector │────────────▶│ OpenObserve │
 │ nginx :80 │          │ Express   │ logs    │ + hostmetrics  │             │   :5080     │
 └───────────┘          │ + SQLite  │ métricas│ (CPU/RAM/red)  │             └─────────────┘
                        └───────────┘ trazas  └────────────────┘
```

| Contenedor | Imagen | Función |
|---|---|---|
| `frontend` | `<usuario>/biblioteca-frontend` | nginx: sirve la web y reenvía `/api` al backend |
| `backend` | `<usuario>/biblioteca-api` | API REST (Node + SQLite), autenticación JWT, instrumentada con OpenTelemetry |
| `openobserve` | `public.ecr.aws/zinclabs/openobserve` | Logs, métricas, trazas, dashboards y alertas |
| `otel-collector` | `otel/opentelemetry-collector-contrib` | Recibe OTLP de la API y mide el servidor (hostmetrics) |

## Estructura

| Ruta | Contenido |
|---|---|
| `backend/` | API, pruebas Jest (104), `Dockerfile` |
| `frontend/` | Web estática (login, CRUD de libros, autores, categorías y usuarios), nginx y `Dockerfile` |
| `e2e/` | Pruebas Playwright: `api.backend.spec.ts` (15) y `ui.frontend.spec.ts` (12 × Chromium y Firefox) |
| `observability/` | Configuración del colector y `aprovisionar.mjs` (dashboard y alertas de OpenObserve) |
| `scripts/notificar-openobserve.mjs` | Envía a OpenObserve el resultado de pruebas y despliegues (API HTTP/JSON) |
| `docker-compose.yml` | Pila completa |
| `.github/workflows/main.yml` | Pipeline |

## Uso local

```bash
cp .env.example .env            # y cambie los valores
docker compose up -d --build    # frontend en http://localhost:8088 (FRONTEND_PORT), OpenObserve en :5080
cd backend && npm ci && npm run test:coverage
cd ../e2e && npm ci && npx playwright install chromium firefox && BASE_URL=http://127.0.0.1:8088 npx playwright test
# dashboard y alertas en OpenObserve:
OPENOBSERVE_USER=... OPENOBSERVE_PASSWORD=... node observability/aprovisionar.mjs
```

## Endpoints

Respuestas `{ "statusCode": 200, "data": [] }`. Todo `/api` exige `Authorization: Bearer <token>` salvo `/api/health` y `/api/auth/login`.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | `{username, password}` → token JWT |
| GET | `/api/health` | Healthcheck (público) |
| GET/POST/PUT/DELETE | `/api/libros`, `/api/categorias` | CRUD (autores: sin DELETE) |
| GET/POST/PUT | `/api/autores` | |
| GET/POST/PUT/DELETE | `/api/usuarios` | Solo rol `admin` |
| POST / DELETE | `/api/backup`, `/api/vaciar` | Solo rol `admin` |

## Secrets de GitHub (Settings → Secrets and variables → Actions)

| Secret | Contenido |
|---|---|
| `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` | Docker Hub (token Read & Write) |
| `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` | Acceso SSH a la instancia (llave `.pem` completa) |
| `JWT_SECRET` | Cadena larga y aleatoria para firmar tokens |
| `ADMIN_PASSWORD` | Contraseña del usuario `admin` inicial |
| `OPENOBSERVE_URL` | `http://<IP_EC2>:5080` |
| `OPENOBSERVE_USER`, `OPENOBSERVE_PASSWORD` | Usuario raíz de OpenObserve (la contraseña exige mayúscula, minúscula, dígito y símbolo, 8+ caracteres) |

Ningún secreto vive en el repositorio; `.env` y `*.pem` están en `.gitignore`.

## Servidor EC2

Ubuntu con Docker y el plugin Compose. Security Group: **22** (SSH), **80** (web) y **5080** (OpenObserve, idealmente restringido a su IP; el pipeline también lo usa para registrar eventos). OpenObserve y el colector necesitan ≥ 2 GB de RAM (t3.small o mayor).

## Observabilidad

- **Logs**: JSON estructurado (nivel, método, ruta, código, duración, `trace_id`) → flujo `default` (logs).
- **Métricas** por endpoint: `http_request_duration_ms`, `http_requests_total`, `http_errors_total` (método, ruta, `status_code`).
- **Trazas**: petición HTTP → middlewares de Express → consultas SQLite; el navegador envía `traceparent`.
- **Infraestructura** (hostmetrics): CPU, RAM, red, disco, carga. **Temperatura**: la API lee `/sys/class/thermal`; las instancias virtualizadas como EC2 normalmente no tienen sensores, por lo que ese panel puede quedar sin datos.
- **Pipeline CI/CD**: flujo `ci_pipeline` (evento, resultado, commit, rama, usuario).
- **Dashboard** "Biblioteca - Observabilidad" y **alertas** (errores 5xx y pipeline fallido) creados por `observability/aprovisionar.mjs`.
