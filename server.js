// ==========================================
// KURA & ÖĞRENCİ PERFORMANS SİSTEMİ
// SQLite Veritabanı Sunucusu — Musa DİVARCI
// ==========================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const auth = require('./auth');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'kura.db');

// 1. Veritabanı Bağlantısı ve WAL Modu
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// 2. Tablo Şemaları
db.exec(`
  CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id TEXT NOT NULL,
    name TEXT NOT NULL,
    in_pool INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ders_ici_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    class_id TEXT NOT NULL,
    type TEXT NOT NULL,
    delta INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS odev_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    class_id TEXT NOT NULL,
    type TEXT NOT NULL,
    delta INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS test_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    class_id TEXT NOT NULL,
    points INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS draw_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    class_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    drawn_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );
`);

// 3. Varsayılan Sınıflar ve Öğrenci Listeleri
const CLASS_DEFAULTS = {
  "6": [
    "ATINÇ RÜZGAR KONUKMAN", "AYAZ BİLGİN", "AYAZ EMİR SELÇUK", "ASYA ÇAKAR",
    "BERAY KESKİN", "BEREN UÇAR", "BULUT KURT", "CEYLİN ÜLKEBAY",
    "ÇINAR YAVER", "DENİZ GÜLER", "ALİSA ÜŞÜDÜR", "DEREN ÇOLAK",
    "DERİN BERRAK ERKOÇ", "DERİN DEMİR", "DOĞA İPEKLİ", "DURU AYVAZ",
    "EGE POYRAZ ÇELİK", "EMİR TOPAKKAYA", "ÖYKÜ CEYLİN ÇİRKİN", "HAZEL MİRA ÇİÇEK",
    "MUSTAFA ÇINAR EROL", "DERİN NAZ KARA", "ÖYKÜ TUTKAÇ", "İSMAİL BÜYÜKGENÇ",
    "ECEM HİLAL", "SEDANUR ÖZSOY", "TANER TURNA", "UMUT EFE KARAAĞAÇ",
    "YİĞİT KARTAL", "ZEYNEP İPEK BEKTAŞ", "HALİL TİMUR YILDIRIM", "MERAL KARTAL"
  ],
  "7": [
    "ALİ BERKER KESKİN", "ALİ GALİP CAN ARICILAR", "AYAZ ÖZDEK", "YİĞİT TOPAL",
    "AYTUĞ AKBULUT", "BEYZA NEHİR ÇAN", "TUANA ÇINAR", "DURU YAŞAYANCAN",
    "TUNA COMERT", "EYLÜL KILIÇARSLAN", "EGE UZUNHANÇERLİ", "GÖKAY KIZILVERAN",
    "GÖKHAN ERDEM", "GÖKSU PEHLİVAN", "DERİN SUNGUR", "HATİCE TOPRAK ÖZER",
    "ENES BAL", "KARDELEN ÇAĞLAR", "KAYRA SERKEK", "MEDİNE ECE AĞLAR",
    "MELİKE ŞEYMA BAY", "EREN BALCI", "MENEKŞE ADA AYAZ", "YAĞMUR BARIN",
    "NİLDA ÇİFÇİ", "SUDENAZ UYSAL", "TOPRAK ANIL KOLAÇ", "TOPRAK BOZTEPE"
  ],
  "8": [
    "MURAT İNCE", "ASYA NAZ KARAGÖZ", "EYLÜL KAZANCI", "EYLÜL YALÇINKAYA",
    "EYNUR BERRU PEHLİVAN", "GÜNEŞ DEMİRÖRS", "ARMİN DALGIÇ", "ŞEBNEM BURÇE ÇILDIR",
    "ÇAĞAN MERT ŞAHİNBAŞ", "ÇAĞAN TOPRAK KIZILIRMAK", "ÇINAR COMERT", "AYHAN YAĞIZ YILDIRIM",
    "ÇINAR TERCANLI", "DEMİR ÇAĞAN BELLEK", "DERİN UMAY POLAT", "GÜNEŞ SU ERAY",
    "İLKİM NAZ AŞKIN", "KAĞAN DİKENLİ", "KEREM TÜRKOĞLU", "MUHAMMET ALİ ERGÜN",
    "MUSTAFA YİĞİT AKÇAKAYA", "ALİ GAZİ ÖZDEMİR", "ÖYKÜ ÖZCAN", "MASAL İPEK",
    "RÜZGAR YİĞİT", "YAĞMUR YİĞİT", "YİĞİT TERCANLI", "ELA DENİZ ÇALIŞIR", "CAN GÖKGÖZ"
  ]
};

