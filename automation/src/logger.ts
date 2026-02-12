import winston from 'winston';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'vfs-automation-engine' },
  transports: [
    new winston.transports.File({ filename: 'logs/automation-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/automation.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});
