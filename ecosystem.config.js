// PM2 Ecosystem Config — Production Process Manager
// Start: pm2 start ecosystem.config.js
// Monitor: pm2 monit
// Logs: pm2 logs singhana

module.exports = {
  apps: [{
    name: 'singhana',
    script: 'server/server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
