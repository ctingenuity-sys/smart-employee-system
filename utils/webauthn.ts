
// تحويل ArrayBuffer إلى Base64URL String (مطلوب لـ WebAuthn)
export const bufferToBase64URLString = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (const charCode of bytes) {
        str += String.fromCharCode(charCode);
    }
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// تحويل Base64URL String إلى ArrayBuffer
export const base64URLStringToBuffer = (base64URLString: string): ArrayBuffer => {
    const base64 = base64URLString.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLen);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// 1. تسجيل الجهاز (لأول مرة)
export const registerDevice = async (username: string): Promise<string> => {
    if (!window.PublicKeyCredential) {
        throw new Error("المتصفح لا يدعم المصادقة البيومترية (WebAuthn).");
    }

    // إنشاء تحدي عشوائي
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const publicKey: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: { 
            name: "Smart Employee System", 
            id: window.location.hostname // يربط البصمة بنطاق الموقع الحالي
        },
        user: {
            id: Uint8Array.from(username, c => c.charCodeAt(0)),
            name: username,
            displayName: username,
        },
        pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
        authenticatorSelection: {
            authenticatorAttachment: "platform", // يجبر استخدام بصمة الجهاز (وليس مفتاح USB)
            userVerification: "required", // يطلب بصمة/PIN
            residentKey: "required" // يخزن المفتاح على الجهاز
        },
        timeout: 60000,
        attestation: "none"
    };

    const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
    
    // نعيد معرف الكريدنشال لتخزينه في قاعدة البيانات
    return `WA_${bufferToBase64URLString(credential.rawId)}`;
};

// 2. التحقق من الجهاز (عند كل بصمة حضور)
export const verifyDevice = async (credentialId: string): Promise<boolean> => {
    if (!window.PublicKeyCredential) {
        throw new Error("WebAuthn not supported");
    }

    // إزالة البادئة WA_ إن وجدت
    const rawId = credentialId.startsWith('WA_') ? credentialId.substring(3) : credentialId;

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const publicKey: PublicKeyCredentialRequestOptions = {
        challenge,
        allowCredentials: [{
            id: base64URLStringToBuffer(rawId),
            type: "public-key",
            transports: ["internal"] // هام جداً: يجبر المتصفح على استخدام الجهاز الحالي حصراً
        }],
        userVerification: "required",
        timeout: 60000
    };

    try {
        const assertion = await navigator.credentials.get({ publicKey });
        return !!assertion;
    } catch (e) {
        console.error("WebAuthn Verify Error", e);
        // نعيد رسالة خطأ واضحة للمستخدم
        throw new Error("فشل التحقق من هوية الجهاز. تأكد من أنك تستخدم نفس الهاتف المسجل وقم بتفعيل قفل الشاشة.");
    }
};
