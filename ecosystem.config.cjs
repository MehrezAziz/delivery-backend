/**
 * PM2 on the VPS (production):
 *   cd /var/www/delivery-backend   # or your install path
 *   npm ci && npm run build && npm prune --production
 *   npx prisma migrate deploy
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'delivery-api',
      script: 'dist/src/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
