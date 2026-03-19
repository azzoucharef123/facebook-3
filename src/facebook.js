import { config } from "./config.js";

const graphVersion = "v25.0";

function buildGraphUrl(pathname, params = {}) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

async function graphRequest(pathname, options = {}) {
  const { method = "GET", query = {}, body } = options;
  const url = buildGraphUrl(pathname, query);

  const response = await fetch(url, {
    method,
    headers: body
      ? {
          "Content-Type": "application/json"
        }
      : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json();

  if (!response.ok || payload.error) {
    const message =
      payload?.error?.message || `Facebook request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export function getFacebookLoginUrl(baseUrl = config.baseUrl) {
  const url = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.facebookAppId);
  url.searchParams.set("redirect_uri", `${baseUrl}/auth/facebook/callback`);
  url.searchParams.set(
    "scope",
    [
      "pages_manage_posts",
      "pages_read_engagement",
      "pages_show_list",
      "pages_manage_engagement",
      "pages_read_user_engagement"
    ].join(",")
  );
  url.searchParams.set("response_type", "code");
  return url.toString();
}

export async function exchangeCodeForLongLivedUserToken(code, baseUrl = config.baseUrl) {
  const redirectUri = `${baseUrl}/auth/facebook/callback`;

  const shortLived = await graphRequest("/oauth/access_token", {
    query: {
      client_id: config.facebookAppId,
      client_secret: config.facebookAppSecret,
      redirect_uri: redirectUri,
      code
    }
  });

  const longLived = await graphRequest("/oauth/access_token", {
    query: {
      grant_type: "fb_exchange_token",
      client_id: config.facebookAppId,
      client_secret: config.facebookAppSecret,
      fb_exchange_token: shortLived.access_token
    }
  });

  return longLived.access_token;
}

export async function getManagedPages(userAccessToken) {
  const response = await graphRequest("/me/accounts", {
    query: {
      access_token: userAccessToken,
      fields: "id,name,access_token,tasks"
    }
  });

  return response.data || [];
}

export async function publishPagePost({ pageId, pageAccessToken, message }) {
  return graphRequest(`/${pageId}/feed`, {
    method: "POST",
    query: {
      access_token: pageAccessToken
    },
    body: {
      message,
      published: true
    }
  });
}

export async function getPageProfile({ pageId, pageAccessToken }) {
  return graphRequest(`/${pageId}`, {
    query: {
      access_token: pageAccessToken,
      fields: "id,name,fan_count,followers_count,link"
    }
  });
}

export async function getPostDetails({ postId, pageAccessToken }) {
  return graphRequest(`/${postId}`, {
    query: {
      access_token: pageAccessToken,
      fields: "id,message,created_time,permalink_url,comments.summary(true),reactions.summary(true),shares"
    }
  });
}

export async function getPostComments({ postId, pageAccessToken, limit = 10 }) {
  const response = await graphRequest(`/${postId}/comments`, {
    query: {
      access_token: pageAccessToken,
      fields: "id,created_time,message,from{id,name}",
      limit
    }
  });

  return response.data || [];
}
