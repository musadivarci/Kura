// ==========================================
// VERCEL SERVERLESS API — KURA & PERFORMANS
// Supabase (PostgreSQL) / Turso / SQLite Backend — Musa DİVARCI
// Güçlendirilmiş Güvenlik & Yetkilendirme Katmanı (2026)
// ==========================================

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const { createClient: createLibsqlClient } = require('@libsql/client');
const auth = require('../auth');

function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const envFile of envFiles) {
    const envPath = path.join(process.cwd(), envFile);
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

// --- VERİTABANI BAĞLANTISI YAPILANDIRMASI ---
const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const useSupabase = Boolean(supabaseUrl && supabaseKey);

const isVercel = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME;
const defaultLocalPath = isVercel ? path.join(os.tmpdir(), 'kura.db') : path.join(process.cwd(), 'kura.db');
const rawTursoUrl = (process.env.TURSO_DATABASE_URL || '').trim();
const libsqlDbUrl = rawTursoUrl ? rawTursoUrl : `file:${defaultLocalPath}`;
const libsqlAuthToken = (process.env.TURSO_AUTH_TOKEN || '').trim() || undefined;

let supabase = null;
let libsql = null;

if (useSupabase) {
  supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
} else {
  libsql = createLibsqlClient({
    url: libsqlDbUrl,
    authToken: libsqlAuthToken
  });
}

const dbType = useSupabase 
  ? 'supabase' 
  : (rawTursoUrl.startsWith('libsql') || rawTursoUrl.startsWith('https://') ? 'turso' : (isVercel ? 'sqlite-tmp' : 'sqlite-local'));

let isInitialized = false;

// --- GÜVENLİK & RATE LIMITING YARDIMCILARI ---
const rateLimitMap = new Map(); // IP -> Array of timestamps

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown-ip';
}

function checkRateLimit(ip, maxRequests = 5, windowMs = 300000) { // 5 dakikada en fazla 5 istek
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    return false; // Limit aşıldı
  }
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return true;
}

// XSS & Zararlı Karakter Temizleyici (Input Sanitization)
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>?/gm, '').trim();
}

