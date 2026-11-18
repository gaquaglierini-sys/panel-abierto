# Issues iniciales

Lista de los issues que se cargaron en GitHub al publicar. Los marcados **good first issue** son tareas chicas.

## good first issue

1. **Interfaz en inglés.** Pasar los textos de la pantalla a un objeto de traducciones y sumar un selector ES/EN (el asistente ya responde en los dos idiomas).
2. **Reconocer CSV de Tiendanube y Kiwify.** Sumar sus nombres de columna en `PLATAFORMAS` (`src/csv.js`), con una plantilla inventada en `ejemplos/` y una prueba.
3. **Exportar la tabla "Qué hacer hoy" a CSV.** Un botón que descargue la tabla de anuncios con la acción sugerida.
4. **Fechas mes/día/año.** Detectar los CSV de EE. UU. (`11/04/2026` = 4 de noviembre) cuando el día es mayor a 12, o con una opción manual.
5. **Comparar con el período anterior.** Mostrar una flecha de cambio en cada número de arriba (gasto, ventas, ROAS).
6. **Copiar la respuesta del asistente.** Un botón para copiar al portapapeles lo que explicó Claude.

## Más grandes

7. **Conector de Hotmart por API**, desde el navegador y con la misma regla: la clave no se guarda.
8. **Comisiones y costos fijos.** Restar la comisión de la plataforma de pago y los gastos fijos del mes para mostrar la ganancia neta.
9. **Tasas de cambio automáticas (opcionales).** Botón para traer la cotización del día desde una fuente pública, sin enviar ningún dato del usuario.
10. **Notificaciones.** Avisar con una notificación del navegador cuando un anuncio pasa a rojo (opcional, apagado por defecto).
