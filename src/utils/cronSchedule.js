import cron from "node-cron";

export const scheduleCron = (scheduleTime, task, options = { schedule: true, timezone: "UTC" }) => {
    cron.schedule(scheduleTime, task, options);
}