const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

// Crash early with clear message if dist doesn't exist
if (!fs.existsSync(distPath)) {
  console.error('ERROR: dist/ folder does not exist. Run "npm run build" first.');
  process.exit(1);
}
if (!fs.existsSync(indexPath)) {
  console.error('ERROR: dist/index.html does not exist. Build may have failed.');
  process.exit(1);
}

console.log(`Serving files from: ${distPath}`);
console.log(`PORT: ${PORT}`);

// Serve static files from dist/
app.use(express.static(distPath));

// SPA fallback - all routes serve index.html
app.get('*', (req, res) => {
  res.sendFile(indexPath);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server running on port ${PORT}`);
});
