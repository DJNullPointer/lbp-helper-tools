// Propertyware API calls

export async function getBuildingIdFromAddress(
  address: string,
): Promise<number | null> {
  // Call Propertyware REST API
  const apiUrl = new URL(
    "https://api.propertyware.com/pw/api/rest/v1/buildings",
  );
  apiUrl.searchParams.set("address", address);

  console.log(`[Propertyware] API URL: ${apiUrl.toString()}`);

  const resp = await fetch(apiUrl.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "x-propertyware-client-id": "fabd8c1d-469c-457f-9c6c-4e953ba5ae3a",
      "x-propertyware-client-secret": "4b17a00f-b509-4545-bb47-58495424ed94",
      "x-propertyware-system-id": "251330565",
    },
  });

  // if the response is empty, assume that the correct item is actually a unit -- not a building
  // if so, the extracted address is incorrect and must be re-extracted in a different location
  if (resp == null) {
  }

  if (!resp.ok) {
    throw new Error(
      `Propertyware API request failed: ${resp.status} ${resp.statusText}`,
    );
  }

  const data = (await resp.json()) as Array<{ id: number }>;
  console.log(`[Propertyware] API returned ${data.length} building(s)`);

  if (data.length === 0) {
    console.warn(`[Propertyware] No buildings found for address: ${address}`);
    return null;
  }

  // Return the first building's ID
  const buildingId = data[0].id;
  console.log(`[Propertyware] Using building ID: ${buildingId}`);
  return buildingId;
}

export async function getPropertyWareWorkOrderUrl(
  address: string,
  issueId: string,
): Promise<string | null> {
  console.log(
    `[Propertyware] Finding work order for address: "${address}", Issue ID: "${issueId}"`,
  );

  // 1) Get building ID from address
  const buildingId = await getBuildingIdFromAddress(address);
  if (!buildingId) {
    throw new Error(`Could not find building for address: ${address}`);
  }
  console.log(`[Propertyware] Found building ID: ${buildingId}`);

  // 2) Call PropertyWare API to get work orders for this building
  const apiUrl = new URL(
    "https://api.propertyware.com/pw/api/rest/v1/workorders",
  );
  apiUrl.searchParams.set("buildingID", buildingId.toString());
  apiUrl.searchParams.set("orderby", "createddate desc");
  apiUrl.searchParams.set("limit", "200");

  console.log(`[Propertyware] API URL: ${apiUrl.toString()}`);

  const resp = await fetch(apiUrl.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "x-propertyware-client-id": "fabd8c1d-469c-457f-9c6c-4e953ba5ae3a",
      "x-propertyware-client-secret": "4b17a00f-b509-4545-bb47-58495424ed94",
      "x-propertyware-system-id": "251330565",
    },
  });

  if (!resp.ok) {
    throw new Error(
      `Propertyware API request failed: ${resp.status} ${resp.statusText}`,
    );
  }

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
