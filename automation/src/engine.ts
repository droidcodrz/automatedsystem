import { Page, Response } from 'playwright';
import { BrowserManager } from './browser';
import { CaptchaHandler, CaptchaConfig } from './captcha';
import { ProxyManager, ProxyEntry } from './proxy';
import { logger } from './logger';

// ─── Data Interfaces ───────────────────────────────────────────────

export interface VFSCredentials {
  email: string;
  password: string;
}

export interface ApplicantData {
  fullName: string;
  passportNumber: string;
  dateOfBirth: string;   // DD/MM/YYYY
  passportExpiry: string; // DD/MM/YYYY
  nationality: string;
  email: string;
  phone: string;
}

export interface BookingConfig {
  originCountry: string;       // "Angola"
  destCountry: string;         // "Brazil" | "Portugal"
  visaCategory: string;        // e.g. "Tourist"
  visaSubCategory?: string;    // e.g. "Short Stay"
  visaCenter?: string;         // e.g. "Luanda"
  refreshInterval: number;     // seconds (5-60)
  preferredDateFrom?: string;
  preferredDateTo?: string;
  mode: 'auto' | 'manual';
}

export interface SlotInfo {
  date: string;
  time: string;
  available: boolean;
  raw?: string;
}

export interface EngineCallbacks {
  onSlotFound: (slot: SlotInfo) => Promise<void>;
  onBookingSuccess: () => Promise<void>;
  onBookingFailed: (error: string) => Promise<void>;
  onCaptchaRequired: (type: string) => Promise<string | null>;
  onLog: (level: string, message: string) => Promise<void>;
  onManualActionRequired?: (action: string, details: string) => Promise<void>;
}

// ─── VFS URL Builder ───────────────────────────────────────────────
// Pattern: https://visa.vfsglobal.com/{origin-code}/{lang}/{dest-code}/login
// Angola = "ago", Brazil = "bra", Portugal = "prt"

const COUNTRY_CODES: Record<string, string> = {
  Angola: 'ago',
  Brazil: 'bra',
  Portugal: 'prt',
};

function buildVFSUrl(origin: string, dest: string, path: string): string {
  const originCode = COUNTRY_CODES[origin] || origin.toLowerCase().slice(0, 3);
  const destCode = COUNTRY_CODES[dest] || dest.toLowerCase().slice(0, 3);
  return `https://visa.vfsglobal.com/${originCode}/en/${destCode}/${path}`;
}

// ─── Angular Material Selectors ────────────────────────────────────
// VFS Global uses Angular Material. These are the real selectors.

const SEL = {
  // Cookie banner
  cookieRejectBtn: 'button:has-text("Reject All"), button:has-text("Reject")',
  cookieAcceptBtn: 'button:has-text("Accept All"), button:has-text("Accept")',

  // Login page
  emailInput: '#mat-input-0',
  passwordInput: '#mat-input-1',
  signInBtn: 'button:has-text("Sign In"), button:has-text("Log In"), button:has-text("Submit")',
  otpInput: '#mat-input-2',
  verifyOtpBtn: 'button:has-text("Verify")',

  // Post-login
  newBookingBtn: 'button:has-text("Start New Booking"), a:has-text("Start New Booking"), button:has-text("New Booking")',
  bookAppointmentSection: 'section:has-text("Book Appointment"), div:has-text("Schedule Appointment")',

  // Dropdowns (Angular Material)
  matFormField: 'mat-form-field',
  matOption: 'mat-option',
  matSelect: 'mat-select',

  // Appointment alerts & calendar
  appointmentAlert: 'div.alert',
  calendarDate: '.mat-calendar-body-cell:not(.mat-calendar-body-disabled)',
  noAppointmentMsg: 'div:has-text("No appointment"), div:has-text("no open"), div:has-text("Currently no date")',

  // Time slots
  timeSlotOption: '.time-slot, mat-radio-button, .slot-option',

  // Form fields (booking form)
  formField: 'mat-form-field',
  submitBtn: 'button:has-text("Submit"), button:has-text("Book"), button:has-text("Confirm")',
  continueBtn: 'button:has-text("Continue"), button:has-text("Next"), button:has-text("Proceed")',

  // Confirmation
  confirmationMsg: '.confirmation, .success, div:has-text("confirmed"), div:has-text("successfully")',

  // Captcha
  recaptchaFrame: 'iframe[src*="recaptcha"]',
  captchaImage: 'img[class*="captcha"], .captcha-image',
};

