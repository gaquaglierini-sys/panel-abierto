# Seguridad · Security

Panel Abierto funciona entero en el navegador y no tiene servidor. Lo más delicado son las claves:

- **Clave de Meta** (conector directo): nunca se guarda. Vive en memoria, se borra al cerrar la pestaña y solo se envía a `graph.facebook.com`.
- **Clave de la API de Claude** (asistente): se guarda solo en el navegador de la persona y solo si marca "Recordarla". Solo se envía a `api.anthropic.com` y nunca entra en los respaldos.

Si encuentras una falla que pueda exponer datos o claves de un usuario, **no abras un issue público**: usa "Report a vulnerability" en la pestaña Security de este repositorio.

---

Panel Abierto runs entirely in the browser and has no server. The sensitive pieces are the keys: the **Meta token** is never stored (memory only, sent only to `graph.facebook.com`); the **Claude API key** is stored only in the user's browser and only if they choose, sent only to `api.anthropic.com`, and never included in backups.

If you find a flaw that could expose user data or keys, **do not open a public issue**: use "Report a vulnerability" in this repository's Security tab.
