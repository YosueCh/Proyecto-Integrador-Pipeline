const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');

// Cada prueba usa una BD SQLite nueva (con datos semilla) en una carpeta temporal.
let dataDir, db, app;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p5-'));
  db = openDatabase(dataDir);
  app = createApp({ db, backupDir: path.join(dataDir, 'backups') });
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const libroValido = { titulo: 'Dune', anio: 1965, autor_id: 1, categoria_id: 1 };

describe('GET /', () => {
  test('devuelve estado ok (healthcheck)', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.data[0].estado).toBe('ok revisando');
  });
  test('ruta inexistente -> 404 con esquema estandar', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404, data: [] });
  });
});

describe('GET /api/health', () => {
  test('responde ok con uptime', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data[0].estado).toBe('ok');
    expect(typeof res.body.data[0].uptime).toBe('number');
  });
});

describe('Categorias', () => {
  test('GET lista las 3 categorias semilla', async () => {
    const res = await request(app).get('/api/categorias');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
  });
  test('POST crea categoria (201)', async () => {
    const res = await request(app).post('/api/categorias').send({ nombre: '  Historia ' });
    expect(res.status).toBe(201);
    expect(res.body.data[0].nombre).toBe('Historia');
  });
  test.each([
    ['sin nombre', {}],
    ['nombre vacio', { nombre: '   ' }],
    ['nombre numerico', { nombre: 123 }],
    ['nombre null', { nombre: null }],
  ])('POST falla con %s -> 400', async (_n, body) => {
    const res = await request(app).post('/api/categorias').send(body);
    expect(res.status).toBe(400);
    expect(res.body.data).toEqual([]);
  });
  test('POST duplicada -> 409', async () => {
    const res = await request(app).post('/api/categorias').send({ nombre: 'Novela' });
    expect(res.status).toBe(409);
  });
  test('POST con JSON malformado -> 400', async () => {
    const res = await request(app)
      .post('/api/categorias')
      .set('Content-Type', 'application/json')
      .send('{nombre:');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('JSON invalido');
  });
  test('PUT actualiza nombre', async () => {
    const res = await request(app).put('/api/categorias/1').send({ nombre: 'Ficcion' });
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual({ id: 1, nombre: 'Ficcion' });
  });
  test('PUT id inexistente -> 404', async () => {
    const res = await request(app).put('/api/categorias/999').send({ nombre: 'X' });
    expect(res.status).toBe(404);
  });
  test('PUT id invalido -> 400', async () => {
    const res = await request(app).put('/api/categorias/abc').send({ nombre: 'X' });
    expect(res.status).toBe(400);
  });
  test('PUT sin nombre -> 400', async () => {
    const res = await request(app).put('/api/categorias/1').send({});
    expect(res.status).toBe(400);
  });
  test('PUT nombre duplicado -> 409', async () => {
    const res = await request(app).put('/api/categorias/1').send({ nombre: 'Ciencia' });
    expect(res.status).toBe(409);
  });
  test('DELETE categoria sin libros -> 200', async () => {
    const nueva = await request(app).post('/api/categorias').send({ nombre: 'Temp' });
    const res = await request(app).delete(`/api/categorias/${nueva.body.data[0].id}`);
    expect(res.status).toBe(200);
    const lista = await request(app).get('/api/categorias');
    expect(lista.body.data).toHaveLength(3);
  });
  test('DELETE categoria con libros -> 409 (llave foranea)', async () => {
    const res = await request(app).delete('/api/categorias/1');
    expect(res.status).toBe(409);
  });
  test('DELETE categoria inexistente -> 404', async () => {
    expect((await request(app).delete('/api/categorias/999')).status).toBe(404);
  });
});

describe('Autores', () => {
  test('GET lista autores semilla', async () => {
    const res = await request(app).get('/api/autores');
    expect(res.status).toBe(200);
    expect(res.body.data[1].nombre).toBe('Carl Sagan');
  });
  test('POST crea autor con nacionalidad', async () => {
    const res = await request(app)
      .post('/api/autores')
      .send({ nombre: 'Isaac Asimov', nacionalidad: 'Rusa' });
    expect(res.status).toBe(201);
    expect(res.body.data[0].nacionalidad).toBe('Rusa');
  });
  test('POST sin nacionalidad la guarda como null', async () => {
    const res = await request(app).post('/api/autores').send({ nombre: 'Anonimo' });
    expect(res.status).toBe(201);
    expect(res.body.data[0].nacionalidad).toBeNull();
  });
  test('POST sin nombre -> 400', async () => {
    expect((await request(app).post('/api/autores').send({ nacionalidad: 'X' })).status).toBe(400);
  });
  test('POST nacionalidad no texto -> 400', async () => {
    const res = await request(app).post('/api/autores').send({ nombre: 'A', nacionalidad: 5 });
    expect(res.status).toBe(400);
  });
  test('POST autor duplicado -> 409', async () => {
    const res = await request(app).post('/api/autores').send({ nombre: 'Carl Sagan' });
    expect(res.status).toBe(409);
  });
  test('POST sin cuerpo -> 400', async () => {
    expect((await request(app).post('/api/autores')).status).toBe(400);
  });
  test('PUT actualiza autor', async () => {
    const res = await request(app)
      .put('/api/autores/2')
      .send({ nombre: 'Carl E. Sagan', nacionalidad: 'USA' });
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual({ id: 2, nombre: 'Carl E. Sagan', nacionalidad: 'USA' });
  });
  test('PUT autor inexistente -> 404', async () => {
    expect((await request(app).put('/api/autores/99').send({ nombre: 'X' })).status).toBe(404);
  });
  test('PUT nombre vacio -> 400', async () => {
    expect((await request(app).put('/api/autores/1').send({ nombre: '' })).status).toBe(400);
  });
});

