// Smart Employee & PACS Bridge Background Service Worker (Manifest V3)
// Relays messages safely across browser tabs with zero recursion

const seenMessageIds = new Set();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;

    // Deduplicate to avoid broadcast storm
    const msgId = message._msgId;
    if (msgId) {
        if (seenMessageIds.has(msgId)) {
            sendResponse({ status: 'ignored_duplicate' });
            return;
        }
        seenMessageIds.add(msgId);
        if (seenMessageIds.size > 200) {
            const first = seenMessageIds.values().next().value;
            seenMessageIds.delete(first);
        }
    }

    // Forward strictly to other open tabs
    const senderTabId = sender?.tab?.id;
    chrome.tabs.query({}, (tabs) => {
        if (!tabs || !tabs.length) return;
        tabs.forEach((tab) => {
            if (tab.id && tab.id !== senderTabId) {
                chrome.tabs.sendMessage(tab.id, message).catch(() => {});
            }
        });
    });

    sendResponse({ status: 'relayed', timestamp: Date.now() });
    return true;
});
