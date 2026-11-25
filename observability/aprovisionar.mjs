// Crea (o reemplaza) en OpenObserve el dashboard "Biblioteca - Observabilidad" y las alertas operativas.
// Uso:  OPENOBSERVE_URL=http://host:5080 OPENOBSERVE_USER=... OPENOBSERVE_PASSWORD=... node observability/aprovisionar.mjs
// Es idempotente: si el dashboard o la alerta ya existen con el mismo nombre, se borran y se vuelven a crear.
const { OPENOBSERVE_URL = 'http://localhost:5080', OPENOBSERVE_USER, OPENOBSERVE_PASSWORD, ORG = 'default' } = process.env;
if (!OPENOBSERVE_USER || !OPENOBSERVE_PASSWORD) {
  console.error('Defina OPENOBSERVE_USER y OPENOBSERVE_PASSWORD');
  process.exit(1);
}
const servidor = OPENOBSERVE_URL.replace(/\/$/, '');
const base = `${servidor}/api/${ORG}`;
const baseV2 = `${servidor}/api/v2/${ORG}`;
const headers = {
  Authorization: `Basic ${Buffer.from(`${OPENOBSERVE_USER}:${OPENOBSERVE_PASSWORD}`).toString('base64')}`,
  'Content-Type': 'application/json',
};
async function llamar(metodo, ruta, cuerpo, raiz = base) {
  const res = await fetch(`${raiz}${ruta}`, { method: metodo, headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const texto = await res.text();
  let json;
  try { json = JSON.parse(texto); } catch { json = texto; }
  return { ok: res.ok, status: res.status, json };
}

// ---------- Paneles ----------
let contador = 0;
const rejilla = (x, y, w, h) => ({ x, y, w, h, i: ++contador });

// Panel con PromQL (metricas)
function promql(titulo, consulta, { tipo = 'line', unidad, leyenda = '', x = 0, y = 0, w = 12, h = 8 } = {}) {
  return {
    id: `Panel_${contador + 1}`,
    type: tipo,
    title: titulo,
    description: '',
    config: { show_legends: true, legends_position: 'bottom', unit: unidad || 'default', promql_table_mode: 'expanded' },
    queryType: 'promql',
    queries: [{
      query: consulta,
      customQuery: true,
      fields: { stream: '', stream_type: 'metrics', x: [], y: [], z: [], filter: { filterType: 'group', logicalOperator: 'AND', conditions: [] } },
      config: { promql_legend: leyenda, layer_type: 'scatter', weight_fixed: 1, limit: 0, min: 0, max: 100 },
    }],
    layout: rejilla(x, y, w, h),
    htmlContent: '',
    markdownContent: '',
  };
}

// Panel con SQL (logs y trazas); "columnas" = [{alias, nombre}] para las tablas
function sql(titulo, consulta, flujo, tipoFlujo, columnas, { tipo = 'table', x = 0, y = 0, w = 12, h = 8, unidad } = {}) {
  return {
    id: `Panel_${contador + 1}`,
    type: tipo,
    title: titulo,
    description: '',
    config: { show_legends: true, legends_position: 'bottom', unit: unidad || 'default' },
    queryType: 'sql',
    queries: [{
      query: consulta,
      customQuery: true,
      fields: {
        stream: flujo,
        stream_type: tipoFlujo,
        x: columnas.filter((c) => c.eje === 'x').map((c) => ({ label: c.alias, alias: c.alias, column: c.alias, color: null, aggregationFunction: null })),
        y: columnas.filter((c) => c.eje !== 'x').map((c) => ({ label: c.alias, alias: c.alias, column: c.alias, color: '#5960b2', aggregationFunction: 'count' })),
        z: [],
        filter: { filterType: 'group', logicalOperator: 'AND', conditions: [] },
      },
      config: { promql_legend: '', layer_type: 'scatter', weight_fixed: 1, limit: 0 },
    }],
    layout: rejilla(x, y, w, h),
    htmlContent: '',
    markdownContent: '',
  };
}

const paneles = [
  // --- Fila 1: pipeline CI/CD (logs) ---
  sql(
    'Pipeline CI/CD: ejecuciones recientes (pruebas y despliegues)',
    'SELECT to_char(to_timestamp(_timestamp/1000000), \'%Y-%m-%d %H:%M:%S\') AS hora, evento, resultado, commit_corto AS commit, rama, usuario, pruebas_pasadas AS pasadas, pruebas_fallidas AS fallidas FROM "ci_pipeline" ORDER BY _timestamp DESC LIMIT 15',
    'ci_pipeline', 'logs',
    ['hora', 'evento', 'resultado', 'commit', 'rama', 'usuario', 'pasadas', 'fallidas'].map((alias) => ({ alias, eje: 'y' })),
    { x: 0, y: 0, w: 30, h: 9 }
  ),

  sql(
    'Alertas disparadas',
    `SELECT to_char(to_timestamp(_timestamp/1000000), '%Y-%m-%d %H:%M:%S') AS hora, alerta, flujo, coincidencias FROM "alertas_disparadas" ORDER BY _timestamp DESC LIMIT 10`,
    'alertas_disparadas', 'logs',
    ['hora', 'alerta', 'flujo', 'coincidencias'].map((alias) => ({ alias, eje: 'y' })),
    { x: 30, y: 0, w: 18, h: 9 }
  ),

  // --- Fila 2: aplicación (metricas) ---
  promql('Peticiones por segundo (por endpoint)', 'sum by (route, method) (rate(http_requests_total[1m]))', { x: 0, y: 9, w: 24, h: 9, unidad: 'default' }),
  promql('Latencia media por endpoint (ms)', 'sum by (route) (rate(http_request_duration_ms_sum[1m])) / sum by (route) (rate(http_request_duration_ms_count[1m]))', { x: 24, y: 9, w: 24, h: 9, unidad: 'milliseconds' }),
  promql('Errores HTTP por segundo (4xx y 5xx, por endpoint y codigo)', 'sum by (route, status_code) (rate(http_errors_total[1m]))', { x: 0, y: 18, w: 24, h: 9 }),
  promql('Peticiones por codigo de estado (total acumulado)', 'sum by (status_code) (http_requests_total)', { tipo: 'bar', x: 24, y: 18, w: 24, h: 9 }),

  // --- Fila 3: logs y trazas de la aplicación ---
  sql(
    'Logs de la API: ultimos eventos',
    'SELECT to_char(to_timestamp(_timestamp/1000000), \'%H:%M:%S\') AS hora, severity AS nivel, method AS metodo, path AS ruta, status_code AS codigo, duration_ms AS ms, trace_id FROM "default" ORDER BY _timestamp DESC LIMIT 15',
    'default', 'logs',
    ['hora', 'nivel', 'metodo', 'ruta', 'codigo', 'ms', 'trace_id'].map((alias) => ({ alias, eje: 'y' })),
    { x: 0, y: 27, w: 24, h: 10 }
  ),
  sql(
    'Trazas: peticiones HTTP y consultas SQLite recientes',
    'SELECT to_char(to_timestamp(start_time/1000000000), \'%H:%M:%S\') AS hora, operation_name AS operacion, duration/1000 AS micros, trace_id FROM "default" ORDER BY start_time DESC LIMIT 15',
    'default', 'traces',
    ['hora', 'operacion', 'micros', 'trace_id'].map((alias) => ({ alias, eje: 'y' })),
    { x: 24, y: 27, w: 24, h: 10 }
  ),

  // --- Fila 4: infraestructura de la instancia (hostmetrics) ---
  promql('CPU del servidor (%)', '100 * (1 - sum(rate(system_cpu_time{state="idle"}[1m])) / sum(rate(system_cpu_time[1m])))', { x: 0, y: 37, w: 24, h: 9, unidad: 'percent' }),
  promql('Memoria RAM usada (%)', '100 * sum(system_memory_usage{state="used"}) / sum(system_memory_usage)', { x: 24, y: 37, w: 24, h: 9, unidad: 'percent' }),
  promql('Ancho de banda de red (bytes/s)', 'sum by (direction) (rate(system_network_io[1m]))', { x: 0, y: 46, w: 24, h: 9, unidad: 'bytes' }),
  promql('Temperatura estimada (°C)', 'host_temperature_celsius', { x: 24, y: 46, w: 24, h: 9, unidad: 'default' }),
];

const dashboard = {
  version: 5,
  dashboardId: '',
  title: 'Biblioteca - Observabilidad',
  description: 'Pipeline CI/CD, trazas y logs de la API, metricas por endpoint y recursos de la instancia EC2',
  role: '',
  owner: OPENOBSERVE_USER,
  created: new Date().toISOString(),
  tabs: [{ tabId: 'default', name: 'Resumen', panels: paneles }],
  variables: { list: [], showDynamicFilters: false },
  defaultDatetimeDuration: { type: 'relative', relativeTimePeriod: '1h', startTime: null, endTime: null },
};

// ---------- Alertas ----------
const alertas = [
  {
    name: 'api_tasa_de_errores_alta',
    stream_type: 'metrics',
    stream_name: 'http_errors_total',
    is_real_time: false,
    query_condition: { type: 'promql', promql: 'sum(rate(http_errors_total{status_code=~"5.."}[5m]))', promql_condition: { column: 'value', operator: '>', value: 0.05 }, aggregation: null, conditions: null, sql: null },
    trigger_condition: { period: 5, operator: '>=', threshold: 1, frequency: 1, cron: '', frequency_type: 'minutes', silence: 10 },
    description: 'Errores 5xx sostenidos en la API (> 0.05/s durante 5 minutos)',
    enabled: true,
  },
  {
    name: 'despliegue_o_pruebas_fallidas',
    stream_type: 'logs',
    stream_name: 'ci_pipeline',
    is_real_time: false,
    query_condition: { type: 'custom', conditions: { or: [{ column: 'resultado', operator: '=', value: 'fallo', ignore_case: true }] }, aggregation: null, promql: null, sql: null },
    trigger_condition: { period: 10, operator: '>=', threshold: 1, frequency: 1, cron: '', frequency_type: 'minutes', silence: 10 },
    description: 'El pipeline registro una ejecucion de pruebas o un despliegue fallido',
    enabled: true,
  },
];

// Destino de las alertas: un webhook hacia el propio OpenObserve que guarda cada alerta disparada en el
// flujo "alertas_disparadas" (visible en el dashboard). Se puede cambiar por Slack, correo, etc.
const PLANTILLA = 'plantilla_alertas_biblioteca';
const DESTINO = 'destino_alertas_biblioteca';
const urlInterna = process.env.OPENOBSERVE_URL_INTERNA || 'http://openobserve:5080';
// Las alertas usan el destino, asi que se borran primero (idempotencia)
async function borrarAlertas() {
  const previas = await llamar('GET', '/alerts', undefined, baseV2);
  for (const a of previas.json?.list || []) {
    if (alertas.some((x) => x.name === a.name)) await llamar('DELETE', `/alerts/${a.alert_id || a.id}`, undefined, baseV2);
  }
}
await borrarAlertas();

async function prepararDestino() {
  await llamar('DELETE', `/alerts/destinations/${DESTINO}`);
  await llamar('DELETE', `/alerts/templates/${PLANTILLA}`);
  const t = await llamar('POST', '/alerts/templates', {
    name: PLANTILLA,
    type: 'http',
    body: '[{"alerta":"{alert_name}","flujo":"{stream_name}","tipo":"{alert_type}","umbral":"{alert_threshold}","coincidencias":"{alert_count}","inicio":"{alert_start_time}"}]',
  });
  const d = await llamar('POST', '/alerts/destinations', {
    name: DESTINO,
    type: 'http',
    url: `${urlInterna.replace(/\/+$/, '')}/api/${ORG}/alertas_disparadas/_json`,
    method: 'post',
    skip_tls_verify: false,
    headers: { Authorization: headers.Authorization, 'Content-Type': 'application/json' },
    template: PLANTILLA,
  });
  console.log(`Plantilla: HTTP ${t.status}  Destino: HTTP ${d.status}`, d.ok ? '' : JSON.stringify(d.json).slice(0, 300));
}
await prepararDestino();

// ---------- Aplicar ----------
const existentes = await llamar('GET', '/dashboards');
for (const d of existentes.json?.dashboards || []) {
  const id = d.dashboard_id || d.dashboardId || d.v5?.dashboardId;
  const titulo = d.title || d.v5?.title;
  if (titulo === dashboard.title && id) await llamar('DELETE', `/dashboards/${id}`);
}
const creado = await llamar('POST', '/dashboards', dashboard);
console.log(`Dashboard: HTTP ${creado.status}`, creado.ok ? '' : JSON.stringify(creado.json).slice(0, 400));

for (const alerta of alertas) {
  const r = await llamar('POST', '/alerts', { ...alerta, destinations: [DESTINO] }, baseV2);
  console.log(`Alerta ${alerta.name}: HTTP ${r.status}`, r.ok ? '' : JSON.stringify(r.json).slice(0, 400));
}
if (!creado.ok) process.exit(1);
console.log(`Abra ${OPENOBSERVE_URL}/web/dashboards`);
