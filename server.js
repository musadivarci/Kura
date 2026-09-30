// ==========================================
// KURA & ÖĞRENCİ PERFORMANS SİSTEMİ
// Node.js Sunucusu (Supabase / Turso / SQLite Hibrit) — Musa DİVARCI
// ==========================================

const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. .env Dosyalarını Otomatik Yükleme (Local & Cloud)
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const envFile of envFiles) {
    const envPath = path.join(__dirname, envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
          const key = line.substring(0, eqIdx).trim();
          let val = line.substring(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      });
    }
  }
}

loadEnv();

// 2. API Yönlendirici
const apiHandler = require('./api/index');

const PORT = process.env.PORT || 3000;
const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const isSupabase = Boolean(supabaseUrl && supabaseKey);

const rawTursoUrl = (process.env.TURSO_DATABASE_URL || '').trim();
const isTurso = rawTursoUrl.startsWith('libsql') || rawTursoUrl.startsWith('https://');

// 3. MIME Türleri
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// 4. HTTP Sunucusu
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // A. API İstekleri -> Doğrudan Handler'a
  if (pathname.startsWith('/api/')) {
    return apiHandler(req, res);
  }

  // B. Statik Dosya Sunucusu (index.html, logo.png vb.)
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 - Sayfa Bulunamadı');
      } else {
        res.writeHead(500);
        res.end(`Sunucu Hatası: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  🚀 Kura & Performans Sistemi Sunucusu Hazır!`);
  console.log(`  🌐 Yerel Adres: http://localhost:${PORT}`);
  if (isSupabase) {
    console.log(`  ☁️  Veritabanı: BULUT (Supabase PostgreSQL — ${supabaseUrl})`);
    console.log(`  🔄 Durum: Local ve Vercel kalıcı Supabase veritabanını paylaşıyor.`);
  } else if (isTurso) {
    console.log(`  ☁️  Veritabanı: BULUT (Turso Cloud LibSQL)`);
    console.log(`  🔄 Durum: Local ve Vercel Turso veritabanını paylaşıyor.`);
  } else {
    console.log(`  💾 Veritabanı: YEREL SQLite (kura.db)`);
    console.log(`  💡 İpucu: Kalıcı bulut veritabanı için .env dosyasına`);
    console.log(`     SUPABASE_URL ve SUPABASE_KEY ekleyebilirsiniz.`);
  }
  console.log(`======================================================\n`);
});
