export {};

// Utility: Wait for SPA to render by checking for specific elements
async function waitForSPAReady(
  selectors: string[],
  timeout: number = 5000,
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    // Check if any of the expected selectors exist
    const found = selectors.some((selector) =>
      document.querySelector(selector),
    );
    
    if (found) {
      // Give it a tiny moment for content to settle
      await new Promise((resolve) => setTimeout(resolve, 100));
      return;
    }
    
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  
  // Timeout reached, but continue anyway
  console.warn("SPA ready check timed out, continuing anyway");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "DOWNLOAD_MELD_INVOICES") {
    handleDownloadMeldInvoices()
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.type === "COPY_RELEVANT_INFO") {
    handleCopyRelevantInfo()
      .then((text) => sendResponse({ success: true, data: { text } }))
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === "COPY_TEXT_TO_CLIPBOARD") {
    // Copy text to clipboard from content script context using execCommand
    (async () => {
      try {
        const text = (message as { text?: string }).text;
        if (!text) {
          sendResponse({
            success: false,
            error: "No text provided to copy",
          });
          return;
        }

        // Use execCommand with textarea (clipboard API doesn't work in content scripts)
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-999999px";
        textarea.style.top = "-999999px";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, text.length);
        
        const successful = document.execCommand("copy");
        document.body.removeChild(textarea);
        
        if (successful) {
          sendResponse({ success: true });
        } else {
          sendResponse({
            success: false,
            error: "execCommand('copy') failed",
          });
        }
      } catch (err: any) {
        sendResponse({
          success: false,
          error: err?.message || String(err),
        });
      }
    })();
    return true; // async response
  }

  if (message.type === "GET_INVOICE_DOWNLOAD_URL") {
    // Get the invoice download URL from the current payment summary page
    (async () => {
      try {
        // Wait for page to be ready
        if (document.readyState !== "complete") {
          await new Promise((resolve) => {
            if (document.readyState === "complete") {
              resolve(undefined);
            } else {
              window.addEventListener("load", () => resolve(undefined), {
                once: true,
              });
            }
          });
        }

        // Wait for SPA to render - look for download link
        await waitForSPAReady(
          [
            'a[href*="/invoices/"][href*="/download/"]',
            '.euiLink[href*="download"]',
            'a[href*="download"]',
          ],
          5000,
        );

        // Find the download link
        const downloadLink = document.querySelector<HTMLAnchorElement>(
          'a[href*="/invoices/"][href*="/download/"]',
        );

        if (!downloadLink) {
          sendResponse({
            success: false,
            error: "Could not find invoice download link on this page",
          });
          return;
        }

        const href = downloadLink.getAttribute("href");
        if (!href) {
          sendResponse({
            success: false,
            error: "Download link has no href attribute",
          });
          return;
        }

        sendResponse({ success: true, downloadUrl: href });
      } catch (err: any) {
        console.error("GET_INVOICE_DOWNLOAD_URL error", err);
        sendResponse({
          success: false,
          error: err?.message || String(err),
        });
      }
    })();
    return true; // async response
  }

  if (message.type === "EXTRACT_ADDRESS_FROM_UNIT_SUMMARY") {
    // Extract address from unit summary page DOM (handles SPA)
    (async () => {
      try {
        // Wait for DOM to be ready
        if (document.readyState !== "complete") {
          await new Promise((resolve) => {
            if (document.readyState === "complete") {
              resolve(undefined);
            } else {
              window.addEventListener("load", () => resolve(undefined), {
                once: true,
              });
            }
          });
        }

        // Wait for SPA to render - look for Address element
        await waitForSPAReady(
          [
            'dt:has-text("Address")',
            '[data-testid*="address"]',
            '.euiText',
            'body',
          ],
          5000,
        );

        const address = extractAddressFromUnitSummaryPage(document);
        if (address) {
          sendResponse({ success: true, address });
        } else {
          sendResponse({
            success: false,
            error: "Could not find Address on unit summary page",
          });
        }
      } catch (err: any) {
        console.error("EXTRACT_ADDRESS_FROM_UNIT_SUMMARY error", err);
        sendResponse({
          success: false,
          error: err?.message || String(err),
        });
      }
    })();
    return true; // async response
  }

  if (message.type === "FIND_UNIT_SUMMARY_URL") {
    // Find unit summary URL from meld summary page DOM (handles SPA)
    (async () => {
      try {
        // Wait for DOM to be ready
        if (document.readyState !== "complete") {
          await new Promise((resolve) => {
            if (document.readyState === "complete") {
              resolve(undefined);
            } else {
              window.addEventListener("load", () => resolve(undefined), {
                once: true,
              });
            }
          });
        }

        // Wait for SPA to render - look for property/unit links
        await waitForSPAReady(
          [
            'a[href*="/properties/"]',
            'a[href*="summary"]',
            'a[href]',
            'body',
          ],
          5000,
        );

        const unitSummaryUrl = findUnitSummaryUrlFromMeldPage(document, window.location.href);
        if (unitSummaryUrl) {
          sendResponse({ success: true, unitSummaryUrl });
        } else {
          sendResponse({
            success: false,
            error: "Could not find unit summary URL on meld summary page",
          });
        }
      } catch (err: any) {
        console.error("FIND_UNIT_SUMMARY_URL error", err);
        sendResponse({
          success: false,
          error: err?.message || String(err),
        });
      }
    })();
    return true; // async response
  }

  return false;
});

