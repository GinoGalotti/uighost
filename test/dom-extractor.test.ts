import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { extractPageState } from '../src/extractor/dom-extractor.js';

test('extractPageState: returns all required fields for example.com', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://example.com', { waitUntil: 'networkidle', timeout: 30_000 });
    const state = await extractPageState(page);

    // URL + title
    assert.ok(state.url.includes('example.com'), `url should include example.com, got: ${state.url}`);
    assert.ok(state.title.length > 0, 'title should be non-empty');

    // Interactive elements
    assert.ok(Array.isArray(state.interactiveElements), 'interactiveElements should be an array');
    for (const el of state.interactiveElements) {
      assert.ok(typeof el.tag === 'string', 'element.tag should be a string');
      assert.ok(typeof el.selector === 'string', 'element.selector should be a string');
      assert.ok(el.visible === true, 'filtered elements should all be visible');
      assert.ok(el.boundingBox.width > 0 && el.boundingBox.height > 0, 'visible elements should have dimensions');
    }

    // Metadata
    assert.ok(Array.isArray(state.metadata.headingStructure), 'headingStructure should be an array');
    assert.ok(typeof state.metadata.linkCount === 'number', 'linkCount should be a number');
    assert.ok(typeof state.metadata.formCount === 'number', 'formCount should be a number');
    assert.ok(typeof state.metadata.imageCount === 'number', 'imageCount should be a number');

    // Accessibility tree
    assert.ok(state.accessibilityTree !== null, 'accessibilityTree should not be null');

    // example.com specifics — at least one link to iana.org
    const links = state.interactiveElements.filter(el => el.tag === 'a');
    assert.ok(links.length > 0, 'example.com should have at least one link');
  } finally {
    await page.close();
    await browser.close();
  }
});
