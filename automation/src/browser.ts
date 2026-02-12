import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { logger } from './logger';

export interface BrowserOptions {
  headless?: boolean;
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  userAgent?: string;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async launch(options: BrowserOptions = {}): Promise<BrowserContext> {
    const launchOptions: Record<string, unknown> = {
      headless: options.headless ?? true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
      ],
    };

    if (options.proxy) {
      launchOptions.proxy = {
        server: options.proxy.server,
        username: options.proxy.username,
        password: options.proxy.password,
      };
    }

    this.browser = await chromium.launch(launchOptions);

    const userAgent = options.userAgent || USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    this.context = await this.browser.newContext({
      userAgent,
      viewport: { width: 1920, height: 1080 },
      locale: 'pt-AO',
      timezoneId: 'Africa/Luanda',
      geolocation: { latitude: -8.839988, longitude: 13.289437 },
      permissions: ['geolocation'],
    });

    // Add human-like behavior scripts
    await this.context.addInitScript(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // Override chrome detection
      (window as any).chrome = { runtime: {} };

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: 'denied' } as PermissionStatus)
          : originalQuery(parameters);

      // Override plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['pt', 'pt-BR', 'en-US', 'en'],
      });
    });

    logger.info('Browser launched successfully');
    return this.context;
  }

  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser context not initialized. Call launch() first.');
    }
    return this.context.newPage();
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info('Browser closed');
  }

  async addRandomDelay(minMs: number = 500, maxMs: number = 2000): Promise<void> {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async humanType(page: Page, selector: string, text: string): Promise<void> {
    await page.click(selector);
    await this.addRandomDelay(200, 500);
    for (const char of text) {
      await page.keyboard.type(char, { delay: Math.floor(Math.random() * 100) + 30 });
    }
  }

  async humanClick(page: Page, selector: string): Promise<void> {
    const element = page.locator(selector);
    await element.scrollIntoViewIfNeeded();
    await this.addRandomDelay(200, 800);
    await element.click();
  }
}
