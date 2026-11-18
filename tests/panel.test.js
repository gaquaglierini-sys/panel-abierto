// Pruebas sin dependencias: correr con `npm test` (Node 18 o más nuevo).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const csv = require('../src/csv.js');
const calc = require('../src/calc.js');
const meta = require('../src/meta.js');
const ejemplo = require('../src/ejemplo.js');
const asistente = require('../src/asistente.js');

const plantilla = (n) => fs.readFileSync(path.join(__dirname, '..', 'ejemplos', n), 'utf8');

test('parseNumber entiende formatos de América Latina y de EE. UU.', () => {
  assert.equal(csv.parseNumber('1.234,56'), 1234.56);
  assert.equal(csv.parseNumber('1,234.56'), 1234.56);
  assert.equal(csv.parseNumber('$ 19,90'), 19.9);
  assert.equal(csv.parseNumber('19.9'), 19.9);
  assert.equal(csv.parseNumber('1,5'), 1.5);
  assert.equal(csv.parseNumber('1,234,567'), 1234567);
  assert.equal(csv.parseNumber('1.234.567'), 1234567);
  assert.equal(csv.parseNumber(''), 0);
});

test('parseDate pasa varios formatos a AAAA-MM-DD', () => {
  assert.equal(csv.parseDate('2026-11-04'), '2026-11-04');
  assert.equal(csv.parseDate('2026-11-04 23:10:00'), '2026-11-04');
  assert.equal(csv.parseDate('4/11/2026 10:00'), '2026-11-04');
  assert.equal(csv.parseDate('Total'), null);
});

test('parseCSV respeta comillas, separador punto y coma y BOM', () => {
  const rows = csv.parseCSV('﻿a;b\n"x;y";"con ""comillas"""\n');
  assert.deepEqual(rows, [['a', 'b'], ['x;y', 'con "comillas"']]);
});

test('Meta Ads: lee el export por anuncio y toma la moneda del encabezado', () => {
  const rows = csv.parseMetaCSV(plantilla('meta-ads-ejemplo.csv'));
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0], { fecha: '2026-11-16', campana: 'HUERTA | LATAM | VENTAS', anuncio: 'V1 · antes y después', gasto: 12.4, compras: 2, moneda: 'USD' });
  const ars = csv.parseMetaCSV('Día,Nombre de la campaña,Importe gastado (ARS)\n2026-11-01,X,"15.000,00"\n2026-11-01,,"15.000,00"');
  assert.deepEqual(ars, [{ fecha: '2026-11-01', campana: 'X', anuncio: '', gasto: 15000, compras: 0, moneda: 'ARS' }]);
});

test('Meta Ads: avisa qué columna falta', () => {
  assert.throws(() => csv.parseMetaCSV('Fecha,Algo\n2026-11-01,3'), (e) => e.code === 'FALTAN_COLUMNAS' && e.faltan.includes('campana'));
});

for (const [archivo, plataforma, cantidad, monedas] of [
  ['impultienda-ejemplo.csv', 'impultienda', 5, ['USD', 'ARS']],
  ['hotmart-ejemplo.csv', 'hotmart', 3, ['USD', 'MXN', 'COP']],
  ['mercadopago-ejemplo.csv', 'mercadopago', 2, ['ARS']],
  ['stripe-ejemplo.csv', 'stripe', 2, ['USD', 'EUR']],
]) {
  test(`${plataforma}: lee la plantilla y descarta las ventas no aprobadas`, () => {
    const rows = csv.parseStoreCSV(plantilla(archivo), { plataforma });
    assert.equal(rows.length, cantidad);
    assert.deepEqual([...new Set(rows.map((r) => r.moneda))].sort(), [...monedas].sort());
    assert.ok(rows.every((r) => r.monto > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha)));
  });
}

