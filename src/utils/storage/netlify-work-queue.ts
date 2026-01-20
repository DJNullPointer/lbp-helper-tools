/**
 * Distributed Work Queue using Netlify Function (Shared Backend)
 * 
 * This version uses your Netlify function as a shared backend, allowing
 * coordination across different users/Google accounts.
 * 
 * Architecture:
 * - Each instance has a unique ID
 * - Work orders are stored on the backend with status: pending, in-progress, completed
 * - Atomic claim operations prevent duplicate processing
 * - Stale lock detection (locks expire after timeout)
 * 
 * Storage Structure (on backend):
 * {
 *   lastProcessed: number,           // Last work order number processed
 *   inProgress: {                     // Work orders currently being processed
 *     "workOrderNumber": {
 *       instanceId: string,
 *       claimedAt: timestamp,
 *       expiresAt: timestamp
 *     }
 *   },
 *   completed: number[]              // Completed work order numbers
 * }
 */

import { PROXY_BASE_URL } from '../proxy-config';

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface WorkOrderLock {
  instanceId: string;
  claimedAt: number;
  expiresAt: number;
}

interface WorkQueueState {
  lastProcessed: number;
  inProgress: Record<string, WorkOrderLock>;
  completed: number[];
}

/**
 * Get or create a unique instance ID for this extension instance
 */
async function getInstanceId(): Promise<string> {
  // Use chrome.storage.local to persist instance ID
  return new Promise((resolve) => {
    chrome.storage.local.get(['workQueue:instanceId'], (result) => {
      if (result['workQueue:instanceId']) {
        resolve(result['workQueue:instanceId']);
        return;
      }
      
      const instanceId = `${chrome.runtime.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      chrome.storage.local.set({ 'workQueue:instanceId': instanceId }, () => {
        resolve(instanceId);
      });
    });
  });
}

/**
 * Call the Netlify function for work queue operations
 */
async function callWorkQueueAPI(action: string, data?: any): Promise<any> {
  // Use the work-orders endpoint from the same Netlify site
  const url = `${PROXY_BASE_URL.replace('/proxy', '/work-orders')}`;
  
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action,
      ...data,
    }),
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Work queue API failed: ${resp.status} ${resp.statusText} - ${errorText}`);
  }

  return resp.json();
}

/**
 * Get the current work queue state from backend
 */
async function getWorkQueueState(): Promise<WorkQueueState> {
  const result = await callWorkQueueAPI('getState');
  return {
    lastProcessed: result.lastProcessed || 0,
    inProgress: result.inProgress || {},
    completed: result.completed || [],
  };
}

/**
 * Atomically claim a work order for processing
 * Returns true if successfully claimed, false if already claimed by another instance
 */
export async function claimWorkOrder(workOrderNumber: number): Promise<boolean> {
  const instanceId = await getInstanceId();
  
  try {
    const result = await callWorkQueueAPI('claim', {
      workOrderNumber,
      instanceId,
      lockTimeout: LOCK_TIMEOUT_MS,
    });
    
    if (result.success) {
      console.log(`[WorkQueue] Instance ${instanceId} claimed work order ${workOrderNumber}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`[WorkQueue] Error claiming work order ${workOrderNumber}:`, error);
    return false;
  }
}

/**
 * Release a work order lock (if it's ours)
 */
export async function releaseWorkOrder(workOrderNumber: number): Promise<void> {
  const instanceId = await getInstanceId();
  
  try {
    await callWorkQueueAPI('release', {
      workOrderNumber,
      instanceId,
    });
    console.log(`[WorkQueue] Instance ${instanceId} released work order ${workOrderNumber}`);
  } catch (error) {
    console.error(`[WorkQueue] Error releasing work order ${workOrderNumber}:`, error);
  }
}

/**
 * Mark a work order as completed
 */
export async function completeWorkOrder(workOrderNumber: number): Promise<void> {
  const instanceId = await getInstanceId();
  
  try {
    await callWorkQueueAPI('complete', {
      workOrderNumber,
      instanceId,
    });
    console.log(`[WorkQueue] Instance ${instanceId} completed work order ${workOrderNumber}`);
  } catch (error) {
    console.error(`[WorkQueue] Error completing work order ${workOrderNumber}:`, error);
  }
}

/**
 * Get the last processed work order number
 */
export async function getLastProcessedWorkOrder(): Promise<number> {
  const state = await getWorkQueueState();
  return state.lastProcessed;
}

/**
 * Update the last processed work order number (without processing)
 */
export async function setLastProcessedWorkOrder(workOrderNumber: number): Promise<void> {
  await callWorkQueueAPI('setLastProcessed', {
    workOrderNumber,
  });
}

/**
 * Get pending work orders (work orders that need processing)
 * Returns array of work order numbers that are not completed and not currently in progress
 */
export async function getPendingWorkOrders(maxWorkOrderNumber: number): Promise<number[]> {
  const result = await callWorkQueueAPI('getPending', {
    maxWorkOrderNumber,
  });
  return result.pending || [];
}

/**
 * Get work orders currently being processed by this instance
 */
export async function getMyInProgressWorkOrders(): Promise<number[]> {
  const instanceId = await getInstanceId();
  const result = await callWorkQueueAPI('getMyInProgress', {
    instanceId,
  });
  return result.workOrders || [];
}
