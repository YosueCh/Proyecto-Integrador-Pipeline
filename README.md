# Biblioteca API — Practica DevOps

API REST en Node.js (Express) con base de datos SQLite, empaquetada en Docker y desplegable en AWS EC2.

## Estructura

| Archivo | Para que sirve |
|---|---|
| `server.js` | Punto de entrada: lee la configuracion, abre la BD y enciende el servidor |
| `src/db.js` | Conexion a SQLite, esquema de tablas (normalizado) y datos de ejemplo |
| `src/routes.js` | Los endpoints de la API |
| `src/app.js` | Crea la app Express, ruta `/`, error 404 y manejo central de errores |
| `src/repo.js` | Logica de insertar/consultar compartida entre la API HTTP y el socket TCP |
| `src/socketServer.js` | Servidor de sockets TCP: protocolo `{insert:...}` / `{get:...}` |
| `test/api.test.js` | Pruebas automaticas de la API HTTP |
| `test/socket.test.js` | Pruebas automaticas del socket TCP |
| `Dockerfile` | Receta para construir la imagen |
| `.dockerignore` | Archivos que NO se copian a la imagen |
| `.github/workflows/ci.yml` | Pipeline de GitHub Actions (pruebas + build de la imagen) |

## Base de datos (normalizada)

```
categorias (id, nombre UNIQUE)
autores    (id, nombre UNIQUE, nacionalidad)
libros     (id, titulo, anio, autor_id -> autores.id, categoria_id -> categorias.id)
```

Un libro guarda solo los `id` de su autor y su categoria; el nombre vive una sola vez en su tabla (3FN).

## Endpoints

Todas las respuestas tienen la forma `{ "statusCode": 200, "data": [] }`. En errores, `data` es `[]` y se agrega `message`.

| # | Metodo | Ruta | Descripcion |
|---|---|---|---|
| 1 | GET | `/` | Estado del servicio |
| 2 | GET | `/api/categorias` | Lista categorias |
| 3 | POST | `/api/categorias` | Crea categoria `{ "nombre": "Historia" }` |
| 4 | GET | `/api/autores` | Lista autores |
| 5 | POST | `/api/autores` | Crea autor `{ "nombre": "...", "nacionalidad": "..." }` |
| 6 | GET | `/api/libros` | Lista libros con autor y categoria (`?categoria_id=1` para filtrar) |
| 7 | POST | `/api/libros` | Crea libro `{ "titulo": "...", "anio": 2001, "autor_id": 1, "categoria_id": 2 }` |
| 8 | DELETE | `/api/libros/:id` | Elimina un libro |
| 9 | POST | `/api/backup` | Genera copia de la BD en `data/backups/` |
| 10 | DELETE | `/api/vaciar` | Borra todos los registros de la BD |

## Socket TCP (insert / get)

Ademas de la API HTTP, el mismo proceso levanta un servidor TCP en el puerto
`6061` con un protocolo de texto plano, un comando por linea (terminada en
`\n`). La respuesta usa el mismo esquema `{ statusCode, data, message? }`.

```
{insert:<element>}   element = el mismo JSON que ya usan los POST de la API.
                      La tabla se infiere de sus claves:
                        - trae "titulo"                 -> libros
                        - trae "nombre" + "nacionalidad" -> autores
                        - trae solo "nombre"             -> categorias

{get:<element>}       element = { "tabla": "libros|autores|categorias", "id"?: n }
                        - sin "id": devuelve todos los registros de esa tabla
                        - con "id": devuelve el registro con ese id (o [])
```

Ejemplos con `nc` (o cualquier cliente TCP):

```bash
printf '{insert:{"nombre":"Historia"}}\n' | nc localhost 6061
printf '{get:{"tabla":"libros"}}\n' | nc localhost 6061
printf '{get:{"tabla":"libros","id":1}}\n' | nc localhost 6061
```

En Windows (PowerShell), sin instalar nada:

```powershell
$c = New-Object System.Net.Sockets.TcpClient('localhost', 6061)
$s = $c.GetStream()
$w = New-Object System.IO.StreamWriter($s); $w.AutoFlush = $true
$w.WriteLine('{get:{"tabla":"libros"}}')
$r = New-Object System.IO.StreamReader($s)
$r.ReadLine()
$c.Close()
```

## Ejecutar sin Docker

```bash
npm install
npm test
npm start          # API en http://localhost:3000, socket TCP en :6061
```

## Ejecutar con Docker

```bash
docker build -t webapp:latest .
docker run -d -p 8080:80 -p 6061:6061 --name webapp-container webapp:latest
# probar API:    http://localhost:8080
# probar socket: puerto 6061
```

## Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `PORT` | `3000` (la imagen usa `80`) | Puerto donde escucha la API HTTP |
| `SOCKET_PORT` | `6061` | Puerto donde escucha el socket TCP `{insert}`/`{get}` |
| `DATA_DIR` | `./data` (la imagen usa `/app/data`) | Carpeta de la BD y los backups |
