// All assets pass through Express so the browser login protects every page.
const fs = require('node:fs');
fs.mkdirSync('vercel-static', { recursive: true });
fs.writeFileSync('vercel-static/.gitkeep', '');
