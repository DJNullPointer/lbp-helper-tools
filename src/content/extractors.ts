// Data extraction functions for content script

export function extractUnitAddressFromUnitSummaryPage(doc: Document): string | null {
  // Find the dt element containing "Address" text, then find the dd in the same euiFlexGroup
  const allDts = Array.from(doc.querySelectorAll<HTMLElement>("dt"));
  
  for (const dt of allDts) {
    const dtText = dt.textContent?.trim() || "";
    if (/^Address$/i.test(dtText)) {
      // Find the euiFlexGroup parent that contains both dt and dd
      const flexGroup = dt.closest(".euiFlexGroup");
      if (flexGroup) {
        const dd = flexGroup.querySelector<HTMLElement>("dd");
        if (dd) {
          const addressText = dd.textContent?.trim() || "";
          if (addressText) {
            // Extract up to the dash (e.g., "1000 N Salem St - 1000 N Salem" -> "1000 N Salem St")
            const match = addressText.match(/^([^-]+)/);
            if (match) {
              const parsedAddress = match[1].trim();
              console.log(`[ContentScript] Extracted unit address: "${parsedAddress}" from "${addressText}"`);
              return parsedAddress;
            }
            // If no dash, return the whole text
            console.log(`[ContentScript] Extracted unit address (no dash): "${addressText}"`);
            return addressText;
          }
        }
      }
    }
  }
  
  console.warn("Could not find unit address on unit summary page");
  return null;
}

export function findUnitSummaryUrlFromMeldPage(doc: Document, baseUrl: string): string | null {
  // Look for links that match the pattern /properties/\d+/summary/
  const allLinks = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>("a[href]"),
  );

  for (const link of allLinks) {
    const href = link.getAttribute("href");
    if (!href) continue;

    try {
      const fullUrl = new URL(href, baseUrl).toString();
      // Match pattern: /properties/\d+/summary/
      if (/\/properties\/\d+\/summary\/?(?:$|[?#])/i.test(fullUrl)) {
        console.log(`[ContentScript] Found unit summary URL: ${fullUrl}`);
        return fullUrl;
      }
    } catch (e) {
      // Invalid URL, skip
      continue;
    }
  }

  console.warn("Could not find unit summary URL on meld page");
  return null;
}

export function extractUnitAddressFromMeldSummaryPage(doc: Document): string | null {
  // Find the element with data-testid="meld-details-unit-or-property-address"
  const addressContainer = doc.querySelector<HTMLElement>(
    '[data-testid="meld-details-unit-or-property-address"]',
  );

  if (addressContainer) {
    // Find all divs with class euiText eui-10x3kab-euiText-m
    const addressDivs = addressContainer.querySelectorAll<HTMLElement>(
      '.euiText.eui-10x3kab-euiText-m',
    );

    // Get the second div (index 1) - the one with the full address
    if (addressDivs.length >= 2) {
      const secondDiv = addressDivs[1];
      const fullAddress = secondDiv.textContent?.trim() || "";
      
      if (fullAddress) {
        // Extract the first half (before the comma)
        const parts = fullAddress.split(',');
        const address = parts[0]?.trim() || "";
        
        if (address) {
          console.log(`[ContentScript] Extracted address from meld summary: "${address}" (from "${fullAddress}")`);
          return address;
        }
      }
    }
  }

  console.warn("Could not find address on meld summary page");
  return null;
}

export function extractIssueIdFromMeldSummaryPage(doc: Document): string | null {
  // Look for "Issue ID" text, then find the associated value
  // The structure should have "Issue ID" as a label and the ID as a value nearby
  
  // Strategy: Find all text nodes or elements containing "Issue ID"
  const allElements = Array.from(doc.querySelectorAll<HTMLElement>("*"));
  
  for (const el of allElements) {
    const text = el.textContent?.trim() || "";
    // Look for "Issue ID" label (might be in a dt, div, or span)
    if (/^Issue ID$/i.test(text)) {
      // Find the associated value - could be in a sibling dd, or in the same container
      const flexGroup = el.closest(".euiFlexGroup");
      if (flexGroup) {
        const dd = flexGroup.querySelector<HTMLElement>("dd");
        if (dd) {
          const issueId = dd.textContent?.trim() || "";
          if (issueId) {
            console.log(`[ContentScript] Extracted Issue ID: "${issueId}"`);
            return issueId;
          }
        }
      }
      
      // Also check parent containers
      let current: HTMLElement | null = el.parentElement;
      while (current) {
        const dd = current.querySelector<HTMLElement>("dd");
        if (dd) {
          const issueId = dd.textContent?.trim() || "";
          if (issueId) {
            console.log(`[ContentScript] Extracted Issue ID from parent: "${issueId}"`);
            return issueId;
          }
        }
        current = current.parentElement;
      }
    }
  }

  console.warn("Could not find Issue ID on meld summary page");
  return null;
}

export function extractBuildingAddressFromMeldSummaryPage(doc: Document): string | null {
  // Find the element with data-testid="meld-details-unit-or-property-address"
  const addressContainer = doc.querySelector<HTMLElement>(
    '[data-testid="meld-details-unit-or-property-address"]',
  );

  if (addressContainer) {
    // Find the first div with class euiText eui-10x3kab-euiText-m (the building address)
    const addressDivs = addressContainer.querySelectorAll<HTMLElement>(
      '.euiText.eui-10x3kab-euiText-m',
    );

    // Get the first div (index 0) - the building address
    if (addressDivs.length >= 1) {
      const firstDiv = addressDivs[0];
      const buildingAddress = firstDiv.textContent?.trim() || "";
      
      if (buildingAddress) {
        console.log(`[ContentScript] Extracted building address from meld summary: "${buildingAddress}"`);
        return buildingAddress;
      }
    }
  }

  console.warn("Could not find building address on meld summary page");
  return null;
}

export function extractBuildingAddressFromUnitSummaryPage(doc: Document): string | null {
  // Find the header subtitle element with the building address
  // Structure: <div class="euiText eui-fvzp9a-euiText-s" data-testid="header-subtitle">
  //   <span>1701 Smith Level</span>
  // </div>
  const headerSubtitle = doc.querySelector<HTMLElement>(
    '[data-testid="header-subtitle"]',
  );

  if (headerSubtitle) {
    const buildingAddress = headerSubtitle.textContent?.trim() || "";
    if (buildingAddress) {
      console.log(`[ContentScript] Extracted building address from unit summary: "${buildingAddress}"`);
      return buildingAddress;
    }
  }

  console.warn("Could not find building address on unit summary page");
  return null;
}
