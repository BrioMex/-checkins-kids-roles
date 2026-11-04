import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(path.join(root, "public", "icon.svg"), "utf8");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:#6b7653}svg{display:block;width:100%;height:100%}</style>${svg}`);
    await page.screenshot({ path: path.join(root, "public", `icon-${size}.png`), omitBackground: false });
  }
} finally { await browser.close(); }
