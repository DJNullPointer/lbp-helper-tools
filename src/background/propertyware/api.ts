// Propertyware API calls via Netlify proxy

import { PROXY_BASE_URL } from "../../utils/proxy-config";

/**
 * Make a proxied API request to Propertyware
 */
async function proxyApiRequest(
  endpoint: string,
  params?: Record<string, string>,
): Promise<Response> {
  const proxyUrl = PROXY_BASE_URL;

  console.log(`[Propertyware] Proxying request to: ${endpoint}`, params);

  const resp = await fetch(proxyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      endpoint,
      method: "GET",
      params,
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(
      `Propertyware API proxy request failed: ${resp.status} ${resp.statusText} - ${errorText}`,
    );
  }

  return resp;
}

async function searchBuildingsByAddress(
  address: string,
): Promise<Array<{ id: number }>> {
  console.log(`[Propertyware] Searching buildings API for address: "${address}"`);

  const resp = await proxyApiRequest("/buildings", { address });

  const data = (await resp.json()) as Array<{ id: number }>;
  console.log(`[Propertyware] Buildings API returned ${data.length} result(s) for address: "${address}"`);
  return data;
}

async function searchUnitsByBuildingId(
  buildingId: number,
): Promise<Array<{ id: number; address: { address: string } }>> {
  console.log(`[Propertyware] Searching units API for building ID: ${buildingId}`);

  const resp = await proxyApiRequest("/units", {
    buildingID: buildingId.toString(),
  });

  const data = (await resp.json()) as Array<{
    id: number;
    address: { address: string };
  }>;
  console.log(`[Propertyware] Units API returned ${data.length} unit(s) for building ID: ${buildingId}`);
  return data;
}

export async function getBuildingIdFromAddress(
  address: string,
): Promise<number | null> {
  const data = await searchBuildingsByAddress(address);

  if (data.length === 0) {
    console.warn(`[Propertyware] No buildings found for address: ${address}`);
    return null;
  }

  // Return the first building's ID
  const buildingId = data[0].id;
  console.log(`[Propertyware] Using building ID: ${buildingId}`);
  return buildingId;
}

/**
 * Get unit ID from address, with fallback to building address if unit address doesn't match
 * @param unitAddress - The unit address to search for
 * @param buildingAddress - Optional building address to use as fallback
 * @returns The unit ID, or null if not found
 */
export async function getUnitIdFromAddress(
  unitAddress: string,
  buildingAddress?: string,
): Promise<number | null> {
  console.log(
    `[Propertyware] Searching for unit with address: "${unitAddress}"${buildingAddress ? ` (fallback building address: "${buildingAddress}")` : ""}`,
  );

  // Step 1: Try searching for building with unit address
  let buildings = await searchBuildingsByAddress(unitAddress);

  if (buildings.length === 1) {
    // If we get exactly 1 result for a unit address, it's likely the unit itself
    // Use that ID directly without querying units API
    const unitId = buildings[0].id;
    console.log(
      `[Propertyware] Unit address returned 1 result - using ID directly: ${unitId}`,
    );
    return unitId;
  } else if (buildings.length > 1) {
    // Multiple results - this shouldn't happen often, but we'll need to query units API
    console.log(
      `[Propertyware] Unit address returned ${buildings.length} results, querying units API to find match`,
    );
    const buildingId = buildings[0].id;
    const units = await searchUnitsByBuildingId(buildingId);
    
    if (units.length === 0) {
      // Building has no units - fall back to building address
      if (buildingAddress) {
        console.log(
          `[Propertyware] Building ${buildingId} has no units, falling back to building address: "${buildingAddress}"`,
        );
        buildings = await searchBuildingsByAddress(buildingAddress);
        if (buildings.length > 0) {
          return await findMatchingUnitInBuilding(
            buildings[0].id,
            unitAddress,
          );
        }
      }
      return null;
    }
    
    return await findMatchingUnitInBuilding(buildingId, unitAddress, units);
  } else if (buildingAddress) {
    // Step 2: No building found for unit address, try building address
    console.log(
      `[Propertyware] No building found for unit address "${unitAddress}", trying building address "${buildingAddress}"`,
    );
    buildings = await searchBuildingsByAddress(buildingAddress);

    if (buildings.length === 0) {
      console.warn(
        `[Propertyware] No building found for either unit address "${unitAddress}" or building address "${buildingAddress}"`,
      );
      return null;
    }

    const buildingId = buildings[0].id;
    console.log(`[Propertyware] Found building ID: ${buildingId} for building address`);
    return await findMatchingUnitInBuilding(buildingId, unitAddress);
  } else {
    console.warn(`[Propertyware] No building found for unit address: ${unitAddress}`);
    return null;
  }
}

