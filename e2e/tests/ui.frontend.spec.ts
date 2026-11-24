import { test, expect, Page } from '@playwright/test';
import { ADMIN_PASSWORD, ADMIN_USER, unico } from './datos';

// Pruebas del frontend (Playwright en el navegador) contra la pila completa.
async function entrar(page: Page, usuario = ADMIN_USER, clave = ADMIN_PASSWORD) {
  await page.goto('/');
  await page.locator('#login-usuario').fill(usuario);
  await page.locator('#login-clave').fill(clave);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test.describe('Login', () => {
  test('muestra el formulario de acceso al abrir el sitio', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible();
    await expect(page.locator('#vista-app')).toBeHidden();
  });

  test('campos vacios muestran un aviso y no llaman a la API', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('#login-error')).toHaveText('Escribe tu usuario y contraseña');
  });

  test('credenciales incorrectas muestran el error del servidor', async ({ page }) => {
    await entrar(page, ADMIN_USER, 'mala-clave');
    await expect(page.locator('#login-error')).toHaveText('Credenciales invalidas');
    await expect(page.locator('#vista-app')).toBeHidden();
  });

  test('credenciales correctas abren la aplicacion con el nombre y rol', async ({ page }) => {
    await entrar(page);
    await expect(page.locator('#vista-app')).toBeVisible();
    await expect(page.locator('#sesion-usuario')).toContainText('admin');
    await expect(page.locator('#tabla-libros tr').first()).toBeVisible();
  });

  test('Salir regresa al login y la sesion no se conserva', async ({ page }) => {
    await entrar(page);
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page.locator('#vista-login')).toBeVisible();
    await page.reload();
    await expect(page.locator('#vista-login')).toBeVisible();
  });
});

test.describe('Catalogo', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page);
    await expect(page.locator('#vista-app')).toBeVisible();
  });

  test('la pestana Libros lista los libros de ejemplo', async ({ page }) => {
    await expect(page.locator('#tabla-libros')).toContainText('Cosmos');
    await expect(page.locator('#tabla-libros')).toContainText('Clean Code');
  });

  test('crear, editar y eliminar un libro desde la interfaz', async ({ page }) => {
    const titulo = `UI ${unico()}`;
    const form = page.locator('#form-libros');

    await form.locator('[name=titulo]').fill(titulo);
    await form.locator('[name=anio]').fill('2024');
    await form.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#mensaje')).toHaveText('Registro creado');
    const fila = page.locator('#tabla-libros tr', { hasText: titulo });
    await expect(fila).toBeVisible();

    await fila.getByRole('button', { name: 'Editar' }).click();
    await expect(form.locator('[name=titulo]')).toHaveValue(titulo);
    await form.locator('[name=titulo]').fill(`${titulo} editado`);
    await form.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#mensaje')).toHaveText('Registro actualizado');
    await expect(page.locator('#tabla-libros tr', { hasText: `${titulo} editado` })).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.locator('#tabla-libros tr', { hasText: `${titulo} editado` }).getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.locator('#mensaje')).toHaveText('Registro eliminado');
    await expect(page.locator('#tabla-libros')).not.toContainText(titulo);
  });

  test('guardar un libro sin titulo muestra el error de validacion', async ({ page }) => {
    await page.locator('#form-libros').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#mensaje')).toHaveClass(/fallo/);
    await expect(page.locator('#mensaje')).toContainText('titulo');
  });

  test('Cancelar limpia el formulario de edicion', async ({ page }) => {
    await page.locator('#tabla-libros tr').first().getByRole('button', { name: 'Editar' }).click();
    await expect(page.locator('#form-libros [name=titulo]')).not.toHaveValue('');
    await page.locator('#form-libros').getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('#form-libros [name=titulo]')).toHaveValue('');
  });

  test('crear una categoria y verla en la lista', async ({ page }) => {
    const nombre = `Cat ${unico()}`;
    await page.getByRole('button', { name: 'Categorías' }).click();
    await page.locator('#form-categorias [name=nombre]').fill(nombre);
    await page.locator('#form-categorias').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#tabla-categorias')).toContainText(nombre);
    page.once('dialog', (d) => d.accept());
    await page.locator('#tabla-categorias tr', { hasText: nombre }).getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.locator('#tabla-categorias')).not.toContainText(nombre);
  });

  test('crear un autor y verlo en la lista', async ({ page }) => {
    const nombre = `Autor ${unico()}`;
    await page.getByRole('button', { name: 'Autores' }).click();
    await page.locator('#form-autores [name=nombre]').fill(nombre);
    await page.locator('#form-autores [name=nacionalidad]').fill('Mexicana');
    await page.locator('#form-autores').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#tabla-autores tr', { hasText: nombre })).toContainText('Mexicana');
  });
});

test.describe('Usuarios', () => {
  test('el administrador crea un usuario lector que luego entra sin la pestana Usuarios', async ({ page }) => {
    const username = `ui${unico()}`;
    await entrar(page);
    await page.getByRole('button', { name: 'Usuarios' }).click();
    const form = page.locator('#form-usuarios');
    await form.locator('[name=username]').fill(username);
    await form.locator('[name=nombre]').fill('Lector UI');
    await form.locator('[name=password]').fill('clave1234');
    await form.locator('[name=rol]').selectOption('lector');
    await form.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.locator('#tabla-usuarios tr', { hasText: username })).toBeVisible();

    await page.getByRole('button', { name: 'Salir' }).click();
    await entrar(page, username, 'clave1234');
    await expect(page.locator('#sesion-usuario')).toContainText('lector');
    await expect(page.locator('#tab-usuarios')).toBeHidden();

    // limpieza como administrador
    await page.getByRole('button', { name: 'Salir' }).click();
    await entrar(page);
    await page.getByRole('button', { name: 'Usuarios' }).click();
    page.once('dialog', (d) => d.accept());
    await page.locator('#tabla-usuarios tr', { hasText: username }).getByRole('button', { name: 'Eliminar' }).click();
    await expect(page.locator('#tabla-usuarios')).not.toContainText(username);
  });
});
