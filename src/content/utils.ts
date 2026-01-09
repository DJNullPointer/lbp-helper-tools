// General utility functions for content script

// Utility: Wait for SPA to render by checking for specific elements
export async function waitForSPAReady(
  selectors: string[],
  timeout: number = 5000,
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    // Check if any of the expected selectors exist
    const found = selectors.some((selector) =>
      document.querySelector(selector),
    );
    
    if (found) {
      // Give it a tiny moment for content to settle
      await new Promise((resolve) => setTimeout(resolve, 100));
      return;
    }
    
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  
  // Timeout reached, but continue anyway
  console.warn("SPA ready check timed out, continuing anyway");
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  // Use execCommand with textarea (clipboard API doesn't work in content scripts)
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-999999px";
  textarea.style.top = "-999999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  
  const successful = document.execCommand("copy");
  document.body.removeChild(textarea);
  
  return successful;
}