async function handleCopyRelevantInfo(): Promise<string> {
  // Always use the current page URL (fresh, not cached)
  const currentUrl = window.location.href;
  console.log(`[ContentScript] Processing COPY_RELEVANT_INFO from current page: ${currentUrl}`);
  
  const url = new URL(currentUrl);

  const isUnitSummary = /\/properties\/\d+\/summary\/?$/.test(url.pathname);
  const isNewMeld = /\/melds\/new-meld\/?$/.test(url.pathname);
  const isEditMeld = /\/meld\/\d+\/edit\/?$/.test(url.pathname);
  
  console.log(`[ContentScript] Page type - Unit Summary: ${isUnitSummary}, New Meld: ${isNewMeld}, Edit Meld: ${isEditMeld}`);

  if (!isUnitSummary && !isNewMeld && !isEditMeld) {
    throw new Error(
      "This tool only works on Meld Unit Summary, Meld Creation, or Meld Edit pages.\n" +
        "Please navigate to those pages first.",
    );
  }

  let unitSummaryUrl: string;
  let address: string | null = null;

  if (isUnitSummary) {
    // We're already on the unit summary page
    unitSummaryUrl = currentUrl;
    // Extract address from current page
    address = extractAddressFromUnitSummaryPage(document);
    if (!address) {
      // Wait for SPA to render if address not found immediately
      await waitForSPAReady(
        [
          'dt:has-text("Address")',
          '[data-testid*="address"]',
          '.euiText',
          'body',
        ],
        5000,
      );
      address = extractAddressFromUnitSummaryPage(document);
    }
  } else if (isNewMeld) {
    // We're on new-meld → derive unit summary URL
    unitSummaryUrl = buildUnitSummaryUrlFromNewMeld(url);
    console.log("unit summary url is:", unitSummaryUrl);
  } else if (isEditMeld) {
    // We're on edit-meld → need to get unit summary URL from meld
    // First, get the meld summary URL to find the unit
    const meldSummaryUrl = buildMeldSummaryUrlFromEditMeld(url);
    console.log("meld summary url is:", meldSummaryUrl);
    
    // Extract unit summary URL from meld summary page
    const resp = (await chrome.runtime.sendMessage({
      type: "GET_UNIT_SUMMARY_URL_FROM_MELD",
      meldSummaryUrl,
    })) as {
      success: boolean;
      unitSummaryUrl?: string;
      error?: string;
    };

    if (!resp || !resp.success || !resp.unitSummaryUrl) {
      throw new Error(
        resp?.error ||
          "Could not resolve unit summary URL from meld summary page.",
      );
    }
    unitSummaryUrl = resp.unitSummaryUrl;
  } else {
    throw new Error("Invalid page type");
  }

  // If we don't have the address yet (new meld or edit meld), get it from unit summary
  if (!address) {
    // Need to open unit summary in background tab and extract address
    const resp = (await chrome.runtime.sendMessage({
      type: "EXTRACT_ADDRESS_FROM_UNIT_SUMMARY_URL",
      unitSummaryUrl,
    })) as {
      success: boolean;
      address?: string;
      error?: string;
    };

    if (!resp || !resp.success || !resp.address) {
      throw new Error(
        resp?.error ||
          "Could not extract address from unit summary page.",
      );
    }
    address = resp.address;
  }

  if (!address) {
    throw new Error(
      "Could not find address on unit summary page.",
    );
  }

  // Use address to fetch Propertyware summary via API
  const response = (await chrome.runtime.sendMessage({
    type: "FETCH_PROPERTYWARE_SUMMARY_FROM_ADDRESS",
    address,
  })) as {
    success: boolean;
    summary?: string;
    error?: string;
  };

  if (!response || !response.success || !response.summary) {
    throw new Error(response?.error || "Failed to fetch PropertyWare details");
  }

  // Return the summary text - popup will handle copying
  return response.summary;
}




