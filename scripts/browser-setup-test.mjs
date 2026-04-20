#!/usr/bin/env node
/**
 * Browser automation: Setup flow + AI Settings verification
 * Run: node scripts/browser-setup-test.mjs
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 1. Setup page
    await page.goto(`${BASE}/setup`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000); // Allow step to resolve

    const alreadyDone = await page.locator("text=Already Configured").count() > 0;
    const hasForm = await page.locator('input[type="text"][placeholder="admin"]').count() > 0;

    if (alreadyDone) {
      console.log("Setup page: Already Configured - going to login");
      await page.click("text=Go to Sign In");
      await page.waitForURL(/\/login/);
      await page.fill('input[name="username"], input[type="text"]', "admin");
      await page.fill('input[type="password"]', "admin123");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
    } else if (hasForm) {
      console.log("Setup page: Filling form");
      await page.fill('input[placeholder="admin"]', "admin");
      await page.fill('input[type="password"]', "admin123");
      await page.click('button[type="submit"]');
      await page.waitForTimeout(4000); // Creating + redirect
    }

    // Navigate to settings
    await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Click AI Settings tab
    await page.click('button:has-text("AI Settings")');
    await page.waitForTimeout(1500);

    // Capture AI Settings structure
    const aiContent = await page.locator('[class*="max-w-lg"]').first().innerHTML().catch(() => "");
    const providerButtons = await page.locator('button:has-text("OpenAI"), button:has-text("Anthropic")').allTextContents();
    const modelLabels = await page.locator('button:has([class*="rounded-full"])').allTextContents();
    const hasOpenAIKey = await page.locator('text=OpenAI API Key').count() > 0;
    const hasAnthropicKey = await page.locator('text=Anthropic API Key').count() > 0;
    const hasModelSelector = await page.locator('text=Article Summarization Model').count() > 0;
    const hasDigestModel = await page.locator('text=Digest Model').count() > 0;

    // Screenshot
    await page.screenshot({ path: "/home/0xhav0c/OhMyRSS/ai-settings-screenshot.png", fullPage: true });
    console.log("\n=== AI SETTINGS LAYOUT ===\n");
    console.log("Provider buttons visible:", providerButtons);
    console.log("OpenAI API Key input:", hasOpenAIKey);
    console.log("Anthropic API Key input:", hasAnthropicKey);
    console.log("Article Summarization Model selector:", hasModelSelector);
    console.log("Digest Model selector:", hasDigestModel);
    console.log("Model options (sample):", modelLabels.slice(0, 8));

    // Setup page screenshot (before if we had form)
    await page.goto(`${BASE}/setup`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "/home/0xhav0c/OhMyRSS/setup-screenshot.png", fullPage: true });
    console.log("\nScreenshots saved: setup-screenshot.png, ai-settings-screenshot.png");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
