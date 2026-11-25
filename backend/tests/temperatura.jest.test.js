const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { leerZonas } = require('../src/temperatura');

describe('leerZonas (temperatura del servidor)', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thermal-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('convierte milesimas de grado a Celsius', () => {
    fs.mkdirSync(path.join(dir, 'thermal_zone0'));
    fs.writeFileSync(path.join(dir, 'thermal_zone0', 'temp'), '45500\n');
    fs.writeFileSync(path.join(dir, 'thermal_zone0', 'type'), 'x86_pkg_temp\n');
    expect(leerZonas(dir)).toEqual([{ zona: 'thermal_zone0', tipo: 'x86_pkg_temp', celsius: 45.5 }]);
  });

  test('sin sensores (directorio inexistente) devuelve lista vacia', () => {
    expect(leerZonas(path.join(dir, 'no-existe'))).toEqual([]);
  });

  test('ignora zonas sin lectura valida', () => {
    fs.mkdirSync(path.join(dir, 'thermal_zone1'));
    expect(leerZonas(dir)).toEqual([]);
  });
});

describe('temperaturaSimulada', () => {
  const { temperaturaSimulada } = require('../src/temperatura');
  test('en reposo ronda los 38 C y con CPU al maximo llega a 78 C', () => {
    expect(temperaturaSimulada(0)).toBe(38);
    expect(temperaturaSimulada(1)).toBe(78);
  });
  test('es proporcional a la carga y acota valores fuera de rango', () => {
    expect(temperaturaSimulada(0.5)).toBe(58);
    expect(temperaturaSimulada(-3)).toBe(38);
    expect(temperaturaSimulada(9)).toBe(78);
  });
});
