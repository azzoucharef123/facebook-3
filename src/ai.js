import { config } from "./config.js";

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeForSimilarity(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function computeSimilarity(left, right) {
  const leftWords = new Set(normalizeForSimilarity(left).split(" ").filter(Boolean));
  const rightWords = new Set(normalizeForSimilarity(right).split(" ").filter(Boolean));

  if (!leftWords.size || !rightWords.size) {
    return 0;
  }

  let intersection = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) {
      intersection += 1;
    }
  }

  return intersection / Math.max(leftWords.size, rightWords.size);
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

    if (Array.isArray(parsed?.posts)) {
      return parsed.posts.map((item) => String(item || "").trim()).filter(Boolean);
    }
  } catch {}

  return cleaned
    .split(/\n{2,}/)
    .map((item) => item.replace(/^[\-\*\d\.\)\s]+/, "").trim())
    .filter(Boolean);
}

function filterGeneratedPosts(posts, existingPosts) {
  const approved = [];
  const comparisonPool = [...existingPosts];

  for (const post of posts) {
    const words = countWords(post);
    if (words < config.minWords || words > config.maxWords) {
      continue;
    }

    const isTooSimilar = comparisonPool.some(
      (item) => computeSimilarity(post, item) >= config.similarityThreshold
    );

    if (isTooSimilar) {
      continue;
    }

    approved.push(post);
    comparisonPool.push(post);
  }

  return approved;
}

export async function generatePostsWithDeepSeek({ prompt, count = 3, existingPosts = [] }) {
  if (!config.deepSeekApiKey) {
    throw new Error("أضف DEEPSEEK_API_KEY في Railway أولًا.");
  }

  const recentSamples = existingPosts
    .slice(-8)
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");
  const targetCount = Math.max(1, count || config.postsPerBatch);
  const generationPrompt = prompt || config.topic;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.deepSeekApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.deepSeekModel,
      messages: [
        {
          role: "system",
          content:
            "You write short Facebook posts and return only valid JSON. No markdown. No extra commentary."
        },
        {
          role: "user",
          content:
            `اكتب ${targetCount + 8} منشورًا قصيرًا جاهزًا للنشر على فيسبوك.\n` +
            `اللغة المطلوبة: ${config.language}\n` +
            `الأسلوب المطلوب: ${config.style}\n` +
            `الموضوع الأساسي: ${config.topic}\n` +
            `التوجيه الإضافي:\n${generationPrompt}\n\n` +
            `كل منشور يجب أن يكون بين ${config.minWords} و ${config.maxWords} كلمات.\n` +
            `تجنب تكرار هذه المنشورات السابقة:\n${recentSamples || "لا توجد أمثلة سابقة."}\n\n` +
            `لا تجعل التشابه بين المنشورات مرتفعًا.\n` +
            'أعد النتيجة فقط كائن JSON بهذه الصيغة: {"posts":["...","..."]}.'
        }
      ],
      response_format: {
        type: "json_object"
      }
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    throw new Error(payload?.error?.message || `DeepSeek request failed with ${response.status}`);
  }

  const rawText = payload?.choices?.[0]?.message?.content || "";
  const posts = filterGeneratedPosts(parsePostsFromResponse(rawText), existingPosts).slice(0, targetCount);

  if (!posts.length) {
    throw new Error("لم أتمكن من استخراج منشورات صالحة من رد DeepSeek.");
  }

  return posts;
}
