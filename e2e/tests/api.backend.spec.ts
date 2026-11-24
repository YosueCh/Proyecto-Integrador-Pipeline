import { test, expect, APIRequestContext } from '@playwright/test';
import { ADMIN_PASSWORD, ADMIN_USER, unico } from './datos';

// Pruebas de backend de extremo a extremo: HTTP real contra la pila desplegada (nginx -> API -> SQLite).
let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });

async function login(request: APIRequestContext, username: string, password: string) {
  return request.post('/api/auth/login', { data: { username, password } });
}

test.beforeAll(async ({ playwright, baseURL }) => {
  const ctx = await playwright.request.newContext({ baseURL });
  const res = await login(ctx, ADMIN_USER, ADMIN_PASSWORD);
  token = (await res.json()).data[0].token;
  await ctx.dispose();
});

test.describe('Estado y autenticacion', () => {
  test('GET /api/health es publico y responde ok', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect((await res.json()).data[0].estado).toBe('ok');
  });

  test('login correcto devuelve token y usuario admin', async ({ request }) => {
    const res = await login(request, ADMIN_USER, ADMIN_PASSWORD);
    expect(res.status()).toBe(200);
    const { data } = await res.json();
    expect(data[0].token).toBeTruthy();
    expect(data[0].usuario.rol).toBe('admin');
  });

  test('login con contrasena incorrecta devuelve 401', async ({ request }) => {
    const res = await login(request, ADMIN_USER, 'incorrecta');
    expect(res.status()).toBe(401);
    expect(await res.json()).toMatchObject({ statusCode: 401, data: [] });
  });

  test('sin token los endpoints protegidos devuelven 401', async ({ request }) => {
    for (const ruta of ['/api/libros', '/api/autores', '/api/categorias', '/api/usuarios']) {
      expect((await request.get(ruta)).status(), ruta).toBe(401);
    }
  });

  test('una ruta inexistente devuelve 404 con el esquema estandar', async ({ request }) => {
    const res = await request.get('/api/no-existe', { headers: auth() });
    expect(res.status()).toBe(404);
    expect(await res.json()).toMatchObject({ statusCode: 404, data: [] });
  });
});

