import cron from "node-cron";
import { config } from "./config.js";

let currentTask = null;
let isRunning = false;
let currentExpression = "";
let currentJob = null;
let currentTimezone = config.timezone;

export function startScheduler(job, options = {}) {
  currentJob = job;
  stopScheduler();

  const interval = Math.max(1, Number(options.intervalMinutes || config.postIntervalMinutes));
  const expression = `*/${interval} * * * *`;
  currentExpression = expression;
  currentTimezone = options.timezone || config.timezone;

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
      timezone: currentTimezone
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

  currentExpression = "";
}

export function restartScheduler(options = {}) {
  if (!currentJob) {
    return "";
  }

  return startScheduler(currentJob, options);
}

export function schedulerIsActive() {
  return Boolean(currentTask);
}

export function getSchedulerSnapshot() {
  return {
    active: schedulerIsActive(),
    expression: currentExpression,
    timezone: currentTimezone
  };
}
