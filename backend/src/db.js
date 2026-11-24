const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { hashPassword } = require('./auth');
const { traceDb } = require('./tracedDb');

// Modelo normalizado (3FN): cada dato vive en una sola tabla y las relaciones
// se expresan con llaves foraneas, no repitiendo texto.
//   categorias 1 --- N libros N --- 1 autores
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS categorias (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS autores (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre       TEXT NOT NULL UNIQUE,
    nacionalidad TEXT
  );

  CREATE TABLE IF NOT EXISTS libros (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo       TEXT NOT NULL,
    anio         INTEGER,
    autor_id     INTEGER NOT NULL REFERENCES autores(id)    ON DELETE RESTRICT,
    categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
    UNIQUE (titulo, autor_id)
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    nombre        TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    rol           TEXT NOT NULL DEFAULT 'lector' CHECK (rol IN ('admin', 'lector'))
  );
`;

function seed(db) {
  const insertCategoria = db.prepare('INSERT INTO categorias (nombre) VALUES (?)');
  const insertAutor = db.prepare('INSERT INTO autores (nombre, nacionalidad) VALUES (?, ?)');
  const insertLibro = db.prepare(
    'INSERT INTO libros (titulo, anio, autor_id, categoria_id) VALUES (?, ?, ?, ?)'
  );

  db.transaction(() => {
    const novela = insertCategoria.run('Novela').lastInsertRowid;
    const ciencia = insertCategoria.run('Ciencia').lastInsertRowid;
    const tecnologia = insertCategoria.run('Tecnologia').lastInsertRowid;

    const garcia = insertAutor.run('Gabriel Garcia Marquez', 'Colombiana').lastInsertRowid;
    const sagan = insertAutor.run('Carl Sagan', 'Estadounidense').lastInsertRowid;
    const martin = insertAutor.run('Robert C. Martin', 'Estadounidense').lastInsertRowid;

    insertLibro.run('Cien anios de soledad', 1967, garcia, novela);
    insertLibro.run('Cosmos', 1980, sagan, ciencia);
    insertLibro.run('Clean Code', 2008, martin, tecnologia);
  })();
}

// Usuario administrador inicial (solo si la tabla esta vacia, tambien en bases anteriores).
// Las credenciales salen de variables de entorno; los valores por omision son para desarrollo.
function seedAdmin(db) {
  if (db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n > 0) return;
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'Admin123!';
  db.prepare('INSERT INTO usuarios (username, nombre, password_hash, rol) VALUES (?, ?, ?, ?)')
    .run(username, 'Administrador', hashPassword(password), 'admin');
}

// Abre (o crea) la base en <dataDir>/app.db. Los datos de ejemplo solo se
// cargan cuando el archivo es nuevo, asi "vaciar" no se deshace al reiniciar.
function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'app.db');
  const isNew = !fs.existsSync(file);

  const db = new Database(file);
  db.pragma('foreign_keys = ON'); // SQLite no valida llaves foraneas si no se activa
  db.exec(SCHEMA);
  if (isNew) seed(db);
  seedAdmin(db);
  return traceDb(db);
}

module.exports = { openDatabase };
