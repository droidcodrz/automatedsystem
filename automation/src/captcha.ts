import { Page } from 'playwright';
import { logger } from './logger';

export interface CaptchaConfig {
  service: 'manual' | '2captcha' | 'anticaptcha';
  apiKey?: string;
}

export class CaptchaHandler {
  private config: CaptchaConfig;

  constructor(config: CaptchaConfig) {
    this.config = config;
  }

  async detectCaptcha(page: Page): Promise<'recaptcha' | 'image' | null> {
    try {
      // Check for reCAPTCHA
      const recaptchaFrame = await page.$('iframe[src*="recaptcha"]');
      if (recaptchaFrame) {
        logger.info('reCAPTCHA detected');
        return 'recaptcha';
      }

      // Check for image captcha
      const imageCaptcha = await page.$('img[class*="captcha"], img[id*="captcha"], .captcha-image');
      if (imageCaptcha) {
        logger.info('Image captcha detected');
        return 'image';
      }

      return null;
    } catch (err) {
      logger.error('Captcha detection failed', { error: err });
      return null;
    }
  }

  async solveCaptcha(page: Page, type: 'recaptcha' | 'image'): Promise<string | null> {
    switch (this.config.service) {
      case '2captcha':
        return this.solveWith2Captcha(page, type);
      case 'anticaptcha':
        return this.solveWithAntiCaptcha(page, type);
      case 'manual':
      default:
        return this.solveManually(page, type);
    }
  }

  private async solveWith2Captcha(page: Page, type: string): Promise<string | null> {
    if (!this.config.apiKey) {
      logger.error('2Captcha API key not configured');
      return null;
    }

    try {
      if (type === 'recaptcha') {
        const siteKey = await page.evaluate(() => {
          const el = document.querySelector('.g-recaptcha');
          return el?.getAttribute('data-sitekey') || null;
        });

        if (!siteKey) {
          logger.error('Could not find reCAPTCHA site key');
          return null;
        }

        const pageUrl = page.url();

        // Submit captcha to 2Captcha
        const submitResponse = await fetch(
          `http://2captcha.com/in.php?key=${this.config.apiKey}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${pageUrl}&json=1`
        );
        const submitData = await submitResponse.json() as { status: number; request: string };

        if (submitData.status !== 1) {
          logger.error('2Captcha submit failed', { data: submitData });
          return null;
        }

        const captchaId = submitData.request;

        // Poll for result
        for (let i = 0; i < 30; i++) {
          await new Promise((resolve) => setTimeout(resolve, 5000));

          const resultResponse = await fetch(
            `http://2captcha.com/res.php?key=${this.config.apiKey}&action=get&id=${captchaId}&json=1`
          );
          const resultData = await resultResponse.json() as { status: number; request: string };

          if (resultData.status === 1) {
            logger.info('2Captcha solved successfully');
            return resultData.request;
          }

          if (resultData.request !== 'CAPCHA_NOT_READY') {
            logger.error('2Captcha error', { data: resultData });
            return null;
          }
        }

        logger.error('2Captcha timeout');
        return null;
      }

      logger.warn(`2Captcha: unsupported captcha type: ${type}`);
      return null;
    } catch (err) {
      logger.error('2Captcha solving failed', { error: err });
      return null;
    }
  }

  private async solveWithAntiCaptcha(page: Page, type: string): Promise<string | null> {
    if (!this.config.apiKey) {
      logger.error('Anti-Captcha API key not configured');
      return null;
    }

    try {
      if (type === 'recaptcha') {
        const siteKey = await page.evaluate(() => {
          const el = document.querySelector('.g-recaptcha');
          return el?.getAttribute('data-sitekey') || null;
        });

        if (!siteKey) {
          logger.error('Could not find reCAPTCHA site key');
          return null;
        }

        const pageUrl = page.url();

        const createResponse = await fetch('https://api.anti-captcha.com/createTask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientKey: this.config.apiKey,
            task: {
              type: 'RecaptchaV2TaskProxyless',
              websiteURL: pageUrl,
              websiteKey: siteKey,
            },
          }),
        });
        const createData = await createResponse.json() as { errorId: number; taskId: number };

        if (createData.errorId !== 0) {
          logger.error('Anti-Captcha create task failed', { data: createData });
          return null;
        }

        // Poll for result
        for (let i = 0; i < 30; i++) {
          await new Promise((resolve) => setTimeout(resolve, 5000));

          const resultResponse = await fetch('https://api.anti-captcha.com/getTaskResult', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientKey: this.config.apiKey,
              taskId: createData.taskId,
            }),
          });
          const resultData = await resultResponse.json() as {
            status: string;
            solution?: { gRecaptchaResponse: string };
          };

          if (resultData.status === 'ready' && resultData.solution) {
            logger.info('Anti-Captcha solved successfully');
            return resultData.solution.gRecaptchaResponse;
          }
        }

        logger.error('Anti-Captcha timeout');
        return null;
      }

      logger.warn(`Anti-Captcha: unsupported captcha type: ${type}`);
      return null;
    } catch (err) {
      logger.error('Anti-Captcha solving failed', { error: err });
      return null;
    }
  }

  private async solveManually(_page: Page, type: string): Promise<string | null> {
    logger.info(`Manual captcha solving required (type: ${type}). Waiting for user input...`);
    // In manual mode, the frontend will display a popup for the user to solve the captcha.
    // This method returns null; the engine will pause and wait for a callback with the solution.
    return null;
  }

  async applyCaptchaSolution(page: Page, solution: string): Promise<void> {
    await page.evaluate((token) => {
      const textarea = document.querySelector('#g-recaptcha-response') as HTMLTextAreaElement;
      if (textarea) {
        textarea.value = token;
        textarea.style.display = 'block';
      }
      // Trigger callback if exists
      const callback = (window as any).___grecaptcha_cfg?.clients?.[0]?.aa?.l?.callback;
      if (callback) callback(token);
    }, solution);
    logger.info('Captcha solution applied');
  }
}
