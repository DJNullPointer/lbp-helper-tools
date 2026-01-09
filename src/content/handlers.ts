// Main handler functions for content script

import { waitForSPAReady } from "./utils";
import { buildUnitSummaryUrlFromNewMeld, buildMeldSummaryUrlFromEditMeld } from "./url-builders";
import { extractAddressFromUnitSummaryPage } from "./extractors";

export async function handleCopyRelevantInfo(): Promise<string> {
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
          'dt',
          '[data-testid*="address"]',
          '.euiFlexGroup',
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

export async function handleDownloadMeldInvoices(): Promise<{
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
