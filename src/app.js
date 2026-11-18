/* Panel Abierto · la pantalla. Lee el estado del navegador, calcula y dibuja. */
(function () {
  'use strict';

  const { parseMetaCSV, parseStoreCSV, PLATAFORMAS, META_COLS } = window.PA_CSV;
  const { resumir, porDia, porAnuncio, evaluarReglas, tono } = window.PA_CALC;
  const { generar, isoDia, TASAS, REGLAS } = window.PA_EJEMPLO;
  const IA = window.PA_ASISTENTE;
  const { t, setLang, getLang } = window.PA_I18N;
  const KEY = 'panel-abierto:v2';
  const KEY_TEMA = 'panel-abierto:tema';
  const KEY_IA = 'panel-abierto:clave-claude';
  const KEY_LANG = 'panel-abierto:idioma';
  const $ = (id) => document.getElementById(id);

  /* ---------- Almacenamiento (todo envuelto: en modo privado puede fallar) ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sigue en memoria */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } },
  };

  /** Completa un estado viejo o incompleto con los valores por defecto. */
  function completar(s) {
    s.config = s.config || {};
    s.config.ofertas = s.config.ofertas || [];
    s.config.tasas = s.config.tasas || { ...TASAS };
    s.config.reglas = s.config.reglas || JSON.parse(JSON.stringify(REGLAS));
    s.config.escala = Number(s.config.escala) || 1.8;
    s.config.corte = Number(s.config.corte) || 1;
    s.gasto = (s.gasto || []).map((x) => ({ anuncio: '', moneda: 'USD', ...x }));
    s.ventas = (s.ventas || []).map((x) => ({ anuncio: '', moneda: 'USD', ...x }));
    return s;
  }

  function leerEstado() {
    try {
      const s = JSON.parse(store.get(KEY));
      if (s && s.config && Array.isArray(s.gasto) && Array.isArray(s.ventas)) return completar(s);
    } catch (e) { /* sin datos guardados: se usan los ejemplos */ }
    return generar();
  }
  const guardar = () => store.set(KEY, JSON.stringify(state));

  let state = leerEstado();
  // Los ejemplos se regeneran cada día para que "Hoy" siempre tenga datos.
  if (state.ejemplo) state = generar();
  const vista = { periodo: '7', desde: null, hasta: null, todosLosAnuncios: false };
  let claveIA = store.get(KEY_IA) || '';
  let pendiente = null; // CSV de ventas esperando que se elijan las columnas a mano

  /* ---------- Utilidades ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) el.append(c instanceof Node ? c : String(c)); });
    return el;
  }
  const money = (n) => `${(n || 0) < 0 ? '−' : ''}US$ ${Math.abs(n || 0).toLocaleString(getLang(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const num2 = (r) => (r == null ? '—' : r.toLocaleString(getLang(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const hoy = () => isoDia(new Date());
  const diasAtras = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDia(d); };
  const nuevoId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  function rango() {
    switch (vista.periodo) {
      case 'hoy': return { desde: hoy(), hasta: hoy(), etiqueta: t('r_hoy') };
      case 'ayer': return { desde: diasAtras(1), hasta: diasAtras(1), etiqueta: t('r_ayer') };
      case '7': return { desde: diasAtras(6), hasta: hoy(), etiqueta: t('r_7') };
      case '30': return { desde: diasAtras(29), hasta: hoy(), etiqueta: t('r_30') };
      case 'todo': return { desde: null, hasta: null, etiqueta: t('r_todo') };
      default: return { desde: vista.desde, hasta: vista.hasta, etiqueta: t('r_custom', vista.desde || '…', vista.hasta || '…') };
    }
  }

  function datosDelPeriodo() {
    const r = rango();
    return { r, d: { ofertas: state.config.ofertas, gasto: state.gasto, ventas: state.ventas, desde: r.desde, hasta: r.hasta, tasas: state.config.tasas } };
  }

  const COLOR_TONO = { rojo: 'mal', amarillo: 'ok', verde: 'bien' };

  /* ---------- Dibujo ---------- */
  function render() {
    const { r, d } = datosDelPeriodo();
    const res = resumir(d);
    const cfg = { escala: state.config.escala, corte: state.config.corte };
    const anuncios = evaluarReglas(porAnuncio(d), state.config.reglas);

    $('banner').hidden = !state.ejemplo;
    const sinTasa = res.monedasSinTasa;
    $('aviso-monedas').hidden = !sinTasa.length;
    if (sinTasa.length) {
      $('aviso-monedas').replaceChildren(
        h('p', null, h('b', null, t('falta_tasa', sinTasa.join(', '))), ` ${t('montos_no_suman')} `),
        h('button', { class: 'btn small', type: 'button', onclick: () => abrirDatos('monedas') }, t('agregar_tasa')),
      );
    }
    document.querySelectorAll('#periodos button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === vista.periodo)));
    $('desde').value = r.desde || '';
    $('hasta').value = r.hasta || '';
    $('leyenda-tono').textContent = t('leyenda_tono', num2(cfg.escala), num2(cfg.corte));

    renderKpis(res.total, r.etiqueta);
    renderAlertas(anuncios);
    renderOfertas(res.ofertas, cfg);
    renderGrafico(porDia(d));
    renderTabla(res.ofertas);
    renderSinAsignar(res.sinAsignar);
  }

  function renderKpis(tot, etiqueta) {
    const k = (label, value, note, cls) => h('div', { class: `kpi ${cls || ''}` },
      h('span', { class: 'label' }, label), h('span', { class: 'value num' }, value), h('span', { class: 'note' }, note));
    $('kpis').replaceChildren(
      k(t('k_resultado'), money(tot.resultado), `${t('k_resultado_nota')} · ${etiqueta}`, `hero ${tot.resultado > 0 ? 'pos' : tot.resultado < 0 ? 'neg' : ''}`),
      k(t('k_gasto'), money(tot.gasto), etiqueta),
      k(t('k_ventas'), String(tot.ventas), t('k_ventas_nota')),
      k(t('k_ingresos'), money(tot.ingresos), t('k_ingresos_nota')),
      k('ROAS', num2(tot.roas), t('k_roas_nota')),
    );
  }

  function renderAlertas(lista) {
    const cuenta = { rojo: 0, amarillo: 0, verde: 0 };
    lista.forEach((u) => { if (u.color) cuenta[u.color] = (cuenta[u.color] || 0) + 1; });
    const chip = (color, texto) => h('span', { class: `chip ${COLOR_TONO[color]}` }, h('b', { class: 'num' }, String(cuenta[color] || 0)), ` ${texto}`);
    $('resumen-alertas').replaceChildren(chip('rojo', t('chip_apagar')), chip('amarillo', t('chip_revisar')), chip('verde', t('chip_escalar')),
      h('span', { class: 'chip' }, h('b', { class: 'num' }, String(lista.filter((u) => !u.color).length)), ` ${t('chip_sin')}`));

    if (!lista.length) { $('alertas').replaceChildren(h('p', { class: 'empty' }, t('sin_gasto_fechas'))); return; }
    const orden = { rojo: 0, amarillo: 1, verde: 2 };
    const todas = [...lista].sort((a, b) => (orden[a.color] ?? 3) - (orden[b.color] ?? 3) || b.gasto - a.gasto);
    const LIMITE = 8;
    const filas = vista.todosLosAnuncios ? todas : todas.slice(0, LIMITE);
    const th = (t, cl) => h('th', { scope: 'col', class: cl || null }, t);
    const mas = todas.length > LIMITE
      ? h('button', { class: 'btn small more', type: 'button', onclick: () => { vista.todosLosAnuncios = !vista.todosLosAnuncios; render(); } },
        vista.todosLosAnuncios ? t('mostrar_menos') : t('ver_todos', todas.length))
      : null;
    $('alertas').replaceChildren(h('table', { class: 'alerts' },
      h('thead', null, h('tr', null, th(t('h_accion')), th(t('h_anuncio')), th(t('h_oferta'), 'hide-sm'), th(t('h_gasto'), 'r'), th(t('h_ventas'), 'r'), th('ROAS', 'r'), th(t('h_costo'), 'r hide-sm'))),
      h('tbody', null, filas.map((u) => h('tr', { class: u.color ? `row-${COLOR_TONO[u.color]}` : null },
        h('td', null, u.accion ? h('span', { class: `pill ${COLOR_TONO[u.color]}`, title: t('regla_titulo', u.regla) }, u.accion) : h('span', { class: 'pill' }, t('pill_sin_alerta'))),
        h('td', null, h('div', { class: 'ad-name' }, u.anuncio), u.anuncio !== u.campana ? h('div', { class: 'muted small' }, u.campana) : null),
        h('td', { class: 'hide-sm' }, u.oferta || h('span', { class: 'muted' }, '—')),
        h('td', { class: 'r num' }, money(u.gasto)),
        h('td', { class: 'r num' }, String(u.ventas)),
        h('td', { class: 'r num' }, num2(u.roas)),
        h('td', { class: 'r num hide-sm' }, u.costoPorVenta == null ? '—' : money(u.costoPorVenta)),
      ))),
    ), mas);
  }

  function renderOfertas(filas, cfg) {
    const cards = filas.map((o) => {
      const tn = tono(o.roas, o.gasto, cfg);
      const max = Math.max(cfg.escala * 1.6, 3);
      const pct = o.roas == null ? 0 : Math.min(100, (o.roas / max) * 100);
      const pill = o.gasto ? { bien: t('p_escalar'), ok: t('p_gana'), mal: t('p_pierde') }[tn] : o.estado || t('p_sin_gasto');
      return h('article', { class: `card ${tn}` },
        h('div', { class: 'card-head' }, h('h3', null, o.nombre), h('span', { class: `pill ${o.gasto ? tn : ''}` }, pill)),
        h('div', { class: 'big num' }, money(o.resultado), h('span', { class: 'muted small' }, ` ${t('resultado')}`)),
        h('div', { class: 'stats' },
          h('div', { class: 'stat' }, h('span', { class: 'label' }, t('h_gasto')), h('span', { class: 'value num' }, money(o.gasto))),
          h('div', { class: 'stat' }, h('span', { class: 'label' }, t('h_ventas')), h('span', { class: 'value num' }, String(o.ventas))),
          h('div', { class: 'stat' }, h('span', { class: 'label' }, 'ROAS'), h('span', { class: 'value num' }, num2(o.roas))),
        ),
        h('div', { class: 'gauge', role: 'img', 'aria-label': t('gauge_aria', num2(o.roas), num2(cfg.escala)) },
          h('div', { class: `fill ${tn}`, style: `width:${pct}%` }),
          h('div', { class: 'tick', style: `left:${(cfg.escala / max) * 100}%` })),
        h('div', { class: 'card-foot muted small' },
          o.costoPorVenta != null ? t('cada_venta', money(o.costoPorVenta), o.ticket ? money(o.ticket) : null) : t('estado_de', o.estado || '—')),
      );
    });
    $('ofertas').replaceChildren(...(cards.length ? cards : [h('p', { class: 'empty' }, t('sin_ofertas_aun'))]));
  }

  function renderGrafico(dias) {
    const box = $('grafico');
    if (!dias.length) { box.replaceChildren(h('p', { class: 'empty' }, t('sin_datos_fechas'))); return; }
    const W = 640, H = 240, P = { l: 44, r: 6, t: 10, b: 26 };
    const max = Math.max(1, ...dias.map((x) => Math.max(x.gasto, x.ingresos)));
    const bw = (W - P.l - P.r) / dias.length;
    const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
    const ns = 'http://www.w3.org/2000/svg';
    const s = (tag, a) => { const e = document.createElementNS(ns, tag); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('gasto_ingresos_dia') });
    [0, 0.5, 1].forEach((f) => {
      const yy = y(max * f);
      svg.append(s('line', { x1: P.l, x2: W - P.r, y1: yy, y2: yy, class: 'grid-line' }));
      const tx = s('text', { x: P.l - 6, y: yy + 4, 'text-anchor': 'end', class: 'axis' });
      tx.textContent = Math.round(max * f);
      svg.append(tx);
    });
    const paso = Math.ceil(dias.length / 8);
    dias.forEach((x, i) => {
      const x0 = P.l + i * bw;
      const w = Math.max(2, bw * 0.36);
      const g = s('g', {});
      const tt = s('title', {});
      tt.textContent = t('barra_titulo', x.fecha, money(x.gasto), money(x.ingresos));
      g.append(tt);
      g.append(s('rect', { x: x0 + bw * 0.12, y: y(x.gasto), width: w, height: H - P.b - y(x.gasto), rx: 3, class: 'bar-spend' }));
      g.append(s('rect', { x: x0 + bw * 0.12 + w + 2, y: y(x.ingresos), width: w, height: H - P.b - y(x.ingresos), rx: 3, class: 'bar-rev' }));
      svg.append(g);
      if (i % paso === 0) {
        const tx = s('text', { x: x0 + bw / 2, y: H - 8, 'text-anchor': 'middle', class: 'axis' });
        tx.textContent = `${x.fecha.slice(8, 10)}/${x.fecha.slice(5, 7)}`;
        svg.append(tx);
      }
    });
    // Tabla oculta con los mismos números, para lectores de pantalla.
    const tabla = h('table', { class: 'sr' }, h('caption', null, t('gasto_ingresos_dia')),
      h('tbody', null, dias.map((x) => h('tr', null, h('th', { scope: 'row' }, x.fecha), h('td', null, money(x.gasto)), h('td', null, money(x.ingresos))))));
    box.replaceChildren(
      h('div', { class: 'legend' }, h('span', null, h('i', { class: 'sw spend' }), t('h_gasto')), h('span', null, h('i', { class: 'sw rev' }), t('k_ingresos'))),
      svg, tabla,
    );
  }

  function renderTabla(filas) {
    if (!filas.length) { $('tabla').replaceChildren(h('p', { class: 'empty' }, t('sin_ofertas'))); return; }
    const th = (t, r) => h('th', { class: r ? 'r' : null, scope: 'col' }, t);
    const td = (t, r) => h('td', { class: r ? 'r num' : null }, t);
    $('tabla').replaceChildren(h('table', null,
      h('thead', null, h('tr', null, th(t('h_oferta')), th(t('h_gasto'), 1), th(t('h_ventas'), 1), th(t('k_ingresos'), 1), th('ROAS', 1), th(t('h_costo'), 1))),
      h('tbody', null, filas.map((o) => h('tr', null, td(o.nombre), td(money(o.gasto), 1), td(String(o.ventas), 1), td(money(o.ingresos), 1), td(num2(o.roas), 1), td(o.costoPorVenta == null ? '—' : money(o.costoPorVenta), 1)))),
    ));
  }

  function renderSinAsignar({ gasto, ventas }) {
    const box = $('sin-asignar');
    if (!gasto.length && !ventas.length) { box.replaceChildren(h('p', { class: 'empty' }, t('todo_asignado'))); return; }
    const filas = [...gasto.map((x) => ({ tipo: t('h_gasto'), ...x })), ...ventas.map((x) => ({ tipo: t('h_ventas'), ...x }))];
    box.replaceChildren(h('div', { class: 'table-scroll' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, t('h_campana_utm')), h('th', null, t('h_tipo')), h('th', { class: 'r' }, t('h_monto')), h('th', null, h('span', { class: 'sr' }, t('h_accion'))))),
      h('tbody', null, filas.map((x) => h('tr', null,
        h('td', null, x.nombre),
        h('td', null, x.tipo),
        h('td', { class: 'r num' }, money(x.valor)),
        h('td', null, x.nombre === '(sin campaña)' ? h('span', { class: 'muted' }, t('sin_utm')) : h('button', { class: 'btn small', type: 'button', onclick: () => crearOfertaDesde(x.nombre) }, t('crear_oferta'))),
      ))),
    )));
  }

  /* ---------- Asistente ---------- */
  function resumenParaIA() {
    const { r, d } = datosDelPeriodo();
    const res = resumir(d);
    const anuncios = evaluarReglas(porAnuncio(d), state.config.reglas);
    return {
      ejemplo: !!state.ejemplo,
      periodo: { etiqueta: r.etiqueta, desde: r.desde, hasta: r.hasta },
      moneda: 'USD',
      umbrales: { roas_para_escalar: state.config.escala, roas_minimo: state.config.corte },
      reglas: state.config.reglas.filter((x) => x.activa !== false).map((x) => ({ nombre: x.nombre, accion: x.accion, condiciones: x.condiciones })),
      total: res.total,
      ofertas: res.ofertas.map(({ id, ...o }) => o),
      anuncios: anuncios.slice(0, 60).map((u) => ({ anuncio: u.anuncio, campana: u.campana, oferta: u.oferta, gasto: u.gasto, ventas: u.ventas, ingresos: u.ingresos, roas: u.roas, costo_por_venta: u.costoPorVenta, alerta: u.accion })),
      sin_asignar: res.sinAsignar,
    };
  }

  async function explicarIA() {
    const out = $('ia-salida');
    if (!claveIA) {
      out.replaceChildren(h('p', { class: 'msg err' }, t('ia_falta_clave') + ' '),
        h('button', { class: 'btn small', type: 'button', onclick: () => abrirDatos('ia') }, t('cargar_clave')));
      return;
    }
    const btn = $('ia-explicar');
    btn.disabled = true;
    out.replaceChildren(h('p', { class: 'muted loading' }, t('ia_leyendo', $('ia-idioma').value)));
    try {
      const texto = await IA.explicar({ clave: claveIA, resumen: resumenParaIA(), idioma: $('ia-idioma').value });
      out.replaceChildren(IA.aNodos(texto), h('p', { class: 'muted small' }, t('ia_pie', IA.MODELO)));
    } catch (err) {
      out.replaceChildren(h('p', { class: 'msg err' }, err.message));
    } finally { btn.disabled = false; }
  }

  /* ---------- Importar ---------- */
  function salirDeEjemplo() {
    if (!state.ejemplo) return;
    state = completar({ config: { escala: state.config.escala, corte: state.config.corte, tasas: state.config.tasas, reglas: state.config.reglas, ofertas: [] }, gasto: [], ventas: [], ejemplo: false });
  }

  /**
   * Suma las filas nuevas de una fuente (meta, hotmart, stripe…). Reemplaza solo las filas de ESA fuente en las
   * mismas fechas que trae el archivo: se puede volver a subir sin duplicar y no se pisan las otras plataformas.
   */
  function fusionar(actuales, nuevas, fuente) {
    if (!nuevas.length) return actuales;
    const fechas = nuevas.map((x) => x.fecha).sort();
    const desde = fechas[0], hasta = fechas[fechas.length - 1];
    const marcadas = nuevas.map((x) => ({ ...x, fuente }));
    return actuales.filter((x) => (x.fuente || '') !== fuente || x.fecha < desde || x.fecha > hasta).concat(marcadas);
  }

  function importarVentas(texto, mapa) {
    const plataforma = $('tienda-plataforma').value;
    const filas = parseStoreCSV(texto, { plataforma, moneda: $('tienda-moneda').value, mapa });
    salirDeEjemplo();
    state.ventas = fusionar(state.ventas, filas, plataforma);
    guardar(); render();
    pendiente = null;
    $('mapeo').hidden = true;
    const sinUtm = filas.filter((x) => !x.campana).length;
    const monedas = [...new Set(filas.map((x) => x.moneda))].join(', ');
    aviso(t('importadas', filas.length, PLATAFORMAS[plataforma].nombre, monedas, sinUtm), 'ok');
  }

  /** Cuando no se reconocen las columnas, se muestran selectores para elegirlas a mano. */
  function mostrarMapeo(err, texto) {
    pendiente = texto;
    const campos = [['fecha', t('m_fecha')], ['monto', t('m_monto')], ['campana', t('m_campana')], ['anuncio', t('m_anuncio')], ['estado', t('m_estado')], ['moneda', t('m_moneda')]];
    const sel = (k) => h('select', { id: `map-${k}`, 'data-k': k },
      h('option', { value: '' }, t('no_esta')),
      err.headers.map((hd, i) => h('option', { value: String(i) }, hd || t('columna_n', i + 1))));
    const box = $('mapeo');
    box.replaceChildren(
      h('p', { class: 'msg err' }, err.message),
      h('div', { class: 'row' }, campos.map(([k, label]) => h('div', { class: 'field' }, h('label', { for: `map-${k}` }, label), sel(k)))),
      h('button', { class: 'btn primary', type: 'button', onclick: () => {
        const mapa = {};
        box.querySelectorAll('select[data-k]').forEach((s) => { if (s.value !== '') mapa[s.dataset.k] = s.value; });
        try { importarVentas(pendiente, mapa); } catch (e) { aviso(e.message, 'err'); }
      } }, t('importar_columnas')),
    );
    box.hidden = false;
  }

  function crearOfertaDesde(nombre) {
    state.config.ofertas.push({ id: nuevoId('o'), nombre, estado: 'al aire', ticket: null, campanas: [nombre] });
    state.ejemplo = false;
    guardar();
    render();
    abrirDatos('ofertas');
    aviso(t('oferta_creada', nombre), 'ok');
  }

  function aviso(texto, tipo) {
    $('msg').replaceChildren(texto ? h('p', { class: `msg ${tipo || 'ok'}` }, texto) : '');
  }

  async function leerArchivo(input) {
    const f = input.files && input.files[0];
    input.value = '';
    return f ? f.text() : null;
  }

  /* ---------- Ventana de datos ---------- */
  function abrirDatos(tab) {
    mostrarTab(tab || 'importar');
    llenarMonedas(); llenarOfertas(); llenarReglas(); llenarTasas();
    $('ia-clave').value = claveIA;
    $('meta-desde').value = $('meta-desde').value || diasAtras(29);
    $('meta-hasta').value = $('meta-hasta').value || hoy();
    if (!$('datos').open) $('datos').showModal();
  }
  function mostrarTab(tab) {
    aviso('');
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  }

  function llenarMonedas() {
    const codigos = Object.keys(state.config.tasas).sort((a, b) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b)));
    document.querySelectorAll('.sel-moneda').forEach((s) => {
      const actual = s.value || 'USD';
      s.replaceChildren(...codigos.map((c) => h('option', { value: c, selected: c === actual }, c)));
    });
  }

  /* Ofertas */
  function llenarOfertas() {
    $('cfg-escala').value = state.config.escala;
    $('cfg-corte').value = state.config.corte;
    const lista = $('lista-ofertas');
    lista.replaceChildren(...state.config.ofertas.map((o, i) => filaOferta(o, i)));
    if (!state.config.ofertas.length) lista.append(h('p', { class: 'empty' }, t('sin_ofertas_todavia')));
  }

  // Los valores guardados siguen en español; solo cambia el texto que se ve.
  const ESTADOS = { 'al aire': 'e_aire', 'en armado': 'e_armado', programada: 'e_programada', pausada: 'e_pausada' };
  function filaOferta(o, i) {
    const id = (k) => `of-${i}-${k}`;
    return h('div', { class: 'item-row', 'data-i': i },
      h('div', { class: 'row' },
        h('div', { class: 'field' }, h('label', { for: id('nombre') }, t('f_nombre')), h('input', { id: id('nombre'), 'data-k': 'nombre', value: o.nombre || '' })),
        h('div', { class: 'field' }, h('label', { for: id('campanas') }, t('f_textos')), h('input', { id: id('campanas'), 'data-k': 'campanas', value: (o.campanas || []).join(', ') })),
      ),
      h('div', { class: 'row' },
        h('div', { class: 'field' }, h('label', { for: id('ticket') }, t('f_precio')), h('input', { id: id('ticket'), 'data-k': 'ticket', type: 'number', step: '0.01', min: '0', value: o.ticket == null ? '' : o.ticket })),
        h('div', { class: 'field' }, h('label', { for: id('estado') }, t('f_estado')),
          h('select', { id: id('estado'), 'data-k': 'estado' }, Object.keys(ESTADOS).map((e) => h('option', { value: e, selected: o.estado === e }, t(ESTADOS[e]))))),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => { leerOfertas(); state.config.ofertas.splice(i, 1); llenarOfertas(); } }, t('quitar')),
      ),
    );
  }

  function leerOfertas() {
    state.config.ofertas = [...document.querySelectorAll('#lista-ofertas .item-row')].map((row) => {
      const v = (k) => row.querySelector(`[data-k="${k}"]`).value;
      const prev = state.config.ofertas[Number(row.dataset.i)] || {};
      return {
        id: prev.id || nuevoId('o'),
        nombre: v('nombre').trim() || 'Sin nombre',
        campanas: v('campanas').split(',').map((s) => s.trim()).filter(Boolean),
        ticket: v('ticket') === '' ? null : Number(v('ticket')),
        estado: v('estado'),
      };
    });
    state.config.escala = Number($('cfg-escala').value) || 1.8;
    state.config.corte = Number($('cfg-corte').value) || 1;
  }

  /* Reglas */
  const CAMPOS = [['gasto', 'c_gasto'], ['ventas', 'h_ventas'], ['roas', 'c_roas'], ['costoPorVenta', 'c_costo'], ['ingresos', 'c_ingresos']];
  const OPERADORES = ['>=', '>', '<=', '<', '='];

  function llenarReglas() {
    const lista = $('lista-reglas');
    lista.replaceChildren(...state.config.reglas.map((r, i) => filaRegla(r, i)));
    if (!state.config.reglas.length) lista.append(h('p', { class: 'empty' }, t('sin_reglas')));
  }

  function filaCondicion(c, ri, ci) {
    const id = (k) => `re-${ri}-${ci}-${k}`;
    return h('div', { class: 'cond', 'data-c': ci },
      h('label', { class: 'sr', for: id('campo') }, t('c_campo')),
      h('select', { id: id('campo'), 'data-k': 'campo' }, CAMPOS.map(([v, k]) => h('option', { value: v, selected: c.campo === v }, t(k)))),
      h('label', { class: 'sr', for: id('op') }, t('c_comparacion')),
      h('select', { id: id('op'), 'data-k': 'op' }, OPERADORES.map((op) => h('option', { value: op, selected: c.op === op }, op))),
      h('label', { class: 'sr', for: id('valor') }, t('c_valor')),
      h('input', { id: id('valor'), 'data-k': 'valor', type: 'number', step: '0.1', value: c.valor }),
      h('button', { class: 'btn small', type: 'button', 'aria-label': t('quitar_condicion'), onclick: () => { leerReglas(); state.config.reglas[ri].condiciones.splice(ci, 1); llenarReglas(); } }, '×'),
    );
  }

  function filaRegla(r, i) {
    const id = (k) => `re-${i}-${k}`;
    const mover = (d) => { leerReglas(); const a = state.config.reglas; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; llenarReglas(); };
    return h('div', { class: `item-row regla ${COLOR_TONO[r.color] || ''}`, 'data-i': i },
      h('div', { class: 'row' },
        h('div', { class: 'field' }, h('label', { for: id('nombre') }, t('regla_n', i + 1)), h('input', { id: id('nombre'), 'data-k': 'nombre', value: r.nombre || '' })),
        h('div', { class: 'field' }, h('label', { for: id('accion') }, t('accion_sugerida')), h('input', { id: id('accion'), 'data-k': 'accion', value: r.accion || '' })),
        h('div', { class: 'field' }, h('label', { for: id('color') }, t('f_color')),
          h('select', { id: id('color'), 'data-k': 'color' }, [['rojo', 'col_rojo'], ['amarillo', 'col_amarillo'], ['verde', 'col_verde']].map(([v, k]) => h('option', { value: v, selected: r.color === v }, t(k))))),
      ),
      h('div', { class: 'conds' }, h('span', { class: 'muted small' }, t('se_cumple_si')), (r.condiciones || []).map((c, ci) => filaCondicion(c, i, ci))),
      h('div', { class: 'tools' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-k': 'activa', checked: r.activa !== false }), t('activa')),
        h('button', { class: 'btn small', type: 'button', onclick: () => { leerReglas(); state.config.reglas[i].condiciones.push({ campo: 'gasto', op: '>=', valor: 0 }); llenarReglas(); } }, t('mas_condicion')),
        h('button', { class: 'btn small', type: 'button', 'aria-label': t('subir_regla'), onclick: () => mover(-1) }, '↑'),
        h('button', { class: 'btn small', type: 'button', 'aria-label': t('bajar_regla'), onclick: () => mover(1) }, '↓'),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => { leerReglas(); state.config.reglas.splice(i, 1); llenarReglas(); } }, t('quitar')),
      ),
    );
  }

  function leerReglas() {
    state.config.reglas = [...document.querySelectorAll('#lista-reglas .regla')].map((row) => {
      const prev = state.config.reglas[Number(row.dataset.i)] || {};
      const v = (k) => row.querySelector(`:scope > .row [data-k="${k}"]`).value;
      return {
        id: prev.id || nuevoId('r'),
        nombre: v('nombre').trim() || 'Regla sin nombre',
        accion: v('accion').trim() || 'Revisar',
        color: v('color'),
        activa: row.querySelector('[data-k="activa"]').checked,
        condiciones: [...row.querySelectorAll('.cond')].map((c) => ({
          campo: c.querySelector('[data-k="campo"]').value,
          op: c.querySelector('[data-k="op"]').value,
          valor: Number(c.querySelector('[data-k="valor"]').value) || 0,
        })),
      };
    });
  }

  /* Monedas */
  function llenarTasas() {
    const lista = $('lista-tasas');
    lista.replaceChildren(...Object.entries(state.config.tasas).filter(([c]) => c !== 'USD').map(([c, t]) => h('div', { class: 'tasa' },
      h('label', { for: `tasa-${c}` }, `1 USD =`),
      h('input', { id: `tasa-${c}`, 'data-c': c, type: 'number', min: '0', step: 'any', value: t }),
      h('span', { class: 'code' }, c),
    )));
  }

  /* ---------- Eventos ---------- */
  document.querySelectorAll('#periodos button').forEach((b) => b.addEventListener('click', () => { vista.periodo = b.dataset.p; render(); }));
  ['desde', 'hasta'].forEach((k) => $(k).addEventListener('change', () => {
    vista.periodo = 'custom';
    vista.desde = $('desde').value || null;
    vista.hasta = $('hasta').value || null;
    render();
  }));

  $('abrir-datos').addEventListener('click', () => abrirDatos());
  $('banner-datos').addEventListener('click', () => abrirDatos());
  $('editar-reglas').addEventListener('click', () => abrirDatos('reglas'));
  $('cerrar-datos').addEventListener('click', () => $('datos').close());
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => mostrarTab(b.dataset.tab)));
  $('ia-explicar').addEventListener('click', explicarIA);

  $('csv-meta').addEventListener('change', async (e) => {
    try {
      const txt = await leerArchivo(e.target);
      if (txt == null) return;
      const filas = parseMetaCSV(txt, { moneda: $('meta-moneda').value });
      salirDeEjemplo();
      state.gasto = fusionar(state.gasto, filas, 'meta');
      guardar(); render();
      const conAnuncio = filas.some((x) => x.anuncio);
      aviso(t('gasto_importado', filas.length, conAnuncio, filas[0] ? filas[0].moneda : 'USD'), 'ok');
    } catch (err) {
      aviso(err.code === 'FALTAN_COLUMNAS'
        ? t('no_es_meta', err.faltan.join(', '), Object.values(META_COLS).map((v) => v[0]).join(', '))
        : err.message, 'err');
    }
  });

  $('csv-tienda').addEventListener('change', async (e) => {
    let txt = null;
    try {
      txt = await leerArchivo(e.target);
      if (txt == null) return;
      importarVentas(txt);
    } catch (err) {
      if (err.code === 'FALTAN_COLUMNAS' && txt) { aviso(''); mostrarMapeo(err, txt); } else aviso(err.message, 'err');
    }
  });

  $('meta-traer').addEventListener('click', async () => {
    const btn = $('meta-traer');
    btn.disabled = true;
    aviso(t('pidiendo_meta'), 'ok');
    try {
      const filas = await window.PA_META.traerGasto({ clave: $('meta-clave').value.trim(), cuenta: $('meta-cuenta').value, desde: $('meta-desde').value, hasta: $('meta-hasta').value, moneda: $('meta-moneda-api').value });
      salirDeEjemplo();
      state.gasto = fusionar(state.gasto, filas, 'meta');
      guardar(); render();
      aviso(t('gasto_traido', filas.length), 'ok');
    } catch (err) { aviso(err.message, 'err'); }
    finally { btn.disabled = false; }
  });

  $('agregar-oferta').addEventListener('click', () => {
    leerOfertas();
    state.config.ofertas.push({ id: nuevoId('o'), nombre: '', campanas: [], ticket: null, estado: 'al aire' });
    llenarOfertas();
  });
  $('guardar-ofertas').addEventListener('click', () => {
    leerOfertas();
    state.ejemplo = false;
    guardar(); render(); llenarOfertas();
    aviso(t('ofertas_guardadas'), 'ok');
  });

  $('agregar-regla').addEventListener('click', () => {
    leerReglas();
    state.config.reglas.push({ id: nuevoId('r'), nombre: t('regla_nueva'), accion: t('revisar'), color: 'amarillo', activa: true, condiciones: [{ campo: 'gasto', op: '>=', valor: 5 }] });
    llenarReglas();
  });
  $('reglas-ejemplo').addEventListener('click', () => {
    state.config.reglas = JSON.parse(JSON.stringify(REGLAS));
    llenarReglas();
  });
  $('guardar-reglas').addEventListener('click', () => {
    leerReglas();
    guardar(); render(); llenarReglas();
    aviso(t('reglas_guardadas'), 'ok');
  });

  $('agregar-tasa').addEventListener('click', () => {
    const c = (prompt(t('prompt_moneda')) || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) return;
    state.config.tasas[c] = state.config.tasas[c] || 1;
    llenarTasas(); llenarMonedas();
  });
  $('guardar-tasas').addEventListener('click', () => {
    document.querySelectorAll('#lista-tasas input[data-c]').forEach((i) => { const v = Number(i.value); if (v > 0) state.config.tasas[i.dataset.c] = v; });
    state.config.tasas.USD = 1;
    guardar(); render();
    aviso(t('tasas_guardadas'), 'ok');
  });

  $('ia-guardar').addEventListener('click', () => {
    claveIA = $('ia-clave').value.trim();
    if ($('ia-recordar').checked && claveIA) store.set(KEY_IA, claveIA); else store.del(KEY_IA);
    aviso(claveIA ? t('clave_guardada') : t('sin_clave'), claveIA ? 'ok' : 'err');
  });
  $('ia-borrar').addEventListener('click', () => {
    claveIA = ''; $('ia-clave').value = ''; store.del(KEY_IA);
    aviso(t('clave_borrada'), 'ok');
  });

  $('exportar').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `panel-abierto-${hoy()}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('importar-json').addEventListener('change', async (e) => {
    try {
      const txt = await leerArchivo(e.target);
      if (txt == null) return;
      const s = JSON.parse(txt);
      if (!s.config || !Array.isArray(s.gasto) || !Array.isArray(s.ventas)) throw new Error(t('no_es_respaldo'));
      state = completar(s); guardar(); render(); abrirDatos('respaldo');
      aviso(t('respaldo_cargado'), 'ok');
    } catch (err) { aviso(err.message, 'err'); }
  });
  $('volver-ejemplo').addEventListener('click', () => {
    if (!confirm(t('confirma_ejemplo'))) return;
    state = generar(); guardar(); render(); abrirDatos('respaldo');
    aviso(t('volviste_ejemplo'), 'ok');
  });
  $('borrar-todo').addEventListener('click', () => {
    if (!confirm(t('confirma_borrar'))) return;
    state = completar({ config: {}, gasto: [], ventas: [], ejemplo: false });
    guardar(); render(); abrirDatos('respaldo');
    aviso(t('se_borro'), 'ok');
  });

  /* ---------- Idioma ---------- */
  /** Pone los textos fijos de index.html en el idioma activo (data-i18n, data-i18n-html y data-i18n-attr). */
  function aplicarIdioma() {
    const l = getLang();
    document.documentElement.lang = l;
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.dataset.i18nAttr.split(';').forEach((par) => { const [a, k] = par.split(':'); el.setAttribute(a, t(k)); });
    });
    $('idioma').textContent = l === 'en' ? 'ES' : 'EN';
  }
  setLang(store.get(KEY_LANG) === 'en' ? 'en' : 'es');
  $('ia-idioma').value = getLang();
  aplicarIdioma();
  $('idioma').addEventListener('click', () => {
    setLang(getLang() === 'en' ? 'es' : 'en');
    store.set(KEY_LANG, getLang());
    $('ia-idioma').value = getLang(); // el asistente responde en el idioma de la pantalla (se puede cambiar aparte)
    aplicarIdioma();
    render();
    if ($('datos').open) { leerOfertas(); leerReglas(); llenarOfertas(); llenarReglas(); llenarTasas(); }
  });

  /* ---------- Tema ---------- */
  function aplicarTema(t) {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  let tema = store.get(KEY_TEMA);
  // ?tema=claro o ?tema=oscuro fuerza el tema (sirve para capturas y para compartir un enlace).
  const forzado = new URLSearchParams(location.search).get('tema');
  if (forzado === 'claro' || forzado === 'oscuro') tema = forzado === 'claro' ? 'light' : 'dark';
  aplicarTema(tema);
  $('tema').addEventListener('click', () => {
    const oscuro = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    tema = oscuro ? 'light' : 'dark';
    aplicarTema(tema);
    store.set(KEY_TEMA, tema);
  });

  render();
  // ?datos=reglas (o importar, monedas, ia…) abre la ventana de datos en esa pestaña: sirve para enlaces y capturas.
  const pestana = new URLSearchParams(location.search).get('datos');
  if (pestana && document.querySelector(`[data-panel="${CSS.escape(pestana)}"]`)) abrirDatos(pestana);
})();
