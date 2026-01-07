// --- TRUE HARDWARE FINGERPRINT (Persistent & Unified) ---

export const getStableDeviceFingerprint = async (): Promise<string> => {
    try {
        const nav = window.navigator as any;
        const screen = window.screen;
        
        // 1. البيانات الأساسية (تم استبدال userAgent بـ platform لضمان الثبات)
        const basicInfo = [
            nav.platform, // يعطي نوع النظام (مثل iPhone أو Win32) وهو ثابت تماماً
            nav.language,
            nav.hardwareConcurrency || 'x', 
            nav.deviceMemory || 'x',        
            screen.colorDepth,
            screen.width + 'x' + screen.height, 
            Intl.DateTimeFormat().resolvedOptions().timeZone 
        ].join('|');

        // 2. Canvas Fingerprint (يعتمد على كيفية معالجة الجهاز للرسوم)
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
                ctx.font = "11pt Arial";
                ctx.fillText("AJ_SMART_SYSTEM_STABLE", 2, 15);
                canvasHash = canvas.toDataURL(); // يولد كوداً فريداً بناءً على كرت الشاشة والمعالج
            }
        } catch (e) { canvasHash = 'canvas-error'; }

        // 3. WebGL (اسم كرت الشاشة الفعلي)
        let webglInfo = '';
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    webglInfo = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                }
            }
        } catch (e) { webglInfo = 'webgl-error'; }

        // 4. دمج وتوليد الهاش النهائي باستخدام SHA-256
        const finalString = `${basicInfo}__${canvasHash}__${webglInfo}`;
        const msgBuffer = new TextEncoder().encode(finalString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // بادئة موحدة لجميع الصفحات
        return `DEV_${hashHex.substring(0, 16).toUpperCase()}`;

    } catch (e) {
        return 'FALLBACK_DEVICE_ID';
    }
};