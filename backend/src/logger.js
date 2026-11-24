const { logs, SeverityNumber } = require('@opentelemetry/api-logs');
const { trace } = require('@opentelemetry/api');

// Logger estructurado: cada evento sale como una linea JSON por consola (docker logs)
// y, si OpenTelemetry esta activo, tambien se emite como registro OTLP con el
// identificador de la traza activa, para saltar del log a la traza en OpenObserve.
const NIVELES = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

const otelLogger = logs.getLogger('biblioteca-api');

function emitir(nivel, mensaje, atributos = {}) {
  const span = trace.getActiveSpan();
  const ctx = span?.spanContext();
  const registro = { timestamp: new Date().toISOString(), level: nivel, message: mensaje, ...atributos };
  if (ctx) Object.assign(registro, { trace_id: ctx.traceId, span_id: ctx.spanId });
  if (process.env.NODE_ENV !== 'test') console.log(JSON.stringify(registro));
  otelLogger.emit({
    severityNumber: NIVELES[nivel],
    severityText: nivel.toUpperCase(),
    body: mensaje,
    attributes: atributos,
  });
}

module.exports = {
  info: (m, a) => emitir('info', m, a),
  warn: (m, a) => emitir('warn', m, a),
  error: (m, a) => emitir('error', m, a),
};
