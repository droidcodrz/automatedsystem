import { Page } from 'playwright';
import { BrowserManager } from './browser';
import { CaptchaHandler, CaptchaConfig } from './captcha';
import { ProxyManager, ProxyEntry } from './proxy';
import { logger } from './logger';

export interface ApplicantData {
  fullName: string;
  passportNumber: string;
  dateOfBirth: string;
  passportExpiry: string;
  nationality: string;
  email: string;
  phone: string;
}

export interface BookingConfig {
  originCountry: string;
  destCountry: string;
  visaCategory: string;
  refreshInterval: number;
  preferredDateFrom?: string;
  preferredDateTo?: string;
  mode: 'auto' | 'manual';
}

export interface SlotInfo {
  date: string;
  time: string;
  available: boolean;
}

export interface EngineCallbacks {
  onSlotFound: (slot: SlotInfo) => Promise<void>;
  onBookingSuccess: () => Promise<void>;
  onBookingFailed: (error: string) => Promise<void>;
  onCaptchaRequired: (type: string) => Promise<string | null>;
  onLog: (level: string, message: string) => Promise<void>;
}

const VFS_BASE_URL = 'https://visa.vfsglobal.com';

// VFS URL patterns for Angola
const VFS_URLS: Record<string, string> = {
  Brazil: `${VFS_BASE_URL}/ago/pt/bra/attend-appointment`,
  Portugal: `${VFS_BASE_URL}/ago/pt/prt/attend-appointment`,
};

const MIN_ERROR_BACKOFF_MS = 5000;
const MAX_ERROR_BACKOFF_MS = 60000;

export class VFSAutomationEngine {
  private browserManager: BrowserManager;
  private captchaHandler: CaptchaHandler;
  private proxyManager: ProxyManager;
  private page: Page | null = null;
  private isRunning: boolean = false;
  private callbacks: EngineCallbacks;
  private consecutiveErrors: number = 0;

  constructor(
    captchaConfig: CaptchaConfig,
    proxies: ProxyEntry[],
    callbacks: EngineCallbacks
  ) {
    this.browserManager = new BrowserManager();
    this.captchaHandler = new CaptchaHandler(captchaConfig);
    this.proxyManager = new ProxyManager();
    this.proxyManager.loadProxies(proxies);
    this.callbacks = callbacks;
  }

  private getPage(): Page {
    if (!this.page) throw new Error('Page not initialized');
    return this.page;
  }

  private getErrorBackoffMs(): number {
    const backoff = Math.min(
      MIN_ERROR_BACKOFF_MS * Math.pow(2, this.consecutiveErrors),
      MAX_ERROR_BACKOFF_MS
    );
    return backoff;
  }

