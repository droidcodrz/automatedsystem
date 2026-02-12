import { logger } from './logger';

export interface ProxyEntry {
  id: string;
  url: string;
  username?: string;
  password?: string;
  country?: string;
  failCount: number;
}

export class ProxyManager {
  private proxies: ProxyEntry[] = [];
  private currentIndex: number = 0;
  private maxFailCount: number = 3;

  loadProxies(proxies: ProxyEntry[]): void {
    this.proxies = proxies.filter((p) => p.failCount < this.maxFailCount);
    this.currentIndex = 0;
    logger.info(`Loaded ${this.proxies.length} active proxies`);
  }

  getCurrentProxy(): ProxyEntry | null {
    if (this.proxies.length === 0) return null;
    return this.proxies[this.currentIndex];
  }

  getProxyConfig(): { server: string; username?: string; password?: string } | undefined {
    const proxy = this.getCurrentProxy();
    if (!proxy) return undefined;

    return {
      server: proxy.url,
      username: proxy.username,
      password: proxy.password,
    };
  }

  rotate(): ProxyEntry | null {
    if (this.proxies.length === 0) return null;
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    const proxy = this.proxies[this.currentIndex];
    logger.info(`Rotated to proxy: ${proxy.url} (${proxy.country || 'unknown'})`);
    return proxy;
  }

  markFailed(proxyId: string): void {
    const proxyIndex = this.proxies.findIndex((p) => p.id === proxyId);
    if (proxyIndex === -1) return;

    const proxy = this.proxies[proxyIndex];
    proxy.failCount++;
    logger.warn(`Proxy ${proxy.url} fail count: ${proxy.failCount}`);

    if (proxy.failCount >= this.maxFailCount) {
      this.proxies.splice(proxyIndex, 1);
      logger.warn(`Proxy ${proxy.url} removed due to too many failures`);

      if (this.proxies.length === 0) {
        this.currentIndex = 0;
      } else if (this.currentIndex >= this.proxies.length) {
        this.currentIndex = 0;
      } else if (proxyIndex < this.currentIndex) {
        // Adjust index when a proxy before current was removed
        this.currentIndex--;
      }
    }
  }

  isBlockDetected(statusCode: number, body?: string): boolean {
    if (statusCode === 403 || statusCode === 429) return true;
    if (body && (body.includes('blocked') || body.includes('rate limit') || body.includes('too many requests'))) {
      return true;
    }
    return false;
  }

  async onBlockDetected(): Promise<ProxyEntry | null> {
    logger.warn('Block detected, rotating proxy...');
    const current = this.getCurrentProxy();
    if (current) {
      this.markFailed(current.id);
    }
    return this.rotate();
  }
}
