const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../src/auth');

const SECRET = 'secreto-de-pruebas';
let dataDir, db, app;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usr-'));
  db = openDatabase(dataDir);
  app = createApp({ db, backupDir: path.join(dataDir, 'backups'), jwtSecret: SECRET });
});

afterEach(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const login = async (username = 'admin', password = 'Admin123!') =>
  request(app).post('/api/auth/login').send({ username, password });
const conToken = (token) => request.agent(app).set('Authorization', `Bearer ${token}`);

describe('utilidades de autenticacion', () => {
  test('hashPassword no guarda la contrasena y verifyPassword la reconoce', () => {
    const hash = hashPassword('secreto1');
    expect(hash).not.toContain('secreto1');
    expect(verifyPassword('secreto1', hash)).toBe(true);
    expect(verifyPassword('otra', hash)).toBe(false);
    expect(verifyPassword('x', 'formato-invalido')).toBe(false);
  });

  test('signToken y verifyToken ida y vuelta', () => {
    const token = signToken({ sub: 'ana' }, SECRET);
    expect(verifyToken(token, SECRET)).toMatchObject({ sub: 'ana' });
  });

  test('verifyToken rechaza firma incorrecta, formato roto y tokens expirados', () => {
    const token = signToken({ sub: 'ana' }, SECRET);
    expect(verifyToken(token, 'otro-secreto')).toBeNull();
    expect(verifyToken('abc', SECRET)).toBeNull();
    expect(verifyToken(signToken({ sub: 'ana' }, SECRET, -10), SECRET)).toBeNull();
  });
});

describe('POST /api/auth/login', () => {
  test('credenciales correctas devuelven token y usuario sin hash', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.data[0].token).toEqual(expect.any(String));
    expect(res.body.data[0].usuario).toEqual({ id: 1, username: 'admin', nombre: 'Administrador', rol: 'admin' });
  });

  test('contrasena incorrecta -> 401', async () => {
    const res = await login('admin', 'mala');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ statusCode: 401, data: [] });
  });

  test('usuario inexistente -> 401', async () => {
    expect((await login('nadie', 'x')).status).toBe(401);
  });

  test('sin datos -> 400', async () => {
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(400);
  });
});

describe('proteccion de la API', () => {
  test('sin token los endpoints responden 401', async () => {
    for (const ruta of ['/api/libros', '/api/autores', '/api/categorias', '/api/usuarios']) {
      expect((await request(app).get(ruta)).status).toBe(401);
    }
  });

  test('/api/health sigue siendo publico', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  test('token invalido -> 401', async () => {
    expect((await conToken('basura').get('/api/libros')).status).toBe(401);
  });

  test('con token valido se puede consultar', async () => {
    const { body } = await login();
    expect((await conToken(body.data[0].token).get('/api/libros')).status).toBe(200);
  });

  test('un lector no puede ver usuarios ni vaciar la base (403)', async () => {
    const lector = signToken({ sub: 'lee', uid: 99, rol: 'lector' }, SECRET);
    expect((await conToken(lector).get('/api/usuarios')).status).toBe(403);
    expect((await conToken(lector).delete('/api/vaciar')).status).toBe(403);
    expect((await conToken(lector).post('/api/backup')).status).toBe(403);
    expect((await conToken(lector).get('/api/libros')).status).toBe(200);
  });
});

describe('CRUD /api/usuarios', () => {
  let api;
  beforeEach(async () => {
    api = conToken((await login()).body.data[0].token);
  });

  test('lista incluye al admin sin password_hash', async () => {
    const res = await api.get('/api/usuarios');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).not.toHaveProperty('password_hash');
  });

  test('crear usuario y entrar con el', async () => {
    const res = await api.post('/api/usuarios').send({ username: 'ana', nombre: 'Ana', password: 'clave123', rol: 'lector' });
    expect(res.status).toBe(201);
    expect(res.body.data[0]).toEqual({ id: 2, username: 'ana', nombre: 'Ana', rol: 'lector' });
    expect((await login('ana', 'clave123')).status).toBe(200);
  });

  test('crear con datos invalidos -> 400', async () => {
    expect((await api.post('/api/usuarios').send({ nombre: 'x', password: 'clave123' })).status).toBe(400);
    expect((await api.post('/api/usuarios').send({ username: 'a', nombre: 'x', password: '123' })).status).toBe(400);
    expect((await api.post('/api/usuarios').send({ username: 'a', nombre: 'x', password: 'clave123', rol: 'dios' })).status).toBe(400);
  });

  test('username repetido -> 409', async () => {
    const res = await api.post('/api/usuarios').send({ username: 'admin', nombre: 'Otro', password: 'clave123' });
    expect(res.status).toBe(409);
  });

  test('actualizar nombre y contrasena', async () => {
    await api.post('/api/usuarios').send({ username: 'ana', nombre: 'Ana', password: 'clave123' });
    const res = await api.put('/api/usuarios/2').send({ nombre: 'Ana Maria', password: 'nueva456' });
    expect(res.status).toBe(200);
    expect(res.body.data[0].nombre).toBe('Ana Maria');
    expect((await login('ana', 'clave123')).status).toBe(401);
    expect((await login('ana', 'nueva456')).status).toBe(200);
  });

  test('actualizar: id invalido 400, inexistente 404, dato invalido 400', async () => {
    expect((await api.put('/api/usuarios/abc').send({})).status).toBe(400);
    expect((await api.put('/api/usuarios/99').send({ nombre: 'x' })).status).toBe(404);
    expect((await api.put('/api/usuarios/1').send({ rol: 'dios' })).status).toBe(400);
  });

  test('eliminar usuario', async () => {
    await api.post('/api/usuarios').send({ username: 'ana', nombre: 'Ana', password: 'clave123' });
    expect((await api.delete('/api/usuarios/2')).status).toBe(200);
    expect((await api.delete('/api/usuarios/2')).status).toBe(404);
  });

  test('eliminar: id invalido 400 y no puede borrarse a si mismo 409', async () => {
    expect((await api.delete('/api/usuarios/abc')).status).toBe(400);
    expect((await api.delete('/api/usuarios/1')).status).toBe(409);
  });
});
