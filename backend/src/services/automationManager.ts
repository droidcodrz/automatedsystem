import { prisma } from '../db/client';
import { config } from '../config';
import { logger } from './logger';
import { sendNotification } from './notifications';
import { decrypt } from './encryption';
import {
  VFSAutomationEngine,
  type VFSCredentials,
  type ApplicantData,
  type BookingConfig,
  type SlotInfo,
  type EngineCallbacks,
  type CaptchaConfig,
  type ProxyEntry,
} from 'automation';

interface RunningTask {
  taskId: string;
  engine: VFSAutomationEngine;
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

    // Decrypt VFS credentials
    let vfsEmail: string;
    let vfsPassword: string;
    try {
      if (!task.vfsEmail || !task.vfsPassword) {
        throw new Error('VFS credentials not configured for this task');
      }
      vfsEmail = decrypt(task.vfsEmail);
      vfsPassword = decrypt(task.vfsPassword);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to decrypt VFS credentials';
      await this.addLog(taskId, 'error', message);
      await prisma.bookingTask.update({
        where: { id: taskId },
        data: { status: 'FAILED', errorMessage: message },
      });
      return;
    }

    const credentials: VFSCredentials = { email: vfsEmail, password: vfsPassword };

    const bookingConfig: BookingConfig = {
      originCountry: task.originCountry,
      destCountry: task.destCountry,
      visaCategory: task.visaCategory,
      visaSubCategory: task.visaSubCategory || undefined,
      visaCenter: task.visaCenter || undefined,
      refreshInterval: task.refreshInterval,
      preferredDateFrom: task.preferredDateFrom?.toISOString().split('T')[0],
      preferredDateTo: task.preferredDateTo?.toISOString().split('T')[0],
      mode: task.mode as 'auto' | 'manual',
    };

    // Decrypt passport number for the applicant data
    let passportNumber: string;
    try {
      passportNumber = decrypt(task.profile.passportNumber);
    } catch {
      passportNumber = '***';
      await this.addLog(taskId, 'warn', 'Could not decrypt passport number');
    }

    const applicant: ApplicantData = {
      fullName: task.profile.fullName,
      passportNumber,
      dateOfBirth: formatDate(task.profile.dateOfBirth),
      passportExpiry: formatDate(task.profile.passportExpiry),
      nationality: task.profile.nationality,
      email: task.profile.email,
      phone: task.profile.phone,
    };

    // Load captcha config
    const captchaConfig: CaptchaConfig = {
      service: config.captcha.service as 'manual' | '2captcha' | 'anticaptcha',
      apiKey: config.captcha.service === '2captcha'
        ? config.captcha.twoCaptchaKey
        : config.captcha.service === 'anticaptcha'
        ? config.captcha.antiCaptchaKey
        : undefined,
    };

    // Load proxies from database
    const proxyRecords = await prisma.proxyConfig.findMany({
      where: { isActive: true },
    });
    const proxies: ProxyEntry[] = proxyRecords.map((p) => ({
      id: p.id,
      url: p.url,
      username: p.username || undefined,
      password: p.password ? safeDecrypt(p.password) : undefined,
      country: p.country || undefined,
      failCount: p.failCount,
    }));

    // Helper to get notification channels for this user
    const getNotifChannels = async (): Promise<{ telegram?: string; email?: string }> => {
      const channels: { telegram?: string; email?: string } = { email: task.user.email };
      try {
        const notifPrefs = await prisma.notificationPreference.findMany({
          where: { userId: task.userId, enabled: true },
        });
        for (const pref of notifPrefs) {
          if (pref.type === 'TELEGRAM' && pref.config) {
            try { channels.telegram = JSON.parse(pref.config).chatId; } catch { /* skip */ }
          }
        }
      } catch { /* fallback to email only */ }
      return channels;
    };

    // Build callbacks that wire engine events back to the database + notifications
    const callbacks: EngineCallbacks = {
      onSlotFound: async (slot: SlotInfo) => {
        await prisma.bookingTask.update({
          where: { id: taskId },
          data: { status: 'SLOT_FOUND', slotFoundAt: new Date() },
        });
        await this.addLog(taskId, 'info', `Slot found: ${slot.date} at ${slot.time}`);

        await sendNotification(await getNotifChannels(), {
          title: 'Appointment Slot Found!',
          message: `A slot is available for ${task.profile.fullName} on ${slot.date} at ${slot.time} (${task.destCountry} - ${task.visaCategory})`,
          type: 'slot_detected',
        });
      },

      onBookingSuccess: async () => {
        await prisma.bookingTask.update({
          where: { id: taskId },
          data: { status: 'BOOKED', bookedAt: new Date() },
        });
        await this.addLog(taskId, 'info', 'Appointment booked successfully!');
        this.tasks.delete(taskId);

        await sendNotification(await getNotifChannels(), {
          title: 'Appointment Booked!',
          message: `Appointment for ${task.profile.fullName} has been booked successfully (${task.destCountry} - ${task.visaCategory})`,
          type: 'appointment_booked',
        });
      },

      onBookingFailed: async (error: string) => {
        await prisma.bookingTask.update({
          where: { id: taskId },
          data: { status: 'FAILED', errorMessage: error, retryCount: { increment: 1 } },
        });
        await this.addLog(taskId, 'error', `Booking failed: ${error}`);
        this.tasks.delete(taskId);

        await sendNotification(await getNotifChannels(), {
          title: 'Booking Failed',
          message: `Task for ${task.profile.fullName} (${task.destCountry}) failed: ${error}`,
          type: 'booking_failed',
        });
      },

      onCaptchaRequired: async (type: string) => {
        await this.addLog(taskId, 'warn', `Captcha required (${type}). Manual intervention needed.`);
        return null;
      },

      onLog: async (level: string, message: string) => {
        await this.addLog(taskId, level, message);
      },

      onManualActionRequired: async (action: string, details: string) => {
        await this.addLog(taskId, 'warn', `Manual action required: ${action} — ${details}`);
      },
    };

    // Create engine and start it in the background
    const engine = new VFSAutomationEngine(captchaConfig, proxies, callbacks);

    this.tasks.set(taskId, { taskId, engine });

    await this.addLog(taskId, 'info', `Monitoring started for ${task.destCountry} - ${task.visaCategory}`);

    // Run engine in the background (don't await — it runs its own loop)
    engine.start(credentials, bookingConfig, applicant).catch(async (err) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.addLog(taskId, 'error', `Engine crashed: ${message}`);
      await prisma.bookingTask.update({
        where: { id: taskId },
        data: { status: 'FAILED', errorMessage: message },
      });
      this.tasks.delete(taskId);
    });
  }

  async stopTask(taskId: string): Promise<void> {
    const runningTask = this.tasks.get(taskId);
    if (!runningTask) return;

    await runningTask.engine.stop();
    this.tasks.delete(taskId);
    logger.info(`Task ${taskId} stopped`);
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

function formatDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return '';
  }
}
