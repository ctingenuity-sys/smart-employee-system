/* 🚀 AJ-SMART-BRIDGE AUTO-INJECTOR V4.3.0 - Ultra-Lightweight IHMS Auto-Sync Engine */
(function () {
    if (window.__AJ_SMART_BRIDGE_INITIALIZED_V430__) return;
    window.__AJ_SMART_BRIDGE_INITIALIZED_V430__ = true;
    window.AJ_BRIDGE_ACTIVE = true;

    let capturedCount = 0;
    let autoClickEnabled = true;
    const AUTO_CLICK_DELAY = 60 * 1000; // 1 minute
    const HEARTBEAT_DELAY = 4 * 60 * 1000; // 4 minutes

    function log(...args) {
        console.log("%c 🟢 Smart Bridge (IHMS):", "color: #10b981; font-weight: bold;", ...args);
    }

    log("Active & Ready on", window.location.href);

    // BroadcastChannel for instant same-browser communication
    let broadcastChannel = null;
    try {
        broadcastChannel = new BroadcastChannel('smart_bridge_channel');
    } catch (e) {}

    // Transmit IHMS Patient / Radiology Queue payload
    function transmitPayload(payload, isClick = false) {
        if (!payload) return;
        capturedCount++;

        const messageData = {
            type: 'SMART_SYNC_DATA',
            payload: payload,
            isClick: isClick,
            action: isClick ? 'PATIENT_CLICKED' : 'AUTO_DATA_SYNC',
            timestamp: Date.now(),
            _source: 'smart_bridge_main'
        };

        // 1. Post to current window
        try {
            window.postMessage(messageData, '*');
        } catch (e) {}

        // 2. BroadcastChannel
        if (broadcastChannel) {
            try {
                broadcastChannel.postMessage(messageData);
            } catch (e) {}
        }

        // 3. LocalStorage event
        try {
            localStorage.setItem('aj_smart_bridge_live_event', JSON.stringify(messageData));
        } catch (e) {}

        updateWidgetVisuals();
    }

    // Helper to check if JSON response is worth passing to the application
    function isValidJsonResponse(json) {
        if (!json) return false;
        if (typeof json === 'object') {
            return true;
        }
        return false;
    }

    // --- XHR Interception (Full Data capture for IHMS) ---
    if (!XMLHttpRequest.prototype.__AJ_SMART_BRIDGE_V430__) {
        XMLHttpRequest.prototype.__AJ_SMART_BRIDGE_V430__ = true;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.send = function () {
            this.addEventListener("load", () => {
                try {
                    const text = this.responseText;
                    if (text && (text.startsWith("{") || text.startsWith("["))) {
                        const json = JSON.parse(text);
                        if (isValidJsonResponse(json)) {
                            transmitPayload(json, false);
                        }
                    }
                } catch (e) {}
            });
            return originalSend.apply(this, arguments);
        };
    }

    // --- Fetch Interception (Full Data capture for IHMS) ---
    if (!window.__AJ_FETCH_INTERCEPTED_V430__) {
        window.__AJ_FETCH_INTERCEPTED_V430__ = true;
        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const response = await originalFetch(...args);
            try {
                const clone = response.clone();
                clone.text().then(text => {
                    if (text && (text.startsWith("{") || text.startsWith("["))) {
                        const json = JSON.parse(text);
                        if (isValidJsonResponse(json)) {
                            transmitPayload(json, false);
                        }
                    }
                }).catch(() => {});
            } catch (e) {}
            return response;
        };
    }

    // --- IHMS Row Click Listener ---
    document.addEventListener('click', (e) => {
        try {
            const target = e.target;
            const row = target.closest('tr, [role="row"], .mat-row, .ui-table-tbody > tr');
            if (row) {
                const rowText = (row.innerText || row.textContent || '').trim();
                if (rowText && rowText.length > 10) {
                    const fNumMatch = rowText.match(/(?:ID|MRN|File\s*No|ملف|رقم\s*الملف)?[:\s]*(\d{4,10})/i);
                    if (fNumMatch) {
                        const fileNumber = fNumMatch[1];
                        const clickPayload = {
                            fileNumber: fileNumber,
                            patientName: rowText.split(/\t|\n/)[0]?.trim() || '',
                            rawText: rowText,
                            source: 'ROW_CLICK'
                        };
                        transmitPayload(clickPayload, true);
                    }
                }
            }
        } catch (err) {}
    }, true);

    // --- Auto Refresh Clicker for IHMS ---
    function clickRefreshButton() {
        if (!autoClickEnabled || document.visibilityState !== "visible") return;
        try {
            const btn =
                document.querySelector('img[mattooltip="RefreshData"]') ||
                document.querySelector('[mattooltip="RefreshData"]') ||
                document.querySelector('.btn-refresh') ||
                document.querySelector('[title="Refresh"]');
            if (btn && typeof btn.click === 'function') {
                btn.click();
                log("Auto refresh clicked in IHMS");
            }
        } catch (e) {}
    }

    // --- IHMS Keep-Alive ---
    function sendHeartbeat() {
        if (document.visibilityState !== "visible") return;
        try {
            document.dispatchEvent(new MouseEvent('mousemove', { view: window, bubbles: true, cancelable: true }));
        } catch (e) {}
    }

    // --- Floating UI Widget (Lightweight) ---
    function updateWidgetVisuals() {
        try {
            const dot = document.getElementById("aj-bridge-dot");
            const countBadge = document.getElementById("aj-bridge-count");
            if (dot) {
                dot.style.backgroundColor = "#f59e0b";
                setTimeout(() => { 
                    try { dot.style.backgroundColor = "#10b981"; } catch(e){} 
                }, 600);
            }
            if (countBadge) {
                countBadge.textContent = String(capturedCount);
            }
        } catch (e) {}
    }

    function createUI() {
        try {
            if (document.getElementById("aj-smart-bridge-ui")) return;
            if (!document.body) {
                setTimeout(createUI, 300);
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
            container.style.padding = "6px 14px";
            container.style.borderRadius = "14px";
            container.style.boxShadow = "0 10px 30px rgba(0,0,0,0.5)";
            container.style.display = "flex";
            container.style.alignItems = "center";
            container.style.gap = "8px";
            container.style.border = "1px solid #334155";
            container.style.fontFamily = "system-ui, -apple-system, sans-serif";
            container.style.fontSize = "12px";
            container.style.userSelect = "none";
            container.style.direction = "rtl";

            // Status Dot
            const dot = document.createElement("span");
            dot.id = "aj-bridge-dot";
            dot.style.width = "10px";
            dot.style.height = "10px";
            dot.style.borderRadius = "50%";
            dot.style.backgroundColor = "#10b981";
            dot.style.boxShadow = "0 0 8px #10b981";
            container.appendChild(dot);

            // Title
            const title = document.createElement("span");
            title.textContent = "IHMS Bridge متصل";
            title.style.fontWeight = "bold";
            container.appendChild(title);

            // Count Badge
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

            setInterval(clickRefreshButton, AUTO_CLICK_DELAY);
            setInterval(sendHeartbeat, HEARTBEAT_DELAY);
        } catch (e) {}
    }

    if (document.readyState === "complete") {
        createUI();
    } else {
        window.addEventListener("load", createUI);
    }
})();
