const crypto = require('node:crypto');
const express = require('express');
const { metrics } = require('@opentelemetry/api');
const { createRouter, ok, fail } = require('./routes');
const { createAuthRouter, requireAuth, soloAdmin } = require('./usuarios');
const logger = require('./logger');
const { registrarTemperatura } = require('./temperatura');

// Metricas por endpoint (RF-04): latencia, volumen de peticiones y errores HTTP,
// etiquetadas con metodo, ruta y codigo de estado. Sin SDK activo son no-ops.
const meter = metrics.getMeter('biblioteca-api');
const latencia = meter.createHistogram('http_request_duration_ms', {
  description: 'Latencia de las peticiones HTTP por endpoint',
  unit: 'ms',
  advice: { explicitBucketBoundaries: [5, 10, 25, 50, 100, 250, 500, 1000, 2500] },
});
const peticiones = meter.createCounter('http_requests_total', { description: 'Peticiones HTTP recibidas' });
const errores = meter.createCounter('http_errors_total', { description: 'Respuestas HTTP con codigo 4xx o 5xx' });

registrarTemperatura();

function createApp({ db, backupDir, jwtSecret = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex') }) {
  const app = express();
  app.use(express.json());

  // Mide cada peticion cuando termina de responderse
  app.use((req, res, next) => {
    const inicio = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
      const ruta = req.route ? `${req.baseUrl}${req.route.path}` : res.statusCode === 401 ? 'sin_autenticar' : 'no_encontrada';
      const atributos = { method: req.method, route: ruta, status_code: res.statusCode };
      latencia.record(ms, atributos);
      peticiones.add(1, atributos);
      if (res.statusCode >= 400) errores.add(1, atributos);
      if (req.originalUrl !== '/api/health') {
        const nivel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
        logger[nivel]('peticion HTTP', { ...atributos, path: req.originalUrl.split('?')[0], duration_ms: Math.round(ms * 100) / 100, user: req.user?.sub });
      }
    });
    next();
  });

  // 1. GET /  -> estado del servicio (tambien sirve como healthcheck)
  app.get('/', (req, res) => {
    ok(res, [{ servicio: 'biblioteca-api-test', estado: 'ok revisando', hora: new Date().toISOString() }]);
  });

  // Login y usuarios; el resto de /api exige un token valido (salvo /api/health)
  app.use('/api', createAuthRouter({ db, jwtSecret }));
  app.use('/api', (req, res, next) => (req.path === '/health' ? next() : requireAuth(jwtSecret)(req, res, next)));
  app.use(['/api/backup', '/api/vaciar'], soloAdmin); // operaciones destructivas: solo admin
  app.use('/api', createRouter({ db, backupDir }));

  // Cualquier ruta no definida
  app.use((req, res) => fail(res, 404, 'Ruta no encontrada'));

  // Manejador central de errores: mantiene el mismo esquema { statusCode, data }
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return fail(res, 400, 'JSON invalido');
    if (typeof err.code === 'string' && err.code.startsWith('SQLITE_CONSTRAINT')) {
      return fail(res, 409, 'Conflicto con los datos existentes (duplicado o registro relacionado)');
    }
    logger.error('error no controlado', { error: err.message, stack: err.stack, path: req.path });
    return fail(res, 500, 'Error interno del servidor');
  });

  return app;
}

module.exports = { createApp };
