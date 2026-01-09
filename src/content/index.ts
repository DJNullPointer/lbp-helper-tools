// Main content script entry point
// Handles message routing and delegates to handlers

import { waitForSPAReady, copyTextToClipboard } from "./utils";
import { handleCopyRelevantInfo, handleDownloadMeldInvoices } from "./handlers";
import {
  extractUnitAddressFromUnitSummaryPage,
  extractBuildingAddressFromUnitSummaryPage,
  findUnitSummaryUrlFromMeldPage,
  extractUnitAddressFromMeldSummaryPage,
  extractBuildingAddressFromMeldSummaryPage,
  extractIssueIdFromMeldSummaryPage,
} from "./extractors";

export {};

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

        const successful = await copyTextToClipboard(text);
        
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

        // Wait for SPA to render - look for download link and meld number
        await waitForSPAReady(
          [
            'a[href*="/invoices/"][href*="/download/"]',
            '.euiLink[href*="download"]',
            'a[href*="download"]',
            '[data-testid="invoice-detail-meld-number"]',
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

        // Extract meld number from the page
        const meldNumberElement = document.querySelector<HTMLElement>(
          '[data-testid="invoice-detail-meld-number"]',
        );
        let meldNumber: string | null = null;
        
        if (meldNumberElement) {
          // The meld number is in a button inside an anchor tag
          const button = meldNumberElement.querySelector<HTMLButtonElement>('button, a');
          if (button) {
            meldNumber = button.textContent?.trim() || null;
            console.log(`[ContentScript] Extracted meld number: ${meldNumber}`);
          }
        }

        sendResponse({ success: true, downloadUrl: href, meldNumber });
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

        // Wait for SPA to render - look for Address element and header subtitle
        await waitForSPAReady(
          [
            'dt',
            '[data-testid*="address"]',
            '[data-testid="header-subtitle"]',
            '.euiFlexGroup',
            'body',
          ],
          5000,
        );

        const unitAddress = extractUnitAddressFromUnitSummaryPage(document);
        const buildingAddress = extractBuildingAddressFromUnitSummaryPage(document);
        console.log(`[ContentScript] Extracted - unitAddress: "${unitAddress}", buildingAddress: "${buildingAddress}"`);
        if (unitAddress) {
          sendResponse({
            success: true,
            unitAddress,
            buildingAddress: buildingAddress || undefined,
          });
        } else {
          sendResponse({
            success: false,
            error: "Could not find unit address on unit summary page",
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

  if (message.type === "OPEN_PROPERTYWARE_PAGE") {
    // Open corresponding PropertyWare page based on current Meld page
    (async () => {
      try {
        const currentUrl = window.location.href;
        const url = new URL(currentUrl);
        
        const isUnitSummary = /\/properties\/\d+\/summary\/?$/.test(url.pathname);
        const isMeldSummary = /\/meld\/\d+\/summary\/?$/.test(url.pathname);
        
        if (!isUnitSummary && !isMeldSummary) {
          sendResponse({
            success: false,
            error: "This tool only works on Meld unit summary or meld summary pages.",
          });
          return;
        }

        let propertyWareUrl: string;

        if (isUnitSummary) {
          // Extract addresses and get unit ID, then build unit detail URL
          await waitForSPAReady(['dt', '.euiFlexGroup', 'body'], 5000);
          const unitAddress = extractUnitAddressFromUnitSummaryPage(document);
          const buildingAddress = extractBuildingAddressFromUnitSummaryPage(document);
          
          if (!unitAddress) {
            sendResponse({
              success: false,
              error: "Could not extract unit address from unit summary page",
            });
            return;
          }

          // Use the new API that handles fallback to building address
          const resp = (await chrome.runtime.sendMessage({
            type: "GET_UNIT_ID_FROM_ADDRESS",
            unitAddress,
            buildingAddress: buildingAddress || undefined,
          })) as {
            success: boolean;
            unitId?: number;
            error?: string;
          };

          if (!resp || !resp.success || !resp.unitId) {
            sendResponse({
              success: false,
              error: resp?.error || "Could not find unit ID for address",
            });
            return;
          }

          propertyWareUrl = `https://app.propertyware.com/pw/properties/unit_detail.do?entityID=${resp.unitId}`;
        } else {
          // Meld summary page: extract address and issue ID, then get work order
          await waitForSPAReady(
            [
              '[data-testid="meld-details-unit-or-property-address"]',
              '.euiFlexGroup',
              'body',
            ],
            5000,
          );

          const unitAddress = extractUnitAddressFromMeldSummaryPage(document);
          const buildingAddress = extractBuildingAddressFromMeldSummaryPage(document);
          const issueId = extractIssueIdFromMeldSummaryPage(document);

          if (!unitAddress) {
            sendResponse({
              success: false,
              error: "Could not extract unit address from meld summary page",
            });
            return;
          }

          if (!issueId) {
            sendResponse({
              success: false,
              error: "Could not extract Issue ID from meld summary page",
            });
            return;
          }

          const resp = (await chrome.runtime.sendMessage({
            type: "GET_PROPERTYWARE_WORK_ORDER_URL",
            address: unitAddress,
            buildingAddress: buildingAddress || undefined,
            issueId,
          })) as {
            success: boolean;
            url?: string;
            error?: string;
          };

          if (!resp || !resp.success || !resp.url) {
            sendResponse({
              success: false,
              error: resp?.error || "Could not find PropertyWare work order",
            });
            return;
          }

          propertyWareUrl = resp.url;
        }

        sendResponse({ success: true, data: { url: propertyWareUrl } });
      } catch (err: any) {
        console.error("OPEN_PROPERTYWARE_PAGE error", err);
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
