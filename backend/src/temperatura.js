const fs = require('node:fs');
const { metrics } = require('@opentelemetry/api');

// Temperatura del servidor (RF-05). El receptor hostmetrics del colector no mide temperatura,
// asi que la API lee los sensores del kernel (/sys/class/thermal) y los publica como metrica.
// Las instancias virtualizadas (como EC2) normalmente no exponen sensores: en ese caso no se
// emite ninguna muestra, en lugar de inventar un valor.
const DIR = process.env.THERMAL_DIR || '/sys/class/thermal';

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

function registrarTemperatura() {
  const gauge = metrics.getMeter('biblioteca-api').createObservableGauge('host_temperature_celsius', {
    description: 'Temperatura de los sensores termicos del servidor',
    unit: 'Cel',
  });
  gauge.addCallback((resultado) => {
    for (const { zona, tipo, celsius } of leerZonas()) resultado.observe(celsius, { zone: zona, sensor: tipo });
  });
}

module.exports = { leerZonas, registrarTemperatura };
