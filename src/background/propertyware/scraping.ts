// Propertyware scraping operations (opening tabs and extracting data)

import { waitForTabComplete } from "../utils";

export async function extractAddressFromUnitSummaryUrl(
  unitSummaryUrl: string,
): Promise<{ unitAddress: string | null; buildingAddress: string | null }> {
  // 1. Open a background tab with the unit summary URL
  const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
    chrome.tabs.create({ url: unitSummaryUrl, active: false }, (t) => {
      if (chrome.runtime.lastError || !t || t.id === undefined) {
        reject(
          new Error(
            chrome.runtime.lastError?.message ||
              "Failed to create tab for unit summary",
          ),
        );
      } else {
        resolve(t);
      }
    });
  });

  const tabId = tab.id!;
  try {
    // 2. Wait for that tab to finish loading
    await waitForTabComplete(tabId);

    // 3. Give SPA time to render
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 4. Ask the content script in THAT tab to extract both addresses
    // Retry with exponential backoff until content script responds or timeout
    let result: {
      success?: boolean;
      unitAddress?: string;
      buildingAddress?: string;
      error?: string;
    } | null = null;

    const maxAttempts = 10;
    const maxWaitTime = 8000; // 8 seconds total (SPA might take longer)
    const startTime = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        result = (await chrome.tabs.sendMessage(tabId, {
          type: "EXTRACT_ADDRESS_FROM_UNIT_SUMMARY",
        })) as {
          success?: boolean;
          unitAddress?: string;
          buildingAddress?: string;
          error?: string;
        };
        if (result && result.success) {
          break;
        }
      } catch (err: any) {
        const elapsed = Date.now() - startTime;
        if (elapsed > maxWaitTime) {
          console.warn("Timeout waiting for content script response");
          break;
        }

        // Exponential backoff: 100ms, 200ms, 400ms, etc. (capped at 500ms)
        const delay = Math.min(100 * Math.pow(2, attempt), 500);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (!result || !result.success) {
      console.warn("Failed to extract addresses from unit summary tab", result);
      return { unitAddress: null, buildingAddress: null };
    }

    return {
      unitAddress: result.unitAddress || null,
      buildingAddress: result.buildingAddress || null,
    };
  } finally {
    // 5. Clean up the background tab
    chrome.tabs.remove(tabId);
  }
}

export async function getUnitSummaryUrlFromMeld(
  meldSummaryUrl: string,
): Promise<string | null> {
  // 1. Open a background tab with the meld summary URL
  const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
    chrome.tabs.create({ url: meldSummaryUrl, active: false }, (t) => {
      if (chrome.runtime.lastError || !t || t.id === undefined) {
        reject(
          new Error(
            chrome.runtime.lastError?.message ||
              "Failed to create tab for meld summary",
          ),
        );
      } else {
        resolve(t);
      }
    });
  });

  const tabId = tab.id!;
  try {
    // 2. Wait for that tab to finish loading
    await waitForTabComplete(tabId);

    // 3. Give SPA time to render
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 4. Ask the content script to find the unit summary link
    // Look for a link that matches the pattern /properties/\d+/summary/
    let result: {
      success?: boolean;
      unitSummaryUrl?: string;
      error?: string;
    } | null = null;

    const maxAttempts = 10;
    const maxWaitTime = 8000;
    const startTime = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        result = (await chrome.tabs.sendMessage(tabId, {
          type: "FIND_UNIT_SUMMARY_URL",
        })) as {
          success?: boolean;
          unitSummaryUrl?: string;
          error?: string;
        };
        if (result && result.success && result.unitSummaryUrl) {
          break;
        }
      } catch (err: any) {
        const elapsed = Date.now() - startTime;
        if (elapsed > maxWaitTime) {
          console.warn("Timeout waiting for content script response");
          break;
        }

        const delay = Math.min(100 * Math.pow(2, attempt), 500);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (!result || !result.success || !result.unitSummaryUrl) {
      console.warn("Failed to find unit summary URL from meld tab", result);
      return null;
    }

    return result.unitSummaryUrl;
  } finally {
    // 5. Clean up the background tab
    chrome.tabs.remove(tabId);
  }
}
