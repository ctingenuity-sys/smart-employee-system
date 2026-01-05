
// --- ADVANCED HARDWARE FINGERPRINTING (Robust for HTTP/Localhost) ---

// دالة تشفير بسيطة يدوية لتعمل في البيئات غير الآمنة (HTTP)
const simpleHash = (str: string): string => {
    let hash = 0;
    if (str.length === 0) return 'hash_0';
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
};

export const getStableDeviceFingerprint = async (): Promise<string> => {
    try {
        const nav = window.navigator as any;
        const screen = window.screen;
        
        // 1. Core Hardware Traits
        const hardwareInfo = [
            nav.platform, // OS
            nav.hardwareConcurrency, // Cores
            nav.deviceMemory, // RAM
            screen.width + 'x' + screen.height, // Resolution
            screen.colorDepth,
            Intl.DateTimeFormat().resolvedOptions().timeZone // Timezone
        ].join('||');

        // 2. Canvas Fingerprinting
        let canvasHash = 'no-canvas';
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                canvas.width = 200;
                canvas.height = 50;
                ctx.textBaseline = "top";
                ctx.font = "16px Arial";
                ctx.fillStyle = "#f60";
                ctx.fillRect(125, 1, 62, 20);
                ctx.fillStyle = "#069";
                ctx.fillText("AJ_SMART_SYSTEM_v1", 2, 15);
                ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
                ctx.fillText("AJ_SMART_SYSTEM_v1", 4, 17);
                
                ctx.beginPath();
                ctx.arc(50, 50, 50, 0, Math.PI * 2, true);
                ctx.closePath();
                ctx.fill();

                canvasHash = canvas.toDataURL();
            }
        } catch (e) {
            console.warn("Canvas fingerprint blocked");
        }

        // Combine traits
        const fingerprintString = `${hardwareInfo}###${canvasHash}`;
        
        // 3. Hashing Strategy
        // Try native crypto API first (fastest/secure), fallback to simpleHash if on HTTP
        if (window.crypto && window.crypto.subtle) {
            try {
                const msgBuffer = new TextEncoder().encode(fingerprintString);
                const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                return `HW_${hashHex.substring(0, 32)}`; 
            } catch (e) {
                console.log("Crypto API failed, using fallback");
                return `HW_FB_${simpleHash(fingerprintString)}`;
            }
        } else {
            // Fallback for non-secure contexts (like local IP testing)
            return `HW_FB_${simpleHash(fingerprintString)}`;
        }

    } catch (e) {
        console.error("Fingerprint generation completely failed", e);
        return 'FALLBACK_DEVICE_ID_' + Math.random().toString(36).substring(7);
    }
};
