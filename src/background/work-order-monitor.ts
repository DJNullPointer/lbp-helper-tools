/**
 * Work Order Monitor
 * 
 * Monitors PropertyWare for new work orders and processes them.
 * Uses Chrome Alarms API for periodic checks and distributed work queue
 * for coordination across multiple extension instances.
 * 
 * Workgroup Model: All extension instances across all users work together
 * to process the queue. Each instance continues processing batches until
 * the queue is empty, with work distributed via atomic claiming.
 */

// Use Netlify-based work queue for multi-user coordination
import {
  claimWorkOrder,
  completeWorkOrder,
  releaseWorkOrder,
  getLastProcessedWorkOrder,
  getPendingWorkOrders,
  setLastProcessedWorkOrder,
} from '../utils/storage/netlify-work-queue';
import { PROXY_BASE_URL } from '../utils/proxy-config';

const ALARM_NAME = 'workOrderCheck';
const CHECK_INTERVAL_MINUTES = 15; // How often to check for new work orders
const BATCH_SIZE = 10; // Process this many work orders at a time (for efficiency, but will continue until queue is empty)
const STARTING_WORK_ORDER_NUMBER = 90500; // Don't process work orders before this number

interface WorkOrder {
  id: number;
  number: number;
  description: string;
  buildingID: number;
  unitID: number;
  unitIDs: number[];
  portfolioID: number;
  [key: string]: any;
}

interface Building {
  id: number;
  portfolioID: number;
  [key: string]: any;
}

interface Portfolio {
  id: number;
  owners: Array<{
    id: number;
    percentageOwnership: number;
    [key: string]: any;
  }>;
  [key: string]: any;
}

interface MeldInfo {
  type: string;
  category: string;
}

// Meld to PropertyWare type mapping
const MELD_TYPE_TO_WARE_TYPE: Record<string, string> = {
  'Turn': 'Turnover',
  'Recurring': 'Recurring',
  'Repair': 'Service Request',
};

// Meld to PropertyWare category mapping
const MELD_CATEGORY_TO_WARE_CATEGORY: Record<string, string> = {
  'Appliances': 'Appliance',
  'Blinds / Window Treatments': 'Windows/Skylight',
  'Carpentry': 'Carpentry',
  'Circuit Breaker': 'Electrical',
  'Cleaning': 'Cleaning',
  'Doors': 'Doors',
  'Driveway': 'Grading/Gravel',
  'Drywall': 'Drywall',
  'Electrical': 'Electrical',
  'Exterior': 'Exterior Maintenance',
  'Fireplace': 'Fireplace/Chimney',
  'Flooring': 'Flooring',
  'For Rent Sign': 'Exterior',
  'Garage Door': 'Garage Door',
  'Garbage Disposal': 'Plumbing',
  'General': 'General Maintenance',
  'Heating / AC': 'HVAC',
  'Interior': 'General Maintenance',
  'Landscaping': 'Landscaping',
  'Locks': 'Locks/Keys',
  'Other': 'General Maintenance',
  'Outside Water Spigot': 'General Maintenance',
  'Painting': 'Painting',
  'Pest Control': 'Pest Control',
  'Plumbing': 'Plumbing',
  'Pool': 'General Maintenance',
  'Roofing': 'Roofing',
  'Sewer': 'Septic',
  'Shower': 'Plumbing',
  'Siding': 'Siding',
  'Smoke Detector / CO Detectors': 'Smoke/CO Detectors',
  'Soffit / Fascia': 'General Maintenance',
  'Stairs': 'General Maintenance',
  'Toilet': 'Toilet',
  'Towel Bars': 'General Maintenance',
  'Turnover': 'Turnover',
  'Violations': 'General Maintenance',
  'Washer / Dryer': 'Washer/Dryer',
  'Water Damage': 'Water Extraction',
  'Water Heater': 'Water Heater',
  'Water Softener': 'General Maintenance',
  'Windows': 'Windows/Skylight',
};

// Description keywords that override category
const DESCRIPTION_KEYWORD_TO_CATEGORY: Record<string, string> = {
  'fire extinguisher': 'Fire Extinguishers',
  'irrigation': 'Irrigation',
  'backflow': 'Irrigation',
  'foundation': 'Foundation',
  'mold': 'Mold Remediation',
  'pressure washing': 'Pressure Washing',
  'rebuild': 'Rebuild',
  'renovations': 'Rebuild',
  'septic': 'Septic',
  'trash': 'Trash Removal',
  'Trash': 'Trash Removal',
};

