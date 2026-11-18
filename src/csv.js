/* Panel Abierto · lectura de CSV (Meta Ads y plataformas de venta).
   Sin dependencias. Funciona en el navegador (window.PA_CSV) y en Node (module.exports). */
(function (root) {
  'use strict';

  /** Detecta el separador mirando la primera línea: coma, punto y coma o tabulación. */
  function detectDelimiter(text) {
    const first = text.split(/\r?\n/, 1)[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQ = false;
    for (const ch of first) {
      if (ch === '"') inQ = !inQ;
      else if (!inQ && ch in counts) counts[ch]++;
    }
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }

  /** Pasa un CSV a una lista de filas (arrays de texto). Respeta comillas y saltos de línea dentro de comillas. */
  function parseCSV(text, delimiter) {
    text = String(text || '').replace(/^﻿/, '');
    const d = delimiter || detectDelimiter(text);
    const rows = [];
    let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
        } else cell += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === d) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some((c) => c.trim() !== '')) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    return rows;
  }

  /** Normaliza un encabezado: minúsculas, sin tildes, sin lo que va entre paréntesis. */
  function normHeader(h) {
    return String(h || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\(.*?\)/g, '').replace(/[_\s]+/g, ' ').trim();
  }

  /** Índice de la primera columna que coincide exacto con un candidato; si no hay, la primera que empieza con uno. */
  function findColumn(headers, candidates) {
    const hs = headers.map(normHeader);
    for (const c of candidates) {
      const i = hs.findIndex((h) => h === c);
      if (i >= 0) return i;
    }
    for (const c of candidates) {
      const i = hs.findIndex((h) => h.startsWith(c));
      if (i >= 0) return i;
    }
    return -1;
  }

  /** "1.234,56" · "1,234.56" · "$ 19,90" · "19.9" → número. Vacío o inválido → 0. */
  function parseNumber(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    let s = String(v || '').replace(/[^\d.,-]/g, '');
    if (!s) return 0;
    const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
    const commas = (s.match(/,/g) || []).length, dots = (s.match(/\./g) || []).length;
    if (commas && dots) {
      // Los dos signos: el último es el decimal.
      s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (commas > 1) s = s.replace(/,/g, ''); // "1,234,567": miles
    else if (commas === 1) s = s.replace(',', '.'); // "19,90": decimal (uso de América Latina)
    else if (dots > 1) s = s.replace(/\./g, ''); // "1.234.567": miles
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  /** "2026-11-04", "2026-11-04 10:00:00", "04/11/2026" (día/mes/año) → "2026-11-04". Inválida → null. */
  function parseDate(v) {
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  }

  /** Código de moneda de 3 letras dentro de un texto: "Importe gastado (ARS)" → "ARS". */
  function currencyIn(text) {
    const m = String(text || '').match(/\b([A-Z]{3})\b/);
    return m ? m[1] : null;
  }

  const META_COLS = {
    fecha: ['dia', 'day', 'fecha', 'date', 'inicio del informe', 'reporting starts'],
    campana: ['nombre de la campana', 'campaign name', 'campana', 'campaign'],
    anuncio: ['nombre del anuncio', 'ad name', 'anuncio'],
    gasto: ['importe gastado', 'amount spent', 'gasto', 'spend'],
    compras: ['compras', 'purchases', 'resultados', 'results'],
  };

  // Columnas que se buscan en un CSV de ventas. Cada plataforma suma sus propios nombres adelante.
  const STORE_BASE = {
    fecha: ['fecha', 'date', 'fecha de creacion', 'created at', 'creado', 'fecha de compra'],
    monto: ['monto', 'total', 'importe', 'amount', 'ingresos', 'precio', 'price'],
    campana: ['utm campaign', 'utm campana', 'campana', 'campaign'],
    anuncio: ['utm content', 'utm contenido', 'anuncio'],
    estado: ['estado', 'status', 'estado del pago', 'payment status'],
    moneda: ['moneda', 'currency', 'divisa'],
  };

  const PLATAFORMAS = {
    generica: { nombre: 'Otra tienda (CSV genérico)', cols: {} },
    impultienda: { nombre: 'Impultienda', cols: {} },
    hotmart: {
      nombre: 'Hotmart',
      cols: {
        fecha: ['fecha de la transaccion', 'fecha de transaccion', 'data da transacao', 'fecha de compra', 'purchase date'],
        monto: ['precio total', 'valor de compra con impuestos', 'precio del producto', 'valor total', 'valor'],
        estado: ['estado de la transaccion', 'status da transacao', 'transaction status'],
        moneda: ['moneda de compra', 'moneda de la compra', 'moeda', 'purchase currency'],
        campana: ['src', 'codigo src'],
        anuncio: ['sck', 'codigo sck'],
      },
    },
    mercadopago: {
      nombre: 'Mercado Pago',
      cols: {
        fecha: ['fecha de aprobacion', 'date approved', 'fecha de creacion', 'date created', 'fecha de origen'],
        monto: ['monto bruto de la operacion', 'valor de la compra', 'transaction amount', 'monto bruto'],
        estado: ['estado de la operacion', 'estado'],
        moneda: ['moneda', 'currency id'],
        campana: ['referencia externa', 'external reference'],
      },
    },
    stripe: {
      nombre: 'Stripe',
      cols: {
        fecha: ['created date', 'created'],
        monto: ['amount'],
        estado: ['status'],
        moneda: ['currency'],
        campana: ['utm campaign'],
        anuncio: ['utm content'],
      },
    },
  };

  const APPROVED = ['aprobado', 'aprobada', 'approved', 'pagado', 'pagada', 'paid', 'completado', 'completada', 'completo',
    'complete', 'completed', 'exitoso', 'success', 'succeeded', 'acreditado', 'acreditada', 'accredited', 'aprovado', 'aprovada'];

  function storeColumns(plataforma) {
    const extra = (PLATAFORMAS[plataforma] || PLATAFORMAS.generica).cols;
    const out = {};
    for (const k of Object.keys(STORE_BASE)) out[k] = [...(extra[k] || []), ...STORE_BASE[k]];
    return out;
  }

  /** Error con la lista de encabezados, para que la pantalla ofrezca elegir las columnas a mano. */
  function faltanColumnas(faltan, headers) {
    const e = new Error(`No se encontraron las columnas: ${faltan.join(', ')}. Elige cuál es cuál.`);
    e.code = 'FALTAN_COLUMNAS';
    e.faltan = faltan;
    e.headers = headers;
    return e;
  }

  function mapColumns(headers, spec, required, mapa) {
    const idx = {};
    for (const k of Object.keys(spec)) {
      idx[k] = mapa && mapa[k] != null && mapa[k] !== '' ? Number(mapa[k]) : findColumn(headers, spec[k]);
    }
    const missing = required.filter((k) => !(idx[k] >= 0));
    if (missing.length) throw faltanColumnas(missing, headers);
    return idx;
  }

  /**
   * CSV del Administrador de anuncios (desglose por día; por campaña o por anuncio) →
   * [{fecha, campana, anuncio, gasto, compras, moneda}].
   */
  function parseMetaCSV(text, opts) {
    const o = opts || {};
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('El archivo está vacío.');
    const idx = mapColumns(rows[0], META_COLS, ['fecha', 'campana', 'gasto'], o.mapa);
    const moneda = currencyIn(rows[0][idx.gasto]) || o.moneda || 'USD';
    const out = [];
    for (const r of rows.slice(1)) {
      const fecha = parseDate(r[idx.fecha]);
      const campana = String(r[idx.campana] || '').trim();
      if (!fecha || !campana) continue; // filas de totales
      out.push({
        fecha, campana,
        anuncio: idx.anuncio >= 0 ? String(r[idx.anuncio] || '').trim() : '',
        gasto: parseNumber(r[idx.gasto]),
        compras: idx.compras >= 0 ? parseNumber(r[idx.compras]) : 0,
        moneda,
      });
    }
    return out;
  }

  /**
   * CSV de ventas (Impultienda, Hotmart, Mercado Pago, Stripe u otra) → [{fecha, campana, anuncio, monto, moneda}].
   * Si hay columna de estado, solo cuenta las ventas aprobadas o pagadas.
   * @param {string} text
   * @param {{plataforma?: string, moneda?: string, mapa?: Object}} [opts]
   */
  function parseStoreCSV(text, opts) {
    const o = opts || {};
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('El archivo está vacío.');
    const idx = mapColumns(rows[0], storeColumns(o.plataforma), ['fecha', 'monto'], o.mapa);
    const out = [];
    for (const r of rows.slice(1)) {
      const fecha = parseDate(r[idx.fecha]);
      if (!fecha) continue;
      if (idx.estado >= 0) {
        const st = normHeader(r[idx.estado]);
        if (st && !APPROVED.includes(st)) continue;
      }
      const mon = idx.moneda >= 0 ? String(r[idx.moneda] || '').trim().toUpperCase() : '';
      out.push({
        fecha,
        campana: idx.campana >= 0 ? String(r[idx.campana] || '').trim() : '',
        anuncio: idx.anuncio >= 0 ? String(r[idx.anuncio] || '').trim() : '',
        monto: parseNumber(r[idx.monto]),
        moneda: /^[A-Z]{3}$/.test(mon) ? mon : (o.moneda || 'USD'),
      });
    }
    return out;
  }

  const api = { detectDelimiter, parseCSV, normHeader, findColumn, parseNumber, parseDate, currencyIn, parseMetaCSV, parseStoreCSV, PLATAFORMAS, META_COLS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PA_CSV = api;
})(typeof window !== 'undefined' ? window : globalThis);
