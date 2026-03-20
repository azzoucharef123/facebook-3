import crypto from "node:crypto";
import { config } from "./config.js";
import { readState, updateState } from "./storage.js";

const CACHE_LIMIT = 18;
const CACHE_POSTS_LIMIT = 48;
const HISTORY_LIMIT = 3;
const HISTORY_WORDS = 5;
const RESPONSE_KEY = "p";

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenWords(text, wordLimit = HISTORY_WORDS) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, wordLimit)
    .join(" ");
}

function computeSimilarity(left, right) {
  const leftWords = new Set(normalizeText(left).split(" ").filter(Boolean));
  const rightWords = new Set(normalizeText(right).split(" ").filter(Boolean));

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

function buildHistoryDigest(existingPosts) {
  const seen = new Set();
  const picked = [];

  for (const post of [...existingPosts].reverse()) {
    const summary = shortenWords(post, HISTORY_WORDS);
    const normalized = normalizeText(summary);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    picked.push(summary);
    if (picked.length >= HISTORY_LIMIT) {
      break;
    }
  }

  return picked.reverse().join(" | ");
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
    const direct = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.[RESPONSE_KEY]) ? parsed[RESPONSE_KEY] : [];
    return direct.map((item) => String(item || "").trim()).filter(Boolean);
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
    const normalized = normalizeText(post);
    if (!normalized) {
      continue;
    }

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

    approved.push(post.trim());
    comparisonPool.push(post);
  }

  return approved;
}

function buildRequestSignature(prompt) {
  const raw = [
    normalizeText(prompt || config.topic),
    normalizeText(config.topic),
    normalizeText(config.language),
    normalizeText(config.style),
    String(config.minWords),
    String(config.maxWords),
    config.deepSeekModel
  ].join("|");

  return crypto.createHash("sha1").update(raw).digest("hex");
}

function getCachedPosts(signature, existingPosts, targetCount) {
  const cache = readState().ai?.cache || [];
  const entry = cache.find((item) => item.key === signature);
  if (!entry?.posts?.length) {
    return [];
  }

  return filterGeneratedPosts(entry.posts, existingPosts).slice(0, targetCount);
}

function persistCache(signature, posts) {
  if (!posts.length) {
    return;
  }

  updateState((current) => {
    const nextCache = Array.isArray(current.ai?.cache) ? [...current.ai.cache] : [];
    const existingIndex = nextCache.findIndex((item) => item.key === signature);
    const existingPosts = existingIndex >= 0 && Array.isArray(nextCache[existingIndex].posts)
      ? nextCache[existingIndex].posts
      : [];
    const merged = [...new Set([...posts, ...existingPosts])].slice(0, CACHE_POSTS_LIMIT);
    const nextEntry = {
      key: signature,
      posts: merged,
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      nextCache.splice(existingIndex, 1);
    }

    nextCache.unshift(nextEntry);
    current.ai = {
      ...(current.ai || {}),
      cache: nextCache.slice(0, CACHE_LIMIT)
    };
    return current;
  });
}

function buildCompactPrompt({ prompt, requestCount, historyDigest }) {
  const topic = prompt && normalizeText(prompt) !== normalizeText(config.topic) ? `${config.topic}; ${prompt}` : config.topic;
  return [
    `JSON فقط {"${RESPONSE_KEY}":[""]}`,
    `${requestCount} منشورات`,
    `lang=${config.language}`,
    `style=${config.style}`,
    `topic=${topic}`,
    `words=${config.minWords}-${config.maxWords}`,
    historyDigest ? `avoid=${historyDigest}` : ""
  ]
    .filter(Boolean)
    .join(" | ");
}

function computeMaxTokens(requestCount) {
  const perPostBudget = Math.max(18, config.maxWords * 3);
  return Math.max(120, Math.min(420, requestCount * perPostBudget + 40));
}

export async function generatePostsWithDeepSeek({ prompt, count = 3, existingPosts = [] }) {
  if (!config.deepSeekApiKey) {
    throw new Error("أضف DEEPSEEK_API_KEY في Railway أولًا.");
  }

  const targetCount = Math.max(1, count || config.postsPerBatch);
  const signature = buildRequestSignature(prompt || config.topic);
  const cachedPosts = getCachedPosts(signature, existingPosts, targetCount);

  if (cachedPosts.length >= targetCount) {
    return cachedPosts;
  }

  const shortage = targetCount - cachedPosts.length;
  const buffer = Math.min(3, Math.max(1, Math.ceil(shortage / 2)));
  const requestCount = shortage + buffer;
  const historyDigest = buildHistoryDigest(existingPosts);
  const compactPrompt = buildCompactPrompt({
    prompt: prompt || config.topic,
    requestCount,
    historyDigest
  });

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
          role: "user",
          content: compactPrompt
        }
      ],
      response_format: {
        type: "json_object"
      },
      max_tokens: computeMaxTokens(requestCount)
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.error) {
    throw new Error(payload?.error?.message || `DeepSeek request failed with ${response.status}`);
  }

  const rawText = payload?.choices?.[0]?.message?.content || "";
  const freshPosts = filterGeneratedPosts(parsePostsFromResponse(rawText), [...existingPosts, ...cachedPosts]);

  if (freshPosts.length) {
    persistCache(signature, freshPosts);
  }

  const result = [...cachedPosts, ...freshPosts].slice(0, targetCount);

  if (!result.length) {
    throw new Error("لم أتمكن من استخراج منشورات صالحة من رد DeepSeek.");
  }

  return result;
}
