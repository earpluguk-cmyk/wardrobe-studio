const ALLOWED_ORIGIN = "https://earpluguk-cmyk.github.io";
const MODEL = "gpt-5.4-mini";
const MAX_IMAGE_CHARS = 2_400_000;
const schema = {
  type: "object", additionalProperties: false,
  properties: {
    name: { type: "string" }, brand: { type: "string" }, type: { type: "string" },
    colours: { type: "array", items: { type: "string", enum: ["Black","White","Grey","Beige","Cream","Tan","Brown","Blue","Green","Red","Pink","Purple","Yellow","Orange","Multicolour"] } },
    contexts: { type: "array", items: { type: "string", enum: ["Casual","Smart","Work","Summer","Holiday"] } },
    seasons: { type: "array", items: { type: "string", enum: ["Spring","Summer","Autumn","Winter","Holiday","All year"] } },
    suitability: { type: "string", enum: ["Fresh trim","Hat needed","Either"] },
    product_search_query: { type: "string" }, confidence: { type: "string", enum: ["high","medium","low"] }
  },
  required: ["name","brand","type","colours","contexts","seasons","suitability","product_search_query","confidence"]
};
function json(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": origin || ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin", "Cache-Control": "no-store"
  }});
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin !== ALLOWED_ORIGIN) return json({ error: "Origin not allowed." }, 403, ALLOWED_ORIGIN);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN, "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", "Vary": "Origin"
    }});
    if (request.method !== "POST") return json({ error: "Use POST for image analysis." }, 405, origin);
    if (!env.OPENAI_API_KEY) return json({ error: "The AI service has not been configured yet." }, 503, origin);
    const declaredSize = Number(request.headers.get("Content-Length") || 0);
    if (declaredSize > 2_600_000) return json({ error: "That image is too large. Try a smaller photo." }, 413, origin);
    try {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const minute = Math.floor(Date.now() / 60000);
      const rateKey = new Request("https://wardrobe-rate-limit.invalid/" + encodeURIComponent(ip) + "/" + minute);
      const cache = caches.default, prior = await cache.match(rateKey);
      const count = prior ? Number(await prior.text()) : 0;
      if (count >= 12) return json({ error: "Too many image requests. Please wait a minute and try again." }, 429, origin);
      await cache.put(rateKey, new Response(String(count + 1), { headers: { "Cache-Control": "max-age=60" } }));
      const body = await request.json(), image = body && body.image;
      if (typeof image !== "string" || image.length > MAX_IMAGE_CHARS || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image))
        return json({ error: "Please upload a valid clothing photo." }, 400, origin);
      const prompt = [
        "You are helping organise a personal clothing wardrobe. Inspect the supplied photo and return concise, practical wardrobe details.",
        "Only identify a brand when its logo, label or product identity is genuinely recognisable. Never guess a brand; otherwise use an empty brand string.",
        "The name should be a short display title, ideally Brand + main colour + recognisable garment style, e.g. Zara Brown Bobble-Neck Jumper. Do not add fabric claims such as wool unless clearly evidenced. If brand is unknown, omit it from the name.",
        "Type should be a short garment type such as Jumper, Jeans, Jacket, Trainers or Shirt. Choose one to three main visible colours from the supplied list.",
        "Choose plausible contexts from Casual, Smart, Work, Summer, Holiday. Choose seasons from Spring, Summer, Autumn, Winter, Holiday, All year. Multiple choices are allowed.",
        "Fresh trim / Hat suitability is personal and cannot be determined from a clothing photo. Always return Either.",
        "Create a Google Images search query from the brand if known and concise garment description. Do not claim to have verified an exact retail listing.",
        "Set confidence high only when garment and key details are clear; medium when some details are uncertain; low when identification is difficult. Return only required structured fields."
      ].join(" ");
      const upstream = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: {
        "Authorization": "Bearer " + env.OPENAI_API_KEY, "Content-Type": "application/json"
      }, body: JSON.stringify({
        model: MODEL,
        input: [{ role: "user", content: [
          { type: "input_text", text: prompt }, { type: "input_image", image_url: image, detail: "low" }
        ]}],
        text: { format: { type: "json_schema", name: "wardrobe_clothing_suggestions", strict: true, schema }},
        max_output_tokens: 500
      })});
      const result = await upstream.json();
      if (!upstream.ok) {
        const message = result.error && result.error.message ? result.error.message : "The AI provider could not analyse this photo.";
        return json({ error: message }, upstream.status === 429 ? 429 : 502, origin);
      }
      const outputText = (result.output || []).flatMap(item => item.content || [])
        .filter(part => part.type === "output_text").map(part => part.text).join("");
      if (!outputText) return json({ error: "The AI returned no clothing suggestions. Please try again." }, 502, origin);
      return json({ result: JSON.parse(outputText) }, 200, origin);
    } catch (error) {
      return json({ error: "Could not analyse this photo. Please try again." }, 500, origin);
    }
  }
};