test('ventas: sin columnas reconocibles pide elegirlas, y con el mapeo de columnas las lee', () => {
  const txt = 'Día de pago;Cobrado\n01/11/2026;10\n';
  assert.throws(() => csv.parseStoreCSV(txt), (e) => e.code === 'FALTAN_COLUMNAS' && e.headers.length === 2);
  const rows = csv.parseStoreCSV(txt, { mapa: { fecha: 0, monto: 1 }, moneda: 'MXN' });
  assert.deepEqual(rows, [{ fecha: '2026-11-01', campana: '', anuncio: '', monto: 10, moneda: 'MXN' }]);
});

test('aUSD convierte con la tasa y devuelve null si falta', () => {
  const tasas = { USD: 1, ARS: 1500 };
  assert.equal(calc.aUSD(1500, 'ARS', tasas), 1);
  assert.equal(calc.aUSD(10, 'USD', tasas), 10);
  assert.equal(calc.aUSD(10, 'GTQ', tasas), null);
});

test('resumir asigna por campaña, convierte a USD y avisa monedas sin tasa', () => {
  const ofertas = [{ id: 'a', nombre: 'Huerta', campanas: ['huerta'] }, { id: 'b', nombre: 'Postres', campanas: ['POSTRES'] }];
  const gasto = [
    { fecha: '2026-11-01', campana: 'HUERTA | MX', gasto: 10, moneda: 'USD' },
    { fecha: '2026-11-01', campana: 'POSTRES | AR', gasto: 30000, moneda: 'ARS' },
    { fecha: '2026-11-01', campana: 'OTRA', gasto: 5, moneda: 'USD' },
  ];
  const ventas = [
    { fecha: '2026-11-01', campana: 'HUERTA%7CMX', monto: 25, moneda: 'USD' },
    { fecha: '2026-11-01', campana: '', monto: 9, moneda: 'USD' },
    { fecha: '2026-11-01', campana: 'POSTRES | AR', monto: 100, moneda: 'GTQ' },
  ];
  const r = calc.resumir({ ofertas, gasto, ventas, desde: '2026-11-01', hasta: '2026-11-01', tasas: { USD: 1, ARS: 1500 } });
  assert.equal(r.ofertas[0].roas, 2.5);
  assert.equal(r.ofertas[1].gasto, 20);
  assert.equal(r.total.gasto, 30);
  assert.deepEqual(r.sinAsignar.gasto, [{ nombre: 'OTRA', valor: 5 }]);
  assert.deepEqual(r.monedasSinTasa, ['GTQ']);
});

test('una fila cuenta para una sola oferta', () => {
  const ofertas = [{ id: 'a', nombre: 'A', campanas: ['HUERTA'] }, { id: 'b', nombre: 'B', campanas: ['HUERTA MX'] }];
  const r = calc.resumir({ ofertas, gasto: [{ fecha: '2026-11-01', campana: 'HUERTA MX', gasto: 10 }], ventas: [] });
  assert.equal(r.total.gasto, 10);
});

test('porAnuncio junta gasto y ventas por utm_content', () => {
  const gasto = [
    { fecha: '2026-11-01', campana: 'C', anuncio: 'A1', gasto: 10 },
    { fecha: '2026-11-01', campana: 'C', anuncio: 'A2', gasto: 4 },
  ];
  const ventas = [{ fecha: '2026-11-01', campana: 'C', anuncio: 'A1', monto: 30 }, { fecha: '2026-11-01', campana: 'C', anuncio: '', monto: 5 }];
  const u = calc.porAnuncio({ ofertas: [{ nombre: 'Of', campanas: ['C'] }], gasto, ventas });
  assert.equal(u.find((x) => x.anuncio === 'A1').roas, 3);
  assert.equal(u.find((x) => x.anuncio === 'A2').ventas, 0);
});

