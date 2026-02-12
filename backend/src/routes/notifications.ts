import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client';
import { authenticate } from '../middleware/auth';
import { sendTelegramNotification, sendEmailNotification } from '../services/notifications';

export const notificationRouter = Router();
notificationRouter.use(authenticate);

const prefSchema = z.object({
  type: z.enum(['TELEGRAM', 'EMAIL', 'DESKTOP']),
  enabled: z.boolean().default(true),
  config: z.string().optional(),
});

notificationRouter.get('/', async (req: Request, res: Response) => {
  try {
    const prefs = await prisma.notificationPreference.findMany({
      where: { userId: req.user!.userId },
    });
    res.json({ preferences: prefs });
  } catch {
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

notificationRouter.put('/', async (req: Request, res: Response) => {
  try {
    const data = prefSchema.parse(req.body);
    const pref = await prisma.notificationPreference.upsert({
      where: {
        userId_type: { userId: req.user!.userId, type: data.type },
      },
      update: { enabled: data.enabled, config: data.config },
      create: {
        userId: req.user!.userId,
        type: data.type,
        enabled: data.enabled,
        config: data.config,
      },
    });
    res.json({ preference: pref });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to update preference' });
  }
});

notificationRouter.post('/test', async (req: Request, res: Response) => {
  try {
    const { type } = req.body;
    const payload = {
      title: 'Test Notification',
      message: 'This is a test from VFS Appointment Automation.',
      type: 'slot_detected' as const,
    };

    if (type === 'TELEGRAM') {
      const pref = await prisma.notificationPreference.findFirst({
        where: { userId: req.user!.userId, type: 'TELEGRAM' },
      });
      if (!pref?.config) {
        res.status(400).json({ error: 'Telegram not configured' });
        return;
      }
      let chatId: string;
      try {
        chatId = JSON.parse(pref.config).chatId;
      } catch {
        res.status(400).json({ error: 'Invalid Telegram configuration' });
        return;
      }
      if (!chatId) {
        res.status(400).json({ error: 'Telegram Chat ID not set' });
        return;
      }
      const sent = await sendTelegramNotification(chatId, payload);
      res.json({ success: sent });
    } else if (type === 'EMAIL') {
      const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      const sent = await sendEmailNotification(user.email, payload);
      res.json({ success: sent });
    } else {
      res.status(400).json({ error: 'Unsupported notification type for testing' });
    }
  } catch {
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});
