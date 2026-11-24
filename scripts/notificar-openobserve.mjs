// Envia a OpenObserve (API HTTP/JSON) el resultado de una etapa del pipeline: pruebas o despliegue.
// Uso:  EVENTO=pruebas|despliegue RESULTADO=exito|fallo node scripts/notificar-openobserve.mjs
// Variables: OPENOBSERVE_URL, OPENOBSERVE_USER, OPENOBSERVE_PASSWORD (secrets) y las GITHUB_* que define Actions.
// Un fallo al notificar nunca rompe el pipeline: solo se avisa en el log.
import fs from 'node:fs';

const { OPENOBSERVE_URL, OPENOBSERVE_USER, OPENOBSERVE_PASSWORD, EVENTO = 'pruebas', RESULTADO = 'desconocido', RESULTADOS_JSON } = process.env;
const env = process.env;

if (!OPENOBSERVE_URL || !OPENOBSERVE_USER || !OPENOBSERVE_PASSWORD) {
  console.log('OpenObserve no configurado (faltan secrets): se omite el registro del evento.');
  process.exit(0);
}

const registro = {
  _timestamp: Date.now() * 1000, // microsegundos
  evento: EVENTO,
  resultado: RESULTADO,
  commit: env.GITHUB_SHA,
  commit_corto: env.GITHUB_SHA?.slice(0, 7),
  rama: env.GITHUB_REF_NAME,
  usuario: env.GITHUB_ACTOR,
  repositorio: env.GITHUB_REPOSITORY,
  workflow: env.GITHUB_WORKFLOW,
  job: env.GITHUB_JOB,
  run_id: env.GITHUB_RUN_ID,
  run_url: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
  mensaje: env.COMMIT_MENSAJE,
};

// Resumen de Playwright si existe el reporte JSON de la corrida
try {
  if (RESULTADOS_JSON && fs.existsSync(RESULTADOS_JSON)) {
    const { stats } = JSON.parse(fs.readFileSync(RESULTADOS_JSON, 'utf8'));
    Object.assign(registro, {
      pruebas_total: stats.expected + stats.unexpected + stats.flaky + stats.skipped,
      pruebas_pasadas: stats.expected,
      pruebas_fallidas: stats.unexpected,
      pruebas_inestables: stats.flaky,
      duracion_ms: Math.round(stats.duration),
    });
  }
} catch (err) {
  console.log(`No se pudo leer ${RESULTADOS_JSON}: ${err.message}`);
}

try {
  const auth = Buffer.from(`${OPENOBSERVE_USER}:${OPENOBSERVE_PASSWORD}`).toString('base64');
  const res = await fetch(`${OPENOBSERVE_URL.replace(/\/$/, '')}/api/default/ci_pipeline/_json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([registro]),
    signal: AbortSignal.timeout(15000),
  });
  console.log(`OpenObserve respondio ${res.status}: evento "${EVENTO}" = ${RESULTADO}`);
} catch (err) {
  console.log(`No se pudo contactar OpenObserve (${err.message}); el pipeline continua.`);
}
