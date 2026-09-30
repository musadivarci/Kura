// ==========================================
// AUTH & 4-DIGIT PIN CODE SERVICE (60s Expiry)
// Musa DİVARCI — musadivarci19@gmail.com
// ==========================================

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const ALLOWED_EMAIL = "musadivarci19@gmail.com";
const PIN_EXPIRY_SECONDS = 60; // 60 Saniye
const JWT_SECRET = process.env.JWT_SECRET || 'kura-secure-jwt-secret-musa-divarci-2026';

function hashPin(pin) {
  return crypto.createHmac('sha256', JWT_SECRET).update(pin).digest('hex');
}

// 4 Haneli Rastgele PIN ve İmzalı Challenge Üretici
function generatePinChallenge(email) {
  const cleanEmail = (email || '').toLowerCase().trim();
  if (cleanEmail !== ALLOWED_EMAIL) {
    throw new Error("Yetkisiz e-posta adresi! Yalnızca " + ALLOWED_EMAIL + " giriş yapabilir.");
  }

  // 4 Haneli Sayısal Kod (örn: 5824)
  const pin = Math.floor(1000 + Math.random() * 9000).toString();
  const pinHash = hashPin(pin);
  const nonce = Math.random().toString(36).substring(2, 10);

  const challengeToken = jwt.sign(
    { email: cleanEmail, pinHash, nonce, purpose: 'pin-challenge' },
    JWT_SECRET,
    { expiresIn: `${PIN_EXPIRY_SECONDS}s` }
  );

  const expiresAt = Date.now() + (PIN_EXPIRY_SECONDS * 1000);
  return { pin, challengeToken, expiresAt };
}

const MAX_FAILED_ATTEMPTS = 5;
const attemptTracker = new Map();

// Periyodik temizleme (bellek şişmesini önlemek için)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of attemptTracker.entries()) {
    if (now - val.lastAttempt > 120000) { // 2 dakika sonra sil
      attemptTracker.delete(key);
    }
  }
}, 60000);

// PIN Doğrulama
function verifyPin(pin, challengeToken) {
  if (!pin || !challengeToken) {
    return { valid: false, error: "Lütfen 4 haneli doğrulama kodunu girin." };
  }

  const cleanPin = pin.toString().replace(/\s+/g, '').trim();
  if (cleanPin.length !== 4) {
    return { valid: false, error: "Doğrulama kodu 4 haneli olmalıdır." };
  }

  try {
    const decoded = jwt.verify(challengeToken, JWT_SECRET);
    if (decoded.purpose !== 'pin-challenge' || decoded.email !== ALLOWED_EMAIL) {
      return { valid: false, error: "Geçersiz giriş isteği. Lütfen yeni kod isteyin." };
    }

    const trackerKey = decoded.nonce || challengeToken.slice(-16);
    const tracker = attemptTracker.get(trackerKey) || { count: 0, lastAttempt: Date.now() };

    if (tracker.count >= MAX_FAILED_ATTEMPTS) {
      return {
        valid: false,
        error: "Çok fazla hatalı deneme yapıldı! Güvenlik sebebiyle bu kod iptal edildi. Lütfen yeni bir kod isteyin."
      };
    }

    const expectedHash = hashPin(cleanPin);
    if (decoded.pinHash !== expectedHash) {
      tracker.count++;
      tracker.lastAttempt = Date.now();
      attemptTracker.set(trackerKey, tracker);

      const remaining = MAX_FAILED_ATTEMPTS - tracker.count;
      return {
        valid: false,
        error: `Girdiğiniz 4 haneli kod hatalı! (${remaining} deneme hakkınız kaldı)`
      };
    }

    // Başarılı giriş -> izleyiciyi temizle
    attemptTracker.delete(trackerKey);

    // Başarılı Giriş -> Oturum (Tarayıcı kapanınca silinir)
    const sessionToken = jwt.sign(
      { email: decoded.email, purpose: 'session' },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    const sessionExpiresAt = Date.now() + (12 * 60 * 60 * 1000);

    return {
      valid: true,
      email: decoded.email,
      sessionToken,
      sessionExpiresAt
    };
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return {
        valid: false,
        error: "Giriş kodunun 60 saniyelik süresi doldu! Lütfen yeni bir kod isteyin."
      };
    }
    return { valid: false, error: "Geçersiz veya süresi dolmuş kod. Lütfen yeni kod isteyin." };
  }
}

