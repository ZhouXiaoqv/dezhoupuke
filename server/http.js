/**
 * HTTP Server — static file serving for the frontend
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const STATIC_DIR = path.resolve(__dirname, '..', 'public');
const THREE_DIR = path.resolve(__dirname, '..', 'node_modules', 'three');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
};

const httpServer = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';

  let filePath;
  let rootDir = STATIC_DIR;
  if (url.startsWith('/vendor/three/')) {
    rootDir = THREE_DIR;
    filePath = path.resolve(THREE_DIR, url.slice('/vendor/three/'.length));
  } else {
    filePath = path.resolve(STATIC_DIR, url.slice(1));
  }
  if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

module.exports = { httpServer, STATIC_DIR };
