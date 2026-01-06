// background.ts
import { parseHTML } from "linkedom";

export {};

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

//
// ------------------------ DOWNLOADS ------------------------------------------
//

async function handleDownloads(
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

//
// -------------------- MELD INVOICE DOWNLOADS (from payments page) ----------
//

async function downloadInvoicesFromPaymentPages(
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

    // 4. Ask content script to find and return the download URL
    let result: {
      success?: boolean;
      downloadUrl?: string;
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

    // 5. Build full download URL and download
    const downloadUrl = new URL(
      result.downloadUrl,
      paymentSummaryUrl,
    ).toString();

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

//
// -------------------- ADDRESS EXTRACTION FROM UNIT SUMMARY -------------------
//

async function extractAddressFromUnitSummaryUrl(
  unitSummaryUrl: string,
): Promise<string | null> {
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

    // 4. Ask the content script in THAT tab to extract the address
    // Retry with exponential backoff until content script responds or timeout
    let result: {
      success?: boolean;
      address?: string;
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
          address?: string;
          error?: string;
        };
        if (result && result.success && result.address) {
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

    if (!result || !result.success || !result.address) {
      console.warn("Failed to extract address from unit summary tab", result);
      return null;
    }

    return result.address;
  } finally {
    // 5. Clean up the background tab
    chrome.tabs.remove(tabId);
  }
}

async function getUnitSummaryUrlFromMeld(
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

function waitForTabComplete(tabId: number): Promise<void> {
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

//
// ---------------------- BASIC PW FETCH HELPERS -------------------------------
//

async function fetchPropertyWarePage(url: string): Promise<string> {
  try {
    // Add cache-busting timestamp to URL
    const urlWithCacheBust = new URL(url);
    urlWithCacheBust.searchParams.set("_t", Date.now().toString());

    const response = await fetch(urlWithCacheBust.toString(), {
      method: "GET",
      credentials: "include",
      cache: "no-store", // Disable caching
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch PropertyWare page: ${response.status} ${response.statusText}`,
      );
    }

    return await response.text();
  } catch (error) {
    const err = error as Error;
    throw new Error(`Error fetching PropertyWare page: ${err.message}`);
  }
}

async function fetchPwHtml(url: string): Promise<string> {
  // Add aggressive cache-busting: timestamp + random number
  const urlWithCacheBust = new URL(url);
  const cacheBuster = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  urlWithCacheBust.searchParams.set("_nocache", cacheBuster);

  console.log(
    `[Propertyware] Fetching ${url} with cache buster: ${cacheBuster}`,
  );

  const resp = await fetch(urlWithCacheBust.toString(), {
    credentials: "include",
    cache: "reload", // More aggressive than no-store - forces reload from server
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
  if (!resp.ok) {
    throw new Error(`PW fetch failed: ${resp.status} ${url}`);
  }

  const html = await resp.text();
  console.log(`[Propertyware] Fetched ${html.length} bytes from ${url}`);
  return html;
}

//
// --------------------- SUMMARY BUILDER PIPELINE ------------------------------
//

async function fetchPropertywareSummaryFromAddress(
  address: string,
): Promise<string> {
  console.log(
    `[Propertyware] Fetching unit detail from address: "${address}"`,
  );

  // 1) Call Propertyware API to get building ID
  console.log(
    `[Propertyware] Step 1: Calling API to find building by address...`,
  );
  const buildingId = await getBuildingIdFromAddress(address);
  if (!buildingId) {
    throw new Error(`Could not find building for address: ${address}`);
  }
  console.log(`[Propertyware] Found building ID: ${buildingId}`);

  // 2) Build unit detail URL directly using building ID
  const unitUrl = `https://app.propertyware.com/pw/properties/unit_detail.do?entityID=${buildingId}`;
  console.log(`[Propertyware] Unit detail URL: ${unitUrl}`);

  // 3) Fetch unit detail page
  console.log(
    `[Propertyware] Step 2: Fetching unit detail page (fresh, no cache)...`,
  );
  const unitHtml = await fetchPwHtml(unitUrl);

  // 4) Build the final text summary from unit detail page
  console.log(`[Propertyware] Step 3: Building summary from fresh data...`);
  return buildSummaryFromPwPages(unitHtml);
}

async function getBuildingIdFromAddress(address: string): Promise<number | null> {
  // Call Propertyware REST API
  const apiUrl = new URL("https://api.propertyware.com/pw/api/rest/v1/buildings");
  apiUrl.searchParams.set("address", address);

  console.log(`[Propertyware] API URL: ${apiUrl.toString()}`);

  const resp = await fetch(apiUrl.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
    },
  });

  if (!resp.ok) {
    throw new Error(
      `Propertyware API request failed: ${resp.status} ${resp.statusText}`,
    );
  }

  const data = (await resp.json()) as Array<{ id: number }>;
  console.log(`[Propertyware] API returned ${data.length} building(s)`);

  if (data.length === 0) {
    console.warn(`[Propertyware] No buildings found for address: ${address}`);
    return null;
  }

  // Return the first building's ID
  const buildingId = data[0].id;
  console.log(`[Propertyware] Using building ID: ${buildingId}`);
  return buildingId;
}

function buildSummaryFromPwPages(unitHtml: string): string {
  const { document: unitDoc } = parseHTML(unitHtml);

  const lines: string[] = [];

  // ADDRESS LINE -----------------------------------------------------------------
  const address = extractAddress(unitDoc);
  if (address) {
    lines.push(address);
  } else {
    lines.push("Address: (not found)");
  }
  lines.push(
    "---------------------------------------------------------------------------------------------------",
  );

  // TENANTS ----------------------------------------------------------------------
  lines.push("TENANTS:");
  const tenantLines = extractTenantLines(unitDoc);
  if (tenantLines.length) {
    lines.push("Name Home Phone Work Phone Mobile Email");
    lines.push(...tenantLines);
  } else {
    lines.push("No tenant info found");
  }

  // SECURITY / KEYS --------------------------------------------------------------
  const securityLine = extractSecurityInfo(unitDoc);
  if (securityLine) {
    lines.push(securityLine);
  }

  const keyInfo = extractKeyInfo(unitDoc);
  if (keyInfo) {
    lines.push(
      "---------------------------------------------------------------------------------------------------",
    );
    lines.push(keyInfo);
  }

  // GENERAL PROPERTY INFO (shutoffs, heaters, etc) --------------------------------
  const generalInfoLines = extractGeneralPropertyInfo(unitDoc);
  if (generalInfoLines.length) {
    lines.push("General Property Information:");
    lines.push(...generalInfoLines);
  }

  return lines.join("\n");
}

//
// ---------- GENERIC HELPER FUNCTIONS (PW HTML) --------------------------------
//

function getValueFromLabel(
  doc: Document,
  labelText: string | RegExp,
): string | null {
  const cells = Array.from(
    doc.querySelectorAll<HTMLTableCellElement>("td, th"),
  );

  const labelCell = cells.find((cell) => {
    const text = cell.textContent?.trim() || "";
    if (typeof labelText === "string") {
      return text.startsWith(labelText);
    }
    return labelText.test(text);
  });

  if (!labelCell) return null;

  const valueCell = labelCell.nextElementSibling as HTMLElement | null;
  if (!valueCell) return null;

  const text = valueCell.textContent
    ?.replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
}

function getHtmlFromLabel(
  doc: Document,
  labelText: string | RegExp,
): string | null {
  const cells = Array.from(
    doc.querySelectorAll<HTMLTableCellElement>("td, th"),
  );

  const labelCell = cells.find((cell) => {
    const text = cell.textContent?.trim() || "";
    if (typeof labelText === "string") {
      return text.startsWith(labelText);
    }
    return labelText.test(text);
  });

  if (!labelCell) return null;

  const valueCell = labelCell.nextElementSibling as HTMLElement | null;
  if (!valueCell) return null;

  const cloned = valueCell.cloneNode(true) as HTMLElement;
  cloned.querySelectorAll("br, BR").forEach((br) => (br.textContent = "\n"));

  const text = cloned.textContent
    ?.replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return text || null;
}

//
// ---------- ADDRESS -----------------------------------------------------------
//

function extractAddress(unitDoc: Document): string | null {
  const header =
    unitDoc.querySelector("h1, h2, .pageTitle, .headerTitle") ||
    unitDoc.querySelector('[id*="address"], [class*="address"]');

  if (header) {
    const text = header.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }

  const location = getValueFromLabel(unitDoc, /^Location\b/i);
  if (location) return location;

  const marketingAddress = getValueFromLabel(
    unitDoc,
    /^For Lease - Address Other Description/i,
  );
  if (marketingAddress) return marketingAddress;

  return null;
}

//
// ---------- TENANTS -----------------------------------------------------------
//

function extractTenantLines(unitDoc: Document): string[] {
  const tables = Array.from(
    unitDoc.querySelectorAll<HTMLTableElement>("table"),
  );
  let tenantTable: HTMLTableElement | null = null;

  for (const table of tables) {
    const text = table.textContent || "";
    if (/Tenant Information/i.test(text)) {
      tenantTable = table;
      break;
    }
  }

  if (!tenantTable) return [];

  const rows = Array.from(tenantTable.querySelectorAll("tr"));
  if (rows.length < 2) return [];

  const headerCells = Array.from(rows[0].querySelectorAll("th, td")).map(
    (c) => c.textContent?.trim() || "",
  );

  const idx = {
    name: headerCells.findIndex((h) => /Primary Contact|Name/i.test(h)),
    home: headerCells.findIndex((h) => /Home Phone/i.test(h)),
    work: headerCells.findIndex((h) => /Work Phone/i.test(h)),
    mobile: headerCells.findIndex((h) => /Mobile Phone/i.test(h)),
    email: headerCells.findIndex((h) => /Email/i.test(h)),
  };

  const lines: string[] = [];

  const get = (cells: HTMLTableCellElement[], i: number) =>
    i >= 0 && i < cells.length
      ? cells[i].textContent?.replace(/\s+/g, " ").trim() || ""
      : "";

  for (const row of rows.slice(1)) {
    const cells = Array.from(row.querySelectorAll("td"));
    if (!cells.length) continue;

    const name = get(cells, idx.name);
    if (!name) continue;

    const home = get(cells, idx.home);
    const work = get(cells, idx.work);
    const mobile = get(cells, idx.mobile);
    const email = get(cells, idx.email);

    lines.push(
      [name, home, work, mobile, email]
        .filter((x) => x && x.length > 0)
        .join(" "),
    );
  }

  return lines;
}

//
// ---------- SECURITY ----------------------------------------------------------
//

function extractSecurityInfo(unitDoc: Document): string | null {
  const secureBuilding = getValueFromLabel(
    unitDoc,
    /^Secure Building Entry\?/i,
  );
  const securitySystem = getValueFromLabel(
    unitDoc,
    /^Security System Present\?/i,
  );
  const securityInstr = getHtmlFromLabel(unitDoc, /^Security Instr/i);

  if (!secureBuilding && !securitySystem && !securityInstr) return null;

  const parts: string[] = [];
  if (secureBuilding) parts.push(`Secure Building entry? ${secureBuilding}`);
  if (securitySystem) parts.push(`Security System: ${securitySystem}`);
  if (securityInstr) parts.push(`Instructions: ${securityInstr}`);

  return parts.join(" | ");
}

//
// ---------- KEYS --------------------------------------------------------------
//

function extractKeyInfo(unitDoc: Document): string | null {
  const keyNumber = getValueFromLabel(unitDoc, /^Key Number/i);
  const lockBoxNum = getValueFromLabel(unitDoc, /^Lock Box Num/i);
  const lockBoxCode = getValueFromLabel(unitDoc, /^Lock Box Code/i);
  const lockBoxLocation = getValueFromLabel(unitDoc, /^Lock Box Location/i);

  if (!keyNumber && !lockBoxNum && !lockBoxCode && !lockBoxLocation) {
    return null;
  }

  const parts = [
    keyNumber ? `Key Number: ${keyNumber}` : "",
    lockBoxLocation ? `Lockbox Location: ${lockBoxLocation}` : "",
    lockBoxNum ? `Lockbox Number: ${lockBoxNum}` : "",
    lockBoxCode ? `Lockbox Code: ${lockBoxCode}` : "",
  ].filter(Boolean);

  return parts.join(" ");
}

//
// ---------- GENERAL PROPERTY INFO --------------------------------------------
//

function extractGeneralPropertyInfo(unitDoc: Document): string[] {
  const lines: string[] = [];

  const waterShutoff = getValueFromLabel(unitDoc, /^Water Cut-Off Location/i);
  const breaker = getValueFromLabel(unitDoc, /^Breaker Box Location/i);
  const waterHeaterType = getValueFromLabel(unitDoc, /^Water Heater Type/i);
  const waterHeaterLocation = getValueFromLabel(
    unitDoc,
    /^Water Heater LOCATION ONLY/i,
  );
  const heatType = getValueFromLabel(unitDoc, /^Heat Type/i);
  const yearBuilt = getValueFromLabel(unitDoc, /^Year Property Built/i);
  const sqFtAbove = getValueFromLabel(unitDoc, /^Sq Ft Above/i);
  const sqFtBelow = getValueFromLabel(unitDoc, /^Sq Ft Below/i);
  const beds = getValueFromLabel(unitDoc, /^Num Bedrooms/i);
  const baths = getValueFromLabel(unitDoc, /^Num Bathrooms/i);
  const flooring = getHtmlFromLabel(unitDoc, /^Flooring$/i);
  const appliances = getHtmlFromLabel(unitDoc, /^Appliances$/i);
  const coDetector = getValueFromLabel(
    unitDoc,
    /^Carbon Monoxide Detector Required/i,
  );
  const smokeDetLoc = getValueFromLabel(unitDoc, /^Smoke Detector Location/i);
  const filters = getHtmlFromLabel(
    unitDoc,
    /^Air Filter -Sizes and Locations/i,
  );
  const drivingDirections = getHtmlFromLabel(unitDoc, /^Driving Directions/i);

  if (waterShutoff || breaker) {
    lines.push(
      `Water Shut-off: ${waterShutoff || "N/A"} Breaker Box: ${
        breaker || "N/A"
      }`,
    );
  }

  if (waterHeaterType || waterHeaterLocation || heatType) {
    lines.push(
      `Water Heater Type/Location: ${waterHeaterType || "N/A"} / ${
        waterHeaterLocation || "N/A"
      } Heat Type: ${heatType || "N/A"}`,
    );
  }

  if (yearBuilt || sqFtAbove || beds || baths) {
    const size =
      sqFtAbove || sqFtBelow
        ? `${sqFtAbove || "0"}${sqFtBelow ? `+${sqFtBelow}` : ""}`
        : "N/A";

    lines.push(
      `Year Property Built: ${yearBuilt || "N/A"} Property Size: ${size} Bedrooms: ${
        beds || "N/A"
      } Bathrooms: ${baths || "N/A"}`,
    );
  }

  if (flooring) lines.push(`Flooring: ${flooring}`);
  if (appliances) lines.push(`Appliances: ${appliances}`);

  if (coDetector || smokeDetLoc) {
    lines.push(
      `CO Detector: ${coDetector || "N/A"} Smoke detectors: ${
        smokeDetLoc || "N/A"
      }`,
    );
  }

  if (filters) lines.push(`Air Filters: ${filters}`);
  if (drivingDirections) lines.push(`Driving Directions: ${drivingDirections}`);

  return lines;
}
