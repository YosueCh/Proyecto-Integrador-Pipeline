# Biblioteca API - Proyecto Integrador CI/CD

API REST en Node.js (Express) con SQLite, con pruebas automatizadas (Jest + Supertest),
empaquetada en Docker y desplegada automaticamente en AWS EC2 mediante GitHub Actions.

## Arquitectura

```
 git push (main)
      |
      v
+---------------------------- GitHub Actions (.github/workflows/main.yml) ----------------------------+
|  1. test    : npm ci -> jest --coverage (falla si la cobertura es < 70%)                            |
|  2. docker  : build de la imagen -> push a Docker Hub (:latest y :<sha del commit>)                 |
|  3. deploy  : SSH a la EC2 -> docker pull -> docker rm -f -> docker run -p 80:80 -> /api/health     |
+----------------------------------------------------------------------------------------------------+
      |                                   |
      v                                   v
  Docker Hub  <--------- pull ---------  AWS EC2 (Ubuntu + Docker)  ->  http://<IP_EC2>/api/...
```

## Estructura

| Archivo | Para que sirve |
|---|---|
| `server.js` | Punto de entrada: configuracion por variables de entorno, BD y servidores |
| `src/app.js` | App Express, ruta `/`, 404 y manejador central de errores |
| `src/routes.js` | Endpoints de la API |
| `src/repo.js` | Logica de acceso a datos y validaciones (compartida con el socket TCP) |
| `src/db.js` | SQLite: esquema normalizado y datos de ejemplo |
| `src/socketServer.js` | Servidor TCP (puerto 6061), protocolo `{insert:...}` / `{get:...}` |
| `tests/` | Pruebas Jest + Supertest (81 pruebas) |
| `Dockerfile` / `.dockerignore` | Imagen (Node 22 slim, usuario sin privilegios, HEALTHCHECK) |
| `.github/workflows/main.yml` | Pipeline de CI/CD |

## Endpoints

Todas las respuestas usan el esquema `{ "statusCode": 200, "data": [] }`; en errores
`data` es `[]` y se agrega `message`.

| Metodo | Ruta | Descripcion |
|---|---|---|
| GET | `/` | Estado del servicio |
| GET | `/api/health` | Healthcheck (usado por Docker y por el despliegue) |
| GET | `/api/categorias` | Lista categorias |
| POST | `/api/categorias` | Crea categoria `{ "nombre": "Historia" }` |
| PUT | `/api/categorias/:id` | Actualiza categoria |
| DELETE | `/api/categorias/:id` | Elimina categoria (409 si tiene libros) |
| GET | `/api/autores` | Lista autores |
| POST | `/api/autores` | Crea autor `{ "nombre", "nacionalidad" }` |
| PUT | `/api/autores/:id` | Actualiza autor |
| GET | `/api/libros` | Lista libros (filtro opcional `?categoria_id=1`) |
| POST | `/api/libros` | Crea libro `{ "titulo", "anio", "autor_id", "categoria_id" }` |
| PUT | `/api/libros/:id` | Actualiza libro |
| DELETE | `/api/libros/:id` | Elimina libro |
| POST | `/api/backup` | Copia consistente de la BD |
| DELETE | `/api/vaciar` | Borra todos los registros |

## Comandos locales

```bash
npm ci                    # instalar dependencias
npm start                 # API en http://localhost:3000
npm test                  # pruebas
npm run test:coverage     # pruebas + cobertura (umbral minimo 70%)

docker build -t biblioteca-api:local .
docker run -d --name api-local -p 8081:80 biblioteca-api:local
curl http://localhost:8081/api/health
docker rm -f api-local
```

## Configuracion del pipeline

### 1. GitHub Secrets (Settings > Secrets and variables > Actions)

| Secret | Contenido |
|---|---|
| `DOCKERHUB_USERNAME` | Usuario de Docker Hub |
| `DOCKERHUB_TOKEN` | Personal Access Token de Docker Hub (Read & Write) |
| `EC2_HOST` | IP publica o DNS de la instancia EC2 |
| `EC2_USER` | Usuario SSH (`ubuntu`) |
| `EC2_SSH_KEY` | Contenido completo del archivo `.pem` |

Ningun dato sensible vive en el repositorio; `.gitignore` excluye `.env` y `*.pem`.

### 2. Servidor EC2

- Ubuntu Server con Docker instalado y el usuario `ubuntu` en el grupo `docker`.
- Security Group con entrada TCP **22** (SSH) y **80** (HTTP).
- El despliegue crea el contenedor `biblioteca-api` con `--restart unless-stopped` y un
  volumen `biblioteca-data` para conservar la base de datos entre versiones.

### 3. Flujo de despliegue

Cada `git push` a `main` ejecuta pruebas, publica la imagen en Docker Hub y reemplaza el
contenedor en la EC2. El job termina en verde solo si `/api/health` responde tras el despliegue.
Los `pull_request` a `main` solo ejecutan las pruebas.
