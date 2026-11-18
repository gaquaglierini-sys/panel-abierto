/* Panel Abierto · conector directo a la API de Marketing de Meta.
   Corre en el navegador: la clave de acceso no sale de tu computadora salvo hacia graph.facebook.com.
   No se guarda en ningún lado: vive en memoria mientras la pestaña está abierta. */
(function (root) {
  'use strict';

  const GRAPH = 'https://graph.facebook.com/v21.0';
  const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];

  function comprasDe(actions) {
    if (!Array.isArray(actions)) return 0;
    for (const t of PURCHASE_TYPES) {
      const a = actions.find((x) => x.action_type === t);
      if (a) return Number(a.value) || 0;
    }
    return 0;
  }

  /** Pasa una fila de /insights a {fecha, campana, anuncio, gasto, compras, moneda}. */
  function filaDeInsight(r, moneda) {
    return { fecha: r.date_start, campana: r.campaign_name || '', anuncio: r.ad_name || '', gasto: Number(r.spend) || 0, compras: comprasDe(r.actions), moneda: moneda || 'USD' };
  }

  /**
   * Trae gasto y compras por día y por anuncio de una cuenta publicitaria.
   * @param {{clave: string, cuenta: string, desde: string, hasta: string, moneda?: string, fetchFn?: Function}} p
   */
  async function traerGasto({ clave, cuenta, desde, hasta, moneda, fetchFn }) {
    const f = fetchFn || root.fetch.bind(root);
    const id = String(cuenta || '').replace(/^act_/, '').trim();
    if (!/^\d+$/.test(id)) throw new Error('El número de cuenta publicitaria tiene que ser solo dígitos.');
    if (!clave) throw new Error('Falta la clave de acceso de Meta.');
    const params = new URLSearchParams({
      level: 'ad',
      time_increment: '1',
      fields: 'campaign_name,ad_name,spend,actions,date_start',
      time_range: JSON.stringify({ since: desde, until: hasta }),
      limit: '500',
      access_token: clave,
    });
    let url = `${GRAPH}/act_${id}/insights?${params}`;
    const out = [];
    for (let pagina = 0; url && pagina < 50; pagina++) {
      const res = await f(url);
      const body = await res.json();
      if (body.error) throw new Error(`Meta respondió: ${body.error.message || 'error'}`);
      (body.data || []).forEach((r) => out.push(filaDeInsight(r, moneda)));
      url = body.paging && body.paging.next;
    }
    return out;
  }

  const api = { traerGasto, filaDeInsight, comprasDe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PA_META = api;
})(typeof window !== 'undefined' ? window : globalThis);
