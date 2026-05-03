# SEO Radar — Competitive SERP Analyzer

**Chrome Extension + Node.js REST API**

Google arama sonuçlarından rakipleri analiz eden, SEO sinyallerini ölçen ve kullanıcı bazlı tarama geçmişi tutan full stack bir araç.

---

## Neden Yaptım?

SEO çalışmaları sırasında rakip sayfaların hangi anahtar kelimeleri nasıl kullandığını, sayfa yapılarını ve teknik sinyallerini analiz etmem gerekiyordu. Mevcut araçlar ya çok pahalıydı ya da ihtiyacım olan detay düzeyini sunmuyordu.

Bu yüzden Google SERP üzerinde doğrudan çalışan, her rakip sayfayı gerçek zamanlı fetch eden ve kendi puanlama sistemimle değerlendiren bir araç inşa etmeye karar verdim. Süreci tam anlamıyla anlamak için hiçbir framework kullanmadan Vanilla JS ile başladım; ardından tarama geçmişini kalıcı hale getirmek için Node.js backend ve PostgreSQL ekledim.

---

## Ne Yapar?

- Google arama sonuçları sayfasında açık olan uzantı popup'ı ile tarama başlatılır
- Sayfadaki organik sonuçlar (başlık, URL, snippet) DOM'dan çekilir
- Her URL arka planda fetch edilir, HTML parse edilir
- Her sayfa için şunlar hesaplanır:
  - **SEO Skoru (0–100):** Sorgu kapsaması, başlık ve heading içeriği, meta description varlığı, gizli metin cezası
  - **Authority Skoru (0–100):** Canonical, robots, iç link sayısı, URL yapısı
  - **Intent Tespiti:** Ürün, kategori, blog, karşılaştırma veya marka sayfası sınıflandırması
  - **Keyword Gap Analizi:** Rakiplerin kullandığı ama benim hedeflemediğim terimler
- Sonuçlar kart görünümünde listelenir, filtrelenebilir, CSV olarak indirilebilir
- Kullanıcı hesabıyla giriş yapıldığında taramalar backend'e kaydedilir

---

## Teknik Kararlar

### Neden Vanilla JS?

Chrome Extension ortamında React gibi bir framework kullanmak, build pipeline kurulumu, bundle boyutu ve Manifest V3 kısıtları açısından gereksiz karmaşıklık yaratırdı. Vanilla JS ile DOM API'yi, async/await akışını ve modül kalıplarını daha net öğrendim.

### Neden Node.js + Express?

JavaScript hem frontend hem backend tarafında kullanmak benim için öğrenme sürecini hızlandırdı. Express minimal yapısıyla ne yaptığımı tam olarak görmemi sağladı; bir framework'ün arkasına gizlenmeden HTTP, middleware ve routing kavramlarını elle yazdım.

### Neden Prisma?

SQL sorgularını direkt yazmak yerine tip güvenli bir ORM kullanmak istedim. Prisma'nın schema-first yaklaşımı veritabanı modellerini açık ve okunabilir tutuyor. Migration sistemi de geliştirme sürecini çok kolaylaştırdı.

### Neden JWT?

Kullanıcı session'larını sunucu tarafında saklamak yerine stateless bir auth mekanizması kurmak istedim. JWT ile token'ı client'ta (Chrome storage) tutarak her istekte doğrulama yapıyorum.

---

## Neler Öğrendim?

- **Chrome Extension Manifest V3** mimarisi: service worker, content script izolasyonu, scripting API ile tab'a kod enjekte etme
- **DOM parsing:** DOMParser ile fetch edilen raw HTML'den title, meta, heading ve iç link çıkarma
- **Puanlama sistemi tasarımı:** Ağırlıklı metrik hesaplama, normalize etme, ceza/bonus mantığı
- **Türkçe NLP temelleri:** Karakter normalizasyonu (ç, ş, ğ → ASCII), token bazlı kapsama hesaplama, stop word filtreleme
- **Node.js + Express:** Route/controller/middleware katmanlama, hata yönetimi, CORS yapılandırması
- **Prisma ORM:** Schema tanımlama, migration, ilişkili veri oluşturma (nested create), sayfalama
- **JWT auth:** Token üretme, doğrulama, middleware ile koruma
- **Asenkron mimari:** Paralel worker pattern ile birden fazla URL'yi eş zamanlı analiz etme

---

## Proje Yapısı

```
serp_analiz_Xalincitysz/
├── extension/              # Chrome uzantısı (frontend)
│   ├── manifest.json
│   ├── popup.html / popup.js
│   ├── results.html / results.js
│   ├── analyzer.js         # Çekirdek analiz motoru
│   ├── background.js
│   └── style.css
└── backend/                # REST API (Node.js)
    ├── src/
    │   ├── app.js          # Express uygulaması
    │   ├── routes/         # auth.js, scans.js
    │   ├── controllers/    # authController.js, scanController.js
    │   └── middleware/     # auth.js (JWT doğrulama)
    ├── prisma/
    │   └── schema.prisma   # User, Scan, ScanResult modelleri
    └── package.json
```

---

## API Endpointleri

| Method | Endpoint | Açıklama | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Yeni hesap oluştur | — |
| POST | `/api/auth/login` | Giriş yap, token al | — |
| GET | `/api/auth/me` | Oturum bilgisi | ✓ |
| POST | `/api/scans` | Tarama kaydet | ✓ |
| GET | `/api/scans` | Tarama geçmişi (sayfalama) | ✓ |
| GET | `/api/scans/:id` | Tarama detayı | ✓ |
| DELETE | `/api/scans/:id` | Tarama sil | ✓ |

---

## Kurulum

### Backend

```bash
cd backend
npm install
cp .env.example .env
# .env dosyasını düzenle: DATABASE_URL ve JWT_SECRET
npx prisma migrate dev --name init
npm run dev
```

### Extension

1. Chrome'da `chrome://extensions` aç
2. "Geliştirici modu"nu aç
3. "Paketlenmemiş uzantı yükle" → `extension/` klasörünü seç

---

## Kullanılan Teknolojiler

**Frontend / Extension**
- Vanilla JavaScript (ES2022)
- Chrome Extensions API — Manifest V3
- DOMParser, Fetch API

**Backend**
- Node.js + Express
- PostgreSQL
- Prisma ORM
- JWT (jsonwebtoken)
- bcryptjs

---

## Geliştirici

Ali Naci — [GitHub](https://github.com/ali006834)
