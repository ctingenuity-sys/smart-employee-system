/* 🚀 AJ-SMART-BRIDGE AUTO-INJECTOR V2.7 Hidden UI + Silent Console */
(function () {
    if (window.AJ_BRIDGE_ACTIVE) return;
    window.AJ_BRIDGE_ACTIVE = true;

    // =====================================================
    // ✅ Console Control
    // =====================================================
    let consoleEnabled = false; // false = رسائل مخفية، true = رسائل تظهر
    function log(...args) {
        if (consoleEnabled) console.log(...args);
    }

    log("🟢 Smart Bridge Extension Active (V2.7 Hidden UI)");

    const APP_URL = "https://staff7.vercel.app/#/appointments";

    // Default times
    let AUTO_CLICK_DELAY = 60 * 1000; // 1 دقيقة
    let HEARTBEAT_DELAY = 4 * 60 * 1000; // 4 دقائق

    let syncWin = null;
    let autoClickTimer = null;
    let heartbeatTimer = null;
    let autoClickEnabled = true;

    // =====================================================
    // 🔘 Safe Refresh Button Click
    // =====================================================
    function clickRefreshButton() {
        if (!autoClickEnabled) return;
        if (document.visibilityState !== "visible") return;

        const btn =
            document.querySelector('img[mattooltip="RefreshData"]') ||
            document.querySelector('[mattooltip="RefreshData"]');

        if (btn && !btn.disabled) {
            btn.click();
            log("🔁 Smart Bridge: Auto Refresh Clicked");
        }
    }

    // =====================================================
    // 💓 Heartbeat & IHMS Keep-Alive
    // =====================================================
    function sendHeartbeat() {
        if (document.visibilityState !== "visible") return;
        fetch(APP_URL, { method: "GET", credentials: "include" })
            .then(() => log("💓 Heartbeat sent"))
            .catch(() => {});
            
        // IHMS Keep-Alive: Simulate user activity to prevent session timeout
        if (window.location.href.toLowerCase().includes('ihms') || document.title.toLowerCase().includes('ihms')) {
            try {
                document.dispatchEvent(new MouseEvent('mousemove', { view: window, bubbles: true, cancelable: true }));
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', code: 'ShiftLeft', keyCode: 16, which: 16, bubbles: true }));
                log("🛡️ IHMS Keep-Alive activity simulated");
            } catch (e) {}
        }
    }

    // =====================================================
    // 🧠 Floating Status UI (مخفي افتراضيًا)
    // =====================================================
    function createUI() {
        if (document.getElementById("aj-smart-bridge-ui")) return;

        const container = document.createElement("div");
        container.id = "aj-smart-bridge-ui";
        container.style.display = "none"; // مخفي افتراضيًا
        container.style.position = "fixed";
        container.style.bottom = "20px";
        container.style.left = "20px";
        container.style.zIndex = "999999";
        container.style.backgroundColor = "#0f172a";
        container.style.color = "#e5e7eb";
        container.style.padding = "10px 14px";
        container.style.borderRadius = "12px";
        container.style.boxShadow = "0 10px 25px rgba(0,0,0,.35)";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "6px";
        container.style.border = "1px solid #334155";
        container.style.fontFamily = "sans-serif";
        container.style.fontSize = "12px";
        container.style.userSelect = "none";

        // ✅ Status row
        const statusRow = document.createElement("div");
        statusRow.style.display = "flex";
        statusRow.style.alignItems = "center";
        statusRow.style.gap = "8px";
        statusRow.innerHTML = `
            <div style="width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e"></div>
            <span><b>Smart Sync</b> Active</span>
        `;
        container.appendChild(statusRow);

        // ✅ Auto Click Toggle
        const toggleBtn = document.createElement("button");
        toggleBtn.textContent = autoClickEnabled ? "Auto-Click: ON" : "Auto-Click: OFF";
        Object.assign(toggleBtn.style, {
            padding: "2px 6px",
            fontSize: "12px",
            cursor: "pointer",
            backgroundColor: autoClickEnabled ? "#22c55e" : "#555",
            color: "#fff",
            border: "none",
            borderRadius: "6px"
        });
        toggleBtn.onclick = () => {
            autoClickEnabled = !autoClickEnabled;
            toggleBtn.textContent = autoClickEnabled ? "Auto-Click: ON" : "Auto-Click: OFF";
            toggleBtn.style.backgroundColor = autoClickEnabled ? "#22c55e" : "#555";
        };
        container.appendChild(toggleBtn);

        // ✅ Inputs لتعديل الوقت
        const inputsRow = document.createElement("div");
        inputsRow.style.display = "flex";
        inputsRow.style.gap = "6px";

        const autoClickInput = document.createElement("input");
        autoClickInput.type = "number";
        autoClickInput.value = AUTO_CLICK_DELAY / 1000;
        autoClickInput.style.width = "50px";
        autoClickInput.title = "Auto-Click Delay (sec)";
        autoClickInput.onchange = () => {
            AUTO_CLICK_DELAY = parseInt(autoClickInput.value) * 1000;
            if (autoClickTimer) clearInterval(autoClickTimer);
            autoClickTimer = setInterval(clickRefreshButton, AUTO_CLICK_DELAY);
        };
        inputsRow.appendChild(document.createTextNode("Auto-Click(sec):"));
        inputsRow.appendChild(autoClickInput);

        const heartbeatInput = document.createElement("input");
        heartbeatInput.type = "number";
        heartbeatInput.value = HEARTBEAT_DELAY / 1000;
        heartbeatInput.style.width = "50px";
        heartbeatInput.title = "Heartbeat Delay (sec)";
        heartbeatInput.onchange = () => {
            HEARTBEAT_DELAY = parseInt(heartbeatInput.value) * 1000;
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_DELAY);
        };
        inputsRow.appendChild(document.createTextNode("Heartbeat(sec):"));
        inputsRow.appendChild(heartbeatInput);

        container.appendChild(inputsRow);

        // ✅ Console Toggle
        const consoleBtn = document.createElement("button");
        consoleBtn.textContent = consoleEnabled ? "Console: ON" : "Console: OFF";
        Object.assign(consoleBtn.style, {
            padding: "2px 6px",
            fontSize: "12px",
            cursor: "pointer",
            backgroundColor: consoleEnabled ? "#22c55e" : "#555",
            color: "#fff",
            border: "none",
            borderRadius: "6px"
        });
        consoleBtn.onclick = () => {
            consoleEnabled = !consoleEnabled;
            consoleBtn.textContent = consoleEnabled ? "Console: ON" : "Console: OFF";
            consoleBtn.style.backgroundColor = consoleEnabled ? "#22c55e" : "#555";
        };
        container.appendChild(consoleBtn);

        document.body.appendChild(container);

        // Start timers
        autoClickTimer = setInterval(clickRefreshButton, AUTO_CLICK_DELAY);
        heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_DELAY);
    }

    if (document.readyState === "complete") {
        createUI();
    } else {
        window.addEventListener("load", createUI);
    }

    // =====================================================
    // 🔑 Shortcut لإظهار/إخفاء UI (Ctrl+Shift+B)
    // =====================================================
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.shiftKey && e.code === "KeyB") {
            const ui = document.getElementById("aj-smart-bridge-ui");
            if (ui) ui.style.display = ui.style.display === "none" ? "flex" : "none";
        }
    });

    // =====================================================
    // 🪟 Open / Reuse Sync Window
    // =====================================================
    function openSyncWindow() {
        if (!syncWin || syncWin.closed) {
            syncWin = window.open(APP_URL, "SmartAppSyncWindow");
        }
        return syncWin;
    }

    // =====================================================
    // 🌐 XHR Interception (SAFE – SINGLE HOOK)
    // =====================================================
    if (!XMLHttpRequest.prototype.__AJ_SMART_BRIDGE__) {
        XMLHttpRequest.prototype.__AJ_SMART_BRIDGE__ = true;

        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.send = function () {
            this.addEventListener("load", () => {
                try {
                    const type = this.getResponseHeader("content-type");
                    if (!type || !type.includes("application/json")) return;

                    const json = JSON.parse(this.responseText);
                    let payload = json?.d || json?.result || json;
                    if (!Array.isArray(payload)) payload = [payload];

                    if (payload[0]?.patientName || payload[0]?.fileNumber) {
                        syncWin = openSyncWindow();
                        let attempts = 0;

                        const interval = setInterval(() => {
                            if (syncWin && !syncWin.closed) {
                                syncWin.postMessage(
                                    { type: "SMART_SYNC_DATA", payload },
                                    "*"
                                );
                                clearInterval(interval);
                            }
                            if (++attempts > 8) clearInterval(interval);
                        }, 500);
                    }
                } catch (_) {}
            });

            return originalSend.apply(this, arguments);
        };
    }

    // =====================================================
    // 👁 Tab Visibility Awareness
    // =====================================================
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            log("⏸ Smart Bridge paused (tab hidden)");
        } else {
            log("▶ Smart Bridge resumed (tab active)");
        }
    });

})();
