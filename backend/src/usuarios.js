const { Router } = require('express');
const { ok, fail } = require('./routes');
const { isId, isText } = require('./repo');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('./auth');

const ROLES = ['admin', 'lector'];
const USUARIO_SELECT = 'SELECT id, username, nombre, rol FROM usuarios';

// Middleware: exige "Authorization: Bearer <token>" y deja el usuario en req.user
function requireAuth(secret) {
  return (req, res, next) => {
    const [tipo, token] = (req.headers.authorization || '').split(' ');
    const user = tipo === 'Bearer' && token ? verifyToken(token, secret) : null;
    if (!user) return fail(res, 401, 'Token ausente, invalido o expirado');
    req.user = user;
    next();
  };
}

function soloAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') return fail(res, 403, 'Se requiere rol admin');
  next();
}

function validarUsuario({ username, nombre, password, rol }, { parcial = false } = {}) {
  if (!parcial || username !== undefined) if (!isText(username)) return 'username es obligatorio';
  if (!parcial || nombre !== undefined) if (!isText(nombre)) return 'nombre es obligatorio';
  if (!parcial || password !== undefined) {
    if (typeof password !== 'string' || password.length < 6) return 'password debe tener al menos 6 caracteres';
  }
  if (rol !== undefined && !ROLES.includes(rol)) return `rol debe ser uno de: ${ROLES.join(', ')}`;
  return null;
}

function createAuthRouter({ db, jwtSecret }) {
  const router = Router();

  // POST /api/auth/login   { "username": "admin", "password": "..." }
  router.post('/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!isText(username) || typeof password !== 'string') return fail(res, 400, 'username y password son obligatorios');
    const usuario = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username.trim());
    if (!usuario || !verifyPassword(password, usuario.password_hash)) return fail(res, 401, 'Credenciales invalidas');
    const token = signToken({ sub: usuario.username, uid: usuario.id, rol: usuario.rol }, jwtSecret);
    ok(res, [{ token, usuario: { id: usuario.id, username: usuario.username, nombre: usuario.nombre, rol: usuario.rol } }]);
  });

  // Todo lo siguiente requiere sesion y rol admin
  const protegido = [requireAuth(jwtSecret), soloAdmin];

  // GET /api/usuarios
  router.get('/usuarios', ...protegido, (req, res) => ok(res, db.prepare(`${USUARIO_SELECT} ORDER BY id`).all()));

  // POST /api/usuarios   { "username", "nombre", "password", "rol" }
  router.post('/usuarios', ...protegido, (req, res) => {
    const datos = req.body || {};
    const error = validarUsuario(datos);
    if (error) return fail(res, 400, error);
    const { lastInsertRowid } = db
      .prepare('INSERT INTO usuarios (username, nombre, password_hash, rol) VALUES (?, ?, ?, ?)')
      .run(datos.username.trim(), datos.nombre.trim(), hashPassword(datos.password), datos.rol || 'lector');
    ok(res, [db.prepare(`${USUARIO_SELECT} WHERE id = ?`).get(lastInsertRowid)], 201);
  });

  // PUT /api/usuarios/:id   (todos los campos son opcionales; password solo si se quiere cambiar)
  router.put('/usuarios/:id', ...protegido, (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return fail(res, 400, 'id debe ser un entero positivo');
    const datos = req.body || {};
    const error = validarUsuario(datos, { parcial: true });
    if (error) return fail(res, 400, error);
    const actual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
    if (!actual) return fail(res, 404, `El usuario ${id} no existe`);
    db.prepare('UPDATE usuarios SET username = ?, nombre = ?, password_hash = ?, rol = ? WHERE id = ?').run(
      datos.username?.trim() ?? actual.username,
      datos.nombre?.trim() ?? actual.nombre,
      datos.password ? hashPassword(datos.password) : actual.password_hash,
      datos.rol ?? actual.rol,
      id
    );
    ok(res, [db.prepare(`${USUARIO_SELECT} WHERE id = ?`).get(id)]);
  });

  // DELETE /api/usuarios/:id   (no permite que un admin se borre a si mismo)
  router.delete('/usuarios/:id', ...protegido, (req, res) => {
    const id = Number(req.params.id);
    if (!isId(id)) return fail(res, 400, 'id debe ser un entero positivo');
    const usuario = db.prepare(`${USUARIO_SELECT} WHERE id = ?`).get(id);
    if (!usuario) return fail(res, 404, `El usuario ${id} no existe`);
    if (usuario.id === req.user.uid) return fail(res, 409, 'No puedes eliminar tu propio usuario');
    db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    ok(res, [usuario]);
  });

  return router;
}

module.exports = { createAuthRouter, requireAuth, soloAdmin };