test.describe('Catalogo: categorias, autores y libros', () => {
  test('las listas traen los datos de ejemplo', async ({ request }) => {
    for (const ruta of ['categorias', 'autores', 'libros']) {
      const res = await request.get(`/api/${ruta}`, { headers: auth() });
      expect(res.status()).toBe(200);
      expect((await res.json()).data.length).toBeGreaterThan(0);
    }
  });

  test('CRUD completo de una categoria', async ({ request }) => {
    const nombre = `Cat ${unico()}`;
    const crear = await request.post('/api/categorias', { headers: auth(), data: { nombre } });
    expect(crear.status()).toBe(201);
    const { id } = (await crear.json()).data[0];

    const editar = await request.put(`/api/categorias/${id}`, { headers: auth(), data: { nombre: `${nombre} editada` } });
    expect((await editar.json()).data[0].nombre).toBe(`${nombre} editada`);

    expect((await request.delete(`/api/categorias/${id}`, { headers: auth() })).status()).toBe(200);
    expect((await request.delete(`/api/categorias/${id}`, { headers: auth() })).status()).toBe(404);
  });

  test('crear un autor y actualizarlo', async ({ request }) => {
    const nombre = `Autor ${unico()}`;
    const crear = await request.post('/api/autores', { headers: auth(), data: { nombre, nacionalidad: 'Mexicana' } });
    expect(crear.status()).toBe(201);
    const { id } = (await crear.json()).data[0];
    const editar = await request.put(`/api/autores/${id}`, { headers: auth(), data: { nombre, nacionalidad: 'Chilena' } });
    expect((await editar.json()).data[0].nacionalidad).toBe('Chilena');
  });

  test('CRUD completo de un libro con filtro por categoria', async ({ request }) => {
    const titulo = `Libro ${unico()}`;
    const crear = await request.post('/api/libros', { headers: auth(), data: { titulo, anio: 2024, autor_id: 1, categoria_id: 1 } });
    expect(crear.status()).toBe(201);
    const libro = (await crear.json()).data[0];
    expect(libro).toMatchObject({ titulo, anio: 2024 });

    const filtrados = await request.get('/api/libros?categoria_id=1', { headers: auth() });
    expect((await filtrados.json()).data.some((l: { id: number }) => l.id === libro.id)).toBe(true);

    const editar = await request.put(`/api/libros/${libro.id}`, { headers: auth(), data: { titulo: `${titulo} v2`, anio: 2025, autor_id: 1, categoria_id: 1 } });
    expect((await editar.json()).data[0].anio).toBe(2025);

    expect((await request.delete(`/api/libros/${libro.id}`, { headers: auth() })).status()).toBe(200);
    expect((await request.delete(`/api/libros/${libro.id}`, { headers: auth() })).status()).toBe(404);
  });

  test('un libro con datos invalidos devuelve 400', async ({ request }) => {
    const res = await request.post('/api/libros', { headers: auth(), data: { titulo: '', autor_id: 1, categoria_id: 1 } });
    expect(res.status()).toBe(400);
    expect((await res.json()).message).toMatch(/titulo/);
  });

  test('un libro con un autor inexistente devuelve 400', async ({ request }) => {
    const res = await request.post('/api/libros', { headers: auth(), data: { titulo: 'X', autor_id: 99999, categoria_id: 1 } });
    expect(res.status()).toBe(400);
  });

  test('no se puede borrar una categoria con libros (409)', async ({ request }) => {
    expect((await request.delete('/api/categorias/1', { headers: auth() })).status()).toBe(409);
  });
});

test.describe('Usuarios y permisos', () => {
  test('CRUD de usuarios: un usuario nuevo entra con su contrasena', async ({ request }) => {
    const username = `u${unico()}`;
    const crear = await request.post('/api/usuarios', { headers: auth(), data: { username, nombre: 'Prueba', password: 'clave1234', rol: 'lector' } });
    expect(crear.status()).toBe(201);
    const { id } = (await crear.json()).data[0];

    expect((await login(request, username, 'clave1234')).status()).toBe(200);
    expect((await request.put(`/api/usuarios/${id}`, { headers: auth(), data: { nombre: 'Renombrado' } })).status()).toBe(200);
    expect((await request.delete(`/api/usuarios/${id}`, { headers: auth() })).status()).toBe(200);
    expect((await login(request, username, 'clave1234')).status()).toBe(401);
  });

  test('un lector puede consultar pero no administrar usuarios (403)', async ({ request }) => {
    const username = `l${unico()}`;
    const crear = await request.post('/api/usuarios', { headers: auth(), data: { username, nombre: 'Lector', password: 'clave1234', rol: 'lector' } });
    const { id } = (await crear.json()).data[0];
    const tokenLector = (await (await login(request, username, 'clave1234')).json()).data[0].token;
    const h = { Authorization: `Bearer ${tokenLector}` };

    expect((await request.get('/api/libros', { headers: h })).status()).toBe(200);
    expect((await request.get('/api/usuarios', { headers: h })).status()).toBe(403);
    expect((await request.delete('/api/vaciar', { headers: h })).status()).toBe(403);

    await request.delete(`/api/usuarios/${id}`, { headers: auth() });
  });

  test('el administrador no puede eliminarse a si mismo (409)', async ({ request }) => {
    const lista = await (await request.get('/api/usuarios', { headers: auth() })).json();
    const admin = lista.data.find((u: { username: string }) => u.username === ADMIN_USER);
    expect((await request.delete(`/api/usuarios/${admin.id}`, { headers: auth() })).status()).toBe(409);
  });
});
