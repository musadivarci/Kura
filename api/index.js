// ==========================================
// VERCEL SERVERLESS API — KURA & PERFORMANS
// SQLite / Turso Cloud Backend — Musa DİVARCI
// ==========================================

const { createClient } = require('@libsql/client');
const path = require('path');
const os = require('os');
const auth = require('../auth');

const isVercel = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME;
const defaultLocalPath = isVercel ? path.join(os.tmpdir(), 'kura.db') : path.join(process.cwd(), 'kura.db');
const dbUrl = process.env.TURSO_DATABASE_URL || `file:${defaultLocalPath}`;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

const db = createClient({
  url: dbUrl,
  authToken: authToken
});

let isInitialized = false;

// Varsayılan Sınıf & Öğrenci Listeleri
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

async function ensureTablesAndSeed() {
  if (isInitialized) return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id TEXT NOT NULL,
      name TEXT NOT NULL,
      in_pool INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS ders_ici_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      class_id TEXT NOT NULL,
      type TEXT NOT NULL,
      delta INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS odev_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      class_id TEXT NOT NULL,
      type TEXT NOT NULL,
      delta INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS test_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      class_id TEXT NOT NULL,
      points INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS draw_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      class_id TEXT NOT NULL,
      student_name TEXT NOT NULL,
      drawn_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Sınıf sayısı kontrolü
  const res = await db.execute("SELECT COUNT(*) as count FROM classes");
  const count = Number(res.rows[0].count);

  if (count === 0) {
    for (const clsKey of ['6', '7', '8']) {
      await db.execute({
        sql: "INSERT INTO classes (id, name) VALUES (?, ?)",
        args: [clsKey, `${clsKey}. Sınıf`]
      });

      const list = CLASS_DEFAULTS[clsKey];
      for (let idx = 0; idx < list.length; idx++) {
        await db.execute({
          sql: "INSERT INTO students (class_id, name, in_pool, sort_order) VALUES (?, ?, 1, ?)",
          args: [clsKey, list[idx].trim(), idx]
        });
      }
    }
  }

  isInitialized = true;
}

