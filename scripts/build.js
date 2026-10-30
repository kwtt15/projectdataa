// Serve pages and API through the same Express entry point on Vercel.
const fs = require('node:fs');
fs.mkdirSync('vercel-static', { recursive: true });
fs.writeFileSync('vercel-static/.gitkeep', '');
