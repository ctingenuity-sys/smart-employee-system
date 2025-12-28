const CACHE_NAME = 'smart-staff-cache-v1';
// سنقوم بتخزين الرابط الرئيسي والملفات الأساسية
const OFFLINE_URL = '/index.html';

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                '/',
                OFFLINE_URL,
                '/assets/index-CT-oG96L.js', // تأكد أن هذا الاسم يطابق ملفك الحالي
                'https://cdn.tailwindcss.com',
                'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
            ]);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // إذا وجد الملف في الكاش (الذاكرة) يفتحه، وإلا يطلبه من الإنترنت
            return response || fetch(event.request);
        }).catch(() => {
            // في حالة الفشل التام (أوفلاين) نفتح الصفحة الرئيسية
            return caches.match(OFFLINE_URL);
        })
    );
});