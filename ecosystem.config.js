// PM2 process definitions — run: pm2 start ecosystem.config.js
// Uses symlink ~/seo-pipeline → "/Volumes/HPB DISC/seo-pipeline" to avoid
// spaces in the drive path breaking ts-node's module resolution.

const base = process.env.HOME + "/sahayi-seo";

module.exports = {
  apps: [
    {
      name: "sahayi-discord-bot",
      script: base + "/node_modules/.bin/ts-node",
      args: "src/cli.ts approve-bot",
      cwd: base,
      env_file: base + "/.env",
      restart_delay: 5000,
      max_restarts: 10,
      log_file: base + "/logs/approve-bot.log",
      error_file: base + "/logs/approve-bot-error.log",
      time: true,
    },
    {
      name: "sahayi-scheduler",
      script: base + "/node_modules/.bin/ts-node",
      args: "src/cli.ts scheduler",
      cwd: base,
      env_file: base + "/.env",
      restart_delay: 5000,
      max_restarts: 10,
      log_file: base + "/logs/scheduler.log",
      error_file: base + "/logs/scheduler-error.log",
      time: true,
    },
  ],
};