/**
 * Make a proxied API request to PropertyWare
 */
async function proxyApiRequest(
  endpoint: string,
  method: string = 'GET',
  params?: Record<string, string>,
  body?: any
): Promise<Response> {
  const resp = await fetch(PROXY_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      endpoint,
      method,
      params,
      body,
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(
      `Propertyware API request failed: ${resp.status} ${resp.statusText} - ${errorText}`
    );
  }

  return resp;
}

/**
 * Fetch the latest work order number from PropertyWare
 */
async function fetchLatestWorkOrderNumber(): Promise<number> {
  const resp = await proxyApiRequest('/workorders', 'GET', {
    orderby: 'number desc',
    limit: '1',
  });

  const workOrders = (await resp.json()) as WorkOrder[];
  if (workOrders.length === 0) {
    return 0;
  }

  return workOrders[0].number;
}

/**
 * Extract Meld URL from work order description
 */
function extractMeldUrl(description: string): string | null {
  // Look for Property Meld Link pattern
  const meldUrlMatch = description.match(
    /https:\/\/app\.propertymeld\.com\/[^\s]+/i
  );
  if (meldUrlMatch) {
    return meldUrlMatch[0];
  }
  return null;
}

/**
 * Extract org ID and Meld ID from URL
 * URLs typically look like:
 * - https://app.propertymeld.com/{orgId}/m/{orgId}/meld/{meldId}/summary/
 * - https://app.propertymeld.com/melds/{meldId}
 */
function extractMeldIdsFromUrl(url: string): { orgId: string | null; meldId: string | null } {
  // Try pattern: /{orgId}/m/{orgId}/meld/{meldId}/
  const orgPatternMatch = url.match(/\/(\d+)\/m\/\1\/meld\/(\d+)/i);
  if (orgPatternMatch) {
    return { orgId: orgPatternMatch[1], meldId: orgPatternMatch[2] };
  }
  
  // Fallback: try simple /melds/{id} pattern
  const simpleMatch = url.match(/\/melds\/([^\/\?]+)/i);
  if (simpleMatch) {
    return { orgId: null, meldId: simpleMatch[1] };
  }
  
  return { orgId: null, meldId: null };
}

/**
 * Normalize category value from API (uppercase with underscores) to title case
 * e.g., "ELECTRICAL" -> "Electrical", "WASHER_DRYER" -> "Washer / Dryer"
 */
function normalizeCategory(category: string): string {
  if (category === category.toUpperCase() && category.includes('_')) {
    // Known categories that use " / " separator in mapping keys
    const slashCategories: Record<string, string> = {
      'WASHER_DRYER': 'Washer / Dryer',
      'SMOKE_DETECTOR': 'Smoke Detector / CO Detectors', // Note: API might return just one part
      'CO_DETECTORS': 'Smoke Detector / CO Detectors',
      'HEATING_AC': 'Heating / AC',
      'SOFFIT_FASCIA': 'Soffit / Fascia',
      'BLINDS_WINDOW_TREATMENTS': 'Blinds / Window Treatments',
    };
    
    if (slashCategories[category]) {
      return slashCategories[category];
    }
    
    // Default: convert underscores to spaces
    return category
      .toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  } else if (category === category.toUpperCase()) {
    // Handle special case: "EXTERNAL" -> "Exterior" (before normal uppercase conversion)
    if (category === 'EXTERNAL') {
      return 'Exterior Maintenance';
    }
    // All uppercase, no underscores - just capitalize first letter
    return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
  }
  
  // Handle special case: "External" -> "Exterior"
  if (category === 'External') {
    return 'Exterior Maintenance';
  }
  
  return category;
}

/**
 * Try to fetch Meld data from API endpoints
 */
