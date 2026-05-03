chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "open_results_page") {
    return false;
  }

  chrome.tabs.create({ url: chrome.runtime.getURL("results.html"), active: true }, () => {
    sendResponse({ ok: !chrome.runtime.lastError });
  });

  return true;
});
