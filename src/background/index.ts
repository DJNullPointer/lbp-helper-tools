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

  // OPEN_ATTACHMENT_URLS -------------------------------------------------------
  if (message.type === "OPEN_ATTACHMENT_URLS") {
    const urls = message.urls as string[];
    if (!urls || urls.length === 0) {
      sendResponse({ success: false, error: "No attachment URLs provided" });
      return false;
    }

    handleDownloads(urls)
      .then(() => sendResponse({ success: true }))
      .catch((error: Error) =>
        sendResponse({ success: false, error: error.message }),
      );
    return true; // async
  }

  // RESOLVE_ISSUE_ID_FROM_UNIT_SUMMARY (for new-meld) -------------------------
  if (message.type === "RESOLVE_ISSUE_ID_FROM_UNIT_SUMMARY") {
    (async () => {
      try {
        const issueId = await resolveIssueIdFromUnitSummary(
          message.unitSummaryUrl as string,
        );
        if (!issueId) {
          sendResponse({
            success: false,
            error: "No Propertyware Issue ID found on unit summary page.",
          });
          return;
        }
        sendResponse({ success: true, issueId });
      } catch (err: any) {
        console.error("RESOLVE_ISSUE_ID_FROM_UNIT_SUMMARY error", err);
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
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

  // PW SUMMARY BUILDER ---------------------------------------------------------
  if (message.type === "FETCH_PROPERTYWARE_SUMMARY") {
    (async () => {
      try {
        const summary = await fetchPropertywareSummary(
          message.issueId as string,
        );
        sendResponse({ success: true, summary });
      } catch (err: any) {
        console.error("FETCH_PROPERTYWARE_SUMMARY error", err);
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
// -------------------- MELD → ISSUE ID (new-meld support) ---------------------
//

async function resolveIssueIdFromUnitSummary(
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

    // 3. Ask the content script in THAT tab to find the meld summary URL
    // Retry with exponential backoff until content script responds or timeout
    let result: {
      success?: boolean;
      meldUrl?: string;
      error?: string;
    } | null = null;
    
    const maxAttempts = 10;
    const maxWaitTime = 5000; // 5 seconds total
    const startTime = Date.now();
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        result = (await chrome.tabs.sendMessage(tabId, {
          type: "SCRAPE_MELD_ISSUE_ID",
        })) as {
          success?: boolean;
          meldUrl?: string;
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

    if (!result || !result.success || !result.meldUrl) {
      console.warn(
        "SCRAPE_MELD_ISSUE_ID failed or returned no meldUrl",
        result,
      );
      return null;
    }

    // 4. Open another background tab to the meld URL and extract Issue ID from live DOM
    const issueId = await extractIssueIdFromMeldTab(result.meldUrl);
    return issueId || null;
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

// Open meld page in background tab and extract Issue ID from live DOM (handles SPA)
async function extractIssueIdFromMeldTab(
  meldUrl: string,
): Promise<string | null> {
  // 1. Open a background tab with the meld URL
  const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
    chrome.tabs.create({ url: meldUrl, active: false }, (t) => {
      if (chrome.runtime.lastError || !t || t.id === undefined) {
        reject(
          new Error(
            chrome.runtime.lastError?.message ||
              "Failed to create tab for meld page",
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

    // 3. Ask the content script in THAT tab to extract the Issue ID
    // Retry with exponential backoff until content script responds or timeout
    let result: {
      success?: boolean;
      issueId?: string;
      error?: string;
    } | null = null;
    
    const maxAttempts = 10;
    const maxWaitTime = 8000; // 8 seconds total (SPA might take longer)
    const startTime = Date.now();
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        result = (await chrome.tabs.sendMessage(tabId, {
          type: "EXTRACT_ISSUE_ID_FROM_MELD",
        })) as {
          success?: boolean;
          issueId?: string;
          error?: string;
        };
        if (result && result.success && result.issueId) {
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

    if (!result || !result.success || !result.issueId) {
      console.warn("Failed to extract Issue ID from meld tab", result);
      return null;
    }

    return result.issueId;
  } finally {
    // 4. Clean up the background tab
    chrome.tabs.remove(tabId);
  }
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

  console.log(`[Propertyware] Fetching ${url} with cache buster: ${cacheBuster}`);

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

// Track last search to prevent rapid duplicate searches
let lastSearch: { issueId: string; timestamp: number } | null = null;

async function fetchPropertywareSummary(issueId: string): Promise<string> {
  const currentTimestamp = Date.now();
  console.log(`[Propertyware] Fetching fresh data for Issue ID: ${issueId} (timestamp: ${currentTimestamp})`);
  
  // If this is the same Issue ID as last search and it was very recent, add a small delay
  // to ensure Propertyware processes it as a new search
  if (lastSearch && lastSearch.issueId === issueId && currentTimestamp - lastSearch.timestamp < 1000) {
    const delay = 500;
    console.log(`[Propertyware] Same Issue ID searched recently, adding ${delay}ms delay to ensure fresh search`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  
  lastSearch = { issueId, timestamp: currentTimestamp };
  
  // 1) Search for the work order by Issue ID
  console.log(`[Propertyware] Step 1: Searching for work order with Issue ID "${issueId}"...`);
  const searchHtml = await postPwSearch(issueId);
  const workOrderUrl = extractWorkOrderUrlFromSearch(searchHtml, issueId);
  if (!workOrderUrl) {
    throw new Error(`Could not find work order for Issue ID ${issueId}`);
  }
  console.log(`[Propertyware] Found work order URL: ${workOrderUrl}`);

  // 2) Fetch work order detail page
  console.log(`[Propertyware] Step 2: Fetching work order page (fresh, no cache)...`);
  const woHtml = await fetchPwHtml(workOrderUrl);

  // 2.5) Verify the work order page contains the Issue ID
  if (!woHtml.includes(issueId)) {
    throw new Error(
      `Work order page does not contain Issue ID ${issueId}. This suggests we got the wrong work order.`,
    );
  }
  console.log(`[Propertyware] Verified work order page contains Issue ID ${issueId}`);

  // 3) From work order, get the unit detail URL
  const unitUrl = extractUnitDetailUrlFromWorkOrder(woHtml);
  if (!unitUrl) {
    throw new Error("Could not find unit detail link on work order page.");
  }
  console.log(`[Propertyware] Found unit detail URL: ${unitUrl}`);

  // 4) Fetch unit detail page
  console.log(`[Propertyware] Step 3: Fetching unit detail page (fresh, no cache)...`);
  const unitHtml = await fetchPwHtml(unitUrl);

  // 5) Build the final text summary from both pages
  console.log(`[Propertyware] Step 4: Building summary from fresh data...`);
  return buildSummaryFromPwPages(unitHtml, woHtml);
}

async function postPwSearch(issueId: string): Promise<string> {
  // Add unique request ID to URL to ensure fresh search
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  const url = `https://app.propertyware.com/pw/search/search.do?_req=${uniqueId}`;

  // Add aggressive cache-busting: timestamp + random number
  const cacheBuster = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const body = new URLSearchParams({
    action: "Search",
    searchText: issueId,
    includeInactives: "true",
    _nocache: cacheBuster, // Cache buster
    _timestamp: Date.now().toString(), // Additional timestamp
  });

  console.log(`[Propertyware] POST search for Issue ID "${issueId}" with cache buster: ${cacheBuster}`);
  console.log(`[Propertyware] Search URL: ${url}`);
  console.log(`[Propertyware] Search body params: searchText=${issueId}, includeInactives=true`);

  const resp = await fetch(url, {
    method: "POST",
    credentials: "include",
    cache: "reload", // More aggressive than no-store
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
      "X-Requested-With": "XMLHttpRequest", // Some servers check this
    },
    body,
  });

  if (!resp.ok) {
    throw new Error(`Search request failed: ${resp.status}`);
  }

  const html = await resp.text();
  console.log(`[Propertyware] Search returned ${html.length} bytes`);
  
  // Verify the search results contain the Issue ID we searched for
  if (!html.includes(issueId)) {
    console.warn(`[Propertyware] WARNING: Search results do not contain Issue ID ${issueId}!`);
    console.warn(`[Propertyware] This might indicate cached or incorrect search results.`);
  } else {
    console.log(`[Propertyware] Verified: Search results contain Issue ID ${issueId}`);
  }
  
  return html;
}

function extractWorkOrderUrlFromSearch(
  html: string,
  issueId: string,
): string | null {
  const { document: doc } = parseHTML(html);

  // Find ALL work order links in the search results
  const allWorkOrderLinks = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>(
      "a[href*='maintenance/work_order_detail.do']",
    ),
  );

  console.log(
    `[Propertyware] Found ${allWorkOrderLinks.length} work order link(s) in search results`,
  );

  if (allWorkOrderLinks.length === 0) return null;

  // Try to find the work order link that's in the same row/context as the Issue ID
  for (const a of allWorkOrderLinks) {
    // Get the table row containing this link
    const row = a.closest("tr");
    if (!row) continue;

    // Check if this row contains the Issue ID
    const rowText = row.textContent || "";
    if (rowText.includes(issueId)) {
      const href = a.getAttribute("href");
      if (href) {
        const fullUrl = new URL(
          href,
          "https://app.propertyware.com/pw/search/search.do",
        ).toString();
        console.log(
          `[Propertyware] Found matching work order URL (Issue ID ${issueId} in same row): ${fullUrl}`,
        );
        return fullUrl;
      }
    }
  }

  // If no exact match found, log a warning and use the first one
  console.warn(
    `[Propertyware] WARNING: Could not find work order with Issue ID ${issueId} in search results. Using first work order link.`,
  );
  const firstLink = allWorkOrderLinks[0];
  const href = firstLink.getAttribute("href");
  if (!href) return null;

  const fullUrl = new URL(
    href,
    "https://app.propertyware.com/pw/search/search.do",
  ).toString();
  console.warn(`[Propertyware] Using first work order URL: ${fullUrl}`);
  return fullUrl;
}

function extractUnitDetailUrlFromWorkOrder(html: string): string | null {
  const { document: doc } = parseHTML(html);

  // Find the Location section in the first table row
  // Look for the <th> that contains "Location"
  const locationHeader = Array.from(
    doc.querySelectorAll<HTMLTableCellElement>("th"),
  ).find((th) => /Location/i.test(th.textContent || ""));

  if (!locationHeader) {
    console.warn(
      `[Propertyware] Could not find Location header in work order page`,
    );
    // Fallback to finding any unit detail link
    const fallbackLink = doc.querySelector<HTMLAnchorElement>(
      "a[href*='properties/unit_detail.do']",
    );
    if (fallbackLink) {
      const href = fallbackLink.getAttribute("href");
      if (href) {
        return new URL(
          href,
          "https://app.propertyware.com/pw/maintenance/work_order_detail.do",
        ).toString();
      }
    }
    return null;
  }

  // Get the parent <tr> of the Location header
  const locationRow = locationHeader.closest("tr");
  if (!locationRow) {
    console.warn(`[Propertyware] Could not find Location row`);
    return null;
  }

  // Find the <td> in the same row (the cell next to the Location header)
  const locationCell = locationRow.querySelector<HTMLTableCellElement>("td");
  if (!locationCell) {
    console.warn(`[Propertyware] Could not find Location cell`);
    return null;
  }

  // Find ALL links in the Location cell
  const locationLinks = Array.from(
    locationCell.querySelectorAll<HTMLAnchorElement>("a[href]"),
  );

  console.log(
    `[Propertyware] Found ${locationLinks.length} link(s) in Location section`,
  );

  if (locationLinks.length === 0) {
    console.warn(`[Propertyware] No links found in Location section`);
    return null;
  }

  // Get the LAST link in the Location section (this is always the unit detail link)
  const lastLink = locationLinks[locationLinks.length - 1];
  const href = lastLink.getAttribute("href");
  if (!href) {
    console.warn(`[Propertyware] Last link in Location section has no href`);
    return null;
  }

  // Build the full URL
  const fullUrl = new URL(
    href,
    "https://app.propertyware.com/pw/maintenance/work_order_detail.do",
  ).toString();
  
  console.log(
    `[Propertyware] Found unit detail URL (last link in Location section): ${fullUrl}`,
  );
  console.log(
    `[Propertyware] Link text: "${lastLink.textContent?.trim()}"`,
  );
  
  return fullUrl;
}

function buildSummaryFromPwPages(
  unitHtml: string,
  workOrderHtml: string,
): string {
  const { document: unitDoc } = parseHTML(unitHtml);
  const { document: woDoc } = parseHTML(workOrderHtml);

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

  // REQUESTED BY / SECURITY / KEYS ----------------------------------------------
  const requestedBy = extractRequestedBy(woDoc);
  if (requestedBy) {
    lines.push(`Requested By: ${requestedBy}`);
  }

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

  // VENDOR DESCRIPTION / PROBLEM DESCRIPTION -------------------------------------
  const vendorDescription = extractVendorDescription(woDoc);
  if (vendorDescription) {
    lines.push(
      "---------------------------------------------------------------------------------------------------",
    );
    lines.push("Vendor Description:");
    lines.push(vendorDescription);
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
// ---------- REQUESTED BY (Work Order) ----------------------------------------
//

function extractRequestedBy(woDoc: Document): string | null {
  return (
    getValueFromLabel(woDoc, /^Requested By/i) ||
    getValueFromLabel(woDoc, /Requested By:/i)
  );
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
// ---------- VENDOR DESCRIPTION (Work Order) ----------------------------------
//

function extractVendorDescription(woDoc: Document): string | null {
  const mainDesc =
    getHtmlFromLabel(woDoc, /^Description$/i) ||
    getHtmlFromLabel(woDoc, /^Work Order Description/i) ||
    getHtmlFromLabel(woDoc, /^Vendor Description/i);

  const residentNotes =
    getHtmlFromLabel(woDoc, /Resident said/i) ||
    getHtmlFromLabel(woDoc, /Additional Details/i);

  const parts: string[] = [];
  if (mainDesc) parts.push(mainDesc);
  if (residentNotes) parts.push(residentNotes);

  if (!parts.length) return null;

  return parts.join("\n");
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
