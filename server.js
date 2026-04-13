const express = require(“express”);
const Anthropic = require(”@anthropic-ai/sdk”);
const axios = require(“axios”);

const app = express();
app.use(express.json());

const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const CALIFICACION_MINIMA = 7;

const CONTEXTO_WYCKOFF = `
Eres un analista experto en la metodologia
de Richard Wyckoff aplicada a futuros de
indices americanos MNQ y MES.

Tu unica funcion es analizar setups de
Wyckoff y calificarlos del 1 al 10.

SISTEMA DE CALIFICACION (Total 10 puntos):

1. CONTRASTE DE VOLUMEN (0-3 puntos)
   El criterio MAS importante de Wyckoff.
   Contraste 5x o mas   -> 3 puntos
   Contraste 3x - 4x    -> 2 puntos
   Contraste 2x - 3x    -> 1 punto
   Menor de 2x          -> 0 puntos
   
   EXCEPCION Creek Jump e Ice Break:
   Volumen 3x o mas     -> 3 puntos
   Volumen 2x - 3x      -> 2 puntos
   Volumen 1.5x - 2x    -> 1 punto
   Menor de 1.5x        -> 0 puntos
1. CALIDAD DEL EVENTO ORIGINAL (0-2 puntos)
   Para Spring y Upthrust:
   Profundidad 3-15 puntos
- cierre fuerte
- volumen mayor 150% -> 2 puntos
  Profundidad 15-30 puntos
- volumen mayor 130% -> 1 punto
  Mas de 30 puntos     -> 0 puntos
   
   Para LPS y LPSY:
   Minimo mas alto + vol bajo
- rechazo fuerte     -> 2 puntos
  Algunas condiciones  -> 1 punto
  No cumple            -> 0 puntos
   
   Para SOS y SOW:
   Ruptura vol alto
- vela grande        -> 2 puntos
  Algunas condiciones  -> 1 punto
  No cumple            -> 0 puntos
   
   Para Creek Jump e Ice Break:
   Vela mayor 1.5x ATR
- volumen mayor 2x   -> 2 puntos
  Algunas condiciones  -> 1 punto
  No cumple            -> 0 puntos
   
   Para LPS Markup y LPSY Markdown:
   Nivel mas alto o bajo
- vol bajo retroceso -> 2 puntos
  Algunas condiciones  -> 1 punto
  No cumple            -> 0 puntos
   
   Para SOS Markup y SOW Markdown:
   Ruptura con vol alto
- pullback vol bajo  -> 2 puntos
  Algunas condiciones  -> 1 punto
  No cumple            -> 0 puntos
1. TIMING DEL TEST (0-2 puntos)
   No aplica Creek Jump ni Ice Break.
   5 a 13 velas         -> 2 puntos
   14 a 21 velas        -> 1 punto
   Fuera de rango       -> 0 puntos
1. CALIDAD DEL RANGO (0-1 punto)
   3 o mas toques + 60-300 puntos -> 1 punto
   Menos condiciones              -> 0 puntos
1. ALINEACION TEMPORALIDADES (0-2 puntos)
   4 temporalidades     -> 2 puntos
   3 temporalidades     -> 1 punto
   Menos de 3           -> 0 puntos

REGLAS:

- Solo aprobar calificacion 7 o mas
- Muy estricto con el volumen
- Timing critico en Wyckoff
- Considerar obstaculos al target

TRADES ALCISTAS:

1. Spring
1. Test del Spring
1. LPS
1. SOS
1. Creek Jump
1. LPS en Markup
1. SOS en Markup

TRADES BAJISTAS:

1. Upthrust
1. Test del Upthrust
1. LPSY
1. SOW
1. Ice Break
1. LPSY en Markdown
1. SOW en Markdown

RESPONDE SOLO CON ESTE JSON EXACTO:
{
“calificacion”: 8.5,
“decision”: “VALIDO”,
“puntos”: {
“contraste_volumen”: 2,
“calidad_evento”: 2,
“timing”: 2,
“calidad_rango”: 1,
“temporalidades”: 2
},
“analisis”: “Explicacion aqui”,
“gestion_recomendada”: {
“entrada”: 19850,
“stop_loss”: 19820,
“target_1”: 19880,
“target_2”: 19920,
“parcial_en”: 19880,
“porcentaje_parcial”: 60,
“mover_be_en”: 19870,
“advertencias”: “Texto aqui”
},
“emoji_calificacion”: “stars”
}
`;

