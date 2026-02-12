import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { config } from './config';
import { authRouter } from './routes/auth';
import { profileRouter } from './routes/profiles';
import { bookingRouter } from './routes/bookings';
import { logRouter } from './routes/logs';
import { proxyRouter } from './routes/proxies';
import { notificationRouter } from './routes/notifications';
import { dashboardRouter } from './routes/dashboard';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './services/logger';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json());

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

app.use('/api/auth', authRouter);
app.use('/api/profiles', profileRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/logs', logRouter);
app.use('/api/proxies', proxyRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/dashboard', dashboardRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});

export default app;