function buildUnitSummaryUrlFromNewMeld(url: URL): string {
  const unitId = url.searchParams.get("for_unit");
  if (!unitId) {
    throw new Error("No for_unit param found in Meld creation URL.");
  }

  // Preserve the org prefix, e.g. "2611/m/2611"
  const match = url.pathname.match(/^\/([^/]+\/m\/[^/]+)\//);
  if (!match) {
    throw new Error("Could not determine organization prefix from URL.");
  }
  const prefix = match[1]; // "2611/m/2611"

  return `https://app.propertymeld.com/${prefix}/properties/${unitId}/summary/`;
}

function buildMeldSummaryUrlFromEditMeld(url: URL): string {
  // Extract meld ID from URL path like /2611/m/2611/meld/11765595/edit/
  const match = url.pathname.match(/^\/([^/]+\/m\/[^/]+)\/meld\/(\d+)\/edit\/?$/);
  if (!match) {
    throw new Error("Could not extract meld ID from edit meld URL.");
  }
  const prefix = match[1];
  const meldId = match[2];
  return `https://app.propertymeld.com/${prefix}/meld/${meldId}/summary/`;
}

function extractAddressFromUnitSummaryPage(doc: Document): string | null {
  // Look for the Address element structure:
  // The structure is: <dt> with "Address" text, then <dd> with the address value
  // The address is up to the dash (e.g., "1000 N Salem St - 1000 N Salem" -> "1000 N Salem St")
  
  // Strategy 1: Find dt element containing "Address" text
  const allDts = Array.from(doc.querySelectorAll<HTMLElement>("dt"));
  for (const dt of allDts) {
    // Check if this dt contains "Address" text (may be nested in divs/spans)
    const dtText = dt.textContent?.trim() || "";
    if (/^Address$/i.test(dtText)) {
      // Find the associated dd element - could be sibling or in parent container
      let current: HTMLElement | null = dt.parentElement;
      while (current) {
        const dd = current.querySelector<HTMLElement>("dd");
        if (dd) {
          const addressText = dd.textContent?.trim() || "";
          if (addressText) {
            // Extract up to the dash
            const match = addressText.match(/^([^-]+)/);
            if (match) {
              const parsedAddress = match[1].trim();
              console.log(`[ContentScript] Extracted address: "${parsedAddress}" from "${addressText}"`);
              return parsedAddress;
            }
            // If no dash, return the whole text
            console.log(`[ContentScript] Extracted address (no dash): "${addressText}"`);
            return addressText;
          }
        }
        current = current.parentElement;
      }
      
      // Also check siblings
      let sibling: Node | null = dt.nextSibling;
      while (sibling) {
        if (sibling.nodeType === 1) {
          const dd = (sibling as HTMLElement).querySelector<HTMLElement>("dd");
          if (dd) {
            const addressText = dd.textContent?.trim() || "";
            if (addressText) {
              const match = addressText.match(/^([^-]+)/);
              if (match) {
                const parsedAddress = match[1].trim();
                console.log(`[ContentScript] Extracted address from sibling: "${parsedAddress}"`);
                return parsedAddress;
              }
              return addressText;
            }
          }
        }
        sibling = sibling.nextSibling;
      }
    }
  }
  
  // Strategy 2: Find div/element containing "Address" text, then find nearby dd
  const addressLabel = Array.from(
    doc.querySelectorAll<HTMLElement>(".euiText, div, span")
  ).find((el) => {
    const text = el.textContent?.trim() || "";
    return /^Address$/i.test(text);
  });
  
  if (addressLabel) {
    // Look for dd in the same parent container
    let current: HTMLElement | null = addressLabel.parentElement;
    while (current) {
      const dd = current.querySelector<HTMLElement>("dd");
      if (dd) {
        const addressText = dd.textContent?.trim() || "";
        if (addressText) {
          const match = addressText.match(/^([^-]+)/);
          if (match) {
            const parsedAddress = match[1].trim();
            console.log(`[ContentScript] Extracted address via label search: "${parsedAddress}"`);
            return parsedAddress;
          }
          return addressText;
        }
      }
      current = current.parentElement;
    }
  }
  
  // Strategy 3: Search for all dd elements and find one near "Address" text
  const allDds = Array.from(doc.querySelectorAll<HTMLElement>("dd"));
  for (const dd of allDds) {
    // Check if there's an "Address" label nearby (in previous siblings or parent)
    let current: HTMLElement | null = dd.parentElement;
    while (current) {
      const addressLabel = current.querySelector<HTMLElement>("dt, .euiText, div, span");
      if (addressLabel) {
        const labelText = addressLabel.textContent?.trim() || "";
        if (/^Address$/i.test(labelText)) {
          const addressText = dd.textContent?.trim() || "";
          if (addressText) {
            const match = addressText.match(/^([^-]+)/);
            if (match) {
              const parsedAddress = match[1].trim();
              console.log(`[ContentScript] Extracted address via dd search: "${parsedAddress}"`);
              return parsedAddress;
            }
            return addressText;
          }
        }
      }
      current = current.parentElement;
    }
  }
  
  console.warn("Could not find address value after Address label");
  return null;
}

function findUnitSummaryUrlFromMeldPage(doc: Document, baseUrl: string): string | null {
  // Look for links that match the pattern /properties/\d+/summary/
  const allLinks = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>("a[href]"),
  );

  for (const link of allLinks) {
    const href = link.getAttribute("href");
    if (!href) continue;

    try {
      const fullUrl = new URL(href, baseUrl).toString();
      // Match pattern: /properties/\d+/summary/
      if (/\/properties\/\d+\/summary\/?(?:$|[?#])/i.test(fullUrl)) {
        console.log(`[ContentScript] Found unit summary URL: ${fullUrl}`);
        return fullUrl;
      }
    } catch (e) {
      // Invalid URL, skip
      continue;
    }
  }

  console.warn("Could not find unit summary URL on meld page");
  return null;
}

// downloads meld invoices

async function handleDownloadMeldInvoices(): Promise<{
  count: number;
  urls: string[];
}> {
  const currentUrl = window.location.href;
  console.log(`[DownloadInvoices] Processing from: ${currentUrl}`);

  // Check URL pattern: app.propertymeld.com/.../melds/payments/ with any query params
  const url = new URL(currentUrl);
  if (!url.hostname.includes("propertymeld.com")) {
    throw new Error("This tool only works on PropertyMeld");
  }

  const paymentsPagePattern = /\/melds\/payments\/?(?:\?|$)/;
  if (!paymentsPagePattern.test(url.pathname)) {
    throw new Error(
      "This tool only works on the Meld Payments page (URL pattern: .../melds/payments/...)",
    );
  }

  // Wait for SPA to render
  await waitForSPAReady(
    [
      '[data-testid^="meld-invoice-list-card"]',
      '.invoice-card',
      'a[href*="/melds/payments/"]',
    ],
    5000,
  );

  // Find all invoice cards
  const invoiceCards = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-testid^="meld-invoice-list-card"]',
    ),
  );

  console.log(`[DownloadInvoices] Found ${invoiceCards.length} invoice cards`);

  if (invoiceCards.length === 0) {
    throw new Error("No invoice cards found on this page");
  }

  // Extract payment summary URLs from each card (deduplicated)
  const paymentSummaryUrls: string[] = [];
  const seenUrls = new Set<string>(); // Deduplication set
  
  for (const card of invoiceCards) {
    // Find the link to the payment summary page
    const summaryLink = card.querySelector<HTMLAnchorElement>(
      'a[href*="/melds/payments/"][href*="/summary/"]',
    );
    if (summaryLink) {
      const href = summaryLink.getAttribute("href");
      if (href) {
        const fullUrl = new URL(href, currentUrl).toString();
        // Normalize URL (remove trailing slash, hash, etc.) for better deduplication
        const normalizedUrl = fullUrl.split('#')[0].replace(/\/$/, '');
        
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          paymentSummaryUrls.push(fullUrl);
        } else {
          console.log(`[DownloadInvoices] Skipping duplicate URL: ${fullUrl}`);
        }
      }
    }
  }

  console.log(
    `[DownloadInvoices] Found ${paymentSummaryUrls.length} unique payment summary URLs (${invoiceCards.length} total cards)`,
  );

  if (paymentSummaryUrls.length === 0) {
    throw new Error("Could not find any payment summary links");
  }

  // Send to background script to handle concurrent downloads
  const response = (await chrome.runtime.sendMessage({
    type: "DOWNLOAD_MELD_INVOICES_FROM_PAYMENTS",
    paymentSummaryUrls,
  })) as {
    success: boolean;
    count?: number;
    urls?: string[];
    error?: string;
  };

  if (!response || !response.success) {
    throw new Error(response?.error || "Failed to download invoices");
  }

  return {
    count: response.count || 0,
    urls: response.urls || [],
  };
}
