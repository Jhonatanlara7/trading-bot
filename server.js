const express = require("express");
const app = express();
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "mi_secreto_123";

// ─── Analiza la señal con Claude ────────────────────────────────────────────
async function analyzeSignal(signal) {
  const prompt = `Eres un analista de trading experto. Recibiste esta señal de TradingView:

${JSON.stringify(signal, null, 2)}

Analiza la señal y responde con este formato exacto (sin markdown, sin asteriscos):

SEÑAL: [BUY/SELL/SKIP]
PAR: [símbolo]
PRECIO ENTRADA: [precio]
STOP LOSS: [sl si viene, si no pon "No especificado"]
TAKE PROFIT: [tp si viene, si no pon "No especificado"]
TIMEFRAME: [tf si viene]

VALORACIÓN: [1-10]
CONFIANZA: [Alta/Media/Baja]

ANÁLISIS:
[2-3 líneas explicando por qué tomar o no la entrada, qué confirma la señal, qué riesgos hay]

RECOMENDACIÓN: [ENTRAR AHORA / ESPERAR CONFIRMACIÓN / IGNORAR SEÑAL]`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await res.json();
  return data.content?.[0]?.text || "No se pudo analizar la señal.";
}

// ─── Envía mensaje a Telegram ─────────────────────────────────────────────
async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: "HTML",
    }),
  });
}

// ─── Endpoint principal ───────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  // Verificar secreto
  const secret = req.query.secret || req.body.secret;
  if (secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const signal = req.body;
  console.log("Señal recibida:", JSON.stringify(signal));

  res.status(200).json({ ok: true, message: "Señal recibida, analizando..." });

  try {
    const analysis = await analyzeSignal(signal);

    const emoji =
      signal.action?.toUpperCase() === "BUY"
        ? "🟢"
        : signal.action?.toUpperCase() === "SELL"
        ? "🔴"
        : "⚪";

    const message =
      `${emoji} <b>NUEVA SEÑAL - ${signal.ticker || signal.symbol || "?"}</b>\n` +
      `🕐 ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}\n\n` +
      `<pre>${analysis}</pre>`;

    await sendTelegram(message);
    console.log("Mensaje enviado a Telegram.");
  } catch (err) {
    console.error("Error procesando señal:", err);
    await sendTelegram(
      `⚠️ Error procesando señal: ${err.message}\n\nDatos: ${JSON.stringify(signal)}`
    );
  }
});

// ─── Health check ─────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Trading bot activo 🤖" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
