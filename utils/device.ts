
// --- TRUE HARDWARE FINGERPRINT (Persistent across Clear Data) ---

/**
 * يقوم هذا الكود بتوليد بصمة رقمية بناءً على مواصفات الجهاز وكارت الشاشة.
 * هذه البصمة لا تتغير بمسح الـ LocalStorage لأنها تُحسب في كل مرة بنفس الطريقة.
 */
export const getStableDeviceFingerprint = async (): Promise<string> => {
    try {
        // 1. تجميع البيانات الأساسية (الشاشة، النظام، التوقيت، المعالج)
        const nav = window.navigator as any;
        const screen = window.screen;
        
        const basicInfo = [
            nav.userAgent,
            nav.language,
            nav.hardwareConcurrency || 'x', // عدد الأنوية
            nav.deviceMemory || 'x',        // حجم الرامات التقريبي
            screen.colorDepth,
            screen.width + 'x' + screen.height, // دقة الشاشة
            screen.availWidth + 'x' + screen.availHeight,
            Intl.DateTimeFormat().resolvedOptions().timeZone // المنطقة الزمنية
        ].join('|');

        // 2. Canvas Fingerprint (رسم صورة مخفية وحساب الكود الخاص بها)
        // المتصفحات المختلفة ترسم الخطوط والظلال بطرق مختلفة قليلاً بناءً على كارت الشاشة ونظام التشغيل
        let canvasHash = '';
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                canvas.width = 280;
                canvas.height = 60;
                ctx.textBaseline = "alphabetic";
                ctx.fillStyle = "#f60";
                ctx.fillRect(125, 1, 62, 20);
                ctx.fillStyle = "#069";
                // نص معقد لاختبار التظليل والرسم (Font Rendering)
                ctx.font = "11pt no-real-font-123";
                ctx.fillText("Cwm fjordbank glyphs vext quiz, \ud83d\ude03", 2, 15);
                ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
                ctx.font = "18pt Arial";
                ctx.fillText("AJ_SMART_SYSTEM", 4, 45);
                
                // إضافة رسم بياني لاختبار الـ Anti-aliasing
                ctx.globalCompositeOperation = "multiply";
                ctx.fillStyle = "rgb(255,0,255)";
                ctx.beginPath();
                ctx.arc(50, 50, 50, 0, Math.PI * 2, true);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = "rgb(0,255,255)";
                ctx.beginPath();
                ctx.arc(100, 50, 50, 0, Math.PI * 2, true);
                ctx.closePath();
                ctx.fill();
                
                canvasHash = canvas.toDataURL();
            }
        } catch (e) { canvasHash = 'canvas-error'; }

        // 3. WebGL Fingerprint (أقوى عامل - يقرأ اسم كارت الشاشة الفعلي)
        let webglInfo = '';
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
                    const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                    webglInfo = `${vendor}~${renderer}`;
                }
            }
        } catch (e) { webglInfo = 'webgl-error'; }

        // 4. دمج كل المعلومات وتشفيرها
        // لاحظ: لا نستخدم Math.random() أو Date.now() هنا أبداً لضمان الثبات
        const finalString = `${basicInfo}__${canvasHash}__${webglInfo}`;
        
        // استخدام خوارزمية SHA-256 للحصول على كود فريد وثابت
        const msgBuffer = new TextEncoder().encode(finalString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // أخذ أول 16 خانة وتحويلها لحروف كبيرة وإضافة بادئة
        const stableID = `DEV_${hashHex.substring(0, 16).toUpperCase()}`;

        return stableID;

    } catch (e) {
        console.error("Fingerprint Error", e);
        // Fallback في حالة الأجهزة القديمة جداً
        return 'FALLBACK_LEGACY_DEVICE';
    }
};