async function analizarConClaude(datosTrade) {
const cliente = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const mensaje = await cliente.messages.create({
model: “claude-sonnet-4-20250514”,
max_tokens: 1000,
system: CONTEXTO_WYCKOFF,
messages: [
{
role: “user”,
content: “Analiza este setup de Wyckoff:\n\n” +
JSON.stringify(datosTrade, null, 2) +
“\n\nResponde SOLO con el JSON.”
}
]
});

```
let respuesta = mensaje.content[0].text.trim();
if (respuesta.includes("```json")) {
    respuesta = respuesta.split("```json")[1].split("```")[0].trim();
} else if (respuesta.includes("```")) {
    respuesta = respuesta.split("```")[1].split("```")[0].trim();
}
return JSON.parse(respuesta);
```

}

async function enviarTelegram(mensaje) {
const url = “https://api.telegram.org/bot” + TELEGRAM_BOT_TOKEN + “/sendMessage”;
const datos = { chat_id: TELEGRAM_CHAT_ID, text: mensaje };
const respuesta = await axios.post(url, datos);
return respuesta.data;
}

function formatearMensaje(datos, analisis) {
const trade      = datos.trade || “”;
const simbolo    = datos.simbolo || “”;
const hora       = datos.hora || “”;
const direccion  = datos.direccion || “”;
const vol        = datos.volumen || {};
const rango      = datos.rango || {};
const evento     = datos.evento_original || {};
const zonas      = datos.zonas_en_camino || {};
const temps      = datos.temporalidades || {};
const gestion    = datos.gestion || {};
const puntos     = analisis.puntos || {};
const cal        = analisis.calificacion || 0;
const txt        = analisis.analisis || “”;
const rec        = analisis.gestion_recomendada || {};

```
const emojiH   = cal >= 9 ? "🔥" : "🟡";
const estado   = cal >= 9 ? "EXCEPCIONAL" : "VALIDO";
const emojiDir = direccion === "LONG" ? "🟢 LONG" : "🔴 SHORT";
const check    = (v) => String(v).includes("Confirmado") ? "✅" : "⚠️";

const prof    = evento.profundidad_spring || evento.profundidad_upthrust || "";
const velas   = evento.velas_desde_spring || evento.velas_desde_upthrust || "";
const toques  = rango.toques_soporte || rango.toques_resistencia || "";