function sanitizeNumber(val, defaultVal = 0, min = -100, max = 100) {
  const num = parseInt(val, 10);
  if (isNaN(num)) return defaultVal;
  return Math.max(min, Math.min(max, num));
}

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

  if (useSupabase) {
    try {
      const { data: clsData, error: clsErr } = await supabase.from('classes').select('id');
      if (!clsErr && (!clsData || clsData.length === 0)) {
        for (const clsKey of ['6', '7', '8']) {
          await supabase.from('classes').upsert({ id: clsKey, name: `${clsKey}. Sınıf` });
          const list = CLASS_DEFAULTS[clsKey];
          const studentRows = list.map((name, idx) => ({
            class_id: clsKey,
            name: name.trim(),
            in_pool: 1,
            sort_order: idx
          }));
          await supabase.from('students').insert(studentRows);
        }
      }
    } catch (e) {
      console.warn("Supabase tablosu kontrol edilirken uyarı:", e.message);
    }
  } else {
    await libsql.execute(`
      CREATE TABLE IF NOT EXISTS classes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
    `);

    await libsql.execute(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        class_id TEXT NOT NULL,
        name TEXT NOT NULL,
        in_pool INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await libsql.execute(`
      CREATE TABLE IF NOT EXISTS ders_ici_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        class_id TEXT NOT NULL,
        type TEXT NOT NULL,
        delta INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await libsql.execute(`
      CREATE TABLE IF NOT EXISTS odev_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        class_id TEXT NOT NULL,
        type TEXT NOT NULL,
        delta INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await libsql.execute(`
      CREATE TABLE IF NOT EXISTS test_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        class_id TEXT NOT NULL,
        points INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await libsql.execute(`
      CREATE TABLE IF NOT EXISTS draw_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        class_id TEXT NOT NULL,
        student_name TEXT NOT NULL,
        drawn_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const res = await libsql.execute("SELECT COUNT(*) as count FROM classes");
    const count = Number(res.rows[0].count);

    if (count === 0) {
      for (const clsKey of ['6', '7', '8']) {
        await libsql.execute({
          sql: "INSERT INTO classes (id, name) VALUES (?, ?)",
          args: [clsKey, `${clsKey}. Sınıf`]
        });

        const list = CLASS_DEFAULTS[clsKey];
        for (let idx = 0; idx < list.length; idx++) {
          await libsql.execute({
            sql: "INSERT INTO students (class_id, name, in_pool, sort_order) VALUES (?, ?, 1, ?)",
            args: [clsKey, list[idx].trim(), idx]
          });
        }
      }
    }
  }

  isInitialized = true;
}

// Tüm Verileri Çekme Fonksiyonu
async function getFullData() {
  await ensureTablesAndSeed();
  const classes = {};

  if (useSupabase) {
    const { data: allStudents, error: stErr } = await supabase
      .from('students')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (stErr) throw new Error("Supabase Öğrenciler Yüklenemedi: " + stErr.message);

    const { data: allDers } = await supabase.from('ders_ici_logs').select('*').order('id', { ascending: true });
    const { data: allOdev } = await supabase.from('odev_logs').select('*').order('id', { ascending: true });
    const { data: allTest } = await supabase.from('test_logs').select('*').order('id', { ascending: true });
    const { data: allHistory } = await supabase.from('draw_history').select('*').order('id', { ascending: true });

    for (const clsKey of ['6', '7', '8']) {
      const clsStudents = (allStudents || []).filter(s => s.class_id === clsKey);
      const fullNames = [];
      const remainingNames = [];
      const scores = {};
      const tokens = {};
      const hwScores = {};
      const hwTokens = {};
      const testScores = {};
      const testTokens = {};
      const studentMap = {};

      clsStudents.forEach(st => {
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

      (allDers || []).filter(d => d.class_id === clsKey).forEach(l => {
        const name = studentMap[l.student_id];
        if (name && scores[name]) {
          if (l.delta > 0) scores[name].plus += Number(l.delta);
          else scores[name].minus += Math.abs(Number(l.delta));
          tokens[name].push(l.type);
        }
      });

      (allOdev || []).filter(o => o.class_id === clsKey).forEach(l => {
        const name = studentMap[l.student_id];
        if (name && hwScores[name]) {
          if (l.delta > 0) hwScores[name].plus += Number(l.delta);
          else hwScores[name].minus += Math.abs(Number(l.delta));
          hwTokens[name].push(l.type);
        }
      });

      (allTest || []).filter(t => t.class_id === clsKey).forEach(l => {
        const name = studentMap[l.student_id];
        if (name && testScores[name] !== undefined) {
          testScores[name] += Number(l.points);
          testTokens[name].push(Number(l.points) > 0 ? `+${l.points}` : `${l.points}`);
        }
      });

      const history = (allHistory || [])
        .filter(h => h.class_id === clsKey)
        .map(h => ({
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
  } else {
    for (const clsKey of ['6', '7', '8']) {
      const studentsRes = await libsql.execute({
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
      const dersRes = await libsql.execute({
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
      const odevRes = await libsql.execute({
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
      const testRes = await libsql.execute({
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
      const historyRes = await libsql.execute({
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
  
  // OWASP Güvenlik Başlıkları
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  Object.keys(extraHeaders).forEach(k => {
    res.setHeader(k, extraHeaders[k]);
  });
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

// Oturum Doğrulama Middleware
function authenticateRequest(req) {
  const authHeader = req.headers.authorization;
  let sessionToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (!sessionToken) {
    sessionToken = getCookie(req, 'auth_session');
  }
  return auth.verifySession(sessionToken);
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
  const clientIp = getClientIp(req);

  try {
    // --- AUTH ENDPOINTS ---
    // 1. POST /api/auth/send-pin
    if ((pathname.endsWith('/auth/send-pin') || pathname.endsWith('/auth/send-link')) && req.method === 'POST') {
      // Rate Limit Kontrolü: 5 dakikada en fazla 4 istek
      if (!checkRateLimit(clientIp, 4, 300000)) {
        return sendJSON(res, {
          success: false,
          error: "Çok fazla giriş kodu isteği gönderildi. Lütfen birkaç dakika sonra tekrar deneyin."
        }, 429);
      }

      const body = await parseBody(req);
      const email = sanitizeText(body.email || auth.ALLOWED_EMAIL).toLowerCase();

      if (email !== auth.ALLOWED_EMAIL) {
        return sendJSON(res, { success: false, error: `Sadece ${auth.ALLOWED_EMAIL} adresi ile giriş yapılabilir.` }, 403);
      }

      const { pin, challengeToken, expiresAt } = auth.generatePinChallenge(email);
      const mailResult = await auth.sendPinEmail(email, pin);

      return sendJSON(res, {
        success: true,
        message: `4 haneli giriş kodu ${email} adresinize gönderildi (60 saniye geçerli).`,
        challengeToken,
        expiresIn: auth.PIN_EXPIRY_SECONDS
      });
    }

    // 2. POST /api/auth/verify-pin
    if (pathname.endsWith('/auth/verify-pin') && req.method === 'POST') {
      const body = await parseBody(req);
      const pin = sanitizeText(body.pin);
      const challengeToken = body.challengeToken;

      const result = auth.verifyPin(pin, challengeToken);
      if (!result.valid) {
        return sendJSON(res, { success: false, error: result.error }, 400);
      }

      const cookieVal = `auth_session=${result.sessionToken}; Path=/; SameSite=Lax; HttpOnly`;
      return sendJSON(res, {
        success: true,
        user: { email: result.email },
        sessionToken: result.sessionToken
      }, 200, { 'Set-Cookie': cookieVal });
    }

    // 3. GET /api/auth/me
    if (pathname.endsWith('/auth/me') && req.method === 'GET') {
      const session = authenticateRequest(req);
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

    // --- TÜM VERİ VE DEĞİŞİKLİK ENDPOINTLERİ İÇİN ZORUNLU OTURUM KONTROLÜ ---
    const authenticatedUser = authenticateRequest(req);
    if (!authenticatedUser) {
      return sendJSON(res, { success: false, error: "Yetkisiz erişim! Lütfen önce giriş yapın." }, 401);
    }

    await ensureTablesAndSeed();

    // GET /api/data
    if (pathname.endsWith('/data') && req.method === 'GET') {
      const data = await getFullData();
      return sendJSON(res, { success: true, data, dbType });
    }

    // POST /api/score/dersici
    if (pathname.endsWith('/score/dersici') && req.method === 'POST') {
      const body = await parseBody(req);
      const classKey = sanitizeText(body.classKey);
      const studentName = sanitizeText(body.studentName);
      const delta = sanitizeNumber(body.delta, 1, -10, 10);
      
      if (useSupabase) {
        const { data: st } = await supabase.from('students').select('id').eq('class_id', classKey).eq('name', studentName).maybeSingle();
        if (!st) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);
        
        const type = delta > 0 ? '+' : '-';
        await supabase.from('ders_ici_logs').insert({ student_id: st.id, class_id: classKey, type, delta });
      } else {
        const studentRes = await libsql.execute({
          sql: "SELECT * FROM students WHERE class_id = ? AND name = ?",
          args: [classKey, studentName]
        });
        if (studentRes.rows.length === 0) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);
        
        const st = studentRes.rows[0];
        const type = delta > 0 ? '+' : '-';
        await libsql.execute({
          sql: "INSERT INTO ders_ici_logs (student_id, class_id, type, delta) VALUES (?, ?, ?, ?)",
          args: [st.id, classKey, type, delta]
        });
      }

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/score/odev
    if (pathname.endsWith('/score/odev') && req.method === 'POST') {
      const body = await parseBody(req);
      const classKey = sanitizeText(body.classKey);
      const studentName = sanitizeText(body.studentName);
      const delta = sanitizeNumber(body.delta, 1, -10, 10);

      if (useSupabase) {
        const { data: st } = await supabase.from('students').select('id').eq('class_id', classKey).eq('name', studentName).maybeSingle();
        if (!st) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);

        const type = delta > 0 ? '+' : '-';
        await supabase.from('odev_logs').insert({ student_id: st.id, class_id: classKey, type, delta });
      } else {
        const studentRes = await libsql.execute({
          sql: "SELECT * FROM students WHERE class_id = ? AND name = ?",
          args: [classKey, studentName]
        });
        if (studentRes.rows.length === 0) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);

        const st = studentRes.rows[0];
        const type = delta > 0 ? '+' : '-';
        await libsql.execute({
          sql: "INSERT INTO odev_logs (student_id, class_id, type, delta) VALUES (?, ?, ?, ?)",
          args: [st.id, classKey, type, delta]
        });
      }

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/score/test
    if (pathname.endsWith('/score/test') && req.method === 'POST') {
      const body = await parseBody(req);
      const classKey = sanitizeText(body.classKey);
      const studentName = sanitizeText(body.studentName);
      const delta = sanitizeNumber(body.delta, 1, -10, 10);

      if (useSupabase) {
        const { data: st } = await supabase.from('students').select('id').eq('class_id', classKey).eq('name', studentName).maybeSingle();
        if (!st) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);

        await supabase.from('test_logs').insert({ student_id: st.id, class_id: classKey, points: delta });
      } else {
        const studentRes = await libsql.execute({
          sql: "SELECT * FROM students WHERE class_id = ? AND name = ?",
          args: [classKey, studentName]
        });
        if (studentRes.rows.length === 0) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);

        const st = studentRes.rows[0];
        await libsql.execute({
          sql: "INSERT INTO test_logs (student_id, class_id, points) VALUES (?, ?, ?)",
          args: [st.id, classKey, delta]
        });
      }

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/score/undo
    if (pathname.endsWith('/score/undo') && req.method === 'POST') {
      const body = await parseBody(req);
      const classKey = sanitizeText(body.classKey);
      const studentName = sanitizeText(body.studentName);
      const type = sanitizeText(body.type);

      if (useSupabase) {
        const { data: st } = await supabase.from('students').select('id').eq('class_id', classKey).eq('name', studentName).maybeSingle();
        if (!st) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);

        const table = type === 'dersici' ? 'ders_ici_logs' : (type === 'odev' ? 'odev_logs' : (type === 'test' ? 'test_logs' : null));
        if (table) {
          const { data: lastLog } = await supabase.from(table).select('id').eq('student_id', st.id).eq('class_id', classKey).order('id', { ascending: false }).limit(1).maybeSingle();
          if (lastLog) {
            await supabase.from(table).delete().eq('id', lastLog.id);
          }
        }
      } else {
        const studentRes = await libsql.execute({
          sql: "SELECT * FROM students WHERE class_id = ? AND name = ?",
          args: [classKey, studentName]
        });
        if (studentRes.rows.length === 0) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);
        const st = studentRes.rows[0];

        if (type === 'dersici') {
          const lastLog = await libsql.execute({
            sql: "SELECT id FROM ders_ici_logs WHERE student_id = ? AND class_id = ? ORDER BY id DESC LIMIT 1",
            args: [st.id, classKey]
          });
          if (lastLog.rows.length > 0) {
            await libsql.execute({
              sql: "DELETE FROM ders_ici_logs WHERE id = ?",
              args: [lastLog.rows[0].id]
            });
          }
        } else if (type === 'odev') {
          const lastLog = await libsql.execute({
            sql: "SELECT id FROM odev_logs WHERE student_id = ? AND class_id = ? ORDER BY id DESC LIMIT 1",
            args: [st.id, classKey]
          });
          if (lastLog.rows.length > 0) {
            await libsql.execute({
              sql: "DELETE FROM odev_logs WHERE id = ?",
              args: [lastLog.rows[0].id]
            });
          }
        } else if (type === 'test') {
          const lastLog = await libsql.execute({
            sql: "SELECT id FROM test_logs WHERE student_id = ? AND class_id = ? ORDER BY id DESC LIMIT 1",
            args: [st.id, classKey]
          });
          if (lastLog.rows.length > 0) {
            await libsql.execute({
              sql: "DELETE FROM test_logs WHERE id = ?",
              args: [lastLog.rows[0].id]
            });
          }
        }
      }

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/draw
    if (pathname.endsWith('/draw') && req.method === 'POST') {
      const body = await parseBody(req);
      const classKey = sanitizeText(body.classKey);
      const studentName = sanitizeText(body.studentName);
      const autoRemove = Boolean(body.autoRemove);

      if (useSupabase) {
        const { data: st } = await supabase.from('students').select('id').eq('class_id', classKey).eq('name', studentName).maybeSingle();
        if (!st) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);

        await supabase.from('draw_history').insert({
          student_id: st.id,
          class_id: classKey,
          student_name: studentName
        });

        if (autoRemove) {
          await supabase.from('students').update({ in_pool: 0 }).eq('id', st.id);
        }
      } else {
        const studentRes = await libsql.execute({
          sql: "SELECT * FROM students WHERE class_id = ? AND name = ?",
          args: [classKey, studentName]
        });
        if (studentRes.rows.length === 0) return sendJSON(res, { success: false, error: "Öğrenci bulunamadı" }, 404);

        const st = studentRes.rows[0];
        await libsql.execute({
          sql: "INSERT INTO draw_history (student_id, class_id, student_name) VALUES (?, ?, ?)",
          args: [st.id, classKey, studentName]
        });

        if (autoRemove) {
          await libsql.execute({
            sql: "UPDATE students SET in_pool = 0 WHERE id = ?",
            args: [st.id]
          });
        }
      }

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/pool/remove
    if (pathname.endsWith('/pool/remove') && req.method === 'POST') {
      const body = await parseBody(req);
      const classKey = sanitizeText(body.classKey);
      const studentName = sanitizeText(body.studentName);

      if (useSupabase) {
        await supabase.from('students').update({ in_pool: 0 }).eq('class_id', classKey).eq('name', studentName);
      } else {
        await libsql.execute({
          sql: "UPDATE students SET in_pool = 0 WHERE class_id = ? AND name = ?",
          args: [classKey, studentName]
        });
      }

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/pool/reset
    if (pathname.endsWith('/pool/reset') && req.method === 'POST') {
      const body = await parseBody(req);
      const classKey = sanitizeText(body.classKey);

      if (useSupabase) {
        await supabase.from('students').update({ in_pool: 1 }).eq('class_id', classKey);
        await supabase.from('draw_history').delete().eq('class_id', classKey);
      } else {
        await libsql.execute({
          sql: "UPDATE students SET in_pool = 1 WHERE class_id = ?",
          args: [classKey]
        });
        await libsql.execute({
          sql: "DELETE FROM draw_history WHERE class_id = ?",
          args: [classKey]
        });
      }

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/scores/reset
    if (pathname.endsWith('/scores/reset') && req.method === 'POST') {
      const body = await parseBody(req);
      const classKey = sanitizeText(body.classKey);
      const type = sanitizeText(body.type);

      if (useSupabase) {
        if (type === 'dersici') {
          await supabase.from('ders_ici_logs').delete().eq('class_id', classKey);
        } else if (type === 'odev') {
          await supabase.from('odev_logs').delete().eq('class_id', classKey);
        } else if (type === 'test') {
          await supabase.from('test_logs').delete().eq('class_id', classKey);
        }
      } else {
        if (type === 'dersici') {
          await libsql.execute({ sql: "DELETE FROM ders_ici_logs WHERE class_id = ?", args: [classKey] });
        } else if (type === 'odev') {
          await libsql.execute({ sql: "DELETE FROM odev_logs WHERE class_id = ?", args: [classKey] });
        } else if (type === 'test') {
          await libsql.execute({ sql: "DELETE FROM test_logs WHERE class_id = ?", args: [classKey] });
        }
      }

      const data = await getFullData();
      return sendJSON(res, { success: true, data });
    }

    // POST /api/students/update
    if (pathname.endsWith('/students/update') && req.method === 'POST') {
      const body = await parseBody(req);
      const classKey = sanitizeText(body.classKey);
      const names = body.names;
      if (!Array.isArray(names)) return sendJSON(res, { success: false, error: "Geçersiz format" }, 400);

      const sanitizedNames = names.map(n => sanitizeText(n)).filter(n => n.length > 0);

      if (useSupabase) {
        await supabase.from('students').delete().eq('class_id', classKey);
        const rows = sanitizedNames.map((n, idx) => ({
          class_id: classKey,
          name: n,
          in_pool: 1,
          sort_order: idx
        }));
        if (rows.length > 0) {
          await supabase.from('students').insert(rows);
        }
      } else {
        await libsql.execute({ sql: "DELETE FROM students WHERE class_id = ?", args: [classKey] });
        for (let idx = 0; idx < sanitizedNames.length; idx++) {
          await libsql.execute({
            sql: "INSERT INTO students (class_id, name, in_pool, sort_order) VALUES (?, ?, 1, ?)",
            args: [classKey, sanitizedNames[idx], idx]
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

      if (useSupabase) {
        await supabase.from('draw_history').delete().neq('id', 0);
        await supabase.from('ders_ici_logs').delete().neq('id', 0);
        await supabase.from('odev_logs').delete().neq('id', 0);
        await supabase.from('test_logs').delete().neq('id', 0);
        await supabase.from('students').delete().neq('id', 0);

        for (const clsKey of ['6', '7', '8']) {
          const cls = backupData.classes[clsKey];
          if (cls && cls.full) {
            const studentIdMap = {};
            for (let idx = 0; idx < cls.full.length; idx++) {
              const name = sanitizeText(cls.full[idx]);
              const inPool = (cls.remaining && cls.remaining.includes(name)) ? 1 : 0;
              const { data: stRow } = await supabase.from('students').insert({
                class_id: clsKey,
                name: name,
                in_pool: inPool,
                sort_order: idx
              }).select('id').single();
              if (stRow) studentIdMap[name] = stRow.id;
            }

            if (cls.tokens) {
              const dersRows = [];
              for (const name of Object.keys(cls.tokens)) {
                const sid = studentIdMap[name];
                if (sid) {
                  for (const tok of cls.tokens[name]) {
                    dersRows.push({
                      student_id: sid,
                      class_id: clsKey,
                      type: sanitizeText(tok),
                      delta: tok === '+' ? 1 : -1
                    });
                  }
                }
              }
              if (dersRows.length > 0) await supabase.from('ders_ici_logs').insert(dersRows);
            }

            if (cls.hwTokens) {
              const odevRows = [];
              for (const name of Object.keys(cls.hwTokens)) {
                const sid = studentIdMap[name];
                if (sid) {
                  for (const tok of cls.hwTokens[name]) {
                    odevRows.push({
                      student_id: sid,
                      class_id: clsKey,
                      type: sanitizeText(tok),
                      delta: tok === '+' ? 1 : -1
                    });
                  }
                }
              }
              if (odevRows.length > 0) await supabase.from('odev_logs').insert(odevRows);
            }

            if (cls.testTokens) {
              const testRows = [];
              for (const name of Object.keys(cls.testTokens)) {
                const sid = studentIdMap[name];
                if (sid) {
                  for (const tok of cls.testTokens[name]) {
                    const pts = parseInt(tok, 10) || 0;
                    testRows.push({
                      student_id: sid,
                      class_id: clsKey,
                      points: pts
                    });
                  }
                }
              }
              if (testRows.length > 0) await supabase.from('test_logs').insert(testRows);
            }

            if (cls.history) {
              const histRows = [];
              for (const h of cls.history) {
                const sid = studentIdMap[h.name] || 0;
                histRows.push({
                  student_id: sid,
                  class_id: clsKey,
                  student_name: sanitizeText(h.name)
                });
              }
              if (histRows.length > 0) await supabase.from('draw_history').insert(histRows);
            }
          }
        }
      } else {
        await libsql.execute("DELETE FROM draw_history;");
        await libsql.execute("DELETE FROM ders_ici_logs;");
        await libsql.execute("DELETE FROM odev_logs;");
        await libsql.execute("DELETE FROM test_logs;");
        await libsql.execute("DELETE FROM students;");

        for (const clsKey of ['6', '7', '8']) {
          const cls = backupData.classes[clsKey];
          if (cls && cls.full) {
            const studentIdMap = {};
            for (let idx = 0; idx < cls.full.length; idx++) {
              const name = sanitizeText(cls.full[idx]);
              const inPool = (cls.remaining && cls.remaining.includes(name)) ? 1 : 0;
              const res = await libsql.execute({
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
                    await libsql.execute({
                      sql: "INSERT INTO ders_ici_logs (student_id, class_id, type, delta) VALUES (?, ?, ?, ?)",
                      args: [sid, clsKey, sanitizeText(tok), tok === '+' ? 1 : -1]
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
                    await libsql.execute({
                      sql: "INSERT INTO odev_logs (student_id, class_id, type, delta) VALUES (?, ?, ?, ?)",
                      args: [sid, clsKey, sanitizeText(tok), tok === '+' ? 1 : -1]
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
                    await libsql.execute({
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
                await libsql.execute({
                  sql: "INSERT INTO draw_history (student_id, class_id, student_name) VALUES (?, ?, ?)",
                  args: [sid, clsKey, sanitizeText(h.name)]
                });
              }
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
