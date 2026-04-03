import type { Page } from 'playwright';
import type { InteractiveElement, PageMetadata, PageState } from '../crawler/web-crawler.js';

type ExtractedState = Omit<PageState, 'screenshotPath'>;

export async function extractPageState(page: Page): Promise<ExtractedState> {
  const [url, title, interactiveElements, metadata, accessibilityTree] = await Promise.all([
    page.url(),
    page.title(),
    extractInteractiveElements(page),
    extractMetadata(page),
    page.locator(':root').ariaSnapshot(),
  ]);

  return { url, title, interactiveElements, metadata, accessibilityTree };
}

async function extractInteractiveElements(page: Page): Promise<InteractiveElement[]> {
  // page.evaluate runs in the browser — no external types available inside
  const raw = await page.evaluate(() => {
    const SELECTORS = 'a, button, input, select, textarea, [role="button"], [onclick]';

    function getSelector(el: Element): string {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const tag = el.tagName.toLowerCase();
      const parent = el.parentElement;
      if (!parent) return tag;
      const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
      if (siblings.length <= 1) return tag;
      return `${tag}:nth-of-type(${siblings.indexOf(el) + 1})`;
    }

    return Array.from(document.querySelectorAll(SELECTORS))
      .map(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const hidden =
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.opacity === '0' ||
          rect.width === 0 ||
          rect.height === 0;

        if (hidden) return null;

        const anchor = el instanceof HTMLAnchorElement ? el.href : null;

        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') ?? el.getAttribute('aria-role') ?? null,
          text:
            el.textContent?.trim() ||
            el.getAttribute('aria-label') ||
            el.getAttribute('alt') ||
            el.getAttribute('placeholder') ||
            null,
          href: anchor ?? undefined,
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          visible: true as const,
          selector: getSelector(el),
        };
      })
      .filter((el): el is NonNullable<typeof el> => el !== null);
  });

  return raw as InteractiveElement[];
}

async function extractMetadata(page: Page): Promise<PageMetadata> {
  return page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    const viewportMeta = document.querySelector('meta[name="viewport"]');

    return {
      lang: document.documentElement.getAttribute('lang'),
      viewport: viewportMeta
        ? { width: window.innerWidth, height: window.innerHeight }
        : null,
      headingStructure: headings.map(
        h => `${h.tagName.toLowerCase()}: ${h.textContent?.trim() ?? ''}`
      ),
      formCount: document.querySelectorAll('form').length,
      linkCount: document.querySelectorAll('a[href]').length,
      imageCount: document.querySelectorAll('img').length,
    };
  });
}
