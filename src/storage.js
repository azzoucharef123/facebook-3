import fs from "node:fs";
import { config } from "./config.js";

const defaultState = {
  facebook: {
    userAccessToken: "",
    pageAccessToken: "",
    pageId: "",
    pageName: "",
    pages: [],
    lastAuthAt: ""
  },
  posts: [],
  preview: {
    nextPost: "",
    generatedAt: "",
    lastError: ""
  },
  settings: {
    contentBrief: "",
    contentLanguage: ""
  },
  scheduler: {
    enabled: true,
    intervalMinutes: config.postIntervalMinutes,
    lastRunAt: "",
    lastResult: "",
    lastError: ""
  }
};

export function readState() {
  if (!fs.existsSync(config.stateFile)) {
    return structuredClone(defaultState);
  }

  try {
    const raw = fs.readFileSync(config.stateFile, "utf8");
    const parsed = JSON.parse(raw);

    return {
      ...structuredClone(defaultState),
      ...parsed,
      facebook: {
        ...structuredClone(defaultState.facebook),
        ...(parsed.facebook || {})
      },
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      preview: {
        ...structuredClone(defaultState.preview),
        ...(parsed.preview || {})
      },
      settings: {
        ...structuredClone(defaultState.settings),
        ...(parsed.settings || {})
      },
      scheduler: {
        ...structuredClone(defaultState.scheduler),
        ...(parsed.scheduler || {})
      }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

export function writeState(nextState) {
  fs.writeFileSync(config.stateFile, JSON.stringify(nextState, null, 2), "utf8");
}

export function updateState(updater) {
  const current = readState();
  const next = updater(current);
  writeState(next);
  return next;
}
