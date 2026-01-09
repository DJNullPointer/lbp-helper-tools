// Propertyware summary building functions

import { parseHTML } from "linkedom";
import { getBuildingIdFromAddress, getUnitIdFromAddress } from "./api";
import { fetchPwHtml } from "./fetch";
import {
  extractAddress,
  extractTenantLines,
  extractSecurityInfo,
  extractKeyInfo,
  extractGeneralPropertyInfo,
} from "./extractors";

export async function fetchPropertywareSummaryFromAddress(
  unitAddress: string,
  buildingAddress?: string,
): Promise<string> {
  console.log(
    `[Propertyware] Fetching unit detail from unit address: "${unitAddress}"${buildingAddress ? ` (with building address: "${buildingAddress}")` : ""}`,
  );

  // 1) Try to get unit ID directly (with fallback to building address if needed)
  console.log(
    `[Propertyware] Step 1: Calling API to find unit by address...`,
  );
  let entityId: number | null = null;

  // First try with unit address only
  entityId = await getUnitIdFromAddress(unitAddress, buildingAddress);

  if (!entityId) {
    // Fallback: try with building ID (for non-unit properties)
    console.log(
      `[Propertyware] No unit found, trying building ID as fallback...`,
    );
    const buildingId = await getBuildingIdFromAddress(
      buildingAddress || unitAddress,
    );
    if (buildingId) {
      entityId = buildingId;
      console.log(`[Propertyware] Using building ID as fallback: ${entityId}`);
    }
  }

  if (!entityId) {
    throw new Error(
      `Could not find unit or building for address: ${unitAddress}${buildingAddress ? ` or ${buildingAddress}` : ""}`,
    );
  }

  console.log(`[Propertyware] Found entity ID: ${entityId}`);

  // 2) Build unit detail URL using entity ID
  const unitUrl = `https://app.propertyware.com/pw/properties/unit_detail.do?entityID=${entityId}`;
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

export function buildSummaryFromPwPages(unitHtml: string): string {
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
