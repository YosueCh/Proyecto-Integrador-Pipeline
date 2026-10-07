// Logica de acceso a datos compartida entre la API HTTP (routes.js) y el
// servidor de sockets TCP (socketServer.js), para no duplicar validaciones.

class ValidationError extends Error {}

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isId = (v) => Number.isInteger(v) && v > 0;

const LIBRO_SELECT = `
  SELECT l.id, l.titulo, l.anio,
         a.id AS autor_id,     a.nombre AS autor,
         c.id AS categoria_id, c.nombre AS categoria
  FROM libros l
  JOIN autores a    ON a.id = l.autor_id
  JOIN categorias c ON c.id = l.categoria_id
`;

function crearCategoria(db, nombre) {
  if (!isText(nombre)) throw new ValidationError('nombre es obligatorio');
  const { lastInsertRowid } = db.prepare('INSERT INTO categorias (nombre) VALUES (?)').run(nombre.trim());
  return db.prepare('SELECT id, nombre FROM categorias WHERE id = ?').get(lastInsertRowid);
}

function crearAutor(db, nombre, nacionalidad = null) {
  if (!isText(nombre)) throw new ValidationError('nombre es obligatorio');
  if (nacionalidad !== null && typeof nacionalidad !== 'string') {
    throw new ValidationError('nacionalidad debe ser texto');
  }
  const { lastInsertRowid } = db
    .prepare('INSERT INTO autores (nombre, nacionalidad) VALUES (?, ?)')
    .run(nombre.trim(), nacionalidad);
  return db.prepare('SELECT id, nombre, nacionalidad FROM autores WHERE id = ?').get(lastInsertRowid);
}

function crearLibro(db, { titulo, anio = null, autor_id, categoria_id } = {}) {
  if (!isText(titulo)) throw new ValidationError('titulo es obligatorio');
  if (!isId(autor_id)) throw new ValidationError('autor_id debe ser un entero positivo');
  if (!isId(categoria_id)) throw new ValidationError('categoria_id debe ser un entero positivo');
  if (anio !== null && !Number.isInteger(anio)) throw new ValidationError('anio debe ser un entero');

  if (!db.prepare('SELECT 1 FROM autores WHERE id = ?').get(autor_id)) {
    throw new ValidationError(`El autor ${autor_id} no existe`);
  }
  if (!db.prepare('SELECT 1 FROM categorias WHERE id = ?').get(categoria_id)) {
    throw new ValidationError(`La categoria ${categoria_id} no existe`);
  }

  const { lastInsertRowid } = db
    .prepare('INSERT INTO libros (titulo, anio, autor_id, categoria_id) VALUES (?, ?, ?, ?)')
    .run(titulo.trim(), anio, autor_id, categoria_id);
  return db.prepare(`${LIBRO_SELECT} WHERE l.id = ?`).get(lastInsertRowid);
}

// Usada por el socket TCP: {insert:<element>}. La tabla se infiere de las
// claves del JSON, ya que el protocolo no la indica por separado.
//   - trae "titulo"                       -> libros
//   - trae "nombre" y "nacionalidad"       -> autores
//   - trae solo "nombre"                   -> categorias
function insertarElemento(db, element) {
  if (!element || typeof element !== 'object' || Array.isArray(element)) {
    throw new ValidationError('element debe ser un objeto JSON');
  }
  if ('titulo' in element) {
    return { tabla: 'libros', registro: crearLibro(db, element) };
  }
  if ('nombre' in element && 'nacionalidad' in element) {
    return { tabla: 'autores', registro: crearAutor(db, element.nombre, element.nacionalidad) };
  }
  if ('nombre' in element) {
    return { tabla: 'categorias', registro: crearCategoria(db, element.nombre) };
  }
  throw new ValidationError(
    'No se pudo determinar la tabla: use "titulo" (libro), "nombre"+"nacionalidad" (autor) o solo "nombre" (categoria)'
  );
}

// Usada por el socket TCP: {get:<element>}, con element = { tabla, id? }.
function obtenerElementos(db, criterio) {
  if (!criterio || typeof criterio !== 'object' || Array.isArray(criterio)) {
    throw new ValidationError('element debe ser un objeto JSON, ej. {"tabla":"libros"}');
  }
  const { tabla, id } = criterio;
  if (!['libros', 'autores', 'categorias'].includes(tabla)) {
    throw new ValidationError('tabla debe ser "libros", "autores" o "categorias"');
  }
  if (id !== undefined && !isId(id)) {
    throw new ValidationError('id debe ser un entero positivo');
  }

  if (tabla === 'libros') {
    return id !== undefined
      ? db.prepare(`${LIBRO_SELECT} WHERE l.id = ?`).all(id)
      : db.prepare(`${LIBRO_SELECT} ORDER BY l.id`).all();
  }
  if (tabla === 'autores') {
    return id !== undefined
      ? db.prepare('SELECT id, nombre, nacionalidad FROM autores WHERE id = ?').all(id)
      : db.prepare('SELECT id, nombre, nacionalidad FROM autores ORDER BY id').all();
  }
  return id !== undefined
    ? db.prepare('SELECT id, nombre FROM categorias WHERE id = ?').all(id)
    : db.prepare('SELECT id, nombre FROM categorias ORDER BY id').all();
}

module.exports = {
  ValidationError,
  isText,
  isId,
  LIBRO_SELECT,
  crearCategoria,
  crearAutor,
  crearLibro,
  insertarElemento,
  obtenerElementos,
};
