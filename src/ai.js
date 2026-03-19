import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { config } from "./config.js";

function buildPrompt({ pageName, recentPosts }) {
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
      `Write in ${config.contentLanguage}. Keep it concise, natural, and ready to publish. ` +
      `Avoid repeating recent posts. Avoid spammy hashtags and exaggerated claims. ` +
      `Aim for 2 to 5 short lines.`,
    user:
      `Page name: ${pageName || "My Facebook Page"}\n\n` +
      `Content brief:\n${config.contentBrief}\n\n` +
      `Recent posts to avoid repeating:\n${recentSection}\n\n` +
      `Write one fresh Facebook Page post now.`
  };
}

async function generateWithOpenAI(prompt) {
  const client = new OpenAI({
    apiKey: config.openAiApiKey
  });

  const response = await client.responses.create({
    model: config.openAiModel,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: prompt.system
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt.user
          }
        ]
      }
    ]
  });

  return response.output_text.trim();
}

async function generateWithGemini(prompt) {
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

export function getActiveAiModel() {
  return config.aiProvider === "gemini"
    ? config.geminiModel
    : config.openAiModel;
}

export async function generatePost({ pageName, recentPosts }) {
  const prompt = buildPrompt({ pageName, recentPosts });

  if (config.aiProvider === "gemini") {
    return generateWithGemini(prompt);
  }

  return generateWithOpenAI(prompt);
}
