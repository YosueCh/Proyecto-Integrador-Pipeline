const fs = require('node:fs');
const path = require('node:path');
const { Router } = require('express');
const { ValidationError, isId, isText, LIBRO_SELECT, crearCategoria, crearAutor, crearLibro } = require('./repo');

// Todas las respuestas comparten el mismo esquema: { statusCode, data: [] }.
// En errores, data va vacio y se agrega "message" con la explicacion.
function ok(res, data, status = 200) {
  res.status(status).json({ statusCode: status, data });
}

function fail(res, status, message) {
  res.status(status).json({ statusCode: status, data: [], message });
}

function createRouter({ db, backupDir }) {
  const router = Router();

  // GET /api/health -> healthcheck para el despliegue y el monitoreo
  router.get('/health', (req, res) => {
    ok(res, [{ estado: 'ok', uptime: process.uptime() }]);
  });

  // 2. GET /api/categorias
  router.get('/categorias', (req, res) => {
    ok(res, db.prepare('SELECT id, nombre FROM categorias ORDER BY id').all());
  });

  // 3. POST /api/categorias   { "nombre": "Historia" }
  router.post('/categorias', (req, res) => {
    try {
      ok(res, [crearCategoria(db, req.body?.nombre)], 201);
    } catch (err) {
      if (err instanceof ValidationError) return fail(res, 400, err.message);
      throw err;
    }
  });

  // 4. GET /api/autores
  router.get('/autores', (req, res) => {
    ok(res, db.prepare('SELECT id, nombre, nacionalidad FROM autores ORDER BY id').all());
  });

  // 5. POST /api/autores   { "nombre": "Isaac Asimov", "nacionalidad": "Rusa" }
  router.post('/autores', (req, res) => {
    try {
      const { nombre, nacionalidad = null } = req.body || {};
      ok(res, [crearAutor(db, nombre, nacionalidad)], 201);
    } catch (err) {
      if (err instanceof ValidationError) return fail(res, 400, err.message);
      throw err;
    }
  });

  // 6. GET /api/libros            (opcional: ?categoria_id=1)
  router.get('/libros', (req, res) => {
    if (req.query.categoria_id !== undefined) {
      const categoriaId = Number(req.query.categoria_id);
      if (!isId(categoriaId)) return fail(res, 400, 'categoria_id debe ser un entero positivo');
      return ok(res, db.prepare(`${LIBRO_SELECT} WHERE l.categoria_id = ? ORDER BY l.id`).all(categoriaId));
    }
    ok(res, db.prepare(`${LIBRO_SELECT} ORDER BY l.id`).all());
  });

  // 7. POST /api/libros   { "titulo": "...", "anio": 2001, "autor_id": 1, "categoria_id": 2 }
  router.post('/libros', (req, res) => {
    try {
      ok(res, [crearLibro(db, req.body || {})], 201);
    } catch (err) {
      if (err instanceof ValidationError) return fail(res, 400, err.message);
      throw err;
    }
  });

  // 8. DELETE /api/libros/:id
  router.delete('/libros/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return fail(res, 400, 'id debe ser un entero positivo');

    const libro = db.prepare(`${LIBRO_SELECT} WHERE l.id = ?`).get(id);
    if (!libro) return fail(res, 404, `El libro ${id} no existe`);

    db.prepare('DELETE FROM libros WHERE id = ?').run(id);
    ok(res, [libro]);
  });

  // 9. POST /api/backup  -> copia consistente de la BD en <dataDir>/backups
  router.post('/backup', async (req, res, next) => {
    try {
      fs.mkdirSync(backupDir, { recursive: true });
      const archivo = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
      const destino = path.join(backupDir, archivo);

      await db.backup(destino); // API nativa de SQLite: segura aunque haya escrituras en curso
      ok(res, [{ archivo, bytes: fs.statSync(destino).size }], 201);
    } catch (err) {
      next(err);
    }
  });

  // 10. DELETE /api/vaciar  -> borra todos los registros (conserva las tablas)
  router.delete('/vaciar', (req, res) => {
    const borrados = db.transaction(() => {
      // Orden inverso a las dependencias: primero la tabla "hija".
      const resumen = {
        libros: db.prepare('DELETE FROM libros').run().changes,
        autores: db.prepare('DELETE FROM autores').run().changes,
        categorias: db.prepare('DELETE FROM categorias').run().changes,
      };
      db.prepare('DELETE FROM sqlite_sequence').run(); // reinicia los AUTOINCREMENT
      return resumen;
    })();
    ok(res, [{ registros_eliminados: borrados }]);
  });

  // 11. PUT /api/categorias/:id   { "nombre": "Historia" }
  router.put('/categorias/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return fail(res, 400, 'id debe ser un entero positivo');
    const nombre = req.body?.nombre;
    if (!isText(nombre)) return fail(res, 400, 'nombre es obligatorio');
    const { changes } = db.prepare('UPDATE categorias SET nombre = ? WHERE id = ?').run(nombre.trim(), id);
    if (!changes) return fail(res, 404, `La categoria ${id} no existe`);
    ok(res, [db.prepare('SELECT id, nombre FROM categorias WHERE id = ?').get(id)]);
  });

  // 12. DELETE /api/categorias/:id  (409 si tiene libros relacionados)
  router.delete('/categorias/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return fail(res, 400, 'id debe ser un entero positivo');
    const cat = db.prepare('SELECT id, nombre FROM categorias WHERE id = ?').get(id);
    if (!cat) return fail(res, 404, `La categoria ${id} no existe`);
    db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
    ok(res, [cat]);
  });

  // 13. PUT /api/autores/:id   { "nombre": "...", "nacionalidad": "..." }
  router.put('/autores/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return fail(res, 400, 'id debe ser un entero positivo');
    const { nombre, nacionalidad = null } = req.body || {};
    if (!isText(nombre)) return fail(res, 400, 'nombre es obligatorio');
    if (nacionalidad !== null && typeof nacionalidad !== 'string') {
      return fail(res, 400, 'nacionalidad debe ser texto');
    }
    const { changes } = db
      .prepare('UPDATE autores SET nombre = ?, nacionalidad = ? WHERE id = ?')
      .run(nombre.trim(), nacionalidad, id);
    if (!changes) return fail(res, 404, `El autor ${id} no existe`);
    ok(res, [db.prepare('SELECT id, nombre, nacionalidad FROM autores WHERE id = ?').get(id)]);
  });

  // 14. PUT /api/libros/:id   { "titulo": "...", "anio": 2001, "autor_id": 1, "categoria_id": 2 }
  router.put('/libros/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return fail(res, 400, 'id debe ser un entero positivo');
    const { titulo, anio = null, autor_id, categoria_id } = req.body || {};
    if (!isText(titulo)) return fail(res, 400, 'titulo es obligatorio');
    if (!isId(autor_id)) return fail(res, 400, 'autor_id debe ser un entero positivo');
    if (!isId(categoria_id)) return fail(res, 400, 'categoria_id debe ser un entero positivo');
    if (anio !== null && !Number.isInteger(anio)) return fail(res, 400, 'anio debe ser un entero');
    if (!db.prepare('SELECT 1 FROM autores WHERE id = ?').get(autor_id)) {
      return fail(res, 400, `El autor ${autor_id} no existe`);
    }
    if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoria_id)) {
      return fail(res, 400, `La categoria ${categoria_id} no existe`);
    }
    const { changes } = db
      .prepare('UPDATE libros SET titulo = ?, anio = ?, autor_id = ?, categoria_id = ? WHERE id = ?')
      .run(titulo.trim(), anio, autor_id, categoria_id, id);
    if (!changes) return fail(res, 404, `El libro ${id} no existe`);
    ok(res, [db.prepare(`${LIBRO_SELECT} WHERE l.id = ?`).get(id)]);
  });

  return router;
}

module.exports = { createRouter, ok, fail };
