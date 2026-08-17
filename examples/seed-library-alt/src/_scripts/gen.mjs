import fs from 'fs';
import path from 'path';

const varietiesData = JSON.parse(fs.readFileSync('./varieties.json', 'utf8'));

const varietiesDir = './src/catalogue';
if (!fs.existsSync(varietiesDir)) {
  fs.mkdirSync(varietiesDir, { recursive: true });
}

varietiesData.varieties.forEach(variety => {
  const slug = variety.slug;
  const filename = path.join(varietiesDir, `${slug}.html`);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${variety.name}</title>
  <meta name="og:type" content="website">
  <meta name="og:title" content="${variety.name} — Fernhollow Seed Library">
  <meta name="og:description" content="${variety.notes}">
  <meta name="og:image" content="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%23e8f0dc' width='200' height='200'/%3E%3Ccircle cx='100' cy='100' r='60' fill='%232d5016' opacity='0.3'/%3E%3Ctext x='100' y='105' text-anchor='middle' font-family='system-ui' font-size='16' fill='%232d5016' font-weight='bold'%3E${variety.name}%3C/text%3E%3C/svg%3E">
</head>
<body>
  <h1>${variety.name}</h1>

  <p>Fernhollow keeps ${variety.name} as one of our heritage varieties, maintained by ${variety.seed_keeper}.</p>

  <div class="variety-details">
    <dl>
      <dt>Family</dt>
      <dd>${variety.family}</dd>

      <dt>Season</dt>
      <dd>${variety.season}</dd>

      <dt>Sowing window</dt>
      <dd>${variety.sow}</dd>

      <dt>Days to maturity</dt>
      <dd>${variety.days_to_maturity}</dd>

      <dt>Currently available</dt>
      <dd>${variety.packets_available} packets</dd>

      <dt>Seed keeper</dt>
      <dd>${variety.seed_keeper}</dd>
    </dl>
  </div>

  <h2>About this variety</h2>

  <p>${variety.notes}</p>

  <h2>Getting started</h2>

  <p>Ready to grow ${variety.name}? Visit us on a Saturday (10am–2pm) during the growing season to borrow a packet. Check our <a href="/growing-guides/">growing guides</a> for detailed instructions on starting from seed and saving seeds.</p>

  <h2>After you harvest</h2>

  <p>When your plants mature, save seeds following our <a href="/growing-guides/saving-seeds.html">seed-saving guide</a>. Return them in a clean, labeled packet during your next visit, and your contribution will help next season's gardeners.</p>

  <p><a href="/catalogue/">← Back to catalogue</a></p>

  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.6;
      color: #2d5016;
      background: #f9faf7;
    }

    h1 {
      font-size: 2rem;
      margin-bottom: 1rem;
      color: #1a3a0a;
    }

    h2 {
      font-size: 1.5rem;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
      color: #1a3a0a;
    }

    p {
      margin-bottom: 1rem;
    }

    a {
      color: #2d5016;
      text-decoration: underline;
    }

    a:hover {
      color: #1a3a0a;
    }

    .variety-details {
      background: #f0f5eb;
      padding: 1.5rem;
      border-radius: 4px;
      margin: 1.5rem 0;
    }

    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 1rem;
    }

    dt {
      font-weight: bold;
      color: #1a3a0a;
    }

    dd {
      margin: 0;
    }
  </style>
</body>
</html>`;

  fs.writeFileSync(filename, html);
  console.log(`Generated: ${filename}`);
});

console.log(`\nSuccessfully generated ${varietiesData.varieties.length} variety pages.`);
