import { TTSRoom } from "./room.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    }
  });

async function hashPassword(password) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(password)
  );

  return [...new Uint8Array(buffer)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

async function token(payload, secret) {
  const body = btoa(
    JSON.stringify({
      ...payload,
      exp: Date.now() + 7 * 86400000
    })
  ).replaceAll("=", "");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body)
  );

  return (
    body +
    "." +
    btoa(String.fromCharCode(...new Uint8Array(signature))).replaceAll("=", "")
  );
}

async function verify(t, secret) {
  try {
    const [body, signature] = t.split(".");

    if (!body || !signature) return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Uint8Array.from(atob(signature), c => c.charCodeAt(0)),
      new TextEncoder().encode(body)
    );

    const payload = JSON.parse(atob(body));

    return valid && payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function auth(req) {
  const header = req.headers.get("authorization") || "";

  return header.startsWith("Bearer ")
    ? header.slice(7)
    : null;
}

export { TTSRoom };

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "content-type, authorization",
          "access-control-allow-methods": "GET,POST,OPTIONS"
        }
      });
    }

    const url = new URL(req.url);

    // =========================
    // HEALTH CHECK
    // =========================

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        app: "KH TTS Streamer",
        time: new Date().toISOString()
      });
    }

    // =========================
    // REGISTER
    // =========================

    if (
      url.pathname === "/api/auth/register" &&
      req.method === "POST"
    ) {
      let body;

      try {
        body = await req.json();
      } catch {
        return json({
          error: "ទិន្នន័យមិនត្រឹមត្រូវ"
        }, 400);
      }

      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const displayName =
        String(body.displayName || username).trim();

      if (!username || !password) {
        return json({
          error: "ត្រូវការឈ្មោះ និងពាក្យសម្ងាត់"
        }, 400);
      }

      if (username.length < 3) {
        return json({
          error: "ឈ្មោះត្រូវមានយ៉ាងហោចណាស់ 3 តួ"
        }, 400);
      }

      if (password.length < 4) {
        return json({
          error: "ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ 4 តួ"
        }, 400);
      }

      const exists = await env.DB
        .prepare(
          "SELECT id FROM streamers WHERE username = ? LIMIT 1"
        )
        .bind(username)
        .first();

      if (exists) {
        return json({
          error: "ឈ្មោះនេះមានរួចហើយ"
        }, 409);
      }

      try {
        const passwordHash = await hashPassword(password);

        const result = await env.DB
          .prepare(
            `INSERT INTO streamers
            (username, password_hash, display_name)
            VALUES (?, ?, ?)`
          )
          .bind(username, passwordHash, displayName)
          .run();

        const id = result.meta.last_row_id;

        await env.DB
          .prepare(
            "INSERT INTO settings (streamer_id) VALUES (?)"
          )
          .bind(id)
          .run();

        const sessionToken = await token(
          {
            id,
            username
          },
          env.SESSION_SECRET
        );

        return json({
          ok: true,
          token: sessionToken,
          displayName
        });
      } catch (error) {
        if (
          String(error?.message || "")
            .toLowerCase()
            .includes("unique")
        ) {
          return json({
            error: "ឈ្មោះនេះមានរួចហើយ"
          }, 409);
        }

        return json({
          error: "មិនអាចបង្កើតគណនីបាន",
          detail: String(error?.message || error)
        }, 500);
      }
    }

    // =========================
    // LOGIN
    // =========================

    if (
      url.pathname === "/api/auth/login" &&
      req.method === "POST"
    ) {
      let body;

      try {
        body = await req.json();
      } catch {
        return json({
          error: "ទិន្នន័យមិនត្រឹមត្រូវ"
        }, 400);
      }

      const username = String(body.username || "").trim();
      const password = String(body.password || "");

      const user = await env.DB
        .prepare(
          "SELECT * FROM streamers WHERE username = ? LIMIT 1"
        )
        .bind(username)
        .first();

      if (
        !user ||
        user.password_hash !== await hashPassword(password)
      ) {
        return json({
          error: "ព័ត៌មាន Login មិនត្រឹមត្រូវ"
        }, 401);
      }

      const sessionToken = await token(
        {
          id: user.id,
          username: user.username
        },
        env.SESSION_SECRET
      );

      return json({
        ok: true,
        token: sessionToken,
        displayName: user.display_name
      });
    }

    // =========================
    // AUTH
    // =========================

    const session = auth(req);

    const user = session
      ? await verify(session, env.SESSION_SECRET)
      : null;

    // =========================
    // GET SETTINGS
    // =========================

    if (
      url.pathname === "/api/settings" &&
      req.method === "GET"
    ) {
      if (!user) {
        return json({
          error: "ត្រូវ Login"
        }, 401);
      }

      const settings = await env.DB
        .prepare(
          "SELECT * FROM settings WHERE streamer_id = ?"
        )
        .bind(user.id)
        .first();

      return json(settings || {});
    }

    // =========================
    // SAVE SETTINGS
    // =========================

    if (
      url.pathname === "/api/settings" &&
      req.method === "POST"
    ) {
      if (!user) {
        return json({
          error: "ត្រូវ Login"
        }, 401);
      }

      const body = await req.json();

      await env.DB
        .prepare(
          `UPDATE settings
           SET voice = ?,
               rate = ?,
               pitch = ?,
               volume = ?,
               filter_enabled = ?,
               blocked_words = ?
           WHERE streamer_id = ?`
        )
        .bind(
          body.voice || "",
          Number(body.rate || 1),
          Number(body.pitch || 1),
          Number(body.volume ?? 1),
          body.filterEnabled === false ? 0 : 1,
          JSON.stringify(body.blockedWords || []),
          user.id
        )
        .run();

      return json({
        ok: true
      });
    }

    // =========================
    // TTS
    // =========================

    if (
      url.pathname === "/api/tts" &&
      req.method === "POST"
    ) {
      if (!user) {
        return json({
          error: "ត្រូវ Login"
        }, 401);
      }

      const body = await req.json();

      if (!body.message || !String(body.message).trim()) {
        return json({
          error: "សារទទេ"
        }, 400);
      }

      const settings = await env.DB
        .prepare(
          "SELECT * FROM settings WHERE streamer_id = ?"
        )
        .bind(user.id)
        .first();

      let message = String(body.message).trim();

      const blockedWords = JSON.parse(
        settings?.blocked_words || "[]"
      );

      if (settings?.filter_enabled) {
        for (const word of blockedWords) {
          message = message.replaceAll(
            String(word),
            "***"
          );
        }
      }

      const result = await env.DB
        .prepare(
          `INSERT INTO tts_events
          (streamer_id, message, status, donation_amount, donation_currency)
          VALUES (?, ?, ?, ?, ?)`
        )
        .bind(
          user.id,
          message,
          "queued",
          Number(body.amount || 0),
          body.currency || "USD"
        )
        .run();

      const eventId = result.meta.last_row_id;

      const roomId = env.ROOM.idFromName(
        String(user.id)
      );

      const room = env.ROOM.get(roomId);

      await room.fetch(
        new Request(
          "https://room/publish",
          {
            method: "POST",
            body: JSON.stringify({
              type: "tts",
              id: eventId,
              message,
              amount: Number(body.amount || 0)
            })
          }
        )
      );

      return json({
        ok: true,
        id: eventId,
        message
      });
    }

    // =========================
    // EVENTS
    // =========================

    if (
      url.pathname === "/api/events" &&
      req.method === "GET"
    ) {
      if (!user) {
        return json({
          error: "ត្រូវ Login"
        }, 401);
      }

      const rows = await env.DB
        .prepare(
          `SELECT *
           FROM tts_events
           WHERE streamer_id = ?
           ORDER BY id DESC
           LIMIT 50`
        )
        .bind(user.id)
        .all();

      return json(rows.results || []);
    }

    // =========================
    // DONATION WEBHOOK
    // =========================

    if (
      url.pathname === "/api/webhook/donation" &&
      req.method === "POST"
    ) {
      const secret =
        req.headers.get("x-webhook-secret");

      if (
        !env.DONATION_WEBHOOK_SECRET ||
        secret !== env.DONATION_WEBHOOK_SECRET
      ) {
        return json({
          error: "Unauthorized"
        }, 401);
      }

      const body = await req.json();

      if (!body.streamerId || !body.message) {
        return json({
          error: "Invalid"
        }, 400);
      }

      const result = await env.DB
        .prepare(
          `INSERT INTO tts_events
          (streamer_id, message, status, donation_amount, donation_currency)
          VALUES (?, ?, ?, ?, ?)`
        )
        .bind(
          Number(body.streamerId),
          String(body.message),
          "queued",
          Number(body.amount || 0),
          body.currency || "USD"
        )
        .run();

      const eventId = result.meta.last_row_id;

      const room = env.ROOM.get(
        env.ROOM.idFromName(
          String(body.streamerId)
        )
      );

      await room.fetch(
        new Request(
          "https://room/publish",
          {
            method: "POST",
            body: JSON.stringify({
              type: "tts",
              id: eventId,
              message: String(body.message),
              amount: Number(body.amount || 0)
            })
          }
        )
      );

      return json({
        ok: true,
        id: eventId
      });
    }

    // =========================
    // OBS
    // =========================

    if (url.pathname === "/api/obs") {
      const streamerId =
        url.searchParams.get("streamer");

      if (!streamerId) {
        return json({
          error: "Missing streamer"
        }, 400);
      }

      const room = env.ROOM.get(
        env.ROOM.idFromName(
          String(streamerId)
        )
      );

      return room.fetch(req);
    }

    // =========================
    // STATIC WEBSITE
    // =========================

    const asset = await env.ASSETS.fetch(req);

    if (asset.status === 404) {
      return env.ASSETS.fetch(
        new Request(
          new URL("/", req.url)
        )
      );
    }

    return asset;
  }
};