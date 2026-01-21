/**
 * Replace Meld dropdowns (category and work type) with buttons
 * The form submit button reads the select element's value attribute,
 * so we update it when buttons are clicked.
 */

// Options to hide from work type dropdown
const HIDDEN_WORK_TYPES = [
  'Add-On Services',
  'Capital Expenditure',
  'Environmental',
  'Inspection',
  'Safety',
];

// Options to hide from work category dropdown
const HIDDEN_CATEGORIES = [
  'Blinds/Window Treatments',
  'Circuit Breaker',
  'Evaluation',
  'For Rent Sign',
  'Hardware',
  'Interior',
  'Other',
  'Outside Water Spigot',
  'Pool',
  'Shower',
  'Soffit/Fascia',
  'Stairs',
  'Towel Bars',
  'Water Softener',
];

/**
 * Create button element for an option
 */
function createOptionButton(
  option: { value: string; label: string },
  isSelected: boolean,
  selectElement: HTMLSelectElement,
  buttonClass: string
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = option.label;
  button.className = buttonClass;
  button.setAttribute('data-option-value', option.value);
  
  // Style the button (smaller size for multiple buttons)
  button.style.cssText = `
    padding: 6px 12px;
    margin: 4px;
    border: 1.5px solid #e5e7eb;
    border-radius: 5px;
    background-color: ${isSelected ? '#3b82f6' : '#ffffff'};
    color: ${isSelected ? '#ffffff' : '#111827'};
    font-size: 0.75rem;
    font-weight: ${isSelected ? '600' : '500'};
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    flex-shrink: 0;
  `;
  
  // Hover styles
  button.addEventListener('mouseenter', () => {
    if (!isSelected) {
      button.style.backgroundColor = '#f3f4f6';
      button.style.borderColor = '#d1d5db';
    }
  });
  
  button.addEventListener('mouseleave', () => {
    if (!isSelected) {
      button.style.backgroundColor = '#ffffff';
      button.style.borderColor = '#e5e7eb';
    }
  });
  
  // Click handler
  button.addEventListener('click', () => {
    // Update select value
    selectElement.value = option.value;
    
    // Trigger change event so any form listeners are notified
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Update button styles for all buttons in the same container
    const buttons = button.parentElement?.querySelectorAll(`.${buttonClass}`) || [];
    buttons.forEach((btn) => {
      const btnElement = btn as HTMLButtonElement;
      const isBtnSelected = btnElement.getAttribute('data-option-value') === option.value;
      btnElement.style.backgroundColor = isBtnSelected ? '#3b82f6' : '#ffffff';
      btnElement.style.color = isBtnSelected ? '#ffffff' : '#111827';
      btnElement.style.fontWeight = isBtnSelected ? '600' : '500';
      btnElement.style.borderColor = isBtnSelected ? '#3b82f6' : '#e5e7eb';
    });
  });
  
  return button;
}

/**
 * Replace a dropdown select with buttons
 */
