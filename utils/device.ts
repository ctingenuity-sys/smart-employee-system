
/**
 * نظام بصمة الجهاز المستقر (Stable Device Fingerprint V2)
 * يعتمد على إنشاء معرف فريد يتم تخزينه في LocalStorage لضمان عدم تغيره
 * مع تحديثات المتصفح البسيطة.
 */
export const getStableDeviceFingerprint = async (): Promise<string> => {
    try {
        // 1. المحاولة الأولى: استرجاع المعرف المخزن مسبقاً (الأسرع والأكثر ثباتاً)
        const storedId = localStorage.getItem('aj_stable_device_id_v2');
        if (storedId) {
            return storedId;
        }

        // 2. إذا لم يوجد (أول مرة أو تم مسح البيانات)، نقوم بإنشاء معرف جديد قوي
        // نستخدم معلومات الهاردوير كـ "بذرة" (Seed) لتقليل العشوائية المفرطة
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        let gpuInfo = 'generic_gpu';
        
        if (gl) {
            const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                const renderer = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                gpuInfo = renderer.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
            }
        }

        // إنشاء جزء عشوائي فريد جداً
        const randomPart = Array.from(crypto.getRandomValues(new Uint8Array(8)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();

        // التنسيق النهائي: DEV_GPU_RANDOM
        // مثال: DEV_APPLEGU_A1B2C3D4
        const newId = `DEV_${gpuInfo}_${randomPart}`.toUpperCase();

        // 3. تخزين المعرف بشكل دائم
        localStorage.setItem('aj_stable_device_id_v2', newId);

        return newId;

    } catch (e) {
        console.error("Device ID Generation Error", e);
        // Fallback في حالة حدوث خطأ كارثي
        const fallbackId = `FALLBACK_${Math.random().toString(36).substring(7)}`.toUpperCase();
        localStorage.setItem('aj_stable_device_id_v2', fallbackId);
        return fallbackId;
    }
};
