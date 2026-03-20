import { config } from "./config.js";

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

export async function generatePostsWithOpenAI({ prompt, count = 3, existingPosts = [] }) {
  if (!config.openAiApiKey) {
    throw new Error("أضف OPENAI_API_KEY في Railway أولًا.");
  }

  const recentSamples = existingPosts
    .slice(-8)
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openAiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openAiModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You write Arabic Facebook posts. Return only a valid JSON array of strings with no markdown and no extra commentary."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `اكتب ${count} منشورات عربية جاهزة للنشر على فيسبوك.\n` +
                `الموضوع أو التوجيه:\n${prompt}\n\n` +
                `تجنب تكرار هذه المنشورات السابقة:\n${recentSamples || "لا توجد أمثلة سابقة."}\n\n` +
                "أعد النتيجة فقط على شكل JSON array من النصوص."
            }
          ]
        }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    throw new Error(payload?.error?.message || `OpenAI request failed with ${response.status}`);
  }

  const rawText = payload.output_text || "";
  const posts = parsePostsFromResponse(rawText).slice(0, count);

  if (!posts.length) {
    throw new Error("لم أتمكن من استخراج منشورات صالحة من رد OpenAI.");
  }

  return posts;
}