// ─── Intercepted API Data ──────────────────────────────────────────

interface InterceptedSlotData {
  dates: string[];
  raw: unknown;
  timestamp: number;
}

// ─── Main Engine ───────────────────────────────────────────────────

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
  private interceptedSlots: InterceptedSlotData | null = null;

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
    return Math.min(
      MIN_ERROR_BACKOFF_MS * Math.pow(2, this.consecutiveErrors),
      MAX_ERROR_BACKOFF_MS
    );
  }

  // ─── Network Interceptor ──────────────────────────────────────

  private setupNetworkInterceptor(): void {
    const page = this.getPage();

    // Intercept XHR/fetch responses for slot/appointment data
    page.on('response', async (response: Response) => {
      const url = response.url();

      // VFS internal APIs often contain these patterns
      if (
        url.includes('/appointment/') ||
        url.includes('/slot') ||
        url.includes('/calendar') ||
        url.includes('/schedule') ||
        url.includes('/availability')
      ) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const data = await response.json();
            logger.info(`Intercepted VFS API: ${url}`, { data });

            // Extract dates from response
            const dates = this.extractDatesFromResponse(data);
            if (dates.length > 0) {
              this.interceptedSlots = {
                dates,
                raw: data,
                timestamp: Date.now(),
              };
              await this.callbacks.onLog('info', `Network interceptor: found ${dates.length} dates in API response`);
            }
          }
        } catch {
          // Response may not be JSON — ignore
        }
      }
    });

    logger.info('Network interceptor active');
  }

  private extractDatesFromResponse(data: unknown): string[] {
    const dates: string[] = [];

    if (Array.isArray(data)) {
      for (const item of data) {
        if (typeof item === 'string' && item.match(/\d{2}[\/-]\d{2}[\/-]\d{4}/)) {
          dates.push(item);
        }
        if (typeof item === 'object' && item !== null) {
          const obj = item as Record<string, unknown>;
          for (const key of ['date', 'appointmentDate', 'slotDate', 'availableDate']) {
            if (typeof obj[key] === 'string') {
              dates.push(obj[key] as string);
            }
          }
        }
      }
    } else if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      // Recursively search common patterns
      for (const key of Object.keys(obj)) {
        if (Array.isArray(obj[key])) {
          dates.push(...this.extractDatesFromResponse(obj[key]));
        }
        if (typeof obj[key] === 'string' && (obj[key] as string).match(/\d{2}[\/-]\d{2}[\/-]\d{4}/)) {
          dates.push(obj[key] as string);
        }
      }
    }

    return dates;
  }

  // ─── Login Flow ───────────────────────────────────────────────

  async login(credentials: VFSCredentials, config: BookingConfig): Promise<void> {
    const page = this.getPage();
    const loginUrl = buildVFSUrl(config.originCountry, config.destCountry, 'login');

    await this.callbacks.onLog('info', `Navigating to VFS login: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 45000 });

    // Handle cookie banner
    await this.dismissCookieBanner();

    // Wait for login form to appear
    await page.waitForSelector(SEL.emailInput, { timeout: 15000 }).catch(() => null);

    // Check for Cloudflare challenge
    const isChallenged = await page.$('div#challenge-running, div.cf-browser-verification');
    if (isChallenged) {
      await this.callbacks.onLog('info', 'Cloudflare challenge detected, waiting...');
      await page.waitForSelector(SEL.emailInput, { timeout: 30000 });
    }

    // Check for captcha before login
    const captchaType = await this.captchaHandler.detectCaptcha(page);
    if (captchaType) {
      await this.handleCaptcha(captchaType);
    }

    // Fill login form
    await this.callbacks.onLog('info', 'Filling login credentials...');
    await this.browserManager.addRandomDelay(500, 1000);

    await page.fill(SEL.emailInput, '');
    await this.browserManager.humanType(page, SEL.emailInput, credentials.email);
    await this.browserManager.addRandomDelay(300, 700);

    await page.fill(SEL.passwordInput, '');
    await this.browserManager.humanType(page, SEL.passwordInput, credentials.password);
    await this.browserManager.addRandomDelay(500, 1000);

    // Click Sign In
    await this.browserManager.humanClick(page, SEL.signInBtn);

    // Wait for either: OTP page, dashboard, or error
    await this.callbacks.onLog('info', 'Waiting for login response...');

    const result = await Promise.race([
      page.waitForSelector(SEL.newBookingBtn, { timeout: 30000 }).then(() => 'dashboard'),
      page.waitForSelector(SEL.otpInput, { timeout: 30000 }).then(() => 'otp'),
      page.waitForSelector('div.error, mat-error, .alert-danger', { timeout: 30000 }).then(() => 'error'),
    ]).catch(() => 'timeout');

    if (result === 'otp') {
      await this.callbacks.onLog('info', 'OTP required. Waiting for user to provide OTP...');
      if (this.callbacks.onManualActionRequired) {
        await this.callbacks.onManualActionRequired('otp', 'Enter the OTP sent to your email/phone');
      }
      // Wait for OTP page to be completed (user fills it or external trigger)
      await page.waitForSelector(SEL.newBookingBtn, { timeout: 120000 });
    } else if (result === 'error') {
      const errorText = await page.textContent('div.error, mat-error, .alert-danger') || 'Unknown error';
      throw new Error(`Login failed: ${errorText.trim()}`);
    } else if (result === 'timeout') {
      throw new Error('Login timed out — check credentials or try again');
    }

    await this.callbacks.onLog('info', 'Login successful!');
  }

  // ─── Cookie Banner ────────────────────────────────────────────

  private async dismissCookieBanner(): Promise<void> {
    const page = this.getPage();
    try {
      const rejectBtn = await page.$(SEL.cookieRejectBtn);
      if (rejectBtn) {
        await rejectBtn.click();
        await this.browserManager.addRandomDelay(300, 600);
        return;
      }
      const acceptBtn = await page.$(SEL.cookieAcceptBtn);
      if (acceptBtn) {
        await acceptBtn.click();
        await this.browserManager.addRandomDelay(300, 600);
      }
    } catch {
      // No cookie banner — continue
    }
  }

  // ─── Start New Booking ────────────────────────────────────────

  private async startNewBooking(): Promise<void> {
    const page = this.getPage();

    await this.callbacks.onLog('info', 'Clicking "Start New Booking"...');
    await this.browserManager.humanClick(page, SEL.newBookingBtn);
    await this.browserManager.addRandomDelay(1000, 2000);

    // Wait for the booking form to load
    await page.waitForSelector(SEL.matFormField, { timeout: 15000 });
  }

  // ─── Dropdown Selection (Angular Material) ────────────────────

  private async selectMatDropdown(index: number, optionText: string): Promise<void> {
    const page = this.getPage();

    // Find the nth mat-form-field (0-indexed)
    const dropdowns = await page.$$(SEL.matFormField);
    if (index >= dropdowns.length) {
      await this.callbacks.onLog('warn', `Dropdown index ${index} not found (only ${dropdowns.length} dropdowns)`);
      return;
    }

    const dropdown = dropdowns[index];

    // Click to open dropdown
    await dropdown.click();
    await this.browserManager.addRandomDelay(500, 1000);

    // Wait for options panel to appear
    await page.waitForSelector(SEL.matOption, { timeout: 5000 });
    await this.browserManager.addRandomDelay(200, 500);

    // Find matching option
    const options = await page.$$(SEL.matOption);
    let matched = false;

    for (const option of options) {
      const text = await option.textContent();
      if (text && text.trim().toLowerCase().includes(optionText.toLowerCase())) {
        await option.click();
        matched = true;
        await this.callbacks.onLog('info', `Selected: "${text.trim()}" from dropdown ${index}`);
        break;
      }
    }

    if (!matched) {
      // If exact match not found, select first available option
      if (options.length > 0) {
        const firstText = await options[0].textContent();
        await options[0].click();
        await this.callbacks.onLog('warn', `"${optionText}" not found, selected first option: "${firstText?.trim()}"`);
      }
    }

    await this.browserManager.addRandomDelay(500, 1500);
  }

  // ─── Check Slot Availability ──────────────────────────────────

  private async checkAvailability(config: BookingConfig): Promise<SlotInfo[]> {
    const page = this.getPage();
    const slots: SlotInfo[] = [];

    // Reset intercepted data
    this.interceptedSlots = null;

    try {
      // Select visa center (dropdown 0)
      if (config.visaCenter) {
        await this.selectMatDropdown(0, config.visaCenter);
      }

      // Select visa category (dropdown 1 or 0)
      const categoryIdx = config.visaCenter ? 1 : 0;
      await this.selectMatDropdown(categoryIdx, config.visaCategory);

      // Select visa sub-category if provided (next dropdown)
      if (config.visaSubCategory) {
        await this.selectMatDropdown(categoryIdx + 1, config.visaSubCategory);
      }

      // Wait for appointment data to load
      await this.browserManager.addRandomDelay(2000, 4000);

      // Method 1: Check intercepted network data (fastest)
      if (this.interceptedSlots && this.interceptedSlots.dates.length > 0) {
        for (const date of this.interceptedSlots.dates) {
          slots.push({
            date,
            time: '09:00',
            available: true,
            raw: date,
          });
        }
        await this.callbacks.onLog('info', `Network interceptor found ${slots.length} slot(s)`);
        return slots;
      }

      // Method 2: Check DOM for "no appointment" message
      const noSlotMsg = await page.$(SEL.noAppointmentMsg);
      if (noSlotMsg) {
        const msgText = await noSlotMsg.textContent();
        await this.callbacks.onLog('info', `No slots: ${msgText?.trim()}`);
        return [];
      }

      // Method 3: Parse alert elements (VFS pattern: div.alert shows dates)
      const alertElements = await page.$$(SEL.appointmentAlert);
      for (const alertEl of alertElements) {
        const text = await alertEl.textContent();
        if (text) {
          // Extract dates from alert text (common format: DD/MM/YYYY or DD-MM-YYYY)
          const dateMatches = text.match(/\d{2}[\/-]\d{2}[\/-]\d{4}/g);
          if (dateMatches) {
            for (const dateStr of dateMatches) {
              slots.push({
                date: dateStr,
                time: '09:00',
                available: true,
                raw: text.trim(),
              });
            }
          }
        }
      }

      // Method 4: Check calendar cells
      const calendarCells = await page.$$(SEL.calendarDate);
      for (const cell of calendarCells) {
        const dateText = await cell.textContent();
        const ariaLabel = await cell.getAttribute('aria-label');
        if (dateText) {
          slots.push({
            date: ariaLabel || dateText.trim(),
            time: '09:00',
            available: true,
          });
        }
      }

      if (slots.length > 0) {
        await this.callbacks.onLog('info', `DOM parsing found ${slots.length} slot(s)`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Availability check failed', { error: message });
    }

    return slots;
  }

  // ─── Slot Filtering ───────────────────────────────────────────

  private selectBestSlot(slots: SlotInfo[], config: BookingConfig): SlotInfo | null {
    let filtered = slots.filter((s) => s.available);

    if (config.preferredDateFrom) {
      const from = new Date(config.preferredDateFrom);
      filtered = filtered.filter((s) => {
        const d = this.parseDate(s.date);
        return d ? d >= from : true;
      });
    }

    if (config.preferredDateTo) {
      const to = new Date(config.preferredDateTo);
      filtered = filtered.filter((s) => {
        const d = this.parseDate(s.date);
        return d ? d <= to : true;
      });
    }

    // Return earliest available
    filtered.sort((a, b) => {
      const da = this.parseDate(a.date);
      const db = this.parseDate(b.date);
      if (!da || !db) return 0;
      return da.getTime() - db.getTime();
    });

    return filtered[0] || null;
  }

  private parseDate(dateStr: string): Date | null {
    // Handle DD/MM/YYYY and DD-MM-YYYY
    const parts = dateStr.split(/[\/-]/);
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (year > 100) {
        return new Date(year, month - 1, day);
      }
    }
    // Fallback to native parser
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  // ─── Book Appointment ─────────────────────────────────────────

  private async bookAppointment(slot: SlotInfo, applicant: ApplicantData): Promise<void> {
    const page = this.getPage();

    await this.callbacks.onLog('info', `Booking slot: ${slot.date} at ${slot.time}`);

    try {
      // Click on the date in calendar if calendar is present
      const calendarCells = await page.$$(SEL.calendarDate);
      for (const cell of calendarCells) {
        const text = await cell.textContent();
        const ariaLabel = await cell.getAttribute('aria-label');
        if (
          (text && text.trim() === slot.date) ||
          (ariaLabel && ariaLabel.includes(slot.date))
        ) {
          await cell.click();
          await this.browserManager.addRandomDelay(500, 1000);
          break;
        }
      }

      // Wait for page to settle
      await page.waitForLoadState('networkidle').catch(() => null);
      await this.browserManager.addRandomDelay(500, 1500);

      // Select time slot if available
      const timeSlots = await page.$$(SEL.timeSlotOption);
      if (timeSlots.length > 0) {
        await timeSlots[0].click(); // Select first available time
        await this.browserManager.addRandomDelay(300, 800);
      }

      // Click Continue/Next if present
      const continueBtn = await page.$(SEL.continueBtn);
      if (continueBtn) {
        await continueBtn.click();
        await this.browserManager.addRandomDelay(1000, 2000);
        await page.waitForLoadState('networkidle').catch(() => null);
      }

      // Fill applicant form
      await this.fillApplicantForm(applicant);

      // Check for captcha before submission
      const captchaType = await this.captchaHandler.detectCaptcha(page);
      if (captchaType) {
        await this.handleCaptcha(captchaType);
      }

      // Submit
      await this.callbacks.onLog('info', 'Submitting booking...');
      const submitBtn = await page.$(SEL.submitBtn);
      if (submitBtn) {
        await this.browserManager.addRandomDelay(200, 500);
        await submitBtn.click();

        // Wait for confirmation
        await page.waitForSelector(SEL.confirmationMsg, { timeout: 20000 });

        await this.callbacks.onLog('info', 'Appointment booked successfully!');
        await this.callbacks.onBookingSuccess();
        this.isRunning = false;
      } else {
        throw new Error('Submit button not found on booking form');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.callbacks.onLog('error', `Booking failed: ${message}`);
      await this.callbacks.onBookingFailed(message);
    }
  }

  // ─── Fill Applicant Form ──────────────────────────────────────

  private async fillApplicantForm(applicant: ApplicantData): Promise<void> {
    const page = this.getPage();

    await this.callbacks.onLog('info', 'Filling applicant details...');

    // VFS forms use mat-input elements. Find all visible inputs and match by labels.
    const formFields = await page.$$('mat-form-field');

    for (const field of formFields) {
      const label = await field.textContent();
      if (!label) continue;
      const labelLower = label.toLowerCase();

      const input = await field.$('input, textarea');
      if (!input) continue;

      try {
        if (labelLower.includes('first name') || labelLower.includes('full name') || labelLower.includes('applicant name')) {
          await input.fill('');
          await input.type(applicant.fullName, { delay: 50 });
        } else if (labelLower.includes('passport') && !labelLower.includes('expir')) {
          await input.fill('');
          await input.type(applicant.passportNumber, { delay: 50 });
        } else if (labelLower.includes('date of birth') || labelLower.includes('birth date') || labelLower.includes('dob')) {
          await input.fill('');
          await input.type(applicant.dateOfBirth, { delay: 50 });
        } else if (labelLower.includes('expir')) {
          await input.fill('');
          await input.type(applicant.passportExpiry, { delay: 50 });
        } else if (labelLower.includes('email')) {
          await input.fill('');
          await input.type(applicant.email, { delay: 50 });
        } else if (labelLower.includes('phone') || labelLower.includes('mobile') || labelLower.includes('contact')) {
          await input.fill('');
          await input.type(applicant.phone, { delay: 50 });
        } else if (labelLower.includes('national')) {
          await input.fill('');
          await input.type(applicant.nationality, { delay: 50 });
        }

        await this.browserManager.addRandomDelay(100, 300);
      } catch {
        continue; // Field might be hidden or readonly
      }
    }

    // Also try native selectors as fallback
    const nativeMappings = [
      { sel: '[formcontrolname*="name"], [formcontrolname*="Name"]', val: applicant.fullName },
      { sel: '[formcontrolname*="passport"], [formcontrolname*="Passport"]', val: applicant.passportNumber },
      { sel: '[formcontrolname*="email"], [formcontrolname*="Email"]', val: applicant.email },
      { sel: '[formcontrolname*="phone"], [formcontrolname*="Phone"], [formcontrolname*="mobile"]', val: applicant.phone },
    ];

    for (const mapping of nativeMappings) {
      try {
        const el = await page.$(mapping.sel);
        if (el) {
          const currentVal = await el.inputValue().catch(() => '');
          if (!currentVal) {
            await el.fill('');
            await el.type(mapping.val, { delay: 50 });
          }
        }
      } catch {
        continue;
      }
    }
  }

  // ─── Captcha Handling ─────────────────────────────────────────

  private async handleCaptcha(type: 'recaptcha' | 'image'): Promise<void> {
    const page = this.getPage();
    await this.callbacks.onLog('info', `Captcha detected (${type}). Solving...`);

    let solution = await this.captchaHandler.solveCaptcha(page, type);

    if (!solution) {
      solution = await this.callbacks.onCaptchaRequired(type);
    }

    if (solution) {
      await this.captchaHandler.applyCaptchaSolution(page, solution);
      await this.callbacks.onLog('info', 'Captcha solved');
    } else {
      await this.callbacks.onLog('warn', 'Captcha not solved — may need manual intervention');
    }
  }

  // ─── Block / Proxy Handling ───────────────────────────────────

  private async handleBlock(loginUrl: string): Promise<void> {
    await this.callbacks.onLog('warn', 'Block detected. Rotating proxy...');
    const newProxy = await this.proxyManager.onBlockDetected();

    if (newProxy) {
      await this.browserManager.close();
      await this.browserManager.launch({
        headless: true,
        proxy: this.proxyManager.getProxyConfig(),
      });
      this.page = await this.browserManager.newPage();
      this.setupNetworkInterceptor();
      await this.page.goto(loginUrl, { waitUntil: 'networkidle', timeout: 45000 });
    } else {
      await this.callbacks.onLog('error', 'No more proxies. Backing off...');
      const backoff = this.getErrorBackoffMs();
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  private async recoverBrowser(
    url: string,
    proxyConfig?: { server: string; username?: string; password?: string }
  ): Promise<void> {
    try {
      await this.browserManager.close();
    } catch { /* ignore */ }

    const context = await this.browserManager.launch({
      headless: true,
      proxy: proxyConfig,
    });
    this.page = await context.newPage();
    this.setupNetworkInterceptor();
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await this.callbacks.onLog('info', 'Browser recovered');
  }

  // ─── Main Entry Point ─────────────────────────────────────────

  async start(
    credentials: VFSCredentials,
    config: BookingConfig,
    applicant: ApplicantData
  ): Promise<void> {
    this.isRunning = true;
    this.consecutiveErrors = 0;
    const proxyConfig = this.proxyManager.getProxyConfig();

    try {
      // 1. Launch browser
      await this.callbacks.onLog('info', 'Launching browser with stealth mode...');
      const context = await this.browserManager.launch({
        headless: true,
        proxy: proxyConfig,
      });

      this.page = await context.newPage();

      // 2. Setup network interceptor (catches internal VFS API calls)
      this.setupNetworkInterceptor();

      // 3. Login to VFS
      await this.login(credentials, config);

      // 4. Navigate to booking
      await this.startNewBooking();

      const loginUrl = buildVFSUrl(config.originCountry, config.destCountry, 'login');

      // 5. Monitoring loop
      while (this.isRunning) {
        try {
          await this.callbacks.onLog('info', 'Checking appointment availability...');

          const slots = await this.checkAvailability(config);

          if (slots.length > 0) {
            const bestSlot = this.selectBestSlot(slots, config);
            if (bestSlot) {
              await this.callbacks.onLog('info', `SLOT FOUND: ${bestSlot.date} at ${bestSlot.time}`);
              await this.callbacks.onSlotFound(bestSlot);

              if (config.mode === 'auto') {
                await this.bookAppointment(bestSlot, applicant);
              } else {
                await this.callbacks.onLog('info', 'Manual mode: slot reported. Continuing to monitor...');
              }
            }
          } else {
            await this.callbacks.onLog('info', 'No slots available.');
          }

          // Reset error counter
          this.consecutiveErrors = 0;

          // Wait before next check
          await new Promise((resolve) => setTimeout(resolve, config.refreshInterval * 1000));

          // Refresh — go back to booking page for fresh check
          try {
            await this.getPage().reload({ waitUntil: 'networkidle' });
            await this.browserManager.addRandomDelay(1000, 2000);
          } catch {
            await this.callbacks.onLog('warn', 'Page reload failed, recovering...');
            await this.recoverBrowser(loginUrl, proxyConfig);
            await this.login(credentials, config);
            await this.startNewBooking();
          }
        } catch (err) {
          this.consecutiveErrors++;
          const message = err instanceof Error ? err.message : 'Unknown error';
          await this.callbacks.onLog('error', `Check error: ${message}`);

          if (message.includes('403') || message.includes('blocked') || message.includes('rate limit')) {
            await this.handleBlock(loginUrl);
          } else {
            const backoff = this.getErrorBackoffMs();
            await this.callbacks.onLog('info', `Backoff: ${Math.round(backoff / 1000)}s`);
            await new Promise((resolve) => setTimeout(resolve, backoff));
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.callbacks.onLog('error', `Engine fatal: ${message}`);
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
}
