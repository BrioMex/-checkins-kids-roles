"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".md": "text/plain; charset=utf-8" };
const allowed = new Set(["index.html", "styles.css", "model.js", "app.js", "icon.svg", "DISENO.md"]);
const server = http.createServer((req, res) => {
  const name = new URL(req.url, "http://localhost").pathname.slice(1) || "index.html";
  if (!allowed.has(name)) {
    res.writeHead(404);
    return res.end("No encontrado");
  }
  fs.readFile(path.join(root, name), (error, data) => {
    if (error) {
      res.writeHead(500);
      return res.end("No se pudo leer el archivo.");
    }
    res.writeHead(200, { "Content-Type": types[path.extname(name)], "Cache-Control": "no-store" });
    res.end(data);
  });
});
server.listen(Number(process.env.PORT || 4173), "127.0.0.1", () => {
  console.log(`Prototipo disponible en http://127.0.0.1:${server.address().port}`);
});
