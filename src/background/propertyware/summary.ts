// Propertyware summary building functions

import { parseHTML } from "linkedom";
import { getBuildingIdFromAddress } from "./api";
import { fetchPwHtml } from "./fetch";
import {
  extractAddress,
  extractTenantLines,
  extractSecurityInfo,
  extractKeyInfo,
  extractGeneralPropertyInfo,
} from "./extractors";

export async function fetchPropertywareSummaryFromAddress(
  address: string,
): Promise<string> {
  console.log(`[Propertyware] Fetching unit detail from address: "${address}"`);

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
