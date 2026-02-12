import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db/client';
import { authenticate } from '../middleware/auth';
import { AutomationManager } from '../services/automationManager';
import { encrypt } from '../services/encryption';

export const bookingRouter = Router();
bookingRouter.use(authenticate);

const createBookingSchema = z.object({
  profileId: z.string().uuid(),
  destCountry: z.enum(['Brazil', 'Portugal']),
  visaCategory: z.string().min(1),
  visaSubCategory: z.string().optional(),
  visaCenter: z.string().optional(),
  vfsEmail: z.string().email(),
  vfsPassword: z.string().min(1),
  mode: z.enum(['auto', 'manual']).default('auto'),
  refreshInterval: z.number().min(5).max(60).default(10),
  preferredDateFrom: z.string().optional().transform((s) => (s ? new Date(s) : undefined)),
  preferredDateTo: z.string().optional().transform((s) => (s ? new Date(s) : undefined)),
  maxRetries: z.number().min(1).max(20).default(5),
});

bookingRouter.get('/', async (req: Request, res: Response) => {
  try {
    const tasks = await prisma.bookingTask.findMany({
      where: { userId: req.user!.userId },
      include: { profile: { select: { fullName: true, passportNumber: false } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ tasks });
  } catch {
    res.status(500).json({ error: 'Failed to fetch booking tasks' });
  }
});

bookingRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const task = await prisma.bookingTask.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
      include: {
        profile: true,
        logs: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!task) {
      res.status(404).json({ error: 'Booking task not found' });
      return;
    }
    res.json({ task });
  } catch {
    res.status(500).json({ error: 'Failed to fetch booking task' });
  }
});

bookingRouter.post('/', async (req: Request, res: Response) => {
  try {
    const data = createBookingSchema.parse(req.body);

    const profile = await prisma.applicantProfile.findFirst({
      where: { id: data.profileId, userId: req.user!.userId },
    });
    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    const task = await prisma.bookingTask.create({
      data: {
        userId: req.user!.userId,
        profileId: data.profileId,
        destCountry: data.destCountry,
        visaCategory: data.visaCategory,
        visaSubCategory: data.visaSubCategory,
        visaCenter: data.visaCenter,
        vfsEmail: encrypt(data.vfsEmail),
        vfsPassword: encrypt(data.vfsPassword),
        mode: data.mode,
        refreshInterval: data.refreshInterval,
        preferredDateFrom: data.preferredDateFrom,
        preferredDateTo: data.preferredDateTo,
        maxRetries: data.maxRetries,
        status: 'PENDING',
      },
    });

    res.status(201).json({ task });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to create booking task' });
  }
});

bookingRouter.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const task = await prisma.bookingTask.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!task) {
      res.status(404).json({ error: 'Booking task not found' });
      return;
    }
    if (task.status === 'MONITORING' || task.status === 'BOOKING') {
      res.status(400).json({ error: 'Task is already running' });
      return;
    }

    await prisma.bookingTask.update({
      where: { id: task.id },
      data: { status: 'MONITORING' },
    });

    AutomationManager.getInstance().startTask(task.id);

    res.json({ message: 'Monitoring started', taskId: task.id });
  } catch {
    res.status(500).json({ error: 'Failed to start monitoring' });
  }
});

bookingRouter.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    const task = await prisma.bookingTask.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!task) {
      res.status(404).json({ error: 'Booking task not found' });
      return;
    }

    await AutomationManager.getInstance().stopTask(task.id);

    await prisma.bookingTask.update({
      where: { id: task.id },
      data: { status: 'CANCELLED' },
    });

    res.json({ message: 'Task stopped', taskId: task.id });
  } catch {
    res.status(500).json({ error: 'Failed to stop task' });
  }
});

bookingRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const task = await prisma.bookingTask.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!task) {
      res.status(404).json({ error: 'Booking task not found' });
      return;
    }

    await AutomationManager.getInstance().stopTask(task.id);
    await prisma.bookingTask.delete({ where: { id: task.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete task' });
  }
});
