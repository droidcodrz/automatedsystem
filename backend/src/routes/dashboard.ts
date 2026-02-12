import { Router, Request, Response } from 'express';
import { prisma } from '../db/client';
import { authenticate } from '../middleware/auth';
import { AutomationManager } from '../services/automationManager';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [totalProfiles, totalTasks, activeTasks, bookedTasks, failedTasks, recentLogs] =
      await Promise.all([
        prisma.applicantProfile.count({ where: { userId } }),
        prisma.bookingTask.count({ where: { userId } }),
        prisma.bookingTask.count({
          where: { userId, status: { in: ['MONITORING', 'BOOKING', 'SLOT_FOUND'] } },
        }),
        prisma.bookingTask.count({ where: { userId, status: 'BOOKED' } }),
        prisma.bookingTask.count({ where: { userId, status: 'FAILED' } }),
        prisma.taskLog.findMany({
          where: { task: { userId } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { task: { select: { destCountry: true, visaCategory: true } } },
        }),
      ]);

    const activeSessions = AutomationManager.getInstance().getActiveTaskCount();

    res.json({
      stats: {
        totalProfiles,
        totalTasks,
        activeTasks,
        bookedTasks,
        failedTasks,
        activeSessions,
      },
      recentLogs,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

dashboardRouter.get('/tasks/active', async (req: Request, res: Response) => {
  try {
    const tasks = await prisma.bookingTask.findMany({
      where: {
        userId: req.user!.userId,
        status: { in: ['MONITORING', 'BOOKING', 'SLOT_FOUND'] },
      },
      include: { profile: { select: { fullName: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ tasks });
  } catch {
    res.status(500).json({ error: 'Failed to fetch active tasks' });
  }
});
