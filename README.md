# 🎲 Kura & Öğrenci Performans Değerlendirme Sistemi

> **Geliştirici:** Musa DİVARCI  
> **Mimari:** Node.js, SQLite (WAL Modu — Sıfır Veri Kaybı), Vanilla JS, Tailwind CSS, Web Audio API

---

## 🌟 Özellikler

- **🎯 Akıllı & Heyecanlı Kura Çarkı:** 16 adımlık dengeli gerilim animasyonu, slot-machine çark dönüşü, zafer fanfar müziği ve 3 yönlü konfeti kutlaması.
- **⚡ Hızlı Değerlendirme:** Kura sonrasında tek tıkla sadece Ders İçi `+1` ve `-1` puanlama butonları.
- **📋 Kura Geçmişi (Ters Sıralı):** Son çekilen öğrenci en üstte vurgulu olarak listelenir.
- **📚 5 Temel Modül:**
  1. **Kura:** Canlı kura çekimi ve anlık sözlü değerlendirme.
  2. **Ders İçi:** Sözlü katılım takibi ve artı/eksi simge dizilimi.
  3. **Ödev:** Ödev ve sorumluluk takip listesi.
  4. **Test:** 3, 2, 1 puanlama ve her 3 puanda kazanılan ⭐ Yıldız ödül sistemi.
  5. **Genel Durum:** Renk kodlu (Zümrüt, Amber, Mor, İndigo) tüm kriterleri birleştiren genel karne tablosu.
- **💾 SQLite Veritabanı:** LocalStorage bağımlılığı yok! Tüm işlemler `kura.db` dosyasına ACID standartlarında anlık kaydedilir.
- **📊 Excel & JSON Dışa Aktarma:** Tek tıkla sınıf listesi ve not dökümü indirme.

---

## 🚀 Kurulum ve Çalıştırma

### 1. Yerel Olarak Çalıştırma (En Hızlı Yol)
Windows ortamında **`Baslat.bat`** dosyasına çift tıklamanız yeterlidir. Otomatik olarak sunucuyu başlatır ve tarayıcınızı açar:
```
http://localhost:3000
```

### 2. Terminal ile Başlatma
```bash
npm start
```
veya
```bash
node server.js
```

---

## 🌐 Canlı Yayına Alma (Deploy)

Bu proje bağımsız bir Node.js ve SQLite uygulaması olduğu için **Render**, **Railway**, **Fly.io** gibi platformlarda 1 tıkla canlıya alınabilir.

### Render.com ile Canlıya Çıkma:
1. GitHub reponuzu Render.com'a bağlayın.
2. **Build Command:** `npm install` (veya boş)
3. **Start Command:** `node server.js`
4. Uygulamanız ücretsiz olarak anında canlıya geçecektir.

---

© 2026 Musa DİVARCI — Tüm Hakları Saklıdır.
