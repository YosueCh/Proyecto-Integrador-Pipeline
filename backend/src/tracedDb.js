const { trace, SpanStatusCode } = require('@opentelemetry/api');

// Cada consulta SQL se registra como un span hijo de la peticion HTTP que la origino,
// asi la traza muestra: peticion -> middleware de Express -> consultas a SQLite.
// better-sqlite3 no tiene instrumentacion automatica; sin SDK activo el tracer es un no-op.
const tracer = trace.getTracer('biblioteca-api.db');

function traceDb(db) {
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const stmt = prepare(sql);
    const operacion = sql.trim().split(/\s+/)[0].toUpperCase();
    for (const metodo of ['run', 'get', 'all']) {
      const original = stmt[metodo].bind(stmt);
      stmt[metodo] = (...args) =>
        tracer.startActiveSpan(`SQLite ${operacion}`, { attributes: { 'db.system': 'sqlite', 'db.operation': operacion, 'db.statement': sql.replace(/\s+/g, ' ').trim() } }, (span) => {
          try {
            return original(...args);
          } catch (err) {
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            throw err;
          } finally {
            span.end();
          }
        });
    }
    return stmt;
  };
  return db;
}

module.exports = { traceDb };
