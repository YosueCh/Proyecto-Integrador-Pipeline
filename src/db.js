const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

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
  return db;
}

module.exports = { openDatabase };
