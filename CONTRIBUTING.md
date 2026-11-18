# Cómo contribuir · How to contribute

**Español** · [English](#english)

Gracias por querer ayudar. Panel Abierto es para emprendedores que no son programadores, así que valoramos tanto el código como los textos claros, las pruebas con formatos reales de CSV (sin datos personales) y las ideas.

## Reglas de la casa

1. **Sin dependencias.** HTML, CSS y JavaScript sin frameworks y sin paso de compilación. Tiene que funcionar abriendo `index.html` con doble clic.
2. **Los datos del usuario no salen del navegador.** Nada de analíticas, rastreadores ni servidores propios. Las únicas conexiones externas permitidas son las de cada conector (`graph.facebook.com`, `api.anthropic.com`) y las dispara el usuario.
3. **Las claves nunca se guardan en el repositorio ni en los respaldos.** La de Meta vive solo en memoria; la de Claude, solo en el navegador de la persona y si ella lo elige.
4. **Nunca subas datos reales.** Ni cuentas publicitarias, ni claves, ni ventas, ni correos. Para un CSV de prueba, inventa los datos o borra todo lo personal.
5. **Español primero.** La interfaz está en español neutro, claro y sin tecnicismos. Los comentarios del código pueden ir en español o en inglés.
6. **Pruebas.** Si tocas `src/csv.js`, `src/calc.js`, `src/meta.js` o `src/asistente.js`, agrega un caso en `tests/` y corre `npm test` (Node 18 o más nuevo).

## Paso a paso

1. Haz un *fork* y crea una rama: `git checkout -b mi-cambio`.
2. Haz el cambio. Pruébalo abriendo `index.html` y con `npm test`.
3. Abre un *pull request* que cuente qué cambia y por qué. Si cambia la pantalla, suma una captura.

## ¿Por dónde empiezo?

Los issues marcados como **good first issue** son tareas chicas que no necesitan conocer todo el código. Si una plataforma exporta un CSV que no se lee bien, abre un issue con la primera fila del archivo (solo los encabezados, sin datos).

---

## English

Thanks for helping! Panel Abierto is for entrepreneurs who are not programmers, so clear copy, tests with real-world CSV formats (no personal data) and ideas are as welcome as code.

### House rules

1. **No dependencies.** Plain HTML, CSS and JavaScript, no frameworks, no build step. It must work by double-clicking `index.html`.
2. **User data never leaves the browser.** No analytics, trackers or servers of our own. The only external calls allowed are each connector's (`graph.facebook.com`, `api.anthropic.com`), triggered by the user.
3. **Keys are never stored in the repository or in backups.** The Meta token lives in memory only; the Claude key only in the user's browser, if they choose.
4. **Never commit real data.** No ad accounts, keys, sales or emails.
5. **Spanish first.** The UI is in clear, neutral Spanish. Code comments can be in Spanish or English.
6. **Tests.** If you touch `src/csv.js`, `src/calc.js`, `src/meta.js` or `src/asistente.js`, add a case under `tests/` and run `npm test` (Node 18+).

### Step by step

1. Fork and create a branch: `git checkout -b my-change`.
2. Make your change. Test it by opening `index.html` and with `npm test`.
3. Open a pull request explaining what changes and why. Add a screenshot if the UI changes.

### Where to start

Issues labeled **good first issue** are small tasks that don't require knowing the whole codebase. If a platform's CSV export is not read correctly, open an issue with the file's header row only (no data).
