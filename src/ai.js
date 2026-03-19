import { GoogleGenAI } from "@google/genai";
import { config } from "./config.js";

function buildPrompt({ pageName, recentPosts, contentLanguage, contentBrief }) {
  const trimmedRecentPosts = recentPosts.slice(-5).map((post, index) => {
    return `${index + 1}. ${post.message}`;
  });

  const recentSection = trimmedRecentPosts.length
    ? trimmedRecentPosts.join("\n")
    : "لا توجد منشورات سابقة بعد.";

  return {
    system:
      `You are a social media writer for Facebook Pages. ` +
      `Return plain text only with no markdown, no quotes, and no explanations. ` +
      `Write in ${contentLanguage || config.contentLanguage}. Keep it concise, natural, and ready to publish. ` +
      `Avoid repeating recent posts. Avoid spammy hashtags and exaggerated claims. ` +
      `Aim for 2 to 5 short lines.`,
    user:
      `Page name: ${pageName || "My Facebook Page"}\n\n` +
      `Content brief:\n${contentBrief || config.contentBrief}\n\n` +
      `Recent posts to avoid repeating:\n${recentSection}\n\n` +
      `Write one fresh Facebook Page post now.`
  };
}

export function getActiveAiModel() {
  return config.geminiModel;
}

export async function generatePost({ pageName, recentPosts, contentLanguage, contentBrief }) {
  const prompt = buildPrompt({ pageName, recentPosts, contentLanguage, contentBrief });
  const ai = new GoogleGenAI({
    apiKey: config.geminiApiKey
  });

  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: prompt.user,
    config: {
      systemInstruction: prompt.system,
      temperature: 1.0
    }
  });

  const text = response.text?.trim();
  if (text) {
    return text;
  }

  const fallbackText =
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || "";

  if (!fallbackText) {
    throw new Error("Gemini returned an empty response.");
  }

  return fallbackText;
}
