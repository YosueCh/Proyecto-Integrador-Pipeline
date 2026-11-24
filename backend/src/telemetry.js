// OpenTelemetry: se carga ANTES que la aplicacion (node --require ./src/telemetry.js server.js)
// para que la instrumentacion de http/express pueda envolver los modulos.
// Exporta trazas, metricas y logs por OTLP/HTTP al OTel Collector, que los reenvia a OpenObserve.
// Sin OTEL_EXPORTER_OTLP_ENDPOINT no hace nada (pruebas y desarrollo local).
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
  const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { LoggerProvider, BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
  const { logs } = require('@opentelemetry/api-logs');
  const { resourceFromAttributes } = require('@opentelemetry/resources');

  const base = endpoint.replace(/\/$/, '');
  const resource = resourceFromAttributes({
    'service.name': process.env.OTEL_SERVICE_NAME || 'biblioteca-api',
    'service.version': process.env.APP_VERSION || '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  });

  // Logs: proveedor registrado de forma explicita para que logger.js lo encuentre
  logs.setGlobalLoggerProvider(
    new LoggerProvider({
      resource,
      processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${base}/v1/logs` }), scheduledDelayMillis: 2000 })],
    })
  );

  const sdk = new NodeSDK({
    resource,
    traceExporter: new OTLPTraceExporter({ url: `${base}/v1/traces` }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics` }),
        exportIntervalMillis: 10000,
      }),
    ],
    instrumentations: [
      new HttpInstrumentation({
        // El healthcheck de Docker (cada 30 s) y el de los despliegues no aportan trazas utiles
        ignoreIncomingRequestHook: (req) => req.url === '/api/health',
      }),
      new ExpressInstrumentation(),
    ],
  });
  sdk.start();

  // Vacia lo pendiente antes de que "docker stop" termine el proceso
  process.once('SIGTERM', () => sdk.shutdown().catch(() => {}));
}
