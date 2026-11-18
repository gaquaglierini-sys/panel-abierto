/* Panel Abierto · datos de ejemplo y configuración inicial. Todo inventado: ninguna cuenta, tienda ni venta es real.
   Los datos se generan para los últimos 30 días contando desde hoy, así "Hoy" siempre tiene algo que mostrar. */
(function (root) {
  'use strict';

  // Generador pseudoaleatorio con semilla: los ejemplos salen iguales cada vez.
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function isoDia(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Tasas de ejemplo: cuántas unidades de cada moneda equivalen a 1 USD. Hay que actualizarlas a mano. */
  const TASAS = { USD: 1, ARS: 1500, MXN: 18.5, COP: 4100, CLP: 950, PEN: 3.75, BRL: 5.4, UYU: 40, EUR: 0.92 };

  /** Reglas de ejemplo, editables en Datos → Reglas. Se evalúan en orden: la primera que se cumple decide. */
  const REGLAS = [
    { id: 'r1', nombre: 'Gastó USD 10 sin venta', condiciones: [{ campo: 'gasto', op: '>=', valor: 10 }, { campo: 'ventas', op: '=', valor: 0 }], accion: 'Apagar', color: 'rojo', activa: true },
    { id: 'r2', nombre: 'Ganador', condiciones: [{ campo: 'roas', op: '>', valor: 1.8 }, { campo: 'ventas', op: '>=', valor: 3 }], accion: 'Escalar +20 %', color: 'verde', activa: true },
    { id: 'r3', nombre: 'ROAS bajo', condiciones: [{ campo: 'roas', op: '<', valor: 1.2 }, { campo: 'gasto', op: '>=', valor: 5 }], accion: 'Revisar', color: 'amarillo', activa: true },
  ];

  // Cada oferta tiene anuncios con un "peso" (cuánto gasta) y una "fuerza" (cuánto vende por dólar).
  const OFERTAS = [
    { id: 'huerta', nombre: 'Huerta en el balcón', estado: 'al aire', ticket: 12.9, campanas: ['HUERTA'],
      plan: { desde: 30, hasta: 0, gasto: 40, ventasPorUSD: 0.12 },
      anuncios: [['V1 · antes y después', 0.45, 1.5], ['V2 · tres errores', 0.35, 1.05], ['IMG · lista de semillas', 0.2, 0.15]] },
    { id: 'postres', nombre: 'Postres sin horno', estado: 'al aire', ticket: 9.9, campanas: ['POSTRES'],
      plan: { desde: 14, hasta: 0, gasto: 26, ventasPorUSD: 0.06 },
      anuncios: [['V1 · receta en 30 s', 0.5, 1.3], ['V2 · sin balanza', 0.3, 0.75], ['IMG · tapa', 0.2, 0]] },
    { id: 'planillas', nombre: 'Planillas para emprender', estado: 'al aire', ticket: 15, campanas: ['PLANILLAS'],
      plan: { desde: 4, hasta: 0, gasto: 22, ventasPorUSD: 0.09 },
      anuncios: [['V1 · ordena tu mes', 0.6, 1.35], ['IMG · captura de la planilla', 0.4, 0.5]] },
    { id: 'acuarela', nombre: 'Acuarela desde cero', estado: 'pausada', ticket: 19, campanas: ['ACUARELA'],
      plan: { desde: 29, hasta: 20, gasto: 30, ventasPorUSD: 0.035 },
      anuncios: [['V1 · primer paisaje', 1, 1]] },
    { id: 'velas', nombre: 'Velas aromáticas', estado: 'en armado', ticket: 11.5, campanas: ['VELAS'], plan: null, anuncios: [] },
  ];

  // Dos mercados por oferta; las ventas de Argentina entran en pesos para mostrar la conversión.
  const MERCADOS = [['LATAM', 0.65, 'USD'], ['AR', 0.35, 'ARS']];

  function generar(hoy) {
    const base = hoy ? new Date(hoy + 'T12:00:00') : new Date();
    const rand = rng(20261118);
    const gasto = [], ventas = [];
    OFERTAS.forEach((o) => {
      if (!o.plan) return;
      for (let d = o.plan.desde; d >= o.plan.hasta; d--) {
        const dia = new Date(base);
        dia.setDate(base.getDate() - d);
        const fecha = isoDia(dia);
        MERCADOS.forEach(([mercado, parte, moneda]) => {
          const campana = `${o.campanas[0]} | ${mercado} | VENTAS`;
          o.anuncios.forEach(([anuncio, peso, fuerza]) => {
            const g = Math.round(o.plan.gasto * parte * peso * (0.75 + rand() * 0.5) * 100) / 100;
            const esperado = g * o.plan.ventasPorUSD * fuerza;
            const n = Math.floor(esperado + rand());
            gasto.push({ fecha, campana, anuncio, gasto: g, compras: Math.max(0, n - (rand() < 0.3 ? 1 : 0)), moneda: 'USD' });
            for (let i = 0; i < n; i++) {
              // Algunas ventas suman un producto extra después de la compra.
              const usd = o.ticket + (rand() < 0.25 ? Math.round(o.ticket * 0.6 * 100) / 100 : 0);
              const monto = moneda === 'USD' ? usd : Math.round(usd * TASAS[moneda]);
              ventas.push({ fecha, campana, anuncio, monto, moneda });
            }
          });
        });
      }
    });
    // Una venta que llega sin UTM: aparece en "Sin asignar" para que se vea esa parte.
    ventas.push({ fecha: isoDia(base), campana: '', anuncio: '', monto: 12.9, moneda: 'USD' });
    return {
      config: {
        escala: 1.8, corte: 1,
        tasas: { ...TASAS },
        reglas: REGLAS.map((r) => ({ ...r, condiciones: r.condiciones.map((c) => ({ ...c })) })),
        ofertas: OFERTAS.map(({ plan, anuncios, ...o }) => ({ ...o, campanas: [...o.campanas] })),
      },
      gasto,
      ventas,
      ejemplo: true,
    };
  }

  const api = { generar, isoDia, TASAS, REGLAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PA_EJEMPLO = api;
})(typeof window !== 'undefined' ? window : globalThis);
