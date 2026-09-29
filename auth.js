// ==========================================
// AUTH & MAGIC LINK SERVICE (60s Expiry)
// Musa DİVARCI — musadivarci19@gmail.com
// ==========================================

const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const ALLOWED_EMAIL = "musadivarci19@gmail.com";
const LINK_EXPIRY_SECONDS = 60; // 60 Saniye
const JWT_SECRET = process.env.JWT_SECRET || 'kura-secure-jwt-secret-musa-divarci-2026';

// Tek kullanımlık token takibi (in-memory blacklist)
const usedTokens = new Set();

function generateMagicToken(email, hostUrl = '') {
  const cleanEmail = (email || '').toLowerCase().trim();
  if (cleanEmail !== ALLOWED_EMAIL) {
    throw new Error("Yetkisiz e-posta adresi! Yalnızca " + ALLOWED_EMAIL + " giriş yapabilir.");
  }

  const nonce = Math.random().toString(36).substring(2, 10);
  const token = jwt.sign(
    { email: cleanEmail, purpose: 'magic-link', nonce },
    JWT_SECRET,
    { expiresIn: `${LINK_EXPIRY_SECONDS}s` }
  );

  const expiresAt = Date.now() + (LINK_EXPIRY_SECONDS * 1000);
  return { token, expiresAt };
}

function verifyMagicToken(token) {
  if (!token) {
    return { valid: false, error: "Giriş bağlantısı bulunamadı." };
  }

  if (usedTokens.has(token)) {
    return { valid: false, error: "Bu giriş bağlantısı daha önce kullanılmış. Lütfen yeni bir link isteyin." };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.purpose !== 'magic-link' || decoded.email !== ALLOWED_EMAIL) {
      return { valid: false, error: "Geçersiz giriş bağlantısı." };
    }

    // Tek kullanımlık yap
    usedTokens.add(token);
    // 5 dakika sonra bellekten temizle
    setTimeout(() => usedTokens.delete(token), 300000);

    // 30 Günlük Oturum Token'ı
    const sessionToken = jwt.sign(
      { email: decoded.email, purpose: 'session' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    const sessionExpiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);

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
        error: "Giriş bağlantısının 60 saniyelik süresi doldu! Lütfen yeni bir giriş bağlantısı isteyin."
      };
    }
    return { valid: false, error: "Geçersiz veya bozuk giriş bağlantısı." };
  }
}

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

// Mail Gönderme Fonksiyonu
async function sendMagicLinkEmail(email, magicLinkUrl) {
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
      subject: "🔑 Tek Tıkla Giriş Bağlantınız (60 Saniye)",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f3f4f6; padding: 36px 24px; border-radius: 16px; max-width: 520px; margin: 20px auto; border: 1px solid #1e293b; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
          <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 38px;">🎲</span>
            <h2 style="color: #ffffff; margin: 10px 0 4px 0; font-size: 22px; font-weight: 700;">Öğrenci Performans Sistemi</h2>
            <p style="color: #818cf8; font-size: 14px; margin: 0; font-weight: 600;">Musa DİVARCI</p>
          </div>
          
          <p style="font-size: 15px; color: #cbd5e1; line-height: 1.6; margin: 0 0 12px 0;">Merhaba Musa Hocam,</p>
          <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 24px 0;">
            Sisteme güvenli giriş yapmak için aşağıdaki butona tıklayın. Bu bağlantı güvenlik nedeniyle <b>tam 60 saniye</b> geçerlidir.
          </p>
          
          <div style="text-align: center; margin: 28px 0;">
            <a href="${magicLinkUrl}" style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: #ffffff; padding: 15px 36px; border-radius: 12px; font-weight: 700; text-decoration: none; display: inline-block; font-size: 16px; box-shadow: 0 6px 20px rgba(79, 70, 229, 0.45); letter-spacing: 0.3px;">
              🚀 Tek Tıkla Oturumu Aç
            </a>
          </div>

          <div style="background-color: #131d31; border: 1px dashed #312e81; border-radius: 10px; padding: 12px; text-align: center; margin-top: 20px;">
            <p style="margin: 0; font-size: 12px; color: #a5b4fc;">
              ⏳ <b>Kalan Süre:</b> 60 Saniye (Süre dolduğunda yeni bir link isteyebilirsiniz)
            </p>
          </div>

          <p style="font-size: 11px; color: #64748b; text-align: center; margin-top: 28px; border-top: 1px solid #1e293b; padding-top: 16px; line-height: 1.5;">
            Bu e-postayı siz talep etmediyseniz lütfen dikkate almayın. Bağlantı 1 dakika içinde kendiliğinden geçersiz olacaktır.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[SMTP] Giriş e-postası başarıyla gönderildi -> ${email}`);
    return { sent: true };
  } catch (e) {
    console.error("[SMTP] E-posta gönderim hatası:", e);
    return { sent: false, error: e.message };
  }
}

module.exports = {
  ALLOWED_EMAIL,
  LINK_EXPIRY_SECONDS,
  generateMagicToken,
  verifyMagicToken,
  verifySession,
  sendMagicLinkEmail
};
