const fs = require('node:fs');
const os = require('node:os');
const { metrics } = require('@opentelemetry/api');

// Temperatura del servidor (RF-05). El receptor hostmetrics del colector no mide temperatura,
// asi que la API lee los sensores del kernel (/sys/class/thermal) y los publica como metrica.
// Las instancias virtualizadas (como EC2) no exponen sensores. En ese caso se publica una
// temperatura SIMULADA, calculada a partir de la carga real de CPU y marcada con
// source="simulado" para que nunca se confunda con una lectura fisica.
const DIR = process.env.THERMAL_DIR || '/sys/class/thermal';
const SIMULAR = process.env.TEMPERATURA_SIMULADA !== '0';

function leerZonas(dir = DIR) {
  let zonas;
  try {
    zonas = fs.readdirSync(dir).filter((n) => n.startsWith('thermal_zone'));
  } catch {
    return [];
  }
  const lecturas = [];
  for (const zona of zonas) {
    try {
      const milGrados = Number(fs.readFileSync(`${dir}/${zona}/temp`, 'utf8'));
      const tipo = fs.readFileSync(`${dir}/${zona}/type`, 'utf8').trim();
      if (Number.isFinite(milGrados)) lecturas.push({ zona, tipo, celsius: milGrados / 1000 });
    } catch {
      /* sensor sin lectura */
    }
  }
  return lecturas;
}

// Modelo simple: 38 C en reposo + hasta 40 C adicionales segun el uso de CPU (0..1)
function temperaturaSimulada(usoCpu) {
  const uso = Math.min(1, Math.max(0, usoCpu));
  return Math.round((38 + 40 * uso) * 10) / 10;
}

let previo = null;
function usoCpu() {
  const total = os.cpus().reduce((a, c) => ({ idle: a.idle + c.times.idle, all: a.all + Object.values(c.times).reduce((x, y) => x + y, 0) }), { idle: 0, all: 0 });
  const uso = previo && total.all > previo.all ? 1 - (total.idle - previo.idle) / (total.all - previo.all) : 0;
  previo = total;
  return uso;
}

function registrarTemperatura() {
  const gauge = metrics.getMeter('biblioteca-api').createObservableGauge('host_temperature_celsius', {
    description: 'Temperatura del servidor: sensores reales o, si no existen, simulada segun la carga de CPU',
    unit: 'Cel',
  });
  gauge.addCallback((resultado) => {
    const uso = usoCpu();
    const reales = leerZonas();
    for (const { zona, tipo, celsius } of reales) resultado.observe(celsius, { zone: zona, sensor: tipo, source: 'sensor' });
    if (!reales.length && SIMULAR) resultado.observe(temperaturaSimulada(uso), { zone: 'simulada', sensor: 'cpu_estimada', source: 'simulado' });
  });
}

module.exports = { leerZonas, temperaturaSimulada, registrarTemperatura };
