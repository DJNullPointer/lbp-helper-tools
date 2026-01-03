export {};

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    if (message.type === "DOWNLOAD_FILES") {
      handleDownloads(message.urls, message.filenames)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message.type === "OPEN_ATTACHMENT_URLS") {
      const urls = message.urls as string[];
      if (urls.length === 0) {
        sendResponse({ success: false, error: "No attachment URLs provided" });
        return false;
      }
      // Use chrome.downloads API to download files directly
      handleDownloads(urls)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;
    }

    if (message.type === "COPY_TO_CLIPBOARD") {
      sendResponse({ success: true, message: "Clipboard operation should be in content script" });
      return false;
    }

    return false;
  },
);

async function handleDownloads(
  urls: string[],
  filenames?: string[],
): Promise<void> {
  console.log(`[Background] Starting download of ${urls.length} files`);
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const filename = filenames?.[i];

    console.log(`[Background] Downloading file ${i + 1}/${urls.length}: ${url}`);
    try {
      const downloadId = await chrome.downloads.download({
        url,
        filename,
        saveAs: false,
      });
      console.log(`[Background] Download started with ID: ${downloadId}`);
      // Small delay between downloads to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`[Background] Failed to download ${url}:`, error);
      // Continue with next download even if one fails
    }
  }
  console.log(`[Background] Finished processing ${urls.length} downloads`);
}