function replaceSelectWithButtons(
  selectElement: HTMLSelectElement,
  containerClass: string,
  buttonClass: string,
  hiddenLabels: string[] = []
): boolean {
  // Check if we've already replaced it (look for buttons container)
  const existingContainer = document.querySelector(`.${containerClass}`);
  if (existingContainer && selectElement.closest('.pm-forms-form-group')?.contains(existingContainer)) {
    console.log(`[SelectButtons] Already replaced ${selectElement.id || 'select'}`);
    return true;
  }
  
  // Find the wrapper div that contains the select
  const selectWrapper = selectElement.closest('.chakra-select__wrapper') as HTMLElement | null;
  if (!selectWrapper) {
    console.log(`[SelectButtons] Could not find select wrapper for ${selectElement.id || 'select'}`);
    return false;
  }
  
  // Get current selected value
  const currentValue = selectElement.value || '';
  
  // Extract all options from select (skip disabled/empty options and hidden labels)
  const options: Array<{ value: string; label: string }> = [];
  Array.from(selectElement.options).forEach((option) => {
    // Skip disabled options and empty values
    if (!option.disabled && option.value && option.value.trim() !== '') {
      const label = option.textContent?.trim() || option.value;
      
      // Skip if this label is in the hidden list
      if (!hiddenLabels.includes(label)) {
        options.push({
          value: option.value,
          label: label,
        });
      }
    }
  });
  
  if (options.length === 0) {
    console.log(`[SelectButtons] No valid options found in select ${selectElement.id || 'select'}`);
    return false;
  }
  
  // Create buttons container with flex-wrap for multiple rows
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = containerClass;
  buttonsContainer.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    width: 100%;
    margin-top: 4px;
  `;
  
  // Create buttons for each option
  options.forEach((option) => {
    const isSelected = option.value === currentValue;
    const button = createOptionButton(option, isSelected, selectElement, buttonClass);
    buttonsContainer.appendChild(button);
  });
  
  // Hide the select wrapper visually but keep it in DOM for form submission
  // The select element itself stays functional, we just hide the visual dropdown
  selectWrapper.style.cssText = `
    position: absolute;
    opacity: 0;
    pointer-events: none;
    width: 1px;
    height: 1px;
    overflow: hidden;
    z-index: -1;
  `;
  
  // Insert buttons container in the same parent as selectWrapper
  // This maintains the form structure
  const parentContainer = selectWrapper.parentElement;
  if (parentContainer) {
    // Insert buttons right after selectWrapper
    parentContainer.insertBefore(buttonsContainer, selectWrapper.nextSibling);
  } else {
    // Fallback: try to find the form group container
    const formGroup = selectElement.closest('.pm-forms-form-group');
    if (formGroup) {
      const selectContainer = selectElement.closest('div > div'); // The div containing selectWrapper
      if (selectContainer && selectContainer.parentElement) {
        selectContainer.parentElement.insertBefore(buttonsContainer, selectContainer.nextSibling);
      }
    }
  }
  
  // Listen for programmatic changes to the select (in case something else updates it)
  selectElement.addEventListener('change', () => {
    const newValue = selectElement.value;
    const buttons = buttonsContainer.querySelectorAll(`.${buttonClass}`);
    buttons.forEach((btn) => {
      const btnElement = btn as HTMLButtonElement;
      const isBtnSelected = btnElement.getAttribute('data-option-value') === newValue;
      btnElement.style.backgroundColor = isBtnSelected ? '#3b82f6' : '#ffffff';
      btnElement.style.color = isBtnSelected ? '#ffffff' : '#111827';
      btnElement.style.fontWeight = isBtnSelected ? '600' : '500';
      btnElement.style.borderColor = isBtnSelected ? '#3b82f6' : '#e5e7eb';
    });
  });
  
  console.log(`[SelectButtons] Successfully replaced ${selectElement.id || 'select'} dropdown with buttons`);
  return true;
}

/**
 * Replace category dropdown with buttons
 */
export function replaceCategoryDropdownWithButtons(): boolean {
  // Find the category select element
  const selectElement = document.querySelector<HTMLSelectElement>(
    '#meld-workcategory, [data-test="meld-workcategory"], [data-testid="meld-workcategory"]'
  );
  
  if (!selectElement) {
    console.log('[CategoryButtons] Category select element not found');
    return false;
  }
  
  return replaceSelectWithButtons(
    selectElement,
    'lbp-category-buttons-container',
    'lbp-category-button',
    HIDDEN_CATEGORIES
  );
}

/**
 * Replace work type dropdown with buttons
 */
export function replaceWorkTypeDropdownWithButtons(): boolean {
  // Find the work type select element
  const selectElement = document.querySelector<HTMLSelectElement>(
    '#meld-worktypes, [data-test="meld-worktypes"], [data-testid="meld-worktypes"]'
  );
  
  if (!selectElement) {
    console.log('[WorkTypeButtons] Work type select element not found');
    return false;
  }
  
  return replaceSelectWithButtons(
    selectElement,
    'lbp-worktype-buttons-container',
    'lbp-worktype-button',
    HIDDEN_WORK_TYPES
  );
}

/**
 * Initialize dropdown buttons on page load
 * Waits for the form to be ready before attempting replacement (handles SPA loading)
 */
export async function initializeDropdownButtons(): Promise<void> {
  // Wait longer for SPA to fully load - Meld can be slow
  const maxAttempts = 40; // Increased from 20 to handle slow SPA loading
  let attempts = 0;
  let categoryReplaced = false;
  let workTypeReplaced = false;
  
  while (attempts < maxAttempts && (!categoryReplaced || !workTypeReplaced)) {
    // Try to replace category dropdown
    if (!categoryReplaced) {
      const categorySelect = document.querySelector<HTMLSelectElement>(
        '#meld-workcategory, [data-test="meld-workcategory"], [data-testid="meld-workcategory"]'
      );
      
      if (categorySelect && categorySelect.options.length > 1) {
        // Make sure select has options loaded (not just the disabled placeholder)
        const hasRealOptions = Array.from(categorySelect.options).some(
          opt => !opt.disabled && opt.value && opt.value.trim() !== ''
        );
        
        if (hasRealOptions) {
          const success = replaceCategoryDropdownWithButtons();
          if (success) {
            categoryReplaced = true;
            console.log('[DropdownButtons] Category dropdown replaced');
          }
        }
      }
    }
    
    // Try to replace work type dropdown
    if (!workTypeReplaced) {
      const workTypeSelect = document.querySelector<HTMLSelectElement>(
        '#meld-worktypes, [data-test="meld-worktypes"], [data-testid="meld-worktypes"]'
      );
      
      if (workTypeSelect && workTypeSelect.options.length > 1) {
        // Make sure select has options loaded (not just the disabled placeholder)
        const hasRealOptions = Array.from(workTypeSelect.options).some(
          opt => !opt.disabled && opt.value && opt.value.trim() !== ''
        );
        
        if (hasRealOptions) {
          const success = replaceWorkTypeDropdownWithButtons();
          if (success) {
            workTypeReplaced = true;
            console.log('[DropdownButtons] Work type dropdown replaced');
          }
        }
      }
    }
    
    // If both are replaced, we're done
    if (categoryReplaced && workTypeReplaced) {
      console.log('[DropdownButtons] All dropdowns replaced successfully');
      return;
    }
    
    // Wait a bit before trying again (longer wait for SPA)
    await new Promise((resolve) => setTimeout(resolve, 300));
    attempts++;
  }
  
  if (!categoryReplaced) {
    console.log('[DropdownButtons] Could not find category select after multiple attempts');
  }
  if (!workTypeReplaced) {
    console.log('[DropdownButtons] Could not find work type select after multiple attempts');
  }
}

/**
 * Add rebuild reminder after Detailed Description field
 */
export function addRebuildReminder(): boolean {
  // Look for the Detailed Description label
  // It might be in a label element with text containing "Detailed Description"
  const labels = Array.from(document.querySelectorAll('label'));
  let descriptionLabel: HTMLElement | null = null;
  
  for (const label of labels) {
    const text = label.textContent?.trim() || '';
    if (text.includes('Detailed Description') || text.includes('detailed description')) {
      descriptionLabel = label;
      break;
    }
  }
  
  if (!descriptionLabel) {
    console.log('[RebuildReminder] Could not find Detailed Description label');
    return false;
  }
  
  // Check if we've already added the reminder
  const existingReminder = document.querySelector('.lbp-rebuild-reminder');
  if (existingReminder && descriptionLabel.closest('.pm-forms-form-group')?.contains(existingReminder)) {
    console.log('[RebuildReminder] Reminder already added');
    return true;
  }
  
  // Find the form group containing the label
  const formGroup = descriptionLabel.closest('.pm-forms-form-group');
  if (!formGroup) {
    console.log('[RebuildReminder] Could not find form group');
    return false;
  }
  
  // Create the reminder element
  const reminder = document.createElement('div');
  reminder.className = 'lbp-rebuild-reminder';
  reminder.style.cssText = `
    margin-top: 12px;
    margin-bottom: 8px;
    padding: 12px 16px;
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border: 2px solid #f59e0b;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.2);
    display: flex;
    align-items: center;
    gap: 10px;
    animation: fadeIn 0.3s ease-in;
  `;
  
  // Add animation keyframes if not already present
  if (!document.querySelector('#lbp-reminder-styles')) {
    const style = document.createElement('style');
    style.id = 'lbp-reminder-styles';
    style.textContent = `
      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(-5px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .lbp-rebuild-reminder:hover {
        box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
        transform: translateY(-1px);
        transition: all 0.2s ease;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Add icon (warning/alert emoji or SVG)
  const icon = document.createElement('span');
  icon.textContent = '⚠️';
  icon.style.cssText = `
    font-size: 1.5rem;
    line-height: 1;
    flex-shrink: 0;
  `;
  
  // Add text
  const text = document.createElement('span');
  text.textContent = 'If meld is a rebuild, please write rebuild somewhere in the description';
  text.style.cssText = `
    font-size: 0.875rem;
    font-weight: 600;
    color: #92400e;
    line-height: 1.5;
  `;
  
  reminder.appendChild(icon);
  reminder.appendChild(text);
  
  // Insert after the form group (or find the next form group and insert before it)
  const nextFormGroup = formGroup.nextElementSibling;
  if (nextFormGroup) {
    formGroup.parentElement?.insertBefore(reminder, nextFormGroup);
  } else {
    // If no next sibling, append to parent
    formGroup.parentElement?.appendChild(reminder);
  }
  
  console.log('[RebuildReminder] Successfully added reminder');
  return true;
}

/**
 * Initialize rebuild reminder on page load
 */
export async function initializeRebuildReminder(): Promise<void> {
  // Wait for the form to be ready
  const maxAttempts = 40;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    const success = addRebuildReminder();
    if (success) {
      return;
    }
    
    // Wait a bit before trying again
    await new Promise((resolve) => setTimeout(resolve, 300));
    attempts++;
  }
  
  console.log('[RebuildReminder] Could not find Detailed Description field after multiple attempts');
}