test('reglas: la primera que se cumple decide y el ROAS sin gasto no cumple', () => {
  const reglas = ejemplo.REGLAS;
  const [apagar, escalar, revisar, nada, sinGasto] = calc.evaluarReglas([
    { gasto: 12, ventas: 0, roas: 0 },
    { gasto: 20, ventas: 4, roas: 2.1 },
    { gasto: 8, ventas: 1, roas: 0.9 },
    { gasto: 8, ventas: 2, roas: 1.5 },
    { gasto: 0, ventas: 0, roas: null },
  ], reglas);
  assert.equal(apagar.color, 'rojo');
  assert.equal(escalar.color, 'verde');
  assert.equal(revisar.color, 'amarillo');
  assert.equal(nada.color, null);
  assert.equal(sinGasto.color, null);
  assert.equal(calc.evaluarReglas([{ gasto: 12, ventas: 0 }], [{ ...reglas[0], activa: false }])[0].color, null);
});

test('tono marca escalar, gana, pierde y sin gasto', () => {
  const cfg = { escala: 1.8, corte: 1 };
  assert.equal(calc.tono(2, 10, cfg), 'bien');
  assert.equal(calc.tono(1.2, 10, cfg), 'ok');
  assert.equal(calc.tono(0.5, 10, cfg), 'mal');
  assert.equal(calc.tono(null, 0, cfg), 'nada');
});

test('Meta API: pide nivel anuncio, pagina y toma omni_purchase', async () => {
  const paginas = {
    first: { data: [{ date_start: '2026-11-01', campaign_name: 'HUERTA', ad_name: 'V1', spend: '3.5', actions: [{ action_type: 'purchase', value: '1' }, { action_type: 'omni_purchase', value: '2' }] }], paging: { next: 'second' } },
    second: { data: [{ date_start: '2026-11-02', campaign_name: 'HUERTA', ad_name: 'V1', spend: '4' }] },
  };
  const urls = [];
  const fetchFn = async (url) => { urls.push(url); return { json: async () => (url === 'second' ? paginas.second : paginas.first) }; };
  const rows = await meta.traerGasto({ clave: 'x', cuenta: '123', desde: '2026-11-01', hasta: '2026-11-02', moneda: 'MXN', fetchFn });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].compras, 2);
  assert.equal(rows[0].anuncio, 'V1');
  assert.equal(rows[0].moneda, 'MXN');
  assert.ok(urls[0].includes('123/insights') && urls[0].includes('level=ad'));
});

test('Meta API: rechaza un número de cuenta inválido', async () => {
  await assert.rejects(meta.traerGasto({ clave: 'x', cuenta: 'abc', desde: '', hasta: '' }), /solo dígitos/);
});

test('asistente: arma la llamada a Claude y devuelve solo el texto', async () => {
  let pedido = null;
  const fetchFn = async (url, init) => {
    pedido = { url, init, body: JSON.parse(init.body) };
    return { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Apaga **V2**.' }] }) };
  };
  const texto = await asistente.explicar({ clave: 'prueba', resumen: { total: {} }, idioma: 'en', fetchFn });
  assert.equal(texto, 'Apaga **V2**.');
  assert.equal(pedido.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(pedido.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(pedido.init.headers['x-api-key'], 'prueba');
  assert.equal(pedido.body.model, 'claude-opus-5-5');
  assert.match(pedido.body.system, /English/);
});

test('asistente: explica los errores de la API en palabras simples', async () => {
  const fetchFn = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid x-api-key' } }) });
  await assert.rejects(asistente.explicar({ clave: 'mala', resumen: {}, fetchFn }), /no es válida/);
  await assert.rejects(asistente.explicar({ clave: '', resumen: {} }), /Falta la clave/);
});

test('los datos de ejemplo son estables y traen alertas de los tres colores', () => {
  const a = ejemplo.generar('2026-11-18');
  assert.deepEqual(a, ejemplo.generar('2026-11-18'));
  assert.ok(a.gasto.length > 100 && a.ventas.length > 50);
  const d = { ofertas: a.config.ofertas, gasto: a.gasto, ventas: a.ventas, desde: '2026-11-12', hasta: '2026-11-18', tasas: a.config.tasas };
  const colores = new Set(calc.evaluarReglas(calc.porAnuncio(d), a.config.reglas).map((u) => u.color));
  assert.ok(colores.has('rojo') && colores.has('verde') && colores.has('amarillo'), `colores: ${[...colores]}`);
});
