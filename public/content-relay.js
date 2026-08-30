// Smart Bridge Extension Content Relay (Manifest V3)
// Safe, ultra-lightweight message bridge between web page and background service worker
(function() {
    if (window.__SMART_BRIDGE_RELAY_V422__) return;
    window.__SMART_BRIDGE_RELAY_V422__ = true;

    // 1. Listen for messages from smart-bridge.js in the main page
    window.addEventListener('message', (event) => {
        if (!event.data || typeof event.data !== 'object') return;
        
        // ONLY forward messages originating directly from smart-bridge.js main world
        if (event.data._source !== 'smart_bridge_main') return;

        const type = event.data.type;
        if (
            type === 'SMART_SYNC_DATA' ||
            type === 'AJ_BRIDGE_DATA' ||
            type === 'PACS_SCRAPED_DATA' ||
            type === 'ZERO_VIEWER_DATA' ||
            type === 'IHMS_ROW_CLICKED'
        ) {
            try {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({
                        ...event.data,
                        _msgId: Math.random().toString(36).substring(2, 10) + '_' + Date.now()
                    }).catch(() => {});
                }
            } catch (e) {}
        }
    });

    // 2. Listen for messages from Background Service Worker (relayed from other tabs)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (!message || !message.type) return;
            try {
                // Relayed message is stamped with _source: 'smart_bridge_relayed'
                window.postMessage({
                    ...message,
                    _source: 'smart_bridge_relayed'
                }, '*');
            } catch (e) {}
            sendResponse({ received: true });
            return true;
        });
    }
})();
