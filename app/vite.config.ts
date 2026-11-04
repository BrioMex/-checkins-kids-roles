import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { configuration } from "./src/config.ts";

let base = "/";

export default defineConfig({
  plugins: [{
    name: "area-offline-shell",
    enforce: "post",
    configResolved(config) {
      base = config.base;
      if (config.command === "build") configuration({
        VITE_SUPABASE_URL: config.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_PUBLISHABLE_KEY: config.env.VITE_SUPABASE_PUBLISHABLE_KEY
      });
    },
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter((file) => /\.(js|css)$/.test(file)).map((file) => `${base}${file}`);
      const publicFiles = ["icon.svg", "icon-192.png", "icon-512.png", "manifest.webmanifest", "CONFIGURAR.md"];
      const hash = createHash("sha256").update(base).update(assets.join("|"));
      for (const file of publicFiles) hash.update(readFileSync(new URL(`./public/${file}`, import.meta.url)));
      const version = hash.digest("hex").slice(0, 12);
      const prefix = `area-shell-${encodeURIComponent(base)}-`;
      this.emitFile({
        type: "asset", fileName: "sw.js", source: `
const PREFIX = ${JSON.stringify(prefix)};
const CACHE = PREFIX + "${version}";
const BASE = ${JSON.stringify(base)};
const FILES = ${JSON.stringify([base, ...publicFiles.map((file) => `${base}${file}`), ...assets])};
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE);
      return await cache.match(url.pathname, { ignoreVary: true }) || await cache.match(BASE, { ignoreVary: true });
    }));
  } else if (!url.search && FILES.includes(url.pathname)) {
    // Canonical public assets are identical even when the host sends Vary: Origin.
    event.respondWith(caches.open(CACHE).then(async cache => await cache.match(url.pathname, { ignoreVary: true }) || fetch(event.request)));
  }
});`
      });
    }
  }],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("read-excel-file")) return "excel";
        }
      }
    }
  }
});
