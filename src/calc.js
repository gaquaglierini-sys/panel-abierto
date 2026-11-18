/* Panel Abierto · cálculos. Funciones puras: entran filas, salen números (todo en dólares). */
(function (root) {
  'use strict';

  const r2 = (x) => Math.round(x * 100) / 100;

  /** Normaliza un nombre de campaña, de anuncio o una UTM para compararlos ("Huerta%7CAR" = "huerta | ar"). */
  function norm(t) {
    let s = String(t || '');
    try { s = decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { /* se deja como venía */ }
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[|_\-+·]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** ¿El nombre pertenece a la oferta? Coincide si contiene alguno de sus textos de campaña. */
  function esDeOferta(nombre, oferta) {
    const n = norm(nombre);
    return n !== '' && (oferta.campanas || []).some((c) => norm(c) !== '' && n.includes(norm(c)));
  }

  function enRango(fecha, desde, hasta) {
    return (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
  }

  /**
   * Pasa un monto a dólares. `tasas` dice cuántas unidades de cada moneda equivalen a 1 USD.
   * Si falta la tasa, devuelve null para que la pantalla avise.
   */
  function aUSD(monto, moneda, tasas) {
    const m = (moneda || 'USD').toUpperCase();
    if (m === 'USD') return monto;
    const t = tasas && Number(tasas[m]);
    return t > 0 ? monto / t : null;
  }

  /** Convierte todas las filas a USD y junta las monedas que no tienen tasa. */
  function convertir(filas, campo, tasas) {
    const faltan = new Set();
    const out = filas.map((x) => {
      const v = aUSD(x[campo], x.moneda, tasas);
      if (v == null) { faltan.add(x.moneda); return { ...x, usd: 0 }; }
      return { ...x, usd: v };
    });
    return { filas: out, faltan: [...faltan] };
  }

  /**
   * Resume cada oferta en las fechas elegidas.
   * @returns {{ofertas: Array, total: Object, sinAsignar: {gasto: Array, ventas: Array}, monedasSinTasa: string[]}}
   */
  function resumir({ ofertas, gasto, ventas, desde, hasta, tasas }) {
    const cg = convertir(gasto.filter((x) => enRango(x.fecha, desde, hasta)), 'gasto', tasas);
    const cv = convertir(ventas.filter((x) => enRango(x.fecha, desde, hasta)), 'monto', tasas);
    const g = cg.filas, v = cv.filas;
    const usadosG = new Set(), usadosV = new Set();

    const filas = ofertas.map((o) => {
      // Cada fila cuenta para una sola oferta: la primera de la lista que la reclama.
      const gs = g.filter((x, i) => !usadosG.has(i) && esDeOferta(x.campana, o) && usadosG.add(i));
      const vs = v.filter((x, i) => !usadosV.has(i) && esDeOferta(x.campana, o) && usadosV.add(i));
      const gastoT = r2(gs.reduce((a, x) => a + x.usd, 0));
      const ingresos = r2(vs.reduce((a, x) => a + x.usd, 0));
      const nVentas = vs.length;
      return {
        id: o.id, nombre: o.nombre, estado: o.estado, ticket: o.ticket || null,
        gasto: gastoT, ingresos, ventas: nVentas,
        comprasMeta: gs.reduce((a, x) => a + (x.compras || 0), 0),
        roas: gastoT > 0 ? r2(ingresos / gastoT) : null,
        resultado: r2(ingresos - gastoT),
        costoPorVenta: nVentas > 0 ? r2(gastoT / nVentas) : null,
      };
    });

    const sum = (k) => r2(filas.reduce((a, x) => a + x[k], 0));
    const tg = sum('gasto'), ti = sum('ingresos');
    const total = { gasto: tg, ingresos: ti, ventas: filas.reduce((a, x) => a + x.ventas, 0), roas: tg > 0 ? r2(ti / tg) : null, resultado: r2(ti - tg) };

    const agrupar = (rows, usados) => {
      const m = new Map();
      rows.forEach((x, i) => {
        if (usados.has(i)) return;
        const k = x.campana || '(sin campaña)';
        m.set(k, r2((m.get(k) || 0) + x.usd));
      });
      return [...m.entries()].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor);
    };

    return {
      ofertas: filas, total,
      sinAsignar: { gasto: agrupar(g, usadosG), ventas: agrupar(v, usadosV) },
      monedasSinTasa: [...new Set([...cg.faltan, ...cv.faltan])],
    };
  }

  /** Gasto e ingresos por día en USD (solo lo asignado a alguna oferta), para el gráfico. */
  function porDia({ ofertas, gasto, ventas, desde, hasta, tasas }) {
    const m = new Map();
    const add = (fecha, k, val) => {
      if (!m.has(fecha)) m.set(fecha, { fecha, gasto: 0, ingresos: 0 });
      m.get(fecha)[k] = r2(m.get(fecha)[k] + val);
    };
    gasto.forEach((x) => {
      if (enRango(x.fecha, desde, hasta) && ofertas.some((o) => esDeOferta(x.campana, o))) add(x.fecha, 'gasto', aUSD(x.gasto, x.moneda, tasas) || 0);
    });
    ventas.forEach((x) => {
      if (enRango(x.fecha, desde, hasta) && ofertas.some((o) => esDeOferta(x.campana, o))) add(x.fecha, 'ingresos', aUSD(x.monto, x.moneda, tasas) || 0);
    });
    return [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  /**
   * Números por anuncio. Si el gasto no trae nombre de anuncio, la unidad es la campaña.
   * Una venta va a un anuncio si su utm_content (o sck) coincide con el nombre del anuncio;
   * si la venta no trae anuncio, va a la campaña solo cuando la campaña tiene un único anuncio.
   */
  function porAnuncio({ ofertas, gasto, ventas, desde, hasta, tasas }) {
    const unidades = new Map();
    const key = (c, a) => `${norm(c)}§${norm(a)}`;
    gasto.forEach((x) => {
      if (!enRango(x.fecha, desde, hasta)) return;
      const k = key(x.campana, x.anuncio || x.campana);
      if (!unidades.has(k)) {
        const of = ofertas.find((o) => esDeOferta(x.campana, o));
        unidades.set(k, { anuncio: x.anuncio || x.campana, campana: x.campana, oferta: of ? of.nombre : null, gasto: 0, ingresos: 0, ventas: 0, compras: 0 });
      }
      const u = unidades.get(k);
      u.gasto = r2(u.gasto + (aUSD(x.gasto, x.moneda, tasas) || 0));
      u.compras += x.compras || 0;
    });
    const lista = [...unidades.values()];
    ventas.forEach((x) => {
      if (!enRango(x.fecha, desde, hasta)) return;
      const delaCampana = lista.filter((u) => norm(u.campana) === norm(x.campana));
      let u = null;
      if (x.anuncio) u = lista.find((z) => norm(z.anuncio) === norm(x.anuncio) && (!x.campana || norm(z.campana) === norm(x.campana)));
      else if (delaCampana.length === 1) u = delaCampana[0];
      if (!u) return;
      u.ventas += 1;
      u.ingresos = r2(u.ingresos + (aUSD(x.monto, x.moneda, tasas) || 0));
    });
    return lista.map((u) => ({
      ...u,
      roas: u.gasto > 0 ? r2(u.ingresos / u.gasto) : null,
      costoPorVenta: u.ventas > 0 ? r2(u.gasto / u.ventas) : null,
      resultado: r2(u.ingresos - u.gasto),
    })).sort((a, b) => b.gasto - a.gasto);
  }

  const OPS = {
    '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b, '=': (a, b) => a === b,
  };

  /** ¿La unidad cumple todas las condiciones de la regla? Un ROAS sin gasto (null) no cumple ninguna condición. */
  function cumple(unidad, regla) {
    const conds = regla.condiciones || [];
    return conds.length > 0 && conds.every((c) => {
      const v = unidad[c.campo];
      if (v == null || !OPS[c.op]) return false;
      return OPS[c.op](v, Number(c.valor));
    });
  }

  /** Aplica las reglas en orden: la primera que se cumple decide la acción. */
  function evaluarReglas(unidades, reglas) {
    return unidades.map((u) => {
      const r = (reglas || []).find((x) => x.activa !== false && cumple(u, x));
      return { ...u, regla: r ? r.nombre : null, accion: r ? r.accion : null, color: r ? r.color : null };
    });
  }

  /** Color de una oferta según su ROAS: 'bien' (escala), 'ok' (gana), 'mal' (pierde) o 'nada' (sin gasto). */
  function tono(roas, gasto, { escala, corte }) {
    if (!gasto) return 'nada';
    if (roas >= escala) return 'bien';
    if (roas >= corte) return 'ok';
    return 'mal';
  }

  const api = { norm, esDeOferta, enRango, aUSD, resumir, porDia, porAnuncio, cumple, evaluarReglas, tono, r2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PA_CALC = api;
})(typeof window !== 'undefined' ? window : globalThis);
