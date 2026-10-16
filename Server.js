// SAMANTHA GOMEZ
// Secure AI Assistant Server
// Requires Node.js 18 or newer.
//
// Environment variables:
// OPENAI_API_KEY = your secret API key
// ALLOWED_ORIGIN = your GitHub Pages website URL
// PORT = optional server port
//
// Never put your API key directly in this file.

const http = require("node:http");

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.OPENAI_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

const ASSISTANT_NAME = "Samantha Gomez";

const SYSTEM_PROMPT = `
You are Samantha Gomez, a helpful personal AI assistant.

Your personality:
- Friendly, intelligent, and respectful.
- Clear, accurate, and patient.
- Explain complicated things simply.
- Ask questions when necessary.
- Never pretend to complete an action you cannot perform.

Your capabilities:
- Answer questions.
- Help with research and learning.
- Explain programming.
- Help organize tasks.
- Assist with writing.
- Analyze information supplied by the user.
- Support a voice-enabled web interface.

Your name is Samantha Gomez.

Protect user privacy.
Never reveal secret API keys.
Never claim to access accounts or devices
unless a connected service actually provides access.
`;

const MAX_BODY_BYTES = 50000;

function sendJSON(res, status, data, origin = "") {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };

  if (origin && origin === ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Vary"] = "Origin";
  }

  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || "";

  if (req.url === "/health" && req.method === "GET") {
    return sendJSON(res, 200, {
      assistant: ASSISTANT_NAME,
      status: "online",
      configured: Boolean(API_KEY && ALLOWED_ORIGIN)
    });
  }

  if (req.url !== "/chat") {
    return sendJSON(res, 404, {
      error: "Endpoint not found"
    });
  }

  if (!ALLOWED_ORIGIN || origin !== ALLOWED_ORIGIN) {
    return sendJSON(res, 403, {
      error: "Origin not allowed"
    });
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin"
    });
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJSON(res, 405, {
      error: "Method not allowed"
    }, origin);
  }

  if (!API_KEY) {
    return sendJSON(res, 503, {
      error: "OpenAI API key is not configured"
    }, origin);
  }

  try {
    let raw = "";

    for await (const chunk of req) {
      raw += chunk.toString();

      if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
        return sendJSON(res, 413, {
          error: "Message too large"
        }, origin);
      }
    }

    let body;

    try {
      body = JSON.parse(raw);
    } catch {
      return sendJSON(res, 400, {
        error: "Invalid JSON"
      }, origin);
    }

    const message = body.message;

    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 4000
    ) {
      return sendJSON(res, 400, {
        error: "Message must contain 1 to 4000 characters"
      }, origin);
    }

    const history = Array.isArray(body.history)
      ? body.history.slice(-10)
      : [];

    const safeHistory = history
      .filter(item =>
        item &&
        ["user", "assistant"].includes(item.role) &&
        typeof item.content === "string" &&
        item.content.length <= 4000
      )
      .map(item => ({
        role: item.role,
        content: item.content
      }));

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 30000);

    let response;

    try {
      response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${API_KEY}`
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            messages: [
              {
                role: "system",
                content: SYSTEM_PROMPT
              },
              ...safeHistory,
              {
                role: "user",
                content: message.trim()
              }
            ],
            max_tokens: 700
          })
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error(
        "OpenAI request failed:",
        response.status
      );

      return sendJSON(res, 502, {
        error: "AI service unavailable. Check server configuration, API access, and billing."
      }, origin);
    }

    const data = await response.json();

    const reply =
      data.choices?.[0]?.message?.content ||
      "I couldn't generate a response.";

    return sendJSON(res, 200, {
      assistant: ASSISTANT_NAME,
      reply: reply
    }, origin);

  } catch (error) {
    console.error("Server error:", error.message);

    return sendJSON(res, 500, {
      error: "Samantha Gomez could not complete the request."
    }, origin);
  }
});

server.listen(PORT, () => {
  console.log(
    `${ASSISTANT_NAME} server running on port ${PORT}`
  );
});