return (
    emojiH + " " + trade.toUpperCase() + "\n" +
    "─────────────────────────────\n" +
    simbolo + " | " + hora + " | " + emojiDir + "\n" +
    "─────────────────────────────\n" +
    "PUNTUACION WYCKOFF:\n" +
    "Contraste volumen:  " + (puntos.contraste_volumen || 0) + "/3\n" +
    "Calidad evento:     " + (puntos.calidad_evento || 0) + "/2\n" +
    "Timing:             " + (puntos.timing || 0) + "/2\n" +
    "Calidad rango:      " + (puntos.calidad_rango || 0) + "/1\n" +
    "Temporalidades:     " + (puntos.temporalidades || 0) + "/2\n" +
    "─────────────────────────────\n" +
    "TEMPORALIDADES:\n" +
    check(temps["1H"]) + " 1H:    " + (temps["1H"] || "") + "\n" +
    check(temps["30MIN"]) + " 30MIN: " + (temps["30MIN"] || "") + "\n" +
    check(temps["10MIN"]) + " 10MIN: " + (temps["10MIN"] || "") + "\n" +
    "✅ 5MIN:  Confirmacion entrada\n" +
    "─────────────────────────────\n" +
    "VOLUMEN:\n" +
    "Contraste:    " + (vol.contraste_evento_test || "") + "\n" +
    "Vol actual:   " + (vol.relativo_actual || "") + "\n" +
    "Tendencia:    " + (vol.tendencia_rango || "") + "\n" +
    "─────────────────────────────\n" +
    "EVENTO ORIGINAL:\n" +
    "Profundidad:  " + prof + "\n" +
    "Velas evento: " + velas + "\n" +
    "Ratio mecha:  " + (evento.ratio_mecha_cuerpo || "") + "x\n" +
    "─────────────────────────────\n" +
    "RANGO:\n" +
    "Tamanio:      " + (rango.tamanio_puntos || "") + " pts\n" +
    "Toques nivel: " + toques + "\n" +
    "Posicion:     " + (rango.posicion_actual || "") + "\n" +
    "─────────────────────────────\n" +
    "ZONAS EN EL CAMINO:\n" +
    "Obstaculos:   " + (zonas.obstaculos || "0") + "\n" +
    "FVG presente: " + (zonas.fvg_presente || "No") + "\n" +
    "Nivel redondo:" + (zonas.nivel_redondo_cercano || "No") + "\n" +
    "─────────────────────────────\n" +
    "TRADE:\n" +
    "Entrada:  " + (rec.entrada || gestion.entrada || "") + "\n" +
    "Stop:     " + (rec.stop_loss || gestion.stop_loss || "") + " 🔴\n" +
    "Target 1: " + (rec.target_1 || gestion.target_1 || "") + " 🎯 (" + (rec.porcentaje_parcial || 60) + "%)\n" +
    "Target 2: " + (rec.target_2 || gestion.target_2 || "") + " 🎯\n" +
    "RR:       1:" + (gestion.RR || "") + "\n" +
    "Mover BE: " + (rec.mover_be_en || gestion.zona_BE || "") + "\n" +
    "─────────────────────────────\n" +
    "ANALISIS IA:\n" + txt + "\n" +
    "─────────────────────────────\n" +
    "CALIFICACION: " + cal + "/10\n" +
    "DECISION: " + estado + " " + emojiH + "\n" +
    "─────────────────────────────\n" +
    "Confirma visualmente: 20%"
).trim();
```

}

app.post(”/webhook”, async (req, res) => {
try {
const datos = req.body;
if (!datos) {
return res.status(400).json({ error: “Sin datos” });
}

```
    const trade = datos.trade || "Desconocido";
    console.log("Trade recibido: " + trade);

    const analisis = await analizarConClaude(datos);
    const calificacion = analisis.calificacion || 0;
    console.log("Calificacion: " + calificacion + "/10");

    if (calificacion >= CALIFICACION_MINIMA) {
        const mensaje = formatearMensaje(datos, analisis);
        await enviarTelegram(mensaje);
        console.log("Senal enviada: " + trade + " " + calificacion + "/10");
        return res.status(200).json({
            status: "senal enviada",
            trade: trade,
            calificacion: calificacion,
            decision: analisis.decision
        });
    } else {
        console.log("Rechazado: " + trade + " " + calificacion + "/10");
        return res.status(200).json({
            status: "rechazado",
            trade: trade,
            calificacion: calificacion,
            razon: "Calificacion " + calificacion + " menor a " + CALIFICACION_MINIMA
        });
    }
} catch (error) {
    console.error("Error: " + error.message);
    return res.status(500).json({ error: error.message });
}
```

});

app.get(”/test”, (req, res) => {
return res.status(200).json({
status: “Servidor funcionando”,
sistema: “Wyckoff + Claude AI”,
trades_alcistas: [
“Spring”, “Test del Spring”, “LPS”,
“SOS”, “Creek Jump”, “LPS en Markup”, “SOS en Markup”
],
trades_bajistas: [
“Upthrust”, “Test del Upthrust”, “LPSY”,
“SOW”, “Ice Break”, “LPSY en Markdown”, “SOW en Markdown”
],
filtro_minimo: CALIFICACION_MINIMA,
total_trades: 14
});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(“Servidor Wyckoff corriendo en puerto “ + PORT);
});
