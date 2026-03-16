# NEXA

Uzbek tilidagi, foto-postlarga yo'naltirilgan zamonaviy social media MVP.

Yangi qo'shimchalar:
- real time private chat
- alohida qidiruv sahifasi
- user va post qidiruvi

## Ishga tushirish

1. `.env.example` faylidan nusxa olib `.env` yarating va qiymatlarni to'ldiring.
2. `npm install`
3. `npm start`
4. Brauzerda `http://localhost:5000` ni oching.

`MONGODB_URI` bo'sh qolsa loyiha avtomatik `fallback-db.json` bilan ishga tushadi.
Bu rejim edit va UI preview paytida qulay.

## Demo kirishlar

- User: `demo` / `demo123`
- Admin: `admin` / `admin123`

## Kerakli servislar

- MongoDB ixtiyoriy. Agar ishlayotgan bo'lsa `MONGODB_URI` orqali ulanadi.
- Cloudinary ixtiyoriy. Sozlanmagan bo'lsa rasmlar `public/uploads/` ga yoziladi.
- MongoDB ishlamasa ham JSON fallback rejimi bilan demo kontent ochiladi.
- `SITE_URL`, `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` orqali SEO va search console oqimini sozlash mumkin.

## Asosiy sahifalar

- `/`
- `/create.html`
- `/search.html`
- `/profile.html`
- `/u/USERNAME`
- `/post/POST_ID`
- `/chat.html`
- `/wallet.html`
- `/login.html`
- `/register.html`
- `/admin.html`
