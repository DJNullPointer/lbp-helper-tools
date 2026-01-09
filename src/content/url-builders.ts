// URL building utilities for content script

export function buildUnitSummaryUrlFromNewMeld(url: URL): string {
  const unitId = url.searchParams.get("for_unit");
  if (!unitId) {
    throw new Error("No for_unit param found in Meld creation URL.");
  }

  // Preserve the org prefix, e.g. "2611/m/2611"
  const match = url.pathname.match(/^\/([^/]+\/m\/[^/]+)\//);
  if (!match) {
    throw new Error("Could not determine organization prefix from URL.");
  }
  const prefix = match[1]; // "2611/m/2611"

  return `https://app.propertymeld.com/${prefix}/properties/${unitId}/summary/`;
}

export function buildMeldSummaryUrlFromEditMeld(url: URL): string {
  // Extract meld ID from URL path like /2611/m/2611/meld/11765595/edit/
  const match = url.pathname.match(/^\/([^/]+\/m\/[^/]+)\/meld\/(\d+)\/edit\/?$/);
  if (!match) {
    throw new Error("Could not extract meld ID from edit meld URL.");
  }
  const prefix = match[1];
  const meldId = match[2];
  return `https://app.propertymeld.com/${prefix}/meld/${meldId}/summary/`;
}