// Tüm Verileri Çekme Fonksiyonu
async function getFullData() {
  await ensureTablesAndSeed();
  const classes = {};

  for (const clsKey of ['6', '7', '8']) {
    const studentsRes = await db.execute({
      sql: "SELECT * FROM students WHERE class_id = ? ORDER BY sort_order ASC, id ASC",
      args: [clsKey]
    });

    const fullNames = [];
    const remainingNames = [];
    const scores = {};
    const tokens = {};
    const hwScores = {};
    const hwTokens = {};
    const testScores = {};
    const testTokens = {};
    const studentMap = {};

    studentsRes.rows.forEach(st => {
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

    // Ders İçi
    const dersRes = await db.execute({
      sql: "SELECT * FROM ders_ici_logs WHERE class_id = ? ORDER BY id ASC",
      args: [clsKey]
    });
    dersRes.rows.forEach(l => {
      const name = studentMap[l.student_id];
      if (name && scores[name]) {
        if (l.delta > 0) scores[name].plus += Number(l.delta);
        else scores[name].minus += Math.abs(Number(l.delta));
        tokens[name].push(l.type);
      }
    });

    // Ödev
    const odevRes = await db.execute({
      sql: "SELECT * FROM odev_logs WHERE class_id = ? ORDER BY id ASC",
      args: [clsKey]
    });
    odevRes.rows.forEach(l => {
      const name = studentMap[l.student_id];
      if (name && hwScores[name]) {
        if (l.delta > 0) hwScores[name].plus += Number(l.delta);
        else hwScores[name].minus += Math.abs(Number(l.delta));
        hwTokens[name].push(l.type);
      }
    });

    // Test
    const testRes = await db.execute({
      sql: "SELECT * FROM test_logs WHERE class_id = ? ORDER BY id ASC",
      args: [clsKey]
    });
    testRes.rows.forEach(l => {
      const name = studentMap[l.student_id];
      if (name && testScores[name] !== undefined) {
        testScores[name] += Number(l.points);
        testTokens[name].push(Number(l.points) > 0 ? `+${l.points}` : `${l.points}`);
      }
    });

    // Kura Geçmişi
    const historyRes = await db.execute({
      sql: "SELECT * FROM draw_history WHERE class_id = ? ORDER BY id ASC",
      args: [clsKey]
    });
    const history = historyRes.rows.map(h => ({
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
  }

  return { classes };
}

// Body parse helper
function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body) return resolve(req.body);
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        resolve({});
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
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  Object.keys(extraHeaders).forEach(k => {
    res.setHeader(k, extraHeaders[k]);
  });
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

// Vercel Serverless Handler
module.exports = async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = req.url || '';
  const pathname = url.split('?')[0];

  try {
    // --- AUTH ENDPOINTS ---
    // 1. POST /api/auth/send-link
    if (pathname.endsWith('/auth/send-link') && req.method === 'POST') {
      const body = await parseBody(req);
      const email = (body.email || auth.ALLOWED_EMAIL).trim().toLowerCase();

      if (email !== auth.ALLOWED_EMAIL) {
        return sendJSON(res, { success: false, error: `Sadece ${auth.ALLOWED_EMAIL} adresi ile giriş yapılabilir.` }, 403);
      }

      const { token } = auth.generateMagicToken(email);
      const host = req.headers.host;
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const magicLinkUrl = `${protocol}://${host}/?token=${token}`;

      const mailResult = await auth.sendMagicLinkEmail(email, magicLinkUrl);

      return sendJSON(res, {
        success: true,
        message: `Giriş bağlantısı ${email} adresine gönderildi (60 saniye geçerli).`,
        devLink: mailResult.devLink || magicLinkUrl,
        expiresIn: auth.LINK_EXPIRY_SECONDS
      });
    }

    // 2. GET / POST /api/auth/verify
    if (pathname.endsWith('/auth/verify') && (req.method === 'GET' || req.method === 'POST')) {
      let token = null;
      if (url.includes('?')) {
        const queryParams = new URLSearchParams(url.split('?')[1]);
        token = queryParams.get('token');
      }
      if (!token && req.method === 'POST') {
        const b = await parseBody(req);
        token = b.token;
      }

      const result = auth.verifyMagicToken(token);
      if (!result.valid) {
        return sendJSON(res, { success: false, error: result.error }, 400);
      }

      const cookieVal = `auth_session=${result.sessionToken}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly`;
      return sendJSON(res, {
        success: true,
        user: { email: result.email },
        sessionToken: result.sessionToken
      }, 200, { 'Set-Cookie': cookieVal });
    }

    // 3. GET /api/auth/me
    if (pathname.endsWith('/auth/me') && req.method === 'GET') {
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

    // 4. POST /api/auth/logout
    if (pathname.endsWith('/auth/logout') && req.method === 'POST') {
      const clearCookie = `auth_session=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly`;
      return sendJSON(res, { success: true }, 200, { 'Set-Cookie': clearCookie });
    }

    await ensureTablesAndSeed();

    // GET /api/data
    if (pathname.endsWith('/data') && req.method === 'GET') {
      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/score/dersici
    if (pathname.endsWith('/score/dersici') && req.method === 'POST') {
      const { classKey, studentName, delta } = await parseBody(req);
      const studentRes = await db.execute({
        sql: "SELECT * FROM students WHERE class_id = ? AND name = ?",
        args: [classKey, studentName]
      });
      if (studentRes.rows.length === 0) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);
      
      const st = studentRes.rows[0];
      const type = delta > 0 ? '+' : '-';
      await db.execute({
        sql: "INSERT INTO ders_ici_logs (student_id, class_id, type, delta) VALUES (?, ?, ?, ?)",
        args: [st.id, classKey, type, delta]
      });

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/score/odev
    if (pathname.endsWith('/score/odev') && req.method === 'POST') {
      const { classKey, studentName, delta } = await parseBody(req);
      const studentRes = await db.execute({
        sql: "SELECT * FROM students WHERE class_id = ? AND name = ?",
        args: [classKey, studentName]
      });
      if (studentRes.rows.length === 0) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);

      const st = studentRes.rows[0];
      const type = delta > 0 ? '+' : '-';
      await db.execute({
        sql: "INSERT INTO odev_logs (student_id, class_id, type, delta) VALUES (?, ?, ?, ?)",
        args: [st.id, classKey, type, delta]
      });

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/score/test
    if (pathname.endsWith('/score/test') && req.method === 'POST') {
      const { classKey, studentName, delta } = await parseBody(req);
      const studentRes = await db.execute({
        sql: "SELECT * FROM students WHERE class_id = ? AND name = ?",
        args: [classKey, studentName]
      });
      if (studentRes.rows.length === 0) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);

      const st = studentRes.rows[0];
      await db.execute({
        sql: "INSERT INTO test_logs (student_id, class_id, points) VALUES (?, ?, ?)",
        args: [st.id, classKey, delta]
      });

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/draw
    if (pathname.endsWith('/draw') && req.method === 'POST') {
      const { classKey, studentName, autoRemove } = await parseBody(req);
      const studentRes = await db.execute({
        sql: "SELECT * FROM students WHERE class_id = ? AND name = ?",
        args: [classKey, studentName]
      });
      if (studentRes.rows.length === 0) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);

      const st = studentRes.rows[0];
      await db.execute({
        sql: "INSERT INTO draw_history (student_id, class_id, student_name) VALUES (?, ?, ?)",
        args: [st.id, classKey, studentName]
      });

      if (autoRemove) {
        await db.execute({
          sql: "UPDATE students SET in_pool = 0 WHERE id = ?",
          args: [st.id]
        });
      }

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/pool/remove
    if (pathname.endsWith('/pool/remove') && req.method === 'POST') {
      const { classKey, studentName } = await parseBody(req);
      await db.execute({
        sql: "UPDATE students SET in_pool = 0 WHERE class_id = ? AND name = ?",
        args: [classKey, studentName]
      });
      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/pool/reset
    if (pathname.endsWith('/pool/reset') && req.method === 'POST') {
      const { classKey } = await parseBody(req);
      await db.execute({
        sql: "UPDATE students SET in_pool = 1 WHERE class_id = ?",
        args: [classKey]
      });
      await db.execute({
        sql: "DELETE FROM draw_history WHERE class_id = ?",
        args: [classKey]
      });
      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/scores/reset
    if (pathname.endsWith('/scores/reset') && req.method === 'POST') {
      const { classKey, type } = await parseBody(req);
      if (type === 'dersici') {
        await db.execute({ sql: "DELETE FROM ders_ici_logs WHERE class_id = ?", args: [classKey] });
      } else if (type === 'odev') {
        await db.execute({ sql: "DELETE FROM odev_logs WHERE class_id = ?", args: [classKey] });
      } else if (type === 'test') {
        await db.execute({ sql: "DELETE FROM test_logs WHERE class_id = ?", args: [classKey] });
      }
      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/students/update
    if (pathname.endsWith('/students/update') && req.method === 'POST') {
      const { classKey, names } = await parseBody(req);
      if (!Array.isArray(names)) return sendJSON(res, { success: false, error: "Geçersiz format" }, 400);

      await db.execute({ sql: "DELETE FROM students WHERE class_id = ?", args: [classKey] });
      for (let idx = 0; idx < names.length; idx++) {
        if (names[idx] && names[idx].trim()) {
          await db.execute({
            sql: "INSERT INTO students (class_id, name, in_pool, sort_order) VALUES (?, ?, 1, ?)",
            args: [classKey, names[idx].trim(), idx]
          });
        }
      }

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/restore
    if (pathname.endsWith('/restore') && req.method === 'POST') {
      const { backupData } = await parseBody(req);
      if (!backupData || !backupData.classes) return sendJSON(res, { success: false, error: "Geçersiz yedek" }, 400);

      await db.execute("DELETE FROM draw_history;");
      await db.execute("DELETE FROM ders_ici_logs;");
      await db.execute("DELETE FROM odev_logs;");
      await db.execute("DELETE FROM test_logs;");
      await db.execute("DELETE FROM students;");

      for (const clsKey of ['6', '7', '8']) {
        const cls = backupData.classes[clsKey];
        if (cls && cls.full) {
          const studentIdMap = {};
          for (let idx = 0; idx < cls.full.length; idx++) {
            const name = cls.full[idx];
            const inPool = (cls.remaining && cls.remaining.includes(name)) ? 1 : 0;
            const res = await db.execute({
              sql: "INSERT INTO students (class_id, name, in_pool, sort_order) VALUES (?, ?, ?, ?)",
              args: [clsKey, name, inPool, idx]
            });
            studentIdMap[name] = Number(res.lastInsertRowid);
          }

          if (cls.tokens) {
            for (const name of Object.keys(cls.tokens)) {
              const sid = studentIdMap[name];
              if (sid) {
                for (const tok of cls.tokens[name]) {
                  await db.execute({
                    sql: "INSERT INTO ders_ici_logs (student_id, class_id, type, delta) VALUES (?, ?, ?, ?)",
                    args: [sid, clsKey, tok, tok === '+' ? 1 : -1]
                  });
                }
              }
            }
          }

          if (cls.hwTokens) {
            for (const name of Object.keys(cls.hwTokens)) {
              const sid = studentIdMap[name];
              if (sid) {
                for (const tok of cls.hwTokens[name]) {
                  await db.execute({
                    sql: "INSERT INTO odev_logs (student_id, class_id, type, delta) VALUES (?, ?, ?, ?)",
                    args: [sid, clsKey, tok, tok === '+' ? 1 : -1]
                  });
                }
              }
            }
          }

          if (cls.testTokens) {
            for (const name of Object.keys(cls.testTokens)) {
              const sid = studentIdMap[name];
              if (sid) {
                for (const tok of cls.testTokens[name]) {
                  const pts = parseInt(tok, 10) || 0;
                  await db.execute({
                    sql: "INSERT INTO test_logs (student_id, class_id, points) VALUES (?, ?, ?)",
                    args: [sid, clsKey, pts]
                  });
                }
              }
            }
          }

          if (cls.history) {
            for (const h of cls.history) {
              const sid = studentIdMap[h.name] || 0;
              await db.execute({
                sql: "INSERT INTO draw_history (student_id, class_id, student_name) VALUES (?, ?, ?)",
                args: [sid, clsKey, h.name]
              });
            }
          }
        }
      }

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    return sendJSON(res, { success: false, error: "Endpoint bulunamadı" }, 404);
  } catch (err) {
    console.error("API Hatası:", err);
    return sendJSON(res, { success: false, error: err.message }, 500);
  }
};
