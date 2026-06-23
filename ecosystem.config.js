// PM2 process definitions — run: pm2 start ecosystem.config.js
// Manages approve-bot and scheduler as persistent background processes

const base = "/Volumes/HPB DISC/seo-pipeline";
const runner = `npx ts-node ${base}/src/cli.ts`;

module.exports = {
  apps: [
    {
      name: "sahayi-discord-bot",
      script: "npx",
      args: `ts-node ${base}/src/cli.ts approve-bot`,
      cwd: base,
      interpreter: "none",
      env_file: `${base}/.env`,
      restart_delay: 5000,
      max_restarts: 10,
      log_file: `${base}/logs/approve-bot.log`,
      error_file: `${base}/logs/approve-bot-error.log`,
      time: true,
    },
    {
      name: "sahayi-scheduler",
      script: "npx",
      args: `ts-node ${base}/src/cli.ts scheduler`,
      cwd: base,
      interpreter: "none",
      env_file: `${base}/.env`,
      restart_delay: 5000,
      max_restarts: 10,
      log_file: `${base}/logs/scheduler.log`,
      error_file: `${base}/logs/scheduler-error.log`,
      time: true,
    },
  ],
};