// İlk Açılış Kontrolü & Seed
function seedDatabase() {
  const checkClassStmt = db.prepare("SELECT COUNT(*) as count FROM classes");
  const count = checkClassStmt.get().count;

  if (count === 0) {
    console.log("-> SQLite Veritabanı ilk kez oluşturuluyor, öğrenci listeleri ekleniyor...");
    const insertClass = db.prepare("INSERT INTO classes (id, name) VALUES (?, ?)");
    const insertStudent = db.prepare("INSERT INTO students (class_id, name, in_pool, sort_order) VALUES (?, ?, 1, ?)");

    ['6', '7', '8'].forEach(clsKey => {
      insertClass.run(clsKey, `${clsKey}. Sınıf`);
      const list = CLASS_DEFAULTS[clsKey];
      list.forEach((name, idx) => {
        insertStudent.run(clsKey, name.trim(), idx);
      });
    });
    console.log("-> Sınıflar ve öğrenci listeleri SQLite veritabanına kaydedildi.");
  }
}

seedDatabase();

// 4. Veri Okuma Yardımcısı
function getFullData() {
  const classes = {};

  ['6', '7', '8'].forEach(clsKey => {
    const students = db.prepare("SELECT * FROM students WHERE class_id = ? ORDER BY sort_order ASC, id ASC").all(clsKey);
    const fullNames = [];
    const remainingNames = [];
    const scores = {};
    const tokens = {};
    const hwScores = {};
    const hwTokens = {};
    const testScores = {};
    const testTokens = {};

    const studentMap = {};

    students.forEach(st => {
      fullNames.push(st.name);
      studentMap[st.id] = st.name;
      if (st.in_pool === 1) {
        remainingNames.push(st.name);
      }
      scores[st.name] = { plus: 0, minus: 0 };
      tokens[st.name] = [];
      hwScores[st.name] = { plus: 0, minus: 0 };
      hwTokens[st.name] = [];
      testScores[st.name] = 0;
      testTokens[st.name] = [];
    });

    // Ders İçi Logları
    const dersLogs = db.prepare("SELECT * FROM ders_ici_logs WHERE class_id = ? ORDER BY id ASC").all(clsKey);
    dersLogs.forEach(l => {
      const name = studentMap[l.student_id];
      if (name && scores[name]) {
        if (l.delta > 0) scores[name].plus += l.delta;
        else scores[name].minus += Math.abs(l.delta);
        tokens[name].push(l.type);
      }
    });

    // Ödev Logları
    const odevLogs = db.prepare("SELECT * FROM odev_logs WHERE class_id = ? ORDER BY id ASC").all(clsKey);
    odevLogs.forEach(l => {
      const name = studentMap[l.student_id];
      if (name && hwScores[name]) {
        if (l.delta > 0) hwScores[name].plus += l.delta;
        else hwScores[name].minus += Math.abs(l.delta);
        hwTokens[name].push(l.type);
      }
    });

    // Test Logları
    const tLogs = db.prepare("SELECT * FROM test_logs WHERE class_id = ? ORDER BY id ASC").all(clsKey);
    tLogs.forEach(l => {
      const name = studentMap[l.student_id];
      if (name && testScores[name] !== undefined) {
        testScores[name] += l.points;
        testTokens[name].push(l.points > 0 ? `+${l.points}` : `${l.points}`);
      }
    });

    // Kura Geçmişi
    const historyLogs = db.prepare("SELECT * FROM draw_history WHERE class_id = ? ORDER BY id ASC").all(clsKey);
    const history = historyLogs.map(h => ({
      name: h.student_name,
      time: new Date(h.drawn_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    }));

    classes[clsKey] = {
      full: fullNames,
      remaining: remainingNames,
      history: history,
      scores: scores,
      tokens: tokens,
      hwScores: hwScores,
      hwTokens: hwTokens,
      testScores: testScores,
      testTokens: testTokens
    };
  });

  return { classes };
}

// 5. HTTP Sunucusu & REST API
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

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function sendJSON(res, data, status = 200, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': reqOrigin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

let reqOrigin = '*';

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  reqOrigin = req.headers.origin || '*';

  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': reqOrigin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // --- AUTH ENDPOINTS ---
  // 1. Giriş Linki İste (60 saniye ömürlü)
  if (pathname === '/api/auth/send-link' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const email = (body.email || auth.ALLOWED_EMAIL).trim().toLowerCase();

      if (email !== auth.ALLOWED_EMAIL) {
        return sendJSON(res, { success: false, error: `Sadece ${auth.ALLOWED_EMAIL} adresi ile giriş yapılabilir.` }, 403);
      }

      const { token } = auth.generateMagicToken(email);
      const host = req.headers.host;
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const magicLinkUrl = `${protocol}://${host}/?token=${token}`;

      const mailResult = await auth.sendMagicLinkEmail(email, magicLinkUrl);

      return sendJSON(res, {
        success: true,
        message: `Giriş bağlantısı ${email} adresine gönderildi (60 saniye geçerli).`,
        devLink: mailResult.devLink || magicLinkUrl,
        expiresIn: auth.LINK_EXPIRY_SECONDS
      });
    } catch (e) {
      return sendJSON(res, { success: false, error: e.message }, 500);
    }
  }

  // 2. Token Doğrula (Tek tıkla oturum açma)
  if ((pathname === '/api/auth/verify') && (req.method === 'GET' || req.method === 'POST')) {
    try {
      let token = parsedUrl.searchParams.get('token');
      if (!token && req.method === 'POST') {
        const b = await parseBody(req);
        token = b.token;
      }

      const result = auth.verifyMagicToken(token);
      if (!result.valid) {
        return sendJSON(res, { success: false, error: result.error }, 400);
      }

      // Cookie ayarla (30 gün)
      const cookieVal = `auth_session=${result.sessionToken}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly`;
      return sendJSON(res, {
        success: true,
        user: { email: result.email },
        sessionToken: result.sessionToken
      }, 200, { 'Set-Cookie': cookieVal });
    } catch (e) {
      return sendJSON(res, { success: false, error: e.message }, 500);
    }
  }

  // 3. Mevcut Oturumu Kontrol Et
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const authHeader = req.headers.authorization;
    let sessionToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!sessionToken) {
      sessionToken = getCookie(req, 'auth_session');
    }

    const session = auth.verifySession(sessionToken);
    if (!session) {
      return sendJSON(res, { authenticated: false });
    }
    return sendJSON(res, { authenticated: true, user: { email: session.email } });
  }

  // 4. Çıkış Yap
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const clearCookie = `auth_session=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;
    return sendJSON(res, { success: true }, 200, { 'Set-Cookie': clearCookie });
  }

  // --- API ENDPOINTS ---
  if (pathname === '/api/data' && req.method === 'GET') {
    try {
      const data = getFullData();
      sendJSON(res, { success: true, data });
    } catch (e) {
      sendJSON(res, { success: false, error: e.message }, 500);
    }
    return;
  }

  // Ders İçi Puanı Ekle / Çıkar
  if (pathname === '/api/score/dersici' && req.method === 'POST') {
    try {
      const { classKey, studentName, delta } = await parseBody(req);
      const student = db.prepare("SELECT * FROM students WHERE class_id = ? AND name = ?").get(classKey, studentName);
      if (!student) {
        return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);
      }

      const type = delta > 0 ? '+' : '-';
      db.prepare("INSERT INTO ders_ici_logs (student_id, class_id, type, delta) VALUES (?, ?, ?, ?)").run(student.id, classKey, type, delta);
      sendJSON(res, { success: true, data: getFullData() });
    } catch (e) {
      sendJSON(res, { success: false, error: e.message }, 500);
    }
    return;
  }

  // Ödev Puanı Ekle / Çıkar
  if (pathname === '/api/score/odev' && req.method === 'POST') {
    try {
      const { classKey, studentName, delta } = await parseBody(req);
      const student = db.prepare("SELECT * FROM students WHERE class_id = ? AND name = ?").get(classKey, studentName);
      if (!student) {
        return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);
      }

      const type = delta > 0 ? '+' : '-';
      db.prepare("INSERT INTO odev_logs (student_id, class_id, type, delta) VALUES (?, ?, ?, ?)").run(student.id, classKey, type, delta);
      sendJSON(res, { success: true, data: getFullData() });
    } catch (e) {
      sendJSON(res, { success: false, error: e.message }, 500);
    }
    return;
  }

  // Test Puanı (3, 2, 1, -1)
  if (pathname === '/api/score/test' && req.method === 'POST') {
    try {
      const { classKey, studentName, delta } = await parseBody(req);
      const student = db.prepare("SELECT * FROM students WHERE class_id = ? AND name = ?").get(classKey, studentName);
      if (!student) {
        return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);
      }

      db.prepare("INSERT INTO test_logs (student_id, class_id, points) VALUES (?, ?, ?)").run(student.id, classKey, delta);
      sendJSON(res, { success: true, data: getFullData() });
    } catch (e) {
      sendJSON(res, { success: false, error: e.message }, 500);
    }
    return;
  }

  // Kura Çekildi Kaydı
  if (pathname === '/api/draw' && req.method === 'POST') {
    try {
      const { classKey, studentName, autoRemove } = await parseBody(req);
      const student = db.prepare("SELECT * FROM students WHERE class_id = ? AND name = ?").get(classKey, studentName);
      if (!student) {
        return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);
      }

      db.prepare("INSERT INTO draw_history (student_id, class_id, student_name) VALUES (?, ?, ?)").run(student.id, classKey, studentName);
      if (autoRemove) {
        db.prepare("UPDATE students SET in_pool = 0 WHERE id = ?").run(student.id);
      }

      sendJSON(res, { success: true, data: getFullData() });
    } catch (e) {
      sendJSON(res, { success: false, error: e.message }, 500);
    }
    return;
  }

  // Havuzdan Elle Çıkar
  if (pathname === '/api/pool/remove' && req.method === 'POST') {
    try {
      const { classKey, studentName } = await parseBody(req);
      db.prepare("UPDATE students SET in_pool = 0 WHERE class_id = ? AND name = ?").run(classKey, studentName);
      sendJSON(res, { success: true, data: getFullData() });
    } catch (e) {
      sendJSON(res, { success: false, error: e.message }, 500);
    }
    return;
  }

  // Kura Havuzunu Sıfırla
  if (pathname === '/api/pool/reset' && req.method === 'POST') {
    try {
      const { classKey } = await parseBody(req);
      db.prepare("UPDATE students SET in_pool = 1 WHERE class_id = ?").run(classKey);
      db.prepare("DELETE FROM draw_history WHERE class_id = ?").run(classKey);
      sendJSON(res, { success: true, data: getFullData() });
    } catch (e) {
      sendJSON(res, { success: false, error: e.message }, 500);
    }
    return;
  }

  // Puanları Sıfırla (dersici, odev, test)
  if (pathname === '/api/scores/reset' && req.method === 'POST') {
    try {
      const { classKey, type } = await parseBody(req);
      if (type === 'dersici') {
        db.prepare("DELETE FROM ders_ici_logs WHERE class_id = ?").run(classKey);
      } else if (type === 'odev') {
        db.prepare("DELETE FROM odev_logs WHERE class_id = ?").run(classKey);
      } else if (type === 'test') {
        db.prepare("DELETE FROM test_logs WHERE class_id = ?").run(classKey);
      }
      sendJSON(res, { success: true, data: getFullData() });
    } catch (e) {
      sendJSON(res, { success: false, error: e.message }, 500);
    }
    return;
  }

  // Sınıf Listesini Güncelle
  if (pathname === '/api/students/update' && req.method === 'POST') {
    try {
      const { classKey, names } = await parseBody(req);
      if (!Array.isArray(names)) {
        return sendJSON(res, { success: false, error: "Geçersiz liste formatı" }, 400);
      }

      // Mevcut öğrencileri ve logları güvenle güncelle
      db.prepare("DELETE FROM students WHERE class_id = ?").run(classKey);
      const insertStudent = db.prepare("INSERT INTO students (class_id, name, in_pool, sort_order) VALUES (?, ?, 1, ?)");
      names.forEach((n, idx) => {
        if (n && n.trim()) {
          insertStudent.run(classKey, n.trim(), idx);
        }
      });

      sendJSON(res, { success: true, data: getFullData() });
    } catch (e) {
      sendJSON(res, { success: false, error: e.message }, 500);
    }
    return;
  }

  // Yedek Yükle (Restore)
  if (pathname === '/api/restore' && req.method === 'POST') {
    try {
      const { backupData } = await parseBody(req);
      if (!backupData || !backupData.classes) {
        return sendJSON(res, { success: false, error: "Geçersiz yedek dosyası" }, 400);
      }

      // Tabloları temizle ve içe aktar
      db.exec("DELETE FROM draw_history; DELETE FROM ders_ici_logs; DELETE FROM odev_logs; DELETE FROM test_logs; DELETE FROM students;");

      const insertStudent = db.prepare("INSERT INTO students (class_id, name, in_pool, sort_order) VALUES (?, ?, ?, ?)");
      const insertDersLog = db.prepare("INSERT INTO ders_ici_logs (student_id, class_id, type, delta) VALUES (?, ?, ?, ?)");
      const insertHwLog = db.prepare("INSERT INTO odev_logs (student_id, class_id, type, delta) VALUES (?, ?, ?, ?)");
      const insertTestLog = db.prepare("INSERT INTO test_logs (student_id, class_id, points) VALUES (?, ?, ?)");
      const insertHistory = db.prepare("INSERT INTO draw_history (student_id, class_id, student_name) VALUES (?, ?, ?)");

      ['6', '7', '8'].forEach(clsKey => {
        const cls = backupData.classes[clsKey];
        if (cls && cls.full) {
          const studentIdMap = {};
          cls.full.forEach((name, idx) => {
            const inPool = (cls.remaining && cls.remaining.includes(name)) ? 1 : 0;
            const res = insertStudent.run(clsKey, name, inPool, idx);
            studentIdMap[name] = Number(res.lastInsertRowid);
          });

          // Tokens restore
          if (cls.tokens) {
            Object.keys(cls.tokens).forEach(name => {
              const sid = studentIdMap[name];
              if (sid) {
                cls.tokens[name].forEach(tok => {
                  insertDersLog.run(sid, clsKey, tok, tok === '+' ? 1 : -1);
                });
              }
            });
          }

          // Homework tokens restore
          if (cls.hwTokens) {
            Object.keys(cls.hwTokens).forEach(name => {
              const sid = studentIdMap[name];
              if (sid) {
                cls.hwTokens[name].forEach(tok => {
                  insertHwLog.run(sid, clsKey, tok, tok === '+' ? 1 : -1);
                });
              }
            });
          }

          // Test tokens restore
          if (cls.testTokens) {
            Object.keys(cls.testTokens).forEach(name => {
              const sid = studentIdMap[name];
              if (sid) {
                cls.testTokens[name].forEach(tok => {
                  const pts = parseInt(tok, 10) || 0;
                  insertTestLog.run(sid, clsKey, pts);
                });
              }
            });
          }

          // Draw history restore
          if (cls.history) {
            cls.history.forEach(h => {
              const sid = studentIdMap[h.name] || 0;
              insertHistory.run(sid, clsKey, h.name);
            });
          }
        }
      });

      sendJSON(res, { success: true, data: getFullData() });
    } catch (e) {
      sendJSON(res, { success: false, error: e.message }, 500);
    }
    return;
  }

  // --- STATİK DOSYA SUNUCUSU ---
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
  console.log(`  🚀 Kura & Performans Sistemi SQLite Sunucusu Hazır!`);
  console.log(`  🌐 Adres: http://localhost:${PORT}`);
  console.log(`  💾 Veritabanı: ${DB_PATH} (WAL Modu — Sıfır Veri Kaybı)`);
  console.log(`======================================================\n`);
});