  async start(config: BookingConfig, applicant: ApplicantData): Promise<void> {
    this.isRunning = true;
    this.consecutiveErrors = 0;
    const proxyConfig = this.proxyManager.getProxyConfig();

    try {
      await this.callbacks.onLog('info', 'Launching browser...');
      const context = await this.browserManager.launch({
        headless: true,
        proxy: proxyConfig,
      });

      this.page = await context.newPage();

      await this.callbacks.onLog('info', `Navigating to VFS Global for ${config.destCountry}...`);

      const url = VFS_URLS[config.destCountry];
      if (!url) {
        throw new Error(`Unsupported destination country: ${config.destCountry}`);
      }

      await this.navigateWithRetry(url);

      // Main monitoring loop
      while (this.isRunning) {
        try {
          await this.callbacks.onLog('info', 'Checking for available slots...');

          const slots = await this.checkAvailability(config);

          if (slots.length > 0) {
            const bestSlot = this.selectBestSlot(slots, config);
            if (bestSlot) {
              await this.callbacks.onLog('info', `Slot found: ${bestSlot.date} at ${bestSlot.time}`);
              await this.callbacks.onSlotFound(bestSlot);

              if (config.mode === 'auto') {
                await this.bookAppointment(bestSlot, applicant);
              } else {
                // Manual mode: notify and keep monitoring
                await this.callbacks.onLog('info', 'Manual mode: slot reported, awaiting user action. Continuing to monitor...');
              }
            }
          } else {
            await this.callbacks.onLog('info', 'No slots available. Waiting for next check...');
          }

          // Reset error counter on success
          this.consecutiveErrors = 0;

          // Wait before next check
          await new Promise((resolve) => setTimeout(resolve, config.refreshInterval * 1000));

          // Refresh the page for next check; recover if page crashed
          try {
            await this.getPage().reload({ waitUntil: 'networkidle' });
          } catch {
            await this.callbacks.onLog('warn', 'Page reload failed, re-launching browser...');
            await this.recoverBrowser(url, proxyConfig);
          }
        } catch (err) {
          this.consecutiveErrors++;
          const message = err instanceof Error ? err.message : 'Unknown error';
          await this.callbacks.onLog('error', `Check cycle error: ${message}`);

          // Handle blocks by rotating proxy
          if (message.includes('403') || message.includes('blocked') || message.includes('rate limit')) {
            await this.handleBlock(url);
          } else {
            // Exponential backoff on consecutive errors
            const backoff = this.getErrorBackoffMs();
            await this.callbacks.onLog('info', `Backing off for ${Math.round(backoff / 1000)}s before retry...`);
            await new Promise((resolve) => setTimeout(resolve, backoff));
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.callbacks.onLog('error', `Engine error: ${message}`);
      await this.callbacks.onBookingFailed(message);
    } finally {
      await this.browserManager.close();
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.browserManager.close();
    this.page = null;
    logger.info('Engine stopped');
  }

  private async recoverBrowser(
    url: string,
    proxyConfig?: { server: string; username?: string; password?: string }
  ): Promise<void> {
    try {
      await this.browserManager.close();
    } catch { /* ignore close errors */ }

    const context = await this.browserManager.launch({
      headless: true,
      proxy: proxyConfig,
    });
    this.page = await context.newPage();
    await this.navigateWithRetry(url);
    await this.callbacks.onLog('info', 'Browser recovered successfully');
  }

  private async navigateWithRetry(url: string, maxRetries: number = 3): Promise<void> {
    const page = this.getPage();
    for (let i = 0; i < maxRetries; i++) {
      try {
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: 30000,
        });

        // Check for captcha after navigation
        const captchaType = await this.captchaHandler.detectCaptcha(page);
        if (captchaType) {
          await this.handleCaptcha(captchaType);
        }

        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.warn(`Navigation attempt ${i + 1} failed: ${message}`);
        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * (i + 1)));
        }
      }
    }
    throw new Error(`Failed to navigate to ${url} after ${maxRetries} attempts`);
  }

  private async checkAvailability(config: BookingConfig): Promise<SlotInfo[]> {
    const page = this.getPage();
    const slots: SlotInfo[] = [];

    try {
      // Select visa category if dropdown exists
      const categorySelect = await page.$('select[id*="category"], select[name*="category"]');
      if (categorySelect) {
        await this.browserManager.addRandomDelay(300, 800);
        await categorySelect.selectOption({ label: config.visaCategory });
        await this.browserManager.addRandomDelay(500, 1500);
      }

      // Wait for calendar or slot elements to load
      await page.waitForSelector(
        '.appointment-table, .calendar-container, [class*="slot"], [class*="date-picker"], [class*="available"]',
        { timeout: 10000 }
      ).catch(() => null);

      // Try multiple selectors for available dates
      const availableDateElements = await page.$$(
        '.available-date, .date-available, td.active:not(.disabled), .appointment-date:not(.unavailable), [class*="available"]:not([class*="unavailable"])'
      );

      for (const dateEl of availableDateElements) {
        const dateText = await dateEl.textContent();
        const timeText = await dateEl.getAttribute('data-time') || '09:00';

        if (dateText) {
          slots.push({
            date: dateText.trim(),
            time: timeText.trim(),
            available: true,
          });
        }
      }

      // Alternative: check API responses intercepted during page load
      const apiSlots = await page.evaluate(() => {
        const data = (window as any).__VFS_SLOTS__;
        if (Array.isArray(data)) {
          return data.filter((s: any) => s.available).map((s: any) => ({
            date: s.date,
            time: s.time || '09:00',
            available: true,
          }));
        }
        return [];
      });

      slots.push(...apiSlots);
    } catch (err) {
      logger.error('Failed to check availability', { error: err });
    }

    return slots;
  }

  private selectBestSlot(slots: SlotInfo[], config: BookingConfig): SlotInfo | null {
    let filtered = slots.filter((s) => s.available);

    if (config.preferredDateFrom) {
      const from = new Date(config.preferredDateFrom);
      filtered = filtered.filter((s) => new Date(s.date) >= from);
    }

    if (config.preferredDateTo) {
      const to = new Date(config.preferredDateTo);
      filtered = filtered.filter((s) => new Date(s.date) <= to);
    }

    // Return earliest available
    filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return filtered[0] || null;
  }

  private async bookAppointment(slot: SlotInfo, applicant: ApplicantData): Promise<void> {
    const page = this.getPage();

    await this.callbacks.onLog('info', `Attempting to book slot: ${slot.date} at ${slot.time}`);

    try {
      // Click on the available slot
      const slotSelector = `[data-date="${slot.date}"], .available-date:has-text("${slot.date}")`;
      await this.browserManager.humanClick(page, slotSelector);
      await this.browserManager.addRandomDelay(500, 1500);

      // Wait for page to settle after click
      await page.waitForLoadState('networkidle').catch(() => null);

      // Select time if needed
      const timeSelect = await page.$('select[id*="time"], select[name*="time"]');
      if (timeSelect) {
        await timeSelect.selectOption({ label: slot.time });
        await this.browserManager.addRandomDelay(300, 800);
      }

      // Fill applicant form
      await this.fillApplicantForm(applicant);

      // Check for captcha before submission
      const captchaType = await this.captchaHandler.detectCaptcha(page);
      if (captchaType) {
        await this.handleCaptcha(captchaType);
      }

      // Submit the form
      await this.callbacks.onLog('info', 'Submitting booking form...');
      const submitButton = await page.$(
        'button[type="submit"], input[type="submit"], .submit-btn, .book-appointment-btn, [class*="submit"]'
      );

      if (submitButton) {
        await this.browserManager.addRandomDelay(200, 500);
        await submitButton.click();

        // Wait for confirmation
        await page.waitForSelector(
          '.confirmation, .success, .booking-confirmed, [class*="success"], [class*="confirm"]',
          { timeout: 15000 }
        );

        await this.callbacks.onLog('info', 'Booking confirmed!');
        await this.callbacks.onBookingSuccess();
        this.isRunning = false; // Stop monitoring after successful booking
      } else {
        throw new Error('Submit button not found');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.callbacks.onLog('error', `Booking failed: ${message}`);
      await this.callbacks.onBookingFailed(message);
    }
  }

  private async fillApplicantForm(applicant: ApplicantData): Promise<void> {
    const page = this.getPage();

    await this.callbacks.onLog('info', 'Filling applicant form...');

    const fieldMappings = [
      { selectors: ['#firstName', '#first_name', '[name*="first"]', '[name*="name"]'], value: applicant.fullName },
      { selectors: ['#passport', '#passport_number', '[name*="passport"]'], value: applicant.passportNumber },
      { selectors: ['#dob', '#dateOfBirth', '#date_of_birth', '[name*="birth"]'], value: applicant.dateOfBirth },
      { selectors: ['#passportExpiry', '#passport_expiry', '[name*="expiry"]'], value: applicant.passportExpiry },
      { selectors: ['#nationality', '[name*="national"]'], value: applicant.nationality },
      { selectors: ['#email', '[name*="email"]', '[type="email"]'], value: applicant.email },
      { selectors: ['#phone', '#telephone', '[name*="phone"]', '[type="tel"]'], value: applicant.phone },
    ];

    for (const field of fieldMappings) {
      for (const selector of field.selectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
            if (tagName === 'select') {
              await element.selectOption({ label: field.value });
            } else {
              await element.fill('');
              await this.browserManager.humanType(page, selector, field.value);
            }
            await this.browserManager.addRandomDelay(200, 600);
            break;
          }
        } catch {
          continue;
        }
      }
    }
  }

  private async handleCaptcha(type: 'recaptcha' | 'image'): Promise<void> {
    const page = this.getPage();
    await this.callbacks.onLog('info', `Captcha detected (${type}). Attempting to solve...`);

    let solution = await this.captchaHandler.solveCaptcha(page, type);

    if (!solution) {
      // Try manual callback
      solution = await this.callbacks.onCaptchaRequired(type);
    }

    if (solution) {
      await this.captchaHandler.applyCaptchaSolution(page, solution);
      await this.callbacks.onLog('info', 'Captcha solved successfully');
    } else {
      await this.callbacks.onLog('warn', 'Captcha could not be solved');
    }
  }

  private async handleBlock(url: string): Promise<void> {
    await this.callbacks.onLog('warn', 'Block detected. Rotating proxy and retrying...');
    const newProxy = await this.proxyManager.onBlockDetected();

    if (newProxy) {
      await this.browserManager.close();
      await this.browserManager.launch({
        headless: true,
        proxy: this.proxyManager.getProxyConfig(),
      });
      this.page = await this.browserManager.newPage();
      await this.navigateWithRetry(url);
    } else {
      await this.callbacks.onLog('error', 'No more proxies available. Waiting before direct retry...');
      const backoff = this.getErrorBackoffMs();
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}
