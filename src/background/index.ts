// Main background script entry point
// Handles message routing and download filename management

import { invoiceDownloadMeldNumbers, handleDownloads, downloadInvoicesFromPaymentPages } from "./downloads";
import { fetchPropertyWarePage } from "./propertyware/fetch";
import { getBuildingIdFromAddress, getPropertyWareWorkOrderUrl } from "./propertyware/api";
import { extractAddressFromUnitSummaryUrl, getUnitSummaryUrlFromMeld } from "./propertyware/scraping";
import { fetchPropertywareSummaryFromAddress } from "./propertyware/summary";

export {};

// Set up listener to modify filenames for invoice downloads
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
  // Check if this download URL has an associated meld number
  const meldNumber = invoiceDownloadMeldNumbers.get(downloadItem.url);

  if (meldNumber && downloadItem.filename) {
    // Extract the original filename and extension
    const lastDot = downloadItem.filename.lastIndexOf(".");
    if (lastDot > 0) {
      const nameWithoutExt = downloadItem.filename.substring(0, lastDot);
      const ext = downloadItem.filename.substring(lastDot);
      const newFilename = `${nameWithoutExt}-${meldNumber}${ext}`;
      console.log(
        `[InvoiceDownload] Renaming "${downloadItem.filename}" to "${newFilename}"`,
      );
      suggest({ filename: newFilename });

      // Clean up the map entry after use
      invoiceDownloadMeldNumbers.delete(downloadItem.url);
      return;
    } else {
      // No extension, just append meld number
      const newFilename = `${downloadItem.filename}-${meldNumber}`;
      console.log(
        `[InvoiceDownload] Renaming "${downloadItem.filename}" to "${newFilename}"`,
      );
      suggest({ filename: newFilename });

      // Clean up the map entry after use
      invoiceDownloadMeldNumbers.delete(downloadItem.url);
      return;
    }
  }

  // Not an invoice download we're tracking, use default behavior
  suggest({ filename: downloadItem.filename });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // DOWNLOAD_FILES -------------------------------------------------------------
  if (message.type === "DOWNLOAD_FILES") {
    handleDownloads(message.urls, message.filenames)
      .then(() => sendResponse({ success: true }))
      .catch((error: Error) =>
        sendResponse({ success: false, error: error.message }),
      );
    return true; // async
  }

  // Simple HTML fetch passthrough ---------------------------------------------
  if (message.type === "FETCH_PROPERTYWARE_PAGE") {
    fetchPropertyWarePage(message.url as string)
      .then((html) => sendResponse({ success: true, html }))
      .catch((error: Error) =>
        sendResponse({ success: false, error: error.message }),
      );
    return true; // async
  }

  // PW SUMMARY BUILDER FROM ADDRESS (NEW API-BASED FLOW) ----------------------
  if (message.type === "FETCH_PROPERTYWARE_SUMMARY_FROM_ADDRESS") {
    (async () => {
      try {
        const summary = await fetchPropertywareSummaryFromAddress(
          message.address as string,
        );
        sendResponse({ success: true, summary });
      } catch (err: any) {
        console.error("FETCH_PROPERTYWARE_SUMMARY_FROM_ADDRESS error", err);
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true; // async
  }

  // GET BUILDING ID FROM ADDRESS ---------------------------------------------
  if (message.type === "GET_BUILDING_ID_FROM_ADDRESS") {
    (async () => {
      try {
        const buildingId = await getBuildingIdFromAddress(
          message.address as string,
        );
        if (!buildingId) {
          sendResponse({
            success: false,
            error: `Could not find building for address: ${message.address}`,
          });
          return;
        }
        sendResponse({ success: true, buildingId });
      } catch (err: any) {
        console.error("GET_BUILDING_ID_FROM_ADDRESS error", err);
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true; // async
  }

  // GET PROPERTYWARE WORK ORDER URL FROM ADDRESS AND ISSUE ID ----------------
  if (message.type === "GET_PROPERTYWARE_WORK_ORDER_URL") {
    (async () => {
      try {
        const url = await getPropertyWareWorkOrderUrl(
          message.address as string,
          message.issueId as string,
        );
        if (!url) {
          sendResponse({
            success: false,
            error:
              "Could not find PropertyWare work order for the given address and Issue ID",
          });
          return;
        }
        sendResponse({ success: true, url });
      } catch (err: any) {
        console.error("GET_PROPERTYWARE_WORK_ORDER_URL error", err);
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true; // async
  }

  // EXTRACT ADDRESS FROM UNIT SUMMARY URL -------------------------------------
  if (message.type === "EXTRACT_ADDRESS_FROM_UNIT_SUMMARY_URL") {
    (async () => {
      try {
        const address = await extractAddressFromUnitSummaryUrl(
          message.unitSummaryUrl as string,
        );
        if (!address) {
          sendResponse({
            success: false,
            error: "Could not extract address from unit summary page.",
          });
          return;
        }
        sendResponse({ success: true, address });
      } catch (err: any) {
        console.error("EXTRACT_ADDRESS_FROM_UNIT_SUMMARY_URL error", err);
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true; // async
  }

  // GET UNIT SUMMARY URL FROM MELD (for edit meld flow) -----------------------
  if (message.type === "GET_UNIT_SUMMARY_URL_FROM_MELD") {
    (async () => {
      try {
        const unitSummaryUrl = await getUnitSummaryUrlFromMeld(
          message.meldSummaryUrl as string,
        );
        if (!unitSummaryUrl) {
          sendResponse({
            success: false,
            error: "Could not find unit summary URL from meld summary page.",
          });
          return;
        }
        sendResponse({ success: true, unitSummaryUrl });
      } catch (err: any) {
        console.error("GET_UNIT_SUMMARY_URL_FROM_MELD error", err);
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true; // async
  }

  // Clipboard is content-script only ------------------------------------------
  if (message.type === "COPY_TO_CLIPBOARD") {
    sendResponse({
      success: true,
      message: "Clipboard operation should be in content script",
    });
    return false;
  }

  // DOWNLOAD_MELD_INVOICES_FROM_PAYMENTS -------------------------------------
  if (message.type === "DOWNLOAD_MELD_INVOICES_FROM_PAYMENTS") {
    (async () => {
      try {
        const onProgress = (
          current: number,
          total: number,
          detail?: string,
        ) => {
          // Send progress update to any listening popup
          chrome.runtime
            .sendMessage({
              type: "INVOICE_DOWNLOAD_PROGRESS",
              current,
              total,
              detail,
            })
            .catch(() => {
              // Ignore errors if no listener (popup might be closed)
            });
        };

        const result = await downloadInvoicesFromPaymentPages(
          message.paymentSummaryUrls as string[],
          onProgress,
        );
        sendResponse({ success: true, ...result });
      } catch (err: any) {
        console.error("DOWNLOAD_MELD_INVOICES_FROM_PAYMENTS error", err);
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true; // async
  }

  // Unhandled message ---------------------------------------------------------
  return false;
});