// Oturum Doğrulama
function verifySession(sessionToken) {
  if (!sessionToken) return null;
  try {
    const decoded = jwt.verify(sessionToken, JWT_SECRET);
    if (decoded.purpose !== 'session' || decoded.email !== ALLOWED_EMAIL) {
      return null;
    }
    return { email: decoded.email };
  } catch {
    return null;
  }
}

// 4 Haneli PIN E-Postası Gönderme Fonksiyonu
async function sendPinEmail(email, pin) {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
  const user = process.env.SMTP_USER || 'musadivarci19@gmail.com';
  const rawPass = process.env.SMTP_PASS || 'yelcmphwgbytxfmo';
  const pass = rawPass.replace(/\s+/g, '');

  try {
    const transporter = nodemailer.createTransport({
      host: host,
      port: port,
      secure: port === 465,
      auth: { user, pass }
    });

    const mailOptions = {
      from: `"Öğrenci Performans Sistemi" <${user}>`,
      to: email,
      subject: `🔑 Giriş Kodunuz: ${pin} (60 Saniye Geçerli)`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f3f4f6; padding: 36px 24px; border-radius: 16px; max-width: 480px; margin: 20px auto; border: 1px solid #1e293b; box-shadow: 0 12px 30px rgba(0,0,0,0.6);">
          <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 38px;">🎲</span>
            <h2 style="color: #ffffff; margin: 10px 0 4px 0; font-size: 22px; font-weight: 700;">Öğrenci Performans Sistemi</h2>
            <p style="color: #818cf8; font-size: 14px; margin: 0; font-weight: 600;">Musa DİVARCI</p>
          </div>
          
          <p style="font-size: 15px; color: #cbd5e1; line-height: 1.6; margin: 0 0 8px 0;">Merhaba Musa Hocam,</p>
          <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 24px 0;">
            Sisteme giriş yapmak için aşağıdaki <b>4 haneli tek seferlik kodu</b> bilgisayar ekranına girin:
          </p>
          
          <!-- 4-DIGIT PIN CODE BADGE -->
          <div style="text-align: center; margin: 28px 0;">
            <div style="display: inline-block; background: #131d31; border: 2px solid #4f46e5; border-radius: 16px; padding: 18px 40px; box-shadow: 0 6px 25px rgba(79, 70, 229, 0.35);">
              <span style="font-family: 'Courier New', Courier, monospace, monospace; font-size: 44px; font-weight: 900; letter-spacing: 12px; color: #ffffff;">
                ${pin}
              </span>
            </div>
          </div>

          <div style="background-color: #0f172a; border: 1px dashed #334155; border-radius: 10px; padding: 12px; text-align: center; margin-top: 20px;">
            <p style="margin: 0; font-size: 12px; color: #fbbf24; font-weight: 600;">
              ⏳ Bu kod 60 saniye boyunca geçerlidir.
            </p>
          </div>

          <p style="font-size: 11px; color: #475569; text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #1e293b; line-height: 1.5;">
            Bu isteği siz yapmadıysanız lütfen dikkate almayın.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[SMTP] 4 Haneli PIN e-postası başarıyla gönderildi -> ${email} (PIN: ${pin})`);
    return { sent: true };
  } catch (e) {
    console.error("[SMTP] PIN e-posta gönderim hatası:", e);
    return { sent: false, error: e.message };
  }
}

module.exports = {
  ALLOWED_EMAIL,
  PIN_EXPIRY_SECONDS,
  generatePinChallenge,
  verifyPin,
  verifySession,
  sendPinEmail
};
