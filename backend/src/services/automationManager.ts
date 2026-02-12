import { prisma } from '../db/client';
import { logger } from './logger';
import { sendNotification } from './notifications';

interface RunningTask {
  taskId: string;
  intervalHandle: ReturnType<typeof setTimeout> | null;
  isRunning: boolean;
}

export class AutomationManager {
  private static instance: AutomationManager;
  private tasks: Map<string, RunningTask> = new Map();

  static getInstance(): AutomationManager {
    if (!AutomationManager.instance) {
      AutomationManager.instance = new AutomationManager();
    }
    return AutomationManager.instance;
  }

  getActiveTaskCount(): number {
    return this.tasks.size;
  }

  async startTask(taskId: string): Promise<void> {
    if (this.tasks.has(taskId)) {
      logger.warn(`Task ${taskId} is already running`);
      return;
    }

    const task = await prisma.bookingTask.findUnique({
      where: { id: taskId },
      include: { profile: true, user: true },
    });

    if (!task) {
      logger.error(`Task ${taskId} not found`);
      return;
    }

    const runningTask: RunningTask = {
      taskId,
      intervalHandle: null,
      isRunning: true,
    };

    this.tasks.set(taskId, runningTask);

    await this.addLog(taskId, 'info', `Monitoring started for ${task.destCountry} - ${task.visaCategory}`);

    this.scheduleCheck(taskId, task.refreshInterval * 1000);
  }

  stopTask(taskId: string): void {
    const runningTask = this.tasks.get(taskId);
    if (!runningTask) return;

    runningTask.isRunning = false;
    if (runningTask.intervalHandle) {
      clearTimeout(runningTask.intervalHandle);
    }
    this.tasks.delete(taskId);
    logger.info(`Task ${taskId} stopped`);
  }

  private scheduleCheck(taskId: string, intervalMs: number): void {
    const runningTask = this.tasks.get(taskId);
    if (!runningTask || !runningTask.isRunning) return;

    runningTask.intervalHandle = setTimeout(async () => {
      await this.checkAvailability(taskId);
      this.scheduleCheck(taskId, intervalMs);
    }, intervalMs);
  }

  private async checkAvailability(taskId: string): Promise<void> {
    const runningTask = this.tasks.get(taskId);
    if (!runningTask || !runningTask.isRunning) return;

    try {
      const task = await prisma.bookingTask.findUnique({
        where: { id: taskId },
        include: { profile: true, user: true },
      });

      if (!task || task.status === 'CANCELLED' || task.status === 'BOOKED') {
        this.stopTask(taskId);
        return;
      }

      await this.addLog(taskId, 'info', 'Checking appointment availability...');

      // The actual VFS checking is delegated to the automation engine worker.
      // This manager coordinates the scheduling; the Playwright-based engine
      // (in the /automation package) handles browser interaction.
      // For now, we emit a check event that the automation engine consumes.

      logger.info(`Availability check triggered for task ${taskId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.addLog(taskId, 'error', `Check failed: ${message}`);

      const task = await prisma.bookingTask.findUnique({ where: { id: taskId } });
      if (task && task.retryCount >= task.maxRetries) {
        await prisma.bookingTask.update({
          where: { id: taskId },
          data: { status: 'FAILED', errorMessage: message },
        });
        this.stopTask(taskId);

        const user = await prisma.user.findUnique({ where: { id: task.userId } });
        if (user) {
          await sendNotification(
            { email: user.email },
            {
              title: 'Booking Failed',
              message: `Task for ${task.destCountry} failed after ${task.maxRetries} retries: ${message}`,
              type: 'booking_failed',
            }
          );
        }
      } else if (task) {
        await prisma.bookingTask.update({
          where: { id: taskId },
          data: { retryCount: { increment: 1 } },
        });
      }
    }
  }

  async onSlotFound(taskId: string, slotDetails: { date: string; time: string }): Promise<void> {
    const task = await prisma.bookingTask.findUnique({
      where: { id: taskId },
      include: { profile: true, user: true },
    });

    if (!task) return;

    await prisma.bookingTask.update({
      where: { id: taskId },
      data: { status: 'SLOT_FOUND', slotFoundAt: new Date() },
    });

    await this.addLog(
      taskId,
      'info',
      `Slot found: ${slotDetails.date} at ${slotDetails.time}`
    );

    await sendNotification(
      { email: task.user.email },
      {
        title: 'Appointment Slot Found!',
        message: `A slot is available for ${task.profile.fullName} on ${slotDetails.date} at ${slotDetails.time} (${task.destCountry} - ${task.visaCategory})`,
        type: 'slot_detected',
      }
    );

    if (task.mode === 'auto') {
      await this.attemptBooking(taskId, slotDetails);
    }
  }

  async attemptBooking(
    taskId: string,
    slotDetails: { date: string; time: string }
  ): Promise<void> {
    try {
      await prisma.bookingTask.update({
        where: { id: taskId },
        data: { status: 'BOOKING' },
      });

      await this.addLog(taskId, 'info', 'Attempting to book appointment...');

      // Booking logic is handled by the Playwright automation engine.
      // This method is called when the engine signals a slot is available
      // and auto-mode is enabled.

      logger.info(`Booking attempt triggered for task ${taskId}`, { slotDetails });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.addLog(taskId, 'error', `Booking attempt failed: ${message}`);
    }
  }

  async onBookingSuccess(taskId: string): Promise<void> {
    const task = await prisma.bookingTask.findUnique({
      where: { id: taskId },
      include: { profile: true, user: true },
    });

    if (!task) return;

    await prisma.bookingTask.update({
      where: { id: taskId },
      data: { status: 'BOOKED', bookedAt: new Date() },
    });

    this.stopTask(taskId);

    await this.addLog(taskId, 'info', 'Appointment booked successfully!');

    await sendNotification(
      { email: task.user.email },
      {
        title: 'Appointment Booked!',
        message: `Appointment for ${task.profile.fullName} has been booked successfully (${task.destCountry} - ${task.visaCategory})`,
        type: 'appointment_booked',
      }
    );
  }

  private async addLog(taskId: string, level: string, message: string, details?: string): Promise<void> {
    try {
      await prisma.taskLog.create({
        data: { taskId, level, message, details },
      });
    } catch (err) {
      logger.error('Failed to create task log', { taskId, error: err });
    }
  }
}
