Reto Mibanco · "De la libreta a la caja"

*AI Frontier Conf '26 · UTEC*

# El problema

Doña Rosa tiene una bodega en Lima. No usa Excel ni apps: lleva sus cuentas mandándose **notas de voz y mensajes de WhatsApp** a sí misma, como "vendí 3 gaseosas a 2.50 y la vecina se llevó arroz fiado".

Construye un agente que:

1. **Escuche o lea** sus mensajes. Se espera que acepte **notas de voz**.
2. Los convierta en **transacciones estructuradas**.
3. **Repregunte** cuando falte un dato, en lugar de inventarlo.
4. Calcule su **flujo de caja**.
5. **Responda "¿Cuánto puedo pagar de cuota al mes?"** con un monto en soles basado en su flujo, explicando el cálculo.

Gana quien registra bien, no quien suena convincente. **Un monto inventado cuenta como error.**

*Caso ficticio inspirado en el día a día de nuestros clientes. Todos los datos son sintéticos.*

# Reglas de negocio

|  |  |  |
| --- | --- | --- |
| **Tipo** | **Cuándo** | **¿Afecta la caja?** |
| venta | Venta cobrada en el momento | + |
| gasto | Compras, servicios, pagos, ayudantes y devoluciones de dinero a clientes | − |
| fiado | Venta a crédito: el cliente se lleva el producto y paga después | No (es por cobrar) |
| cobro\_fiado | El cliente paga algo que debía | + |

* **Flujo de caja semanal** = ventas + cobros de fiado − gastos.
* **monto** es siempre el total en soles de la línea (cantidad × precio, con descuentos aplicados).
* Un mensaje puede generar **varias filas** (una por producto u operación) o **ninguna** (por ejemplo, gastos personales que no son del negocio).
* Si el mensaje se corrige ("no perdón, fueron 12"), registra la versión corregida.
* **Si falta el monto, NO lo inventes ni pongas 0.** Deja monto vacío y marca requiere\_confirmacion = SI. En la conversación, el agente debe preguntar.
* Si el cobro de un fiado no indica el monto pero el fiado se registró antes, el agente debe recordarlo.
* El agente **no promete ni aprueba créditos**. Solo estima una cuota sostenible.

# Kit

|  |  |
| --- | --- |
| **Archivo** | **Contenido** |
| ejemplos\_mensajes.csv | 30 mensajes de una semana (id\_mensaje, dia, mensaje) |
| ejemplos\_respuestas.csv | La salida correcta de esos 30 mensajes |
| plantilla\_entrega.csv | El formato exacto que deben entregar |

*Los CSV están separados por comas y codificados en UTF-8.*

# Entregable

En el minuto 100 recibirán **set\_oculto.csv** (20 mensajes nuevos, mismo formato). Tendrán **5 minutos** para procesarlo y enviar **resultados\_<equipo>.csv** con estas columnas exactas:

id\_mensaje,tipo,producto,cantidad,monto,requiere\_confirmacion

* tipo: venta | gasto | fiado | cobro\_fiado
* monto: número con punto decimal (ej. 16.50), sin "S/". Vacío si falta.
* requiere\_confirmacion: SI | NO
* Procesen los 20 mensajes **en orden**, como una sola semana. Hay mensajes que dependen de otros anteriores.

# Evaluación (100 pts)

|  |  |  |
| --- | --- | --- |
| **Criterio** | **Pts** | **Cómo** |
| Exactitud de transacciones | 40 | Automática contra la clave. Filas de más o montos inventados restan. |
| Flujo de caja semanal | 15 | Calculado desde su CSV (±S/ 1) |
| Repregunta ante datos incompletos | 20 | Prueba en vivo de ~3 min con mensajes del jurado |
| Estimación de cuota | 10 | Prueba en vivo: monto en soles, sostenible, sin prometer crédito |
| Experiencia para usuaria no digital | 15 | Prueba en vivo: nota de voz, tolerancia a errores de tipeo, lenguaje simple |

En la prueba en vivo, el jurado usará su agente como si fuera Doña Rosa, con el set oculto ya cargado.

# Herramientas gratuitas

Usen lo que quieran. Algunas opciones:

* **Groq:** LLMs abiertos como gpt-oss o qwen, más whisper-large-v3 para audio. API compatible con OpenAI.
* **Google AI Studio:** Gemini Flash, que acepta audio directamente.
* **Open source local o en Colab:** faster-whisper y modelos tipo Qwen o Llama con Ollama o transformers.
* **Interfaz:** Streamlit, Gradio, un bot de Telegram, n8n o lo que prefieran.

Los planes gratuitos tienen límites de uso por minuto; diseñen pensando en eso. **No envíen datos reales a ninguna API:** todo el kit es sintético.

# Cronograma

|  |  |
| --- | --- |
| **Minuto** | **Actividad** |
| 0–15 | Briefing y kit |
| 15–100 | Construcción |
| 100–105 | Set oculto → entregar CSV |
| 105–120 | Pruebas en vivo y ranking |