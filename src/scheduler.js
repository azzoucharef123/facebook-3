import cron from "node-cron";
import { config } from "./config.js";

let currentTask = null;
let isRunning = false;

export function startScheduler(job) {
  stopScheduler();

  const interval = Math.max(1, config.postIntervalMinutes);
  const expression = `*/${interval} * * * *`;

  currentTask = cron.schedule(
    expression,
    async () => {
      if (isRunning) {
        return;
      }

      isRunning = true;

      try {
        await job();
      } finally {
        isRunning = false;
      }
    },
    {
      timezone: config.timezone
    }
  );

  return expression;
}

export function stopScheduler() {
  if (currentTask) {
    currentTask.stop();
    currentTask.destroy();
    currentTask = null;
  }
}

export function schedulerIsActive() {
  return Boolean(currentTask);
}
