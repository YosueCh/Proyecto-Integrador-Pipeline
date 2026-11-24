'use strict';

// Cliente de la API de Biblioteca. Todas las llamadas van a /api (nginx las reenvia al backend).
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const TOKEN = 'biblioteca.token';
const USUARIO = 'biblioteca.usuario';

let sesion = null; // { token, usuario }
let catalogos = { autores: [], categorias: [] };

// Identificador W3C Trace Context: el backend continua esta misma traza (navegador -> nginx -> API -> SQLite)
const hex = (bytes) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

async function api(ruta, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json', traceparent: `00-${hex(16)}-${hex(8)}-01` };
  if (sesion) headers.Authorization = `Bearer ${sesion.token}`;
  const res = await fetch(`/api${ruta}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({ statusCode: res.status, data: [], message: 'Respuesta no valida' }));
  if (res.status === 401 && ruta !== '/auth/login') {
    cerrarSesion();
    throw new Error('La sesión expiró, inicia sesión de nuevo');
  }
  if (!res.ok) throw new Error(json.message || `Error ${res.status}`);
  return json.data;
}

function aviso(texto, fallo = false) {
  const el = $('#mensaje');
  el.textContent = texto;
  el.className = fallo ? 'aviso fallo' : 'aviso';
  el.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => { el.hidden = true; }, 4000);
}

const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Sesión ----------
function mostrarVista() {
  $('#vista-login').hidden = Boolean(sesion);
  $('#vista-app').hidden = !sesion;
  if (!sesion) return;
  $('#sesion-usuario').textContent = `${sesion.usuario.nombre} (${sesion.usuario.rol})`;
  $('#tab-usuarios').hidden = sesion.usuario.rol !== 'admin';
  cambiarPestana('libros');
}

function cerrarSesion() {
  sesion = null;
  sessionStorage.removeItem(TOKEN);
  sessionStorage.removeItem(USUARIO);
  mostrarVista();
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = $('#login-error');
  error.hidden = true;
  const username = $('#login-usuario').value.trim();
  const password = $('#login-clave').value;
  if (!username || !password) {
    error.textContent = 'Escribe tu usuario y contraseña';
    error.hidden = false;
    return;
  }
  try {
    const [datos] = await api('/auth/login', { method: 'POST', body: { username, password } });
    sesion = datos;
    sessionStorage.setItem(TOKEN, datos.token);
    sessionStorage.setItem(USUARIO, JSON.stringify(datos.usuario));
    $('#login-clave').value = '';
    mostrarVista();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
});

$('#salir').addEventListener('click', cerrarSesion);

// ---------- Pestañas ----------
function cambiarPestana(nombre) {
  for (const b of document.querySelectorAll('#pestanas button')) b.classList.toggle('activa', b.dataset.tab === nombre);
  for (const s of document.querySelectorAll('[data-seccion]')) s.hidden = s.dataset.seccion !== nombre;
  cargar(nombre).catch((err) => aviso(err.message, true));
}
$('#pestanas').addEventListener('click', (e) => {
  if (e.target.dataset.tab) cambiarPestana(e.target.dataset.tab);
});

// ---------- Definición de cada recurso (columnas, formulario, ruta) ----------
const recursos = {
  libros: {
    ruta: '/libros',
    fila: (l) => [l.id, l.titulo, l.anio ?? '', l.autor, l.categoria],
    cuerpo: (f) => ({ titulo: f.titulo, anio: f.anio === '' ? null : Number(f.anio), autor_id: Number(f.autor_id), categoria_id: Number(f.categoria_id) }),
    nombre: (l) => l.titulo,
  },
  autores: {
    ruta: '/autores',
    fila: (a) => [a.id, a.nombre, a.nacionalidad ?? ''],
    cuerpo: (f) => ({ nombre: f.nombre, nacionalidad: f.nacionalidad || null }),
    nombre: (a) => a.nombre,
  },
  categorias: {
    ruta: '/categorias',
    fila: (c) => [c.id, c.nombre],
    cuerpo: (f) => ({ nombre: f.nombre }),
    nombre: (c) => c.nombre,
  },
  usuarios: {
    ruta: '/usuarios',
    fila: (u) => [u.id, u.username, u.nombre, u.rol],
    cuerpo: (f) => ({ username: f.username, nombre: f.nombre, rol: f.rol, ...(f.password ? { password: f.password } : {}) }),
    nombre: (u) => u.username,
  },
};
// La API no ofrece DELETE de autores; los demás recursos sí (y todos admiten PUT).
const sinBorrado = new Set(['autores']);
const registros = {};

async function cargar(nombre) {
  const r = recursos[nombre];
  if (nombre === 'libros') {
    [catalogos.autores, catalogos.categorias] = await Promise.all([api('/autores'), api('/categorias')]);
    llenarSelect($('#form-libros [name=autor_id]'), catalogos.autores, 'nombre');
    llenarSelect($('#form-libros [name=categoria_id]'), catalogos.categorias, 'nombre');
  }
  registros[nombre] = await api(r.ruta);
  const tbody = $(`#tabla-${nombre}`);
  tbody.innerHTML = registros[nombre].map((reg) => {
    const celdas = r.fila(reg).map((c) => `<td>${escapar(c)}</td>`).join('');
    const borrar = sinBorrado.has(nombre) ? '' : `<button class="chico peligro" data-accion="borrar" data-id="${reg.id}">Eliminar</button>`;
    return `<tr data-id="${reg.id}">${celdas}<td class="acciones"><button class="chico secundario" data-accion="editar" data-id="${reg.id}">Editar</button> ${borrar}</td></tr>`;
  }).join('');
}

function llenarSelect(select, lista, campo) {
  const previo = select.value;
  select.innerHTML = lista.map((x) => `<option value="${x.id}">${escapar(x[campo])}</option>`).join('');
  if (previo) select.value = previo;
}

// ---------- Formularios y tablas ----------
for (const nombre of Object.keys(recursos)) {
  const form = $(`#form-${nombre}`);
  const r = recursos[nombre];

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(form));
    try {
      const id = datos.id;
      await api(id ? `${r.ruta}/${id}` : r.ruta, { method: id ? 'PUT' : 'POST', body: r.cuerpo(datos) });
      aviso(id ? 'Registro actualizado' : 'Registro creado');
      form.reset();
      form.elements.id.value = '';
      await cargar(nombre);
    } catch (err) {
      aviso(err.message, true);
    }
  });

  form.querySelector('.cancelar').addEventListener('click', () => { form.reset(); form.elements.id.value = ''; });

  $(`#tabla-${nombre}`).addEventListener('click', async (e) => {
    const { accion, id } = e.target.dataset;
    if (!accion) return;
    const reg = registros[nombre].find((x) => String(x.id) === id);
    if (accion === 'editar') {
      for (const campo of form.elements) {
        if (campo.name && campo.name !== 'password' && reg[campo.name] !== undefined) campo.value = reg[campo.name] ?? '';
      }
      form.querySelector('input:not([type=hidden])').focus();
    } else if (accion === 'borrar') {
      if (!confirm(`¿Eliminar "${r.nombre(reg)}"?`)) return;
      try {
        await api(`${r.ruta}/${id}`, { method: 'DELETE' });
        aviso('Registro eliminado');
        await cargar(nombre);
      } catch (err) {
        aviso(err.message, true);
      }
    }
  });
}

// ---------- Arranque ----------
try {
  const token = sessionStorage.getItem(TOKEN);
  const usuario = JSON.parse(sessionStorage.getItem(USUARIO) || 'null');
  if (token && usuario) sesion = { token, usuario };
} catch { /* sin sesión previa */ }
mostrarVista();
