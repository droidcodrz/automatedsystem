import nodemailer from 'nodemailer';
import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { logger } from './logger';

let telegramBot: TelegramBot | null = null;

function getTelegramBot(): TelegramBot | null {
  if (!config.telegram.botToken) return null;
  if (!telegramBot) {
    telegramBot = new TelegramBot(config.telegram.botToken, { polling: false });
  }
  return telegramBot;
}

const emailTransporter = config.smtp.user
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    })
  : null;

export interface NotificationPayload {
  title: string;
  message: string;
  type: 'slot_detected' | 'appointment_booked' | 'booking_failed';
}

export async function sendTelegramNotification(
  chatId: string,
  payload: NotificationPayload
): Promise<boolean> {
  const bot = getTelegramBot();
  if (!bot) {
    logger.warn('Telegram bot not configured');
    return false;
  }
  try {
    const icon =
      payload.type === 'appointment_booked'
        ? '✅'
        : payload.type === 'slot_detected'
        ? '🔔'
        : '❌';
    await bot.sendMessage(
      chatId,
      `${icon} *${payload.title}*\n\n${payload.message}`,
      { parse_mode: 'Markdown' }
    );
    return true;
  } catch (err) {
    logger.error('Telegram notification failed', { error: err });
    return false;
  }
}

export async function sendEmailNotification(
  to: string,
  payload: NotificationPayload
): Promise<boolean> {
  if (!emailTransporter) {
    logger.warn('Email transport not configured');
    return false;
  }
  try {
    await emailTransporter.sendMail({
      from: config.smtp.user,
      to,
      subject: `VFS Automation: ${payload.title}`,
      html: `
        <h2>${payload.title}</h2>
        <p>${payload.message}</p>
        <hr>
        <small>VFS Appointment Automation System</small>
      `,
    });
    return true;
  } catch (err) {
    logger.error('Email notification failed', { error: err });
    return false;
  }
}

export async function sendNotification(
  channels: { telegram?: string; email?: string },
  payload: NotificationPayload
): Promise<void> {
  const promises: Promise<boolean>[] = [];

  if (channels.telegram) {
    promises.push(sendTelegramNotification(channels.telegram, payload));
  }
  if (channels.email) {
    promises.push(sendEmailNotification(channels.email, payload));
  }

  await Promise.allSettled(promises);
}