async function findMatchingUnitInBuilding(
  buildingId: number,
  unitAddress: string,
  units?: Array<{ id: number; address: { address: string } }>,
): Promise<number | null> {
  // Query units API if not provided
  if (!units) {
    units = await searchUnitsByBuildingId(buildingId);
  }

  if (units.length === 0) {
    console.warn(
      `[Propertyware] No units found for building ID: ${buildingId}`,
    );
    return null;
  }

  // Find the unit that matches the unit address
  // Normalize addresses for comparison (case-insensitive, trim whitespace)
  const normalizedUnitAddress = unitAddress.toLowerCase().trim();

  const matchingUnit = units.find((unit) => {
    const unitAddr = unit.address.address.toLowerCase().trim();
    // Check if the unit address contains the search address or vice versa
    return (
      unitAddr === normalizedUnitAddress ||
      unitAddr.includes(normalizedUnitAddress) ||
      normalizedUnitAddress.includes(unitAddr)
    );
  });

  if (!matchingUnit) {
    console.warn(
      `[Propertyware] No unit found matching address "${unitAddress}" in building ${buildingId}`,
    );
    console.log(
      `[Propertyware] Available unit addresses: ${units.map((u) => u.address.address).join(", ")}`,
    );
    return null;
  }

  console.log(
    `[Propertyware] Found matching unit ID: ${matchingUnit.id} for address: "${unitAddress}"`,
  );
  return matchingUnit.id;
}

export async function getPropertyWareWorkOrderUrl(
  address: string,
  issueId: string,
  buildingAddress?: string,
): Promise<string | null> {
  console.log(
    `[Propertyware] Finding work order for address: "${address}", Issue ID: "${issueId}"${buildingAddress ? ` (building address: "${buildingAddress}")` : ""}`,
  );

  // 1) Get building ID from address (try unit address first, then building address)
  let buildingId = await getBuildingIdFromAddress(address);
  if (!buildingId && buildingAddress) {
    console.log(
      `[Propertyware] No building found for unit address, trying building address...`,
    );
    buildingId = await getBuildingIdFromAddress(buildingAddress);
  }
  if (!buildingId) {
    throw new Error(
      `Could not find building for address: ${address}${buildingAddress ? ` or ${buildingAddress}` : ""}`,
    );
  }
  console.log(`[Propertyware] Found building ID: ${buildingId}`);

  // 2) Call PropertyWare API to get work orders for this building
  console.log(`[Propertyware] Fetching work orders for building ID: ${buildingId}`);

  const resp = await proxyApiRequest("/workorders", {
    buildingID: buildingId.toString(),
    orderby: "createddate desc",
    limit: "200",
  });

  const workOrders = (await resp.json()) as Array<{
    id: number;
    number: number;
  }>;
  console.log(`[Propertyware] API returned ${workOrders.length} work order(s)`);

  // 3) Find the work order with matching Issue ID (stored in the "number" field)
  const issueIdNum = parseInt(issueId, 10);
  if (isNaN(issueIdNum)) {
    throw new Error(`Invalid Issue ID format: ${issueId}`);
  }

  const matchingWorkOrder = workOrders.find((wo) => wo.number === issueIdNum);

  if (!matchingWorkOrder) {
    console.warn(
      `[Propertyware] No work order found with Issue ID (number) ${issueIdNum}`,
    );
    return null;
  }

  console.log(
    `[Propertyware] Found matching work order: ID ${matchingWorkOrder.id}, Number ${matchingWorkOrder.number}`,
  );

  // 4) Build the work order detail URL
  const workOrderUrl = `https://app.propertyware.com/pw/maintenance/work_order_detail.do?entityID=${matchingWorkOrder.id}`;
  console.log(`[Propertyware] Work order URL: ${workOrderUrl}`);

  return workOrderUrl;
}
