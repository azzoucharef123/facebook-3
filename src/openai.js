import OpenAI from "openai";
import { config } from "./config.js";

const client = new OpenAI({
  apiKey: config.openAiApiKey
});

export async function generatePost({ pageName, recentPosts }) {
  const trimmedRecentPosts = recentPosts.slice(-5).map((post, index) => {
    return `${index + 1}. ${post.message}`;
  });

  const recentSection = trimmedRecentPosts.length
    ? trimmedRecentPosts.join("\n")
    : "لا توجد منشورات سابقة بعد.";

  const response = await client.responses.create({
    model: config.openAiModel,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              `You are a social media writer for Facebook Pages. ` +
              `Return plain text only with no markdown, no quotes, and no explanations. ` +
              `Write in ${config.contentLanguage}. Keep it concise, natural, and ready to publish. ` +
              `Avoid repeating recent posts. Avoid spammy hashtags and exaggerated claims. ` +
              `Aim for 2 to 5 short lines.`
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Page name: ${pageName || "My Facebook Page"}\n\n` +
              `Content brief:\n${config.contentBrief}\n\n` +
              `Recent posts to avoid repeating:\n${recentSection}\n\n` +
              `Write one fresh Facebook Page post now.`
          }
        ]
      }
    ]
  });

  return response.output_text.trim();
}
