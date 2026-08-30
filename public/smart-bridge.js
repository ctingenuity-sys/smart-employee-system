/* 🚀 AJ-SMART-BRIDGE AUTO-INJECTOR V3.5 Universal Sync Engine */
(function () {
    if (window.AJ_BRIDGE_ACTIVE) return;
    window.AJ_BRIDGE_ACTIVE = true;

    let consoleEnabled = false;
    let capturedCount = 0;
    let autoClickEnabled = true;
    let AUTO_CLICK_DELAY = 60 * 1000; // 1 minute
    let HEARTBEAT_DELAY = 4 * 60 * 1000; // 4 minutes
    let autoClickTimer = null;
    let heartbeatTimer = null;

    function log(...args) {
        if (consoleEnabled) console.log("%c 🟢 Smart Bridge:", "color: #10b981; font-weight: bold;", ...args);
    }

    log("Active on", window.location.href);

    // BroadcastChannel for instant cross-tab communication without window popup blocks
    let broadcastChannel = null;
    try {
        broadcastChannel = new BroadcastChannel('smart_bridge_channel');
    } catch (e) {}

    // Check if JSON contains patient or case related information
    function isPatientDataPayload(data) {
        if (!data) return false;
        try {
            const str = (typeof data === 'string' ? data : JSON.stringify(data)).toLowerCase();
            return (
                str.includes('patient') ||
                str.includes('fileno') ||
                str.includes('filenumber') ||
                str.includes('mrn') ||
                str.includes('xray') ||
                str.includes('que') ||
                str.includes('servicename') ||
                str.includes('examname') ||
                str.includes('order') ||
                str.includes('patname') ||
                str.includes('engname') ||
                str.includes('doctor')
            );
        } catch (e) {
            return false;
        }
    }

    function ensureIframe() {
        if (document.getElementById('aj-bridge-frame')) return;
        if (!document.body) {
            setTimeout(ensureIframe, 200);
            return;
        }
        try {
            const iframe = document.createElement('iframe');
            iframe.src = window.location.origin + '/#/appointments';
            iframe.style.display = 'none';
            iframe.id = 'aj-bridge-frame';
            document.body.appendChild(iframe);
        } catch (e) {}
    }

    // Broadcast captured data to all targets
    function transmitPayload(payload) {
        if (!payload) return;
        capturedCount++;
        log("Data captured & transmitting payload...", payload);

        ensureIframe();

        // 1. Send via BroadcastChannel (Works across tabs in same browser session)
        if (broadcastChannel) {
            try {
                broadcastChannel.postMessage({ type: 'SMART_SYNC_DATA', payload });
                broadcastChannel.postMessage({ type: 'AJ_BRIDGE_DATA', payload });
            } catch (e) {}
        }

        // 2. Send via window.postMessage (to current window and parent/iframe)
        try {
            window.postMessage({ type: 'SMART_SYNC_DATA', payload }, '*');
            window.postMessage({ type: 'AJ_BRIDGE_DATA', payload }, '*');
        } catch (e) {}

        // 3. Send to hidden bridge iframe if attached
        const frame = document.getElementById('aj-bridge-frame');
        if (frame && frame.contentWindow) {
            try {
                frame.contentWindow.postMessage({ type: 'SMART_SYNC_DATA', payload }, '*');
                frame.contentWindow.postMessage({ type: 'AJ_BRIDGE_DATA', payload }, '*');
            } catch (e) {}
        }

        // Update UI widget if present
        updateWidgetVisuals();
    }

    // --- XHR Interception ---
    if (!XMLHttpRequest.prototype.__AJ_SMART_BRIDGE__) {
        XMLHttpRequest.prototype.__AJ_SMART_BRIDGE__ = true;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.send = function () {
            this.addEventListener("load", () => {
                try {
                    const contentType = this.getResponseHeader("content-type") || "";
                    if (this.responseText && (contentType.includes("json") || this.responseText.startsWith("{") || this.responseText.startsWith("["))) {
                        const json = JSON.parse(this.responseText);
                        if (isPatientDataPayload(json)) {
                            transmitPayload(json);
                        }
                    }
                } catch (e) {}
            });
            return originalSend.apply(this, arguments);
        };
    }

    // --- Fetch Interception ---
    if (!window.__AJ_FETCH_INTERCEPTED__) {
        window.__AJ_FETCH_INTERCEPTED__ = true;
        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const response = await originalFetch(...args);
            try {
                const clone = response.clone();
                clone.text().then(text => {
                    if (text && (text.startsWith("{") || text.startsWith("["))) {
                        const json = JSON.parse(text);
                        if (isPatientDataPayload(json)) {
                            transmitPayload(json);
                        }
                    }
                }).catch(() => {});
            } catch (e) {}
            return response;
        };
    }

    // --- Auto Refresh Clicker ---
    function clickRefreshButton() {
        if (!autoClickEnabled || document.visibilityState !== "visible") return;
        const btn =
            document.querySelector('img[mattooltip="RefreshData"]') ||
            document.querySelector('[mattooltip="RefreshData"]') ||
            document.querySelector('.btn-refresh') ||
            document.querySelector('[title="Refresh"]');
        if (btn && typeof btn.click === 'function') {
            btn.click();
            log("Auto refresh clicked");
        }
    }

    // --- IHMS Keep-Alive ---
    function sendHeartbeat() {
        if (document.visibilityState !== "visible") return;
        try {
            document.dispatchEvent(new MouseEvent('mousemove', { view: window, bubbles: true, cancelable: true }));
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, bubbles: true }));
        } catch (e) {}
    }

    // --- Floating UI Status ---
    function updateWidgetVisuals() {
        const dot = document.getElementById("aj-bridge-dot");
        const countBadge = document.getElementById("aj-bridge-count");
        if (dot) {
            dot.style.backgroundColor = "#f59e0b"; // Orange pulse
            setTimeout(() => { dot.style.backgroundColor = "#10b981"; }, 600);
        }
        if (countBadge) {
            countBadge.textContent = String(capturedCount);
        }
    }

    function createUI() {
        ensureIframe();
        if (document.getElementById("aj-smart-bridge-ui")) return;
        if (!document.body) {
            setTimeout(createUI, 200);
            return;
        }

        const container = document.createElement("div");
        container.id = "aj-smart-bridge-ui";
        container.style.position = "fixed";
        container.style.bottom = "20px";
        container.style.left = "20px";
        container.style.zIndex = "999999";
        container.style.backgroundColor = "#0f172a";
        container.style.color = "#e5e7eb";
        container.style.padding = "8px 12px";
        container.style.borderRadius = "12px";
        container.style.boxShadow = "0 8px 24px rgba(0,0,0,0.4)";
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.gap = "8px";
        container.style.border = "1px solid #334155";
        container.style.fontFamily = "system-ui, sans-serif";
        container.style.fontSize = "12px";
        container.style.userSelect = "none";

        const dot = document.createElement("span");
        dot.id = "aj-bridge-dot";
        dot.style.width = "10px";
        dot.style.height = "10px";
        dot.style.borderRadius = "50%";
        dot.style.backgroundColor = "#10b981";
        dot.style.boxShadow = "0 0 8px #10b981";
        container.appendChild(dot);

        const title = document.createElement("span");
        title.innerHTML = "<b>Smart Bridge</b>";
        container.appendChild(title);

        const countBadge = document.createElement("span");
        countBadge.id = "aj-bridge-count";
        countBadge.textContent = "0";
        countBadge.style.backgroundColor = "#0284c7";
        countBadge.style.color = "#fff";
        countBadge.style.padding = "2px 6px";
        countBadge.style.borderRadius = "10px";
        countBadge.style.fontSize = "10px";
        countBadge.style.fontWeight = "bold";
        container.appendChild(countBadge);

        document.body.appendChild(container);

        autoClickTimer = setInterval(clickRefreshButton, AUTO_CLICK_DELAY);
        heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_DELAY);
    }

    if (document.readyState === "complete") {
        createUI();
    } else {
        window.addEventListener("load", createUI);
    }
})();
