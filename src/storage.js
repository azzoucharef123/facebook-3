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
  scheduler: {
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
    return {
      ...structuredClone(defaultState),
      ...JSON.parse(raw)
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
