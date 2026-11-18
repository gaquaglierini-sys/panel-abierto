/* Panel Abierto · asistente con Claude.
   Usa la clave de la API de Claude de cada persona, que queda solo en su navegador.
   La llamada va directo de su navegador a api.anthropic.com: no pasa por ningún otro servidor. */
(function (root) {
  'use strict';

  const URL_API = 'https://api.anthropic.com/v1/messages';
  const MODELO = 'claude-opus-5-5';

  const INSTRUCCIONES = {
    es: 'Responde en español neutro, claro y simple, sin tecnicismos.',
    en: 'Answer in plain, simple English with no jargon.',
  };

  function sistema(idioma) {
    return [
      'Eres el asistente de Panel Abierto, un panel para personas que venden productos digitales (ebooks, cursos, plantillas) con anuncios de Meta.',
      'Recibes un resumen en JSON con los números del período elegido, en dólares: totales, cada oferta y cada anuncio con su gasto, ventas reales de la tienda, ingresos, ROAS (ingresos ÷ gasto) y la alerta que marcaron las reglas de la persona.',
      'Tu trabajo: explicar qué está pasando y recomendar qué hacer hoy, anuncio por anuncio cuando haga falta: apagar, escalar, revisar o esperar.',
      'Reglas: usa solo los números del JSON y no inventes datos; si hay pocos datos (por ejemplo, poco gasto o un solo día), dilo y recomienda esperar; no prometas resultados; si el campo "ejemplo" es true, aclara al principio que son datos de ejemplo.',
      'Formato: un párrafo corto de resumen, después una lista de acciones con el nombre del anuncio u oferta en **negrita**, y al final una línea con lo más importante. Máximo 250 palabras.',
      INSTRUCCIONES[idioma] || INSTRUCCIONES.es,
    ].join('\n');
  }

  /**
   * Le pide a Claude que explique los números.
   * @param {{clave: string, resumen: Object, idioma?: 'es'|'en', fetchFn?: Function}} p
   * @returns {Promise<string>} el texto de la respuesta
   */
  async function explicar({ clave, resumen, idioma, fetchFn }) {
    if (!clave) throw new Error('Falta la clave de la API de Claude (Datos → Asistente IA).');
    const f = fetchFn || root.fetch.bind(root);
    const res = await f(URL_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': clave,
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        // Permite llamar a la API desde el navegador: la clave es de la propia persona y no se comparte.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        fallbacks: 'default',
        system: sistema(idioma),
        messages: [{ role: 'user', content: JSON.stringify(resumen) }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body && body.error && body.error.message;
      if (res.status === 401) throw new Error('La clave de la API de Claude no es válida.');
      if (res.status === 429) throw new Error('La API de Claude pidió esperar un momento (límite de uso). Prueba de nuevo en un minuto.');
      throw new Error(`La API de Claude respondió con un error${msg ? `: ${msg}` : ''}.`);
    }
    if (body.stop_reason === 'refusal') throw new Error('Claude no pudo responder esta consulta.');
    const texto = (body.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!texto) throw new Error('La respuesta llegó vacía. Prueba de nuevo.');
    return texto;
  }

  /** Convierte el texto de Claude (markdown simple) en nodos seguros: párrafos, listas y negritas. Nunca usa innerHTML. */
  function aNodos(texto, doc) {
    const d = doc || root.document;
    const frag = d.createDocumentFragment();
    const inline = (linea, el) => {
      linea.split(/(\*\*[^*]+\*\*)/g).forEach((parte) => {
        if (/^\*\*[^*]+\*\*$/.test(parte)) {
          const b = d.createElement('strong');
          b.textContent = parte.slice(2, -2);
          el.append(b);
        } else if (parte) el.append(d.createTextNode(parte));
      });
      return el;
    };
    let lista = null;
    texto.split(/\r?\n/).forEach((raw) => {
      const linea = raw.trim();
      if (!linea) { lista = null; return; }
      const item = linea.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
      if (item) {
        if (!lista) { lista = d.createElement('ul'); frag.append(lista); }
        lista.append(inline(item[1], d.createElement('li')));
        return;
      }
      lista = null;
      const titulo = linea.match(/^#{1,6}\s+(.*)$/);
      frag.append(inline(titulo ? titulo[1] : linea, d.createElement(titulo ? 'h3' : 'p')));
    });
    return frag;
  }

  const api = { explicar, aNodos, sistema, MODELO };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PA_ASISTENTE = api;
})(typeof window !== 'undefined' ? window : globalThis);
