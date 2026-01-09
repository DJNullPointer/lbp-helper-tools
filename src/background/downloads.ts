// Download-related functions for background script

import { waitForTabComplete } from "./utils";

// Map to store meld numbers for invoice downloads (keyed by download URL)
export const invoiceDownloadMeldNumbers = new Map<string, string>();

export async function handleDownloads(
  urls: string[],
  filenames?: string[],
): Promise<void> {
  console.log(`[Background] Starting download of ${urls.length} files`);

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const filename = filenames?.[i];

    console.log(
      `[Background] Downloading file ${i + 1}/${urls.length}: ${url}`,
    );
    try {
      const downloadId = await chrome.downloads.download({
        url,
        filename,
        saveAs: false,
      });
      console.log(`[Background] Download started with ID: ${downloadId}`);
      // Small delay between downloads to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`[Background] Failed to download ${url}:`, error);
      // Continue with next download even if one fails
    }
  }

  console.log(`[Background] Finished processing ${urls.length} downloads`);
}

export async function downloadInvoicesFromPaymentPages(
  paymentSummaryUrls: string[],
  onProgress?: (current: number, total: number, detail?: string) => void,
): Promise<{ count: number; urls: string[] }> {
  const total = paymentSummaryUrls.length;
  console.log(`[InvoiceDownload] Starting download of ${total} invoices`);

  const downloadedUrls: string[] = [];
  const CONCURRENT_LIMIT = 5; // Process 5 tabs at a time to avoid overwhelming RAM
  let completedCount = 0;

  // Process URLs in batches
  for (let i = 0; i < paymentSummaryUrls.length; i += CONCURRENT_LIMIT) {
    const batch = paymentSummaryUrls.slice(i, i + CONCURRENT_LIMIT);
    const batchNumber = Math.floor(i / CONCURRENT_LIMIT) + 1;
    const totalBatches = Math.ceil(
      paymentSummaryUrls.length / CONCURRENT_LIMIT,
    );

    console.log(
      `[InvoiceDownload] Processing batch ${batchNumber}/${totalBatches} (${batch.length} invoices)`,
    );

    // Process batch concurrently
    const batchPromises = batch.map(async (url, batchIndex) => {
      const globalIndex = i + batchIndex;

      // Update progress when starting each download
      if (onProgress) {
        onProgress(
          globalIndex + 1,
          total,
          `Downloading invoice ${globalIndex + 1} of ${total}`,
        );
      }

      const result = await downloadInvoiceFromPaymentPage(url);

      if (result) {
        downloadedUrls.push(result);
        completedCount++;
        // Update progress after each successful download
        if (onProgress) {
          onProgress(
            completedCount,
            total,
            `Downloading invoice ${completedCount + 1} of ${total}`,
          );
        }
      }

      return result;
    });

    const batchResults = await Promise.allSettled(batchPromises);
    for (const result of batchResults) {
      if (result.status === "rejected") {
        console.warn(
          `[InvoiceDownload] Failed to download invoice:`,
          result.reason,
        );
      }
    }

    // Small delay between batches to avoid overwhelming the browser
    if (i + CONCURRENT_LIMIT < paymentSummaryUrls.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(
    `[InvoiceDownload] Successfully downloaded ${downloadedUrls.length} of ${total} invoices`,
  );

  if (onProgress) {
    onProgress(
      total,
      total,
      `Complete! Downloaded ${downloadedUrls.length} invoices`,
    );
  }

  return {
    count: downloadedUrls.length,
    urls: downloadedUrls,
  };
}

async function downloadInvoiceFromPaymentPage(
  paymentSummaryUrl: string,
): Promise<string | null> {
  // 1. Open background tab to payment summary page
  const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
    chrome.tabs.create({ url: paymentSummaryUrl, active: false }, (t) => {
      if (chrome.runtime.lastError || !t || t.id === undefined) {
        reject(
          new Error(
            chrome.runtime.lastError?.message ||
              "Failed to create tab for payment page",
          ),
        );
      } else {
        resolve(t);
      }
    });
  });

  const tabId = tab.id!;
  try {
    // 2. Wait for tab to load
    await waitForTabComplete(tabId);

    // 3. Give SPA time to render
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 4. Ask content script to find and return the download URL and meld number
    let result: {
      success?: boolean;
      downloadUrl?: string;
      meldNumber?: string;
      error?: string;
    } | null = null;

    const maxAttempts = 5;
    const maxWaitTime = 5000;
    const startTime = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        result = (await chrome.tabs.sendMessage(tabId, {
          type: "GET_INVOICE_DOWNLOAD_URL",
        })) as {
          success?: boolean;
          downloadUrl?: string;
          meldNumber?: string;
          error?: string;
        };
        if (result && result.success && result.downloadUrl) {
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

    if (!result || !result.success || !result.downloadUrl) {
      console.warn(
        `[InvoiceDownload] Could not find download URL for ${paymentSummaryUrl}`,
        result,
      );
      return null;
    }

    // 5. Build full download URL
    const downloadUrl = new URL(
      result.downloadUrl,
      paymentSummaryUrl,
    ).toString();

    // Store meld number for this download URL so onDeterminingFilename can use it
    if (result.meldNumber) {
      invoiceDownloadMeldNumbers.set(downloadUrl, result.meldNumber);
      console.log(
        `[InvoiceDownload] Stored meld number "${result.meldNumber}" for download: ${downloadUrl}`,
      );
    }

    // Start download without specifying filename - let Chrome determine it,
    // then onDeterminingFilename will modify it to append the meld number
    console.log(`[InvoiceDownload] Downloading invoice from: ${downloadUrl}`);
    await chrome.downloads.download({
      url: downloadUrl,
      saveAs: false,
    });

    // Small delay between downloads
    await new Promise((resolve) => setTimeout(resolve, 200));

    return downloadUrl;
  } finally {
    // 6. Clean up background tab
    chrome.tabs.remove(tabId);
  }
}
