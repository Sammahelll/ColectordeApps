# MANTEC Satélites — Hub

## Instalación (Etapa 1 — ya armado)
1. Crear proyecto nuevo en supabase.com
2. SQL Editor → pegar y correr `schema.sql`
3. Project Settings → API → copiar **Project URL** y **anon public key**
4. Subir `index.html` y `sat-sync.js` a la misma carpeta donde vayan a vivir
   los 6 módulos (mismo hosting: Vercel, Netlify, o el que ya uses para MANTEC)
5. Abrir `index.html` → botón "Configurar Supabase" → pegar URL + anon key
6. Renombrar tus 6 archivos actuales a los nombres que espera el hub (o editar
   el array `MODULOS` en `index.html` si preferís otros nombres):
   - motor_pro.html
   - tablero_pro.html
   - vibra_pro.html
   - thermovision.html
   - lubricacion_campo.html
   - alineacion_laser.html

## Qué hace hoy
- Catálogo de equipos compartido (`equipos`), cargable desde el hub
- Tabla `analisis` genérica (jsonb) lista para recibir datos de cualquier módulo
- Vista de escritorio: cruza análisis de los 6 módulos por equipo, con filtro
  y severidad (ok / atención / crítico)
- Bucket de Storage `analisis-media` para fotos/termografías

## Lo que falta (Etapa 2 — módulo por módulo)
Los 6 archivos originales **todavía no escriben a Supabase** — hoy siguen
guardando solo en su `localStorage` propio. Para que "cargar en línea"
funcione de verdad, cada módulo necesita 3 líneas agregadas donde ya guarda
su resultado localmente:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="./sat-sync.js"></script>
```
```js
SatSync.init(); // toma la config que ya guardó el hub
await SatSync.guardarAnalisis({
  modulo: 'vibra_pro',            // el key correspondiente a cada módulo
  equipo_tag: tagDelEquipoActual, // el TAG que el módulo ya maneja
  severidad: 'atencion',          // mapear del estado interno del módulo
  resumen: 'texto corto para el listado',
  datos: elObjetoQueYaArmaElModulo
});
```

Sugerencia: arrancar por **Vibra Pro** (es el más completo y el que ya tiene
lógica de export/backup, así que el mapeo de "qué campo va a `resumen`/
`severidad`" es más directo) y usarlo de piloto antes de repetir el patrón
en los otros 5.
