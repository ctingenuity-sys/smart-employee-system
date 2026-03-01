/* 🚀 AJ-SMART-BRIDGE AUTO-INJECTOR V2.7 Hidden UI + Silent Console */
(function () {
    if (window.AJ_BRIDGE_ACTIVE) return;
    window.AJ_BRIDGE_ACTIVE = true;

    // Silent Console: No logs
    // console.log("%c 🟢 Smart Bridge Extension Active ", ...);

    const APP_URL = "https://ais-dev-ochny5tnn5pzuyysf2m4ye-55098846967.europe-west1.run.app/#/appointments";
    let syncWin = null;

    // Hidden UI: No UI creation
    /*
    const createUI = () => {
        const container = document.createElement('div');
        Object.assign(container.style, {
            position: 'fixed',
            bottom: '20px',
            left: '20px',
            zIndex: '999999',
            backgroundColor: '#0f172a',
            color: 'white',
            padding: '10px 15px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            fontFamily: 'sans-serif',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            border: '1px solid #334155',
            transition: 'all 0.3s ease'
        });

        const statusDot = document.createElement('div');
        Object.assign(statusDot.style, {
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#22c55e',
            boxShadow: '0 0 10px #22c55e'
        });

        const text = document.createElement('span');
        text.innerText = 'Smart Sync Active';
        text.style.fontWeight = 'bold';

        container.appendChild(statusDot);
        container.appendChild(text);
        document.body.appendChild(container);

        // Hover Effect
        container.onmouseenter = () => { container.style.transform = 'scale(1.05)'; };
        container.onmouseleave = () => { container.style.transform = 'scale(1)'; };
    };

    if (document.readyState === 'complete') createUI();
    else window.addEventListener('load', createUI);
    */

    // Window Management
    function openSyncWindow() {
        if (!syncWin || syncWin.closed) {
            // Check if we already have a frame or window
            syncWin = window.open(APP_URL, "SmartAppSyncWindow");
        }
        return syncWin;
    }

    // XHR Interceptor
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            try {
                if (this.getResponseHeader("content-type")?.includes("application/json")) {
                    const json = JSON.parse(this.responseText);
                    let payload = json.d || json.result || json;
                    if (!Array.isArray(payload)) payload = [payload];
                    
                    // Filter relevant packets
                    if (payload[0]?.patientName || payload[0]?.fileNumber || payload[0]?.mrn) {
                        // console.log("⚡ Smart Bridge: Data Captured", payload.length);
                        
                        syncWin = openSyncWindow();
                        
                        // Send with retry
                        let attempts = 0;
                        const sendInterval = setInterval(() => {
                            if (syncWin && !syncWin.closed) {
                                syncWin.postMessage({ type: 'SMART_SYNC_DATA', payload }, '*');
                                clearInterval(sendInterval);
                                // Visual Feedback - Removed for Hidden UI
                                /*
                                const ui = document.querySelector('div[style*="z-index: 999999"] span');
                                if(ui) {
                                    const oldText = ui.innerText;
                                    ui.innerText = 'Data Sent 🚀';
                                    setTimeout(() => ui.innerText = oldText, 2000);
                                }
                                */
                            }
                            attempts++;
                            if (attempts > 10) clearInterval(sendInterval);
                        }, 500);
                    }
                }
            } catch (e) {}
        });
        return originalSend.apply(this, arguments);
    };
})();
