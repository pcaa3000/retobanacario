# De la libreta a la caja — Reto Mibanco

Web app para Doña Rosa: convierte mensajes de texto y notas de voz en
transacciones (`venta | gasto | fiado | cobro_fiado`), repregunta cuando falta
un monto (nunca lo inventa), calcula el flujo de caja semanal y estima una cuota
mensual sostenible. Incluye el modo lote para el `set_oculto.csv` del reto.

## Stack

- Next.js + Tailwind (frontend y API routes)
- Supabase (Postgres) — mensajes y transacciones
- Google Gemini (`@google/genai`) — extracción + audio directo (sin STT aparte)

## Setup

```bash
npm install
cp .env.local.example .env.local   # rellenar las claves
npm run dev                         # http://localhost:3000
```

### Gemini

`GEMINI_API_KEY` de <https://aistudio.google.com/apikey> (gratis). Modelo por
defecto `gemini-2.5-flash` (acepta audio), configurable con `GEMINI_MODEL`.

### Supabase

1. Crear proyecto en <https://supabase.com> (plan gratis).
2. SQL Editor → ejecutar `supabase/schema.sql`.
3. Copiar `Project URL`, `anon key` y `service_role key` a `.env.local`.

Si `.env.local` no tiene credenciales de Supabase, la app funciona igual con un
almacén en memoria (se pierde al reiniciar) — útil para probar la UI.

`AGENTE_MOCK=1` activa un extractor por reglas en vez de Gemini (solo demo sin
key; cubre los patrones del kit de ejemplo).

## Uso

- `/` — chat con Doña Rosa: texto o 🎙 nota de voz. El agente anota
  transacciones, repregunta datos faltantes y responde "¿cuánto puedo pagar de
  cuota al mes?" con el cálculo.
- `/lote` — subir `set_oculto.csv` (id_mensaje,dia,mensaje) → procesa en orden
  con contexto de la semana → descargar `resultados_equipo.csv` con las
  columnas exactas de `plantilla_entrega.csv`.

### Motor del modo lote

`/api/lote` usa **una sola request batch a Gemini** con todos los mensajes de la
semana (así el modelo ve el contexto completo — un fiado y su cobro posterior —
y no choca con el límite de requests/minuto del plan gratuito). La salida del
modelo se **valida y sanea localmente** (ids del CSV, tipos válidos, montos
finitos, `monto` vacío ⇒ `requiere_confirmacion = SI`, normalización de
producto) antes de calcular el flujo con código determinístico.

Si no hay `GEMINI_API_KEY`, falla la red o el modelo devuelve vacío, cae al
extractor local por reglas (`lib/local.ts`) — el mismo que usa el chat con
`AGENTE_MOCK=1`. Para forzar el motor local a propósito: `LOTE_MOTOR=local`.

La respuesta incluye `fuente` (`"gemini"` o `"local"`) y, si hubo fallback,
`aviso`. La página `/lote` muestra el motor usado.


- `GET /api/state` / `DELETE /api/state` — estado y reinicio del demo.
- `GET /api/cuota` — resumen y explicación de la cuota.

## Verificación

```bash
node --test scripts/lote-validacion.test.ts   # validación local (sin red)
node scripts/eval.mjs                         # requiere npm run dev en marcha
```

El test unitario cubre el saneo determinístico (ids, tipos, monto faltante,
normalización de producto) sin tocar Gemini. `eval.mjs` envía
`inputs/ejemplos_mensajes.csv` a `/api/lote` y compara contra
`inputs/ejemplos_respuestas.csv` (ground truth: 33 filas, flujo S/ 788.90).
