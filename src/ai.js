import { config } from "./config.js";

function extractTextContent(choice) {
  const content = choice?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part?.type === "text") {
          return part.text || "";
        }

        return "";
      })
      .join("\n");
  }

  return "";
}

function parsePostsFromResponse(rawText) {
  const cleaned = String(rawText || "").trim();
  if (!cleaned) {
    return [];
  }

  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : cleaned;

  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    }
  } catch {}

  return cleaned
    .split(/\n{2,}/)
    .map((item) => item.replace(/^[\-\*\d\.\)\s]+/, "").trim())
    .filter(Boolean);
}

export async function generatePostsWithOpenRouter({ prompt, count = 3, existingPosts = [] }) {
  if (!config.openRouterApiKey) {
    throw new Error("أضف OPENROUTER_API_KEY في Railway أولًا.");
  }

  const recentSamples = existingPosts.slice(-8).map((item, index) => `${index + 1}. ${item}`).join("\n");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openRouterApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openRouterModel,
      messages: [
        {
          role: "system",
          content:
            "You write Arabic Facebook posts. Return only a valid JSON array of strings with no markdown and no extra text."
        },
        {
          role: "user",
          content:
            `اكتب ${count} منشورات عربية جاهزة للنشر على فيسبوك.\n` +
            `الموضوع أو التوجيه:\n${prompt}\n\n` +
            `تجنب تكرار هذه المنشورات السابقة:\n${recentSamples || "لا توجد أمثلة سابقة."}\n\n` +
            "أعد النتيجة فقط على شكل JSON array من النصوص."
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    throw new Error(payload?.error?.message || `OpenRouter request failed with ${response.status}`);
  }

  const rawText = extractTextContent(payload.choices?.[0] || {});
  const posts = parsePostsFromResponse(rawText).slice(0, count);

  if (!posts.length) {
    throw new Error("لم أتمكن من استخراج منشورات صالحة من رد الذكاء الاصطناعي.");
  }

  return posts;
}
