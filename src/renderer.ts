import * as puppeteer from 'puppeteer';
import * as url from 'url';

import { Config } from './config';

type SerializedResponse = {
  status: number;
  content: string;
};

type ViewportDimensions = {
  width: number;
  height: number;
};

const MOBILE_USERAGENT =
  'Mozilla/5.0 (Linux; Android 8.0.0; Pixel 2 XL Build/OPD1.170816.004) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.75 Mobile Safari/537.36';

/**
 * Renderer class handles rendering and serialization of web pages using Puppeteer.
 */
export class Renderer {
  private browser: puppeteer.Browser;
  private config: Config;

  constructor(browser: puppeteer.Browser, config: Config) {
    this.browser = browser;
    this.config = config;
  }

  async serialize(requestUrl: string, isMobile: boolean): Promise<SerializedResponse> {
    const page = await this.browser.newPage();

    // Set viewport dimensions and user agent based on the device type
    await page.setViewport({
      width: this.config.width,
      height: this.config.height,
      isMobile,
    });

    if (isMobile) {
      page.setUserAgent(MOBILE_USERAGENT);
    }

    let response: puppeteer.Response | null = null;

    // Capture the main frame response
    page.on('response', (r) => {
      if (!response) {
        response = r;
      }
    });

    try {
      // Navigate to the page and wait until no network requests are pending
      response = await page.goto(requestUrl, {
        timeout: this.config.timeout,
        waitUntil: 'networkidle0',
      });
    } catch (e) {
      console.error('Error navigating to page:', e);
    }

    if (!response) {
      console.error('No response received for the requested URL');
      await page.close();
      return { status: 400, content: '' };
    }

    // Handle status codes and allow for potential meta tag overrides
    let statusCode = response.status();
    const newStatusCode = await page
      .$eval('meta[name="render:status_code"]', (element) => parseInt(element.getAttribute('content') || '', 10))
      .catch(() => undefined);

    if (statusCode === 304) {
      statusCode = 200; // Treat 304 Not Modified as 200 OK
    }

    if (statusCode === 200 && newStatusCode) {
      statusCode = newStatusCode;
    }

    // Serialize the entire page content
    const result = await page.evaluate(() => document.documentElement.outerHTML);

    await page.close();
    return { status: statusCode, content: result };
  }

  async screenshot(
    requestUrl: string,
    isMobile: boolean,
    dimensions: ViewportDimensions,
    options?: object
  ): Promise<Buffer> {
    const page = await this.browser.newPage();

    // Set viewport dimensions and user agent based on the device type
    await page.setViewport({
      width: dimensions.width,
      height: dimensions.height,
      isMobile,
    });

    if (isMobile) {
      page.setUserAgent(MOBILE_USERAGENT);
    }

    let response: puppeteer.Response | null = null;

    try {
      // Navigate to the page and wait until no network requests are pending
      response = await page.goto(requestUrl, {
        timeout: 10000,
        waitUntil: 'networkidle0',
      });
    } catch (e) {
      console.error('Error navigating to page for screenshot:', e);
    }

    if (!response) {
      throw new ScreenshotError('NoResponse');
    }

    const screenshotOptions = {
      ...options,
      type: 'jpeg',
      encoding: 'binary',
    };

    // Capture and return the screenshot as a buffer
    const buffer = (await page.screenshot(screenshotOptions)) as Buffer;
    await page.close();
    return buffer;
  }
}

type ErrorType = 'Forbidden' | 'NoResponse';

export class ScreenshotError extends Error {
  type: ErrorType;

  constructor(type: ErrorType) {
    super(type);
    this.name = this.constructor.name;
    this.type = type;
  }
}
