export {};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "COPY_RELEVANT_INFO") {
    handleCopyRelevantInfo()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  return false;
});

async function handleCopyRelevantInfo(): Promise<void> {
  // Check if we're on a property detail page
  const url = window.location.href;
  const propertyDetailPattern = /\/pms\/property\/\d+/;
  
  if (!propertyDetailPattern.test(url)) {
    throw new Error("This tool only works on PropertyWare property detail pages");
  }

  // TODO: Implement actual scraping logic based on PropertyWare's DOM structure
  const propertyData = {
    address: extractText(".property-address") || "N/A",
    propertyId: extractText(".property-id") || "N/A",
    // Add more fields as needed
  };

  // Format data for clipboard
  const clipboardText = formatPropertyData(propertyData);

  // Copy to clipboard (content scripts can do this with user gesture)
  await navigator.clipboard.writeText(clipboardText);
}

function extractText(selector: string): string | null {
  const element = document.querySelector(selector);
  return element?.textContent?.trim() || null;
}

function formatPropertyData(data: Record<string, string>): string {
  // Format the data as needed for clipboard
  return Object.entries(data)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

