const express = require('express');
const { createRouter, ok, fail } = require('./routes');

function createApp({ db, backupDir }) {
  const app = express();
  app.use(express.json());

  // 1. GET /  -> estado del servicio (tambien sirve como healthcheck)
  app.get('/', (req, res) => {
    ok(res, [{ servicio: 'biblioteca-api v2', estado: 'ok', hora: new Date().toISOString() }]);


  app.use('/api', createRouter({ db, backupDir }));

  // Cualquier ruta no definida
  app.use((req, res) => fail(res, 404, 'Ruta no encontrada'));

  // Manejador central de errores: mantiene el mismo esquema { statusCode, data }
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return fail(res, 400, 'JSON invalido');
    if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
      return fail(res, 409, 'Conflicto con los datos existentes (duplicado o registro relacionado)');
    }
    console.error(err);
    return fail(res, 500, 'Error interno del servidor');
  });

  return app;
}

module.exports = { createApp };