describe('Libros', () => {
  test('GET lista libros con autor y categoria', async () => {
    const res = await request(app).get('/api/libros');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[2]).toMatchObject({ titulo: 'Clean Code', categoria: 'Tecnologia' });
  });
  test('GET filtra por categoria_id', async () => {
    const res = await request(app).get('/api/libros?categoria_id=2');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].titulo).toBe('Cosmos');
  });
  test.each(['abc', '0', '-1', '1.5'])('GET categoria_id=%s -> 400', async (v) => {
    expect((await request(app).get(`/api/libros?categoria_id=${v}`)).status).toBe(400);
  });
  test('POST crea libro (201)', async () => {
    const res = await request(app).post('/api/libros').send(libroValido);
    expect(res.status).toBe(201);
    expect(res.body.data[0]).toMatchObject({ titulo: 'Dune', autor: 'Gabriel Garcia Marquez' });
  });
  test('POST sin titulo -> 400', async () => {
    const { titulo, ...sin } = libroValido;
    expect((await request(app).post('/api/libros').send(sin)).status).toBe(400);
  });
  test.each([
    ['autor_id texto', { autor_id: '1' }],
    ['autor_id negativo', { autor_id: -3 }],
    ['categoria_id faltante', { categoria_id: undefined }],
    ['anio decimal', { anio: 19.5 }],
    ['anio texto', { anio: 'mil' }],
    ['autor inexistente', { autor_id: 999 }],
    ['categoria inexistente', { categoria_id: 999 }],
  ])('POST invalido: %s -> 400', async (_n, cambio) => {
    const res = await request(app).post('/api/libros').send({ ...libroValido, ...cambio });
    expect(res.status).toBe(400);
    expect(res.body.data).toEqual([]);
  });
  test('POST libro duplicado (mismo titulo y autor) -> 409', async () => {
    const res = await request(app)
      .post('/api/libros')
      .send({ titulo: 'Cosmos', autor_id: 2, categoria_id: 2 });
    expect(res.status).toBe(409);
  });
  test('PUT actualiza libro', async () => {
    const res = await request(app).put('/api/libros/1').send({ ...libroValido, titulo: 'Nuevo' });
    expect(res.status).toBe(200);
    expect(res.body.data[0].titulo).toBe('Nuevo');
  });
  test('PUT libro inexistente -> 404', async () => {
    expect((await request(app).put('/api/libros/999').send(libroValido)).status).toBe(404);
  });
  test('PUT con autor inexistente -> 400', async () => {
    const res = await request(app).put('/api/libros/1').send({ ...libroValido, autor_id: 999 });
    expect(res.status).toBe(400);
  });
  test('PUT id no numerico -> 400', async () => {
    expect((await request(app).put('/api/libros/x').send(libroValido)).status).toBe(400);
  });
  test('DELETE elimina libro y ya no aparece', async () => {
    const res = await request(app).delete('/api/libros/1');
    expect(res.status).toBe(200);
    expect(res.body.data[0].titulo).toBe('Cien anios de soledad');
    expect((await request(app).get('/api/libros')).body.data).toHaveLength(2);
  });
  test('DELETE dos veces -> segundo 404', async () => {
    await request(app).delete('/api/libros/1');
    expect((await request(app).delete('/api/libros/1')).status).toBe(404);
  });
  test.each(['abc', '0', '-5'])('DELETE id=%s -> 400', async (id) => {
    expect((await request(app).delete(`/api/libros/${id}`)).status).toBe(400);
  });
});

describe('Backup y vaciar', () => {
  test('POST /api/backup crea archivo', async () => {
    const res = await request(app).post('/api/backup');
    expect(res.status).toBe(201);
    expect(fs.readdirSync(path.join(dataDir, 'backups')).length).toBe(1);
  });
  test('DELETE /api/vaciar borra todo', async () => {
    const res = await request(app).delete('/api/vaciar');
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/libros')).body.data).toEqual([]);
    expect((await request(app).get('/api/categorias')).body.data).toEqual([]);
  });
});
