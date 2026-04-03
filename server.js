const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 3000);
const root = __dirname;

const mimeByExt = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon"
};

function send(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
}

function resolveSafePath(urlPath) {
  const cleanPath = urlPath.split("?")[0].split("#")[0];
  const normalized = path.normalize(cleanPath).replace(/^(\.\.[/\\])+/, "");
  const withDefault = normalized === "/" ? "/index.html" : normalized;
  return path.join(root, withDefault);
}

const server = http.createServer((req, res) => {
  const filePath = resolveSafePath(req.url || "/");
  if (!filePath.startsWith(root)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if ((req.url || "/") !== "/" && req.method === "GET") {
        const fallback = path.join(root, "index.html");
        fs.readFile(fallback, (fallbackErr, fallbackData) => {
          if (fallbackErr) {
            send(res, 404, "Not Found");
            return;
          }
          send(res, 200, fallbackData, "text/html; charset=utf-8");
        });
        return;
      }
      send(res, 404, "Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, mimeByExt[ext] || "application/octet-stream");
  });
});

server.listen(port, () => {
  console.log(`Grade 1 Learning Arcade running on port ${port}`);
});
