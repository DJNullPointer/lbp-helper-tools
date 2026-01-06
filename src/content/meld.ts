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

  if (message.type === "SCRAPE_MELD_ISSUE_ID") {
    // Use async to wait for page to be ready
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

        // Wait for SPA to render - look for common Meld page elements
        await waitForSPAReady(
          [
            'a[href*="/meld/"]',
            '[data-testid]',
            'a[href]',
          ],
          5000,
        );

        const meldUrl = findFirstMeldSummaryUrlFromDom(
          document,
          window.location.href,
        );
        if (!meldUrl) {
          sendResponse({
            success: false,
            error: "No meld summary URLs found on this page.",
          });
        } else {
          sendResponse({ success: true, meldUrl });
        }
      } catch (err: any) {
        console.error("SCRAPE_MELD_ISSUE_ID error", err);
        sendResponse({
          success: false,
          error: err?.message || String(err),
        });
      }
    })();
    return true; // async response
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

  if (message.type === "EXTRACT_ISSUE_ID_FROM_MELD") {
    // Extract Issue ID directly from the meld page DOM (handles SPA)
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

        // Wait for SPA to render - look for Issue ID element or Propertyware elements
        await waitForSPAReady(
          [
            '[data-testid^="meld-integration-resource-issue-id"]',
            '[data-testid*="issue-id"]',
            '[data-testid="integration-resource-partner-name"]',
            'body',
          ],
          5000,
        );

        const issueId = extractIssueIdFromMeldPage(document);
        if (issueId) {
          sendResponse({ success: true, issueId });
        } else {
          sendResponse({
            success: false,
            error: "Could not find Issue ID on meld page",
          });
        }
      } catch (err: any) {
        console.error("EXTRACT_ISSUE_ID_FROM_MELD error", err);
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

  let issueId: string | null = null;

  if (isUnitSummary) {
    // We're already on the page that has the meld links
    issueId = await getIssueIdFromCurrentUnitSummaryPage();
  } else if (isNewMeld) {
    // We're on new-meld → derive unit summary URL and let the background
    // spin up a hidden tab to scrape it
    const unitSummaryUrl = buildUnitSummaryUrlFromNewMeld(url);
    console.log("unit summary url is:", unitSummaryUrl);

    const resp = (await chrome.runtime.sendMessage({
      type: "RESOLVE_ISSUE_ID_FROM_UNIT_SUMMARY",
      unitSummaryUrl,
    })) as {
      success: boolean;
      issueId?: string;
      error?: string;
    };

    if (!resp || !resp.success) {
      throw new Error(
        resp?.error ||
          "Could not resolve Propertyware Issue ID from unit summary page.",
      );
    }
    issueId = resp.issueId ?? null;
  } else if (isEditMeld) {
    // We're on edit-meld → derive meld summary URL and let the background
    // spin up a hidden tab to extract Issue ID from the meld summary page
    const meldSummaryUrl = buildMeldSummaryUrlFromEditMeld(url);
    console.log("meld summary url is:", meldSummaryUrl);

    const resp = (await chrome.runtime.sendMessage({
      type: "RESOLVE_ISSUE_ID_FROM_MELD_SUMMARY",
      meldSummaryUrl,
    })) as {
      success: boolean;
      issueId?: string;
      error?: string;
    };

    if (!resp || !resp.success) {
      throw new Error(
        resp?.error ||
          "Could not resolve Propertyware Issue ID from meld summary page.",
      );
    }
    issueId = resp.issueId ?? null;
  }

  if (!issueId) {
    throw new Error(
      "Could not find a Propertyware Issue ID from this unit's meld(s).",
    );
  }

  const response = (await chrome.runtime.sendMessage({
    type: "FETCH_PROPERTYWARE_SUMMARY",
    issueId,
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

async function getIssueIdFromCurrentUnitSummaryPage(): Promise<string | null> {
  // Always use current document and URL (fresh, not cached)
  const currentUrl = window.location.href;
  console.log(`[ContentScript] Getting Issue ID from current unit summary page: ${currentUrl}`);
  
  const meldUrl = findFirstMeldSummaryUrlFromDom(
    document,
    currentUrl,
  );

  console.log("First meld summary URL found on current page:", meldUrl);

  if (!meldUrl) return null;

  const issueId = await tryExtractIssueIdFromMeld(meldUrl);
  if (issueId) {
    console.log("Using Issue ID:", issueId);
    return issueId;
  }

  return null;
}


function extractIssueIdFromMeldPage(doc: Document): string | null {
  // Try multiple selectors to find the Issue ID element
  const selectors = [
    '[data-testid^="meld-integration-resource-issue-id"]',
    '[data-testid*="issue-id"]',
    '[data-testid*="issueId"]',
    '[data-testid*="issue_id"]',
  ];

  for (const selector of selectors) {
    const issueIdEls = Array.from(doc.querySelectorAll<HTMLElement>(selector));
    console.log(`Selector "${selector}" found ${issueIdEls.length} elements`);
    
    for (const issueIdEl of issueIdEls) {
      // Get text content, which may be nested in child elements
      let issueId = issueIdEl.textContent?.trim() || "";
      console.log(`Element text content: "${issueId}"`);
      
      // If the text includes "Issue ID" label, extract just the number
      issueId = issueId.replace(/Issue\s*ID/gi, "").trim();
      
      // Extract the first sequence of digits (should be the Issue ID)
      const match = issueId.match(/\d+/);
      if (match) {
        const id = match[0];
        console.log(`Found Issue ID using selector "${selector}": ${id}`);
        return id;
      }
      
      // If no match in textContent, try looking in all child elements
      const children = Array.from(issueIdEl.querySelectorAll("*"));
      for (const child of children) {
        const childText = child.textContent?.trim() || "";
        const childMatch = childText.match(/^\d+$/);
        if (childMatch) {
          console.log(`Found Issue ID in child element: ${childMatch[0]}`);
          return childMatch[0];
        }
      }
      
      // Also check direct child nodes (text nodes)
      for (const node of Array.from(issueIdEl.childNodes)) {
        if (node.nodeType === 3) { // Text node
          const text = node.textContent?.trim() || "";
          const textMatch = text.match(/^\d+$/);
          if (textMatch) {
            console.log(`Found Issue ID in text node: ${textMatch[0]}`);
            return textMatch[0];
          }
        }
      }
    }
  }

  // Fallback: Search the entire document for "Issue ID" followed by a number
  const bodyText = doc.body?.textContent || "";
  console.log("Searching body text for Issue ID pattern...");
  const fallbackMatch = bodyText.match(/Issue\s*ID[:\s]*(\d+)/i);
  if (fallbackMatch) {
    const id = fallbackMatch[1];
    console.log(`Found Issue ID via text search: ${id}`);
    return id;
  }

  // Last resort: look for any number near "Issue ID" text
  const nearMatch = bodyText.match(/(?:Issue\s*ID|IssueID)[^\d]*(\d{4,})/i);
  if (nearMatch) {
    const id = nearMatch[1];
    console.log(`Found Issue ID near "Issue ID" text: ${id}`);
    return id;
  }

  console.warn("Could not find Issue ID on meld page");
  return null;
}

function findFirstMeldSummaryUrlFromDom(
  doc: Document,
  baseUrl: string,
): string | null {
  // Try multiple selectors to find meld links
  const selectors = [
    'a[href*="/meld/"]',
    'a[href*="meld"]',
    'a[href]',
  ];

  for (const selector of selectors) {
    const anchors = Array.from(
      doc.querySelectorAll<HTMLAnchorElement>(selector),
    );
    console.log(`Trying selector "${selector}": found ${anchors.length} anchors`);

    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (!href) continue;

      try {
        const full = new URL(href, baseUrl).toString();

        // /meld/<number>/summary/ with optional ? or #
        if (/\/meld\/\d+\/summary\/?(?:$|[?#])/i.test(full)) {
          console.log("Matched meld summary href:", full);
          return full;
        }
      } catch (e) {
        // Invalid URL, skip
        continue;
      }
    }
  }

  console.warn("No meld summary URLs found on page");
  return null;
}

async function tryExtractIssueIdFromMeld(
  meldUrl: string,
): Promise<string | null> {
  const resp = await fetch(meldUrl, { credentials: "include" });
  if (!resp.ok) return null;

  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // 1) Verify Partner is Propertyware
  const partnerEl = doc.querySelector(
    '[data-testid="integration-resource-partner-name"]',
  );
  const partnerText = partnerEl?.textContent?.trim() || "";
  if (!/propertyware/i.test(partnerText)) return null;

  // 2) Get Issue ID (86481)
  const issueIdEl = doc.querySelector<HTMLElement>(
    '[data-testid^="meld-integration-resource-issue-id"]',
  );
  const issueId = issueIdEl?.textContent?.trim() || null;

  return issueId && /^\d+$/.test(issueId) ? issueId : null;
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
  const match = url.pathname.match(/\/meld\/(\d+)\/edit/);
  if (!match || !match[1]) {
    throw new Error("Could not extract meld ID from edit meld URL.");
  }
  const meldId = match[1];

  // Preserve the org prefix, e.g. "2611/m/2611"
  const prefixMatch = url.pathname.match(/^\/([^/]+\/m\/[^/]+)\//);
  if (!prefixMatch) {
    throw new Error("Could not determine organization prefix from URL.");
  }
  const prefix = prefixMatch[1]; // "2611/m/2611"

  return `https://app.propertymeld.com/${prefix}/meld/${meldId}/summary/`;
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
