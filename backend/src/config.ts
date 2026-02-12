import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

// Validate critical secrets in production
if (isProduction) {
  const required = ['JWT_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

if (isProduction && process.env.JWT_SECRET === 'dev-secret-change-in-production') {
  throw new Error('JWT_SECRET must be changed from default in production');
}

if (
  isProduction &&
  process.env.ENCRYPTION_KEY === '0000000000000000000000000000000000000000000000000000000000000000'
) {
  throw new Error('ENCRYPTION_KEY must be changed from default in production');
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  encryptionKey: process.env.ENCRYPTION_KEY || '0000000000000000000000000000000000000000000000000000000000000000',

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },

  captcha: {
    service: process.env.CAPTCHA_SERVICE || 'manual',
    twoCaptchaKey: process.env.TWO_CAPTCHA_API_KEY || '',
    antiCaptchaKey: process.env.ANTI_CAPTCHA_API_KEY || '',
  },

  proxy: {
    enabled: process.env.PROXY_ENABLED === 'true',
    url: process.env.PROXY_URL || '',
    username: process.env.PROXY_USERNAME || '',
    password: process.env.PROXY_PASSWORD || '',
  },

  vfs: {
    baseUrl: process.env.VFS_BASE_URL || 'https://visa.vfsglobal.com',
  },
};
