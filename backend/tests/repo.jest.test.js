const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../src/db');
const { ValidationError, insertarElemento, obtenerElementos, crearAutor } = require('../src/repo');

let dataDir, db;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
  db = openDatabase(dataDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('insertarElemento', () => {
  test('infiere libros por la clave "titulo"', () => {
    const r = insertarElemento(db, { titulo: 'Dune', autor_id: 1, categoria_id: 1 });
    expect(r.tabla).toBe('libros');
    expect(r.registro.titulo).toBe('Dune');
  });
  test('infiere autores por "nombre" + "nacionalidad"', () => {
    const r = insertarElemento(db, { nombre: 'Asimov', nacionalidad: 'Rusa' });
    expect(r.tabla).toBe('autores');
  });
  test('infiere categorias solo por "nombre"', () => {
    const r = insertarElemento(db, { nombre: 'Historia' });
    expect(r.tabla).toBe('categorias');
  });
  test.each([null, undefined, 'texto', 5, []])('rechaza element invalido: %p', (el) => {
    expect(() => insertarElemento(db, el)).toThrow(ValidationError);
  });
  test('rechaza objeto sin claves reconocibles', () => {
    expect(() => insertarElemento(db, { otro: 1 })).toThrow(/No se pudo determinar la tabla/);
  });
});

describe('obtenerElementos', () => {
  test.each([
    ['libros', 3],
    ['autores', 3],
    ['categorias', 3],
  ])('lista todos los registros de %s', (tabla, total) => {
    expect(obtenerElementos(db, { tabla })).toHaveLength(total);
  });
  test.each(['libros', 'autores', 'categorias'])('busca por id en %s', (tabla) => {
    const r = obtenerElementos(db, { tabla, id: 1 });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(1);
  });
  test('id inexistente devuelve lista vacia', () => {
    expect(obtenerElementos(db, { tabla: 'libros', id: 999 })).toEqual([]);
  });
  test.each([null, 'x', []])('rechaza criterio invalido: %p', (c) => {
    expect(() => obtenerElementos(db, c)).toThrow(ValidationError);
  });
  test('rechaza tabla desconocida', () => {
    expect(() => obtenerElementos(db, { tabla: 'usuarios' })).toThrow(/tabla debe ser/);
  });
  test.each([0, -1, 1.5, '1'])('rechaza id invalido: %p', (id) => {
    expect(() => obtenerElementos(db, { tabla: 'libros', id })).toThrow(/id debe ser/);
  });
});

describe('crearAutor', () => {
  test('rechaza nacionalidad que no es texto', () => {
    expect(() => crearAutor(db, 'X', 5)).toThrow(ValidationError);
  });
});
