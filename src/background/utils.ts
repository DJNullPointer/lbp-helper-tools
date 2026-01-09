// General utility functions for background script

export function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    function listener(
      updatedTabId: number,
      info: chrome.tabs.TabChangeInfo,
    ): void {
      if (updatedTabId === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}
