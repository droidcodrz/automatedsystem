import { Router, Request, Response } from 'express';
import { prisma } from '../db/client';
import { authenticate } from '../middleware/auth';

export const logRouter = Router();
logRouter.use(authenticate);

logRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { taskId, level, from, to, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = Math.min(parseInt(limit as string, 10), 200);

    const where: Record<string, unknown> = {};

    if (taskId) {
      const task = await prisma.bookingTask.findFirst({
        where: { id: taskId as string, userId: req.user!.userId },
      });
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      where.taskId = taskId;
    } else {
      const userTasks = await prisma.bookingTask.findMany({
        where: { userId: req.user!.userId },
        select: { id: true },
      });
      where.taskId = { in: userTasks.map((t) => t.id) };
    }

    if (level) where.level = level;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from as string);
      if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to as string);
    }

    const [logs, total] = await Promise.all([
      prisma.taskLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: { task: { select: { destCountry: true, visaCategory: true } } },
      }),
      prisma.taskLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

logRouter.get('/export', async (req: Request, res: Response) => {
  try {
    const { taskId, format = 'csv' } = req.query;

    const where: Record<string, unknown> = {};
    if (taskId) {
      const task = await prisma.bookingTask.findFirst({
        where: { id: taskId as string, userId: req.user!.userId },
      });
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      where.taskId = taskId;
    } else {
      const userTasks = await prisma.bookingTask.findMany({
        where: { userId: req.user!.userId },
        select: { id: true },
      });
      where.taskId = { in: userTasks.map((t) => t.id) };
    }

    const logs = await prisma.taskLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { task: { select: { destCountry: true, visaCategory: true } } },
    });

    if (format === 'csv') {
      const header = 'Timestamp,Level,Task ID,Destination,Visa Category,Message,Details\n';
      const rows = logs.map(
        (l) =>
          `"${l.createdAt.toISOString()}","${l.level}","${l.taskId}","${l.task.destCountry}","${l.task.visaCategory}","${l.message.replace(/"/g, '""')}","${(l.details || '').replace(/"/g, '""')}"`
      );
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=logs.csv');
      res.send(header + rows.join('\n'));
    } else {
      const lines = logs.map(
        (l) =>
          `[${l.createdAt.toISOString()}] [${l.level.toUpperCase()}] [${l.task.destCountry}/${l.task.visaCategory}] ${l.message}${l.details ? ' | ' + l.details : ''}`
      );
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', 'attachment; filename=logs.txt');
      res.send(lines.join('\n'));
    }
  } catch {
    res.status(500).json({ error: 'Failed to export logs' });
  }
});