async function tryMeldApi(orgId: string | null, meldId: string): Promise<MeldInfo | null> {
  const baseUrl = 'https://app.propertymeld.com';
  
  // Build API endpoints - prefer the org-specific pattern if we have orgId
  const apiEndpoints: string[] = [];
  
  if (orgId) {
    // Use the org-specific API pattern: /{orgId}/m/{orgId}/api/v2/melds/{meldId}/
    apiEndpoints.push(`/${orgId}/m/${orgId}/api/v2/melds/${meldId}/`);
    apiEndpoints.push(`/${orgId}/m/${orgId}/api/v1/melds/${meldId}/`);
    apiEndpoints.push(`/${orgId}/m/${orgId}/api/melds/${meldId}/`);
  }
  
  // Also try generic endpoints
  apiEndpoints.push(`/api/v2/melds/${meldId}/`);
  apiEndpoints.push(`/api/v1/melds/${meldId}/`);
  apiEndpoints.push(`/api/melds/${meldId}/`);

  for (const endpoint of apiEndpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[WorkOrderMonitor] API endpoint ${endpoint} returned data`);
        
        // Log the full API response object
        console.log(`[WorkOrderMonitor] Full Meld API response:`, JSON.stringify(data, null, 2));
        
        // Extract type and category directly from the API response
        let type = data.work_type;
        const category = data.work_category;
        
        // Check if this is a recurring work order
        // Check for recurring_meld field or other recurring indicators
        const isRecurring = !!(data.recurring_meld) || data.recurring === true;
        
        if (isRecurring) {
          console.log(`[WorkOrderMonitor] Detected recurring work order, setting type to "Recurring"`);
          type = 'Recurring';
        } else {
          // Normalize type (API returns uppercase like "REPAIR", mapping expects "Repair")
          if (type && typeof type === 'string' && type === type.toUpperCase()) {
            type = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
          }
        }
        
        if (type && category) {
          const normalizedCategory = normalizeCategory(category);
          console.log(`[WorkOrderMonitor] Found type/category from API ${endpoint}: ${type}/${normalizedCategory}`);
          return { type, category: normalizedCategory };
        } else {
          console.log(`[WorkOrderMonitor] API returned data but missing type/category. Type: ${type}, Category: ${category}`);
          // Log all keys to help debug
          const allKeys = Object.keys(data);
          console.log(`[WorkOrderMonitor] All data keys (${allKeys.length}):`, allKeys);
          
          // Log any fields that might contain category info
          const categoryLikeKeys = allKeys.filter(k => k.toLowerCase().includes('categor'));
          if (categoryLikeKeys.length > 0) {
            console.log(`[WorkOrderMonitor] Category-like keys:`, categoryLikeKeys);
            categoryLikeKeys.forEach(key => {
              console.log(`[WorkOrderMonitor]   ${key}:`, data[key]);
            });
          }
        }
      } else {
        console.log(`[WorkOrderMonitor] API endpoint ${endpoint} returned ${response.status}`);
      }
    } catch (error) {
      // Continue to next endpoint
      console.log(`[WorkOrderMonitor] API endpoint ${endpoint} failed:`, error);
    }
  }

  return null;
}

/**
 * Get Meld type and category from API
 */
async function scrapeMeldPage(meldUrl: string): Promise<MeldInfo | null> {
  const { orgId, meldId } = extractMeldIdsFromUrl(meldUrl);
  if (!meldId) {
    console.log(`[WorkOrderMonitor] Could not extract Meld ID from URL: ${meldUrl}`);
    return null;
  }
  
  console.log(`[WorkOrderMonitor] Extracted orgId: ${orgId}, meldId: ${meldId}, calling API...`);
  return await tryMeldApi(orgId, meldId);
}

/**
 * Map Meld type/category to PropertyWare type/category
 */
function mapMeldToPropertyWare(
  meldType: string,
  meldCategory: string,
  description: string
): { type: string; category: string } {
  // Check description for keywords that override category
  const descriptionLower = description.toLowerCase();
  for (const [keyword, category] of Object.entries(DESCRIPTION_KEYWORD_TO_CATEGORY)) {
    if (descriptionLower.includes(keyword.toLowerCase())) {
      return {
        type: MELD_TYPE_TO_WARE_TYPE[meldType] || 'Service Request',
        category: category,
      };
    }
  }

  // Map type
  const wareType = MELD_TYPE_TO_WARE_TYPE[meldType] || 'Service Request';
  console.log(`[WorkOrderMonitor] Mapping type: "${meldType}" -> "${wareType}" (found: ${!!MELD_TYPE_TO_WARE_TYPE[meldType]})`);

  // Map category
  const wareCategory = MELD_CATEGORY_TO_WARE_CATEGORY[meldCategory] || 'General Maintenance';
  console.log(`[WorkOrderMonitor] Mapping category: "${meldCategory}" -> "${wareCategory}" (found: ${!!MELD_CATEGORY_TO_WARE_CATEGORY[meldCategory]})`);

  return { type: wareType, category: wareCategory };
}

/**
 * Get building details to get portfolioID
 */
async function getBuilding(buildingID: number): Promise<Building> {
  const resp = await proxyApiRequest(`/buildings/${buildingID}`, 'GET');
  return (await resp.json()) as Building;
}

/**
 * Get portfolio details to get requestedBy (owner with 100% ownership)
 */
async function getPortfolio(portfolioID: number): Promise<Portfolio> {
  const resp = await proxyApiRequest(`/portfolios/${portfolioID}`, 'GET');
  return (await resp.json()) as Portfolio;
}

/**
 * Get requestedBy (owner ID with 100% ownership)
 */
async function getRequestedBy(workOrder: WorkOrder): Promise<number | null> {
  try {
    // Get building to get portfolioID
    const building = await getBuilding(workOrder.buildingID);
    
    // Get portfolio to get owners
    const portfolio = await getPortfolio(building.portfolioID);
    
    // Find owner with 100% ownership
    const owner = portfolio.owners.find((o) => o.percentageOwnership === 100.0);
    if (owner) {
      return owner.id;
    }
    
    // If no 100% owner, return the first owner (fallback)
    if (portfolio.owners.length > 0) {
      return portfolio.owners[0].id;
    }
    
    return null;
  } catch (error) {
    console.error('[WorkOrderMonitor] Error getting requestedBy:', error);
    return null;
  }
}

/**
 * Process a single work order
 */
async function processWorkOrder(workOrderNumber: number): Promise<void> {
  console.log(`[WorkOrderMonitor] Processing work order ${workOrderNumber}`);

  try {
    // Fetch work order details by number
    // We need to find the work order by number first
    const resp = await proxyApiRequest('/workorders', 'GET', {
      orderby: 'number desc',
      limit: '1000', // Large limit to find the work order
    });

    const allWorkOrders = (await resp.json()) as WorkOrder[];
    const workOrderMatch = allWorkOrders.find((wo) => wo.number === workOrderNumber);

    if (!workOrderMatch) {
      throw new Error(`Work order ${workOrderNumber} not found`);
    }

    // Fetch the full work order by ID to get all fields (needed to preserve values for validation)
    const fullWorkOrderResp = await proxyApiRequest(`/workorders/${workOrderMatch.id}`, 'GET');
    const workOrder = (await fullWorkOrderResp.json()) as WorkOrder;

    // Extract Meld URL from description
    const meldUrl = extractMeldUrl(workOrder.description);
    if (!meldUrl) {
      throw new Error(`No Meld URL found in work order ${workOrderNumber} description`);
    }

    // Scrape Meld page for type and category
    const meldInfo = await scrapeMeldPage(meldUrl);
    
    // Require type and category - don't process if we can't extract them
    if (!meldInfo || !meldInfo.type || !meldInfo.category) {
      throw new Error(
        `Could not extract type/category from Meld page for work order ${workOrderNumber}. ` +
        `Type: ${meldInfo?.type || 'null'}, Category: ${meldInfo?.category || 'null'}`
      );
    }
    
    // Map Meld type/category to PropertyWare
    const mapped = mapMeldToPropertyWare(
      meldInfo.type,
      meldInfo.category,
      workOrder.description
    );
    const type = mapped.type;
    let category = mapped.category;
    
    console.log(`[WorkOrderMonitor] Using scraped type/category: ${type}/${category}`);
    
    // Apply description keyword overrides (these can override the scraped category)
    const descriptionLower = workOrder.description.toLowerCase();
    for (const [keyword, mappedCategory] of Object.entries(DESCRIPTION_KEYWORD_TO_CATEGORY)) {
      if (descriptionLower.includes(keyword.toLowerCase())) {
        category = mappedCategory;
        console.log(`[WorkOrderMonitor] Applied keyword override: ${keyword} -> ${category}`);
        break;
      }
    }

    // Get requestedBy (owner with 100% ownership)
    const requestedBy = await getRequestedBy(workOrder);
    if (!requestedBy) {
      throw new Error(`Could not find requestedBy for work order ${workOrderNumber}`);
    }

    // Prepare PATCH body - only send the fields we want to update
    // Propertyware may validate other fields, so we preserve existing values where needed
    const patchBody: any = {
      buildingID: workOrder.buildingID,
      requestedBy: requestedBy,
      publishToTenantPortal: false,
      type: type,
      category: category,
      unitIDs: workOrder.unitIDs || [workOrder.unitID],
    };

    // Minute To Enter - preserve existing value or set to 0 if missing
    if (workOrder.minuteToEnter !== undefined && workOrder.minuteToEnter !== null) {
      patchBody.minuteToEnter = workOrder.minuteToEnter;
    } else {
      // Set to 0 (valid value) if not present
      patchBody.minuteToEnter = 0;
    }

    // dateToEnter - only include if it exists and convert to proper format
    // Propertyware expects LocalDate format (YYYY-MM-DD) without time
    if (workOrder.dateToEnter !== undefined && workOrder.dateToEnter !== null) {
      const dateStr = String(workOrder.dateToEnter).trim();
      // Try to extract just the date part (YYYY-MM-DD)
      // Handle formats like "2026-01-19T01:56 PM" or "2026-01-19" or ISO strings
      const dateMatch = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        patchBody.dateToEnter = dateMatch[1]; // Just the date part (YYYY-MM-DD)
        console.log(`[WorkOrderMonitor] Converted dateToEnter from "${dateStr}" to "${patchBody.dateToEnter}"`);
      } else {
        // If we can't parse it, don't include it (let Propertyware use existing value)
        console.warn(
          `[WorkOrderMonitor] Could not parse dateToEnter format: "${dateStr}", omitting from PATCH`
        );
      }
    }

    // Log the type and category that will be sent in the PATCH request
    console.log(
      `[WorkOrderMonitor] PATCH request for work order ${workOrderNumber} (ID: ${workOrder.id}):`
    );
    console.log(`[WorkOrderMonitor]   - type: "${type}"`);
    console.log(`[WorkOrderMonitor]   - category: "${category}"`);
    console.log(`[WorkOrderMonitor]   - buildingID: ${patchBody.buildingID}`);
    console.log(`[WorkOrderMonitor]   - requestedBy: ${patchBody.requestedBy}`);
    console.log(`[WorkOrderMonitor]   - publishToTenantPortal: ${patchBody.publishToTenantPortal}`);
    console.log(`[WorkOrderMonitor]   - unitIDs: [${patchBody.unitIDs.join(', ')}]`);
    console.log(`[WorkOrderMonitor] Full PATCH body:`, JSON.stringify(patchBody, null, 2));

    // Send PATCH request to update work order
    try {
      await proxyApiRequest(`/workorders/${workOrder.id}`, 'PATCH', undefined, patchBody);
    } catch (error) {
      // Log the full error and request details for debugging
      console.error(`[WorkOrderMonitor] PATCH request failed for work order ${workOrderNumber}:`, error);
      console.error(`[WorkOrderMonitor] Request body was:`, JSON.stringify(patchBody, null, 2));
      throw error;
    }

    console.log(
      `[WorkOrderMonitor] Successfully processed work order ${workOrderNumber} (ID: ${workOrder.id})`
    );
  } catch (error) {
    console.error(
      `[WorkOrderMonitor] Error processing work order ${workOrderNumber}:`,
      error
    );
    throw error; // Re-throw so caller can handle it
  }
}

/**
 * Process a batch of work orders
 * Only processes work orders that this instance successfully claims
 */
async function processWorkOrderBatch(workOrderNumbers: number[]): Promise<void> {
  const claimed: number[] = [];

  // Claim work orders (only process ones we successfully claim)
  for (const workOrderNumber of workOrderNumbers) {
    const claimedSuccessfully = await claimWorkOrder(workOrderNumber);
    if (claimedSuccessfully) {
      claimed.push(workOrderNumber);
    } else {
      console.log(
        `[WorkOrderMonitor] Work order ${workOrderNumber} already claimed by another instance`
      );
    }
  }

  // Process claimed work orders
  for (const workOrderNumber of claimed) {
    try {
      await processWorkOrder(workOrderNumber);
      await completeWorkOrder(workOrderNumber);
    } catch (error) {
      // Release the lock on error so another instance can retry
      console.error(
        `[WorkOrderMonitor] Failed to process work order ${workOrderNumber}, releasing lock`
      );
      await releaseWorkOrder(workOrderNumber);
      // Continue processing other work orders even if one fails
    }
  }
}

/**
 * Main check function - called by alarm
 * Continues processing until all pending work orders are handled (workgroup model)
 */
async function checkForNewWorkOrders(): Promise<void> {
  console.log('[WorkOrderMonitor] Starting work order check');

  try {
    // Get the latest work order number from PropertyWare
    const latestWorkOrderNumber = await fetchLatestWorkOrderNumber();
    console.log(
      `[WorkOrderMonitor] Latest work order number: ${latestWorkOrderNumber}`
    );

    // Get the last processed work order number from storage
    let lastProcessed = await getLastProcessedWorkOrder();
    
    // Initialize to starting work order number if not set or below threshold
    if (lastProcessed < STARTING_WORK_ORDER_NUMBER) {
      console.log(
        `[WorkOrderMonitor] Initializing lastProcessed to ${STARTING_WORK_ORDER_NUMBER} (was ${lastProcessed})`
      );
      await setLastProcessedWorkOrder(STARTING_WORK_ORDER_NUMBER);
      lastProcessed = STARTING_WORK_ORDER_NUMBER;
    }
    
    console.log(
      `[WorkOrderMonitor] Last processed work order number: ${lastProcessed}`
    );

    // If there are no new work orders, we're done
    if (latestWorkOrderNumber <= lastProcessed) {
      console.log('[WorkOrderMonitor] No new work orders to process');
      return;
    }
    
    // Also ensure we don't process work orders below the starting number
    if (latestWorkOrderNumber < STARTING_WORK_ORDER_NUMBER) {
      console.log(
        `[WorkOrderMonitor] Latest work order ${latestWorkOrderNumber} is below starting threshold ${STARTING_WORK_ORDER_NUMBER}`
      );
      return;
    }

    // Workgroup processing: Continue processing batches until queue is empty
    // All instances work together to process all pending work orders
    let totalProcessed = 0;
    let iterations = 0;
    const MAX_ITERATIONS = 1000; // Safety limit to prevent infinite loops

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      // Get pending work orders (ones that need processing)
      const pending = await getPendingWorkOrders(latestWorkOrderNumber);

      if (pending.length === 0) {
        // All work orders are either completed or in progress by other instances
        // Update lastProcessed to latest if we've caught up
        if (latestWorkOrderNumber > lastProcessed) {
          await setLastProcessedWorkOrder(latestWorkOrderNumber);
        }
        console.log(
          `[WorkOrderMonitor] Queue empty. Processed ${totalProcessed} work orders this cycle.`
        );
        break;
      }

      // Filter out work orders below starting threshold (safety check)
      const validPending = pending.filter(wo => wo >= STARTING_WORK_ORDER_NUMBER);
      
      if (validPending.length === 0) {
        // All pending work orders are below threshold, update lastProcessed
        if (latestWorkOrderNumber > lastProcessed) {
          await setLastProcessedWorkOrder(latestWorkOrderNumber);
        }
        console.log(
          `[WorkOrderMonitor] All pending work orders are below threshold ${STARTING_WORK_ORDER_NUMBER}`
        );
        break;
      }
      
      // Process a batch (other instances will claim the rest)
      const batch = validPending.slice(0, BATCH_SIZE);
      console.log(
        `[WorkOrderMonitor] Processing batch of ${batch.length} work orders (${validPending.length} valid pending, ${pending.length} total pending)`
      );

      await processWorkOrderBatch(batch);
      totalProcessed += batch.length;

      // Small delay to allow other instances to claim work orders
      // This helps distribute work across the workgroup
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (iterations >= MAX_ITERATIONS) {
      console.warn(
        `[WorkOrderMonitor] Reached max iterations (${MAX_ITERATIONS}). Stopping to prevent infinite loop.`
      );
    }

    console.log(
      `[WorkOrderMonitor] Work order check completed. Processed ${totalProcessed} work orders.`
    );
  } catch (error) {
    console.error('[WorkOrderMonitor] Error during work order check:', error);
  }
}

/**
 * Initialize the work order monitor
 * Sets up the alarm and runs initial check
 */
export function initializeWorkOrderMonitor(): void {
  console.log('[WorkOrderMonitor] Initializing work order monitor');

  // Set up periodic alarm
  chrome.alarms.create(ALARM_NAME, {
    periodInMinutes: CHECK_INTERVAL_MINUTES,
  });

  // Run initial check after a short delay (to let extension fully load)
  setTimeout(() => {
    checkForNewWorkOrders();
  }, 5000);

  // Listen for alarm events
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_NAME) {
      checkForNewWorkOrders();
    }
  });

  console.log(
    `[WorkOrderMonitor] Monitor initialized - checking every ${CHECK_INTERVAL_MINUTES} minutes`
  );
}

/**
 * Manually trigger a work order check (useful for testing or manual triggers)
 */
export async function triggerWorkOrderCheck(): Promise<void> {
  await checkForNewWorkOrders();
}
