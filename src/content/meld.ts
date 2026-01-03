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
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  return false;
});

async function handleDownloadMeldInvoices(): Promise<{
  count: number;
  urls: string[];
}> {
  // Check if we're on PropertyMeld
  if (!window.location.hostname.includes("propertymeld.com")) {
    throw new Error("This tool only works on PropertyMeld");
  }

  // TODO: Implement actual scraping logic based on PropertyMeld's invoice page structure
  // This is a placeholder - you'll need to inspect the actual DOM structure
  
  // Example: Find all invoice download links
  const invoiceLinks = document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="invoice"], a[href*="download"], button[data-invoice-id]',
  );

  if (invoiceLinks.length === 0) {
    throw new Error("No invoices found on this page");
  }

  const invoiceUrls: string[] = [];
  const filenames: string[] = [];

  invoiceLinks.forEach((link) => {
    let url = link.href;
    
    // If it's a button, we might need to trigger a click or extract data attribute
    if (link.tagName === "BUTTON") {
      const dataUrl = link.getAttribute("data-url") || link.getAttribute("data-href");
      if (dataUrl) url = dataUrl;
    }

    if (url && !invoiceUrls.includes(url)) {
      invoiceUrls.push(url);
      // Try to extract filename from link text or data attribute
      const filename = link.textContent?.trim() || link.getAttribute("download") || undefined;
      if (filename) filenames.push(filename);
    }
  });

  // Send download request to background worker
  await chrome.runtime.sendMessage({
    type: "DOWNLOAD_FILES",
    urls: invoiceUrls,
    filenames: filenames.length > 0 ? filenames : undefined,
  });

  return {
    count: invoiceUrls.length,
    urls: invoiceUrls,
  };
}

async function handleCopyRelevantInfo(): Promise<void> {
  if (!window.location.hostname.includes("propertymeld.com")) {
    throw new Error("This tool only works on PropertyMeld");
  }

  const propertyIdentifier = extractPropertyIdentifier();
  
  if (!propertyIdentifier) {
    throw new Error("Could not find property identifier on this page. Please ensure you're on a property page.");
  }

  const propertyWareUrl = constructPropertyWareUrl(propertyIdentifier);
  
  const response = await chrome.runtime.sendMessage({
    type: "FETCH_PROPERTYWARE_PAGE",
    url: propertyWareUrl,
  });

  if (!response.success) {
    throw new Error(response.error || "Failed to fetch PropertyWare page");
  }

  const html = response.html;
  const relevantInfo = extractRelevantInfo(html);
  
  await navigator.clipboard.writeText(relevantInfo);
}

function extractPropertyIdentifier(): string | null {
  const url = window.location.href;
  
  const propertyIdMatch = url.match(/property[\/\-_]([^\/\?#]+)/i);
  if (propertyIdMatch) {
    return propertyIdMatch[1];
  }

  const addressElement = document.querySelector('[data-property-address], .property-address, [class*="address"]');
  if (addressElement) {
    const address = addressElement.textContent?.trim();
    if (address) {
      return address;
    }
  }

  const propertyIdElement = document.querySelector('[data-property-id], .property-id, [id*="property"]');
  if (propertyIdElement) {
    const id = propertyIdElement.textContent?.trim() || propertyIdElement.getAttribute('data-property-id');
    if (id) {
      return id;
    }
  }

  return null;
}

function constructPropertyWareUrl(identifier: string): string {
  if (/^\d+$/.test(identifier)) {
    return `https://app.propertyware.com/pms/property/${identifier}`;
  }
  
  const encodedIdentifier = encodeURIComponent(identifier);
  return `https://app.propertyware.com/pms/property/search?q=${encodedIdentifier}`;
}

function extractRelevantInfo(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const info: string[] = [];
  
  const propertyAddress = doc.querySelector('.property-address, [class*="address"], [data-property-address]');
  if (propertyAddress) {
    info.push(`Address: ${propertyAddress.textContent?.trim() || 'N/A'}`);
  }
  
  const propertyId = doc.querySelector('.property-id, [class*="property-id"], [data-property-id]');
  if (propertyId) {
    info.push(`Property ID: ${propertyId.textContent?.trim() || 'N/A'}`);
  }
  
  const tenantInfo = doc.querySelector('.tenant-info, [class*="tenant"]');
  if (tenantInfo) {
    info.push(`Tenant: ${tenantInfo.textContent?.trim() || 'N/A'}`);
  }
  
  const rentAmount = doc.querySelector('.rent-amount, [class*="rent"], [data-rent]');
  if (rentAmount) {
    info.push(`Rent: ${rentAmount.textContent?.trim() || 'N/A'}`);
  }
  
  if (info.length === 0) {
    return "No relevant information found on PropertyWare page.";
  }
  
  return info.join('\n');
}

