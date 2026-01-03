export {};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "DOWNLOAD_MELD_INVOICES") {
    handleDownloadMeldInvoices()
      .then((result) => sendResponse({ success: true, ...result }))
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

