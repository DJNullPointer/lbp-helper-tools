export interface TooltipOptions {
  content: string;
  position?: "top" | "bottom" | "left" | "right";
}

export function createTooltip(
  triggerElement: HTMLElement,
  options: TooltipOptions,
): void {
  const { content, position = "top" } = options;

  let tooltip: HTMLDivElement | null = null;
  let hideTimeout: number | null = null;

  const showTooltip = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    if (tooltip) {
      tooltip.classList.add("tooltip--visible");
      return;
    }

    tooltip = document.createElement("div");
    tooltip.className = `tooltip tooltip--${position}`;
    tooltip.textContent = content;
    document.body.appendChild(tooltip);

    const rect = triggerElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    switch (position) {
      case "top":
        tooltip.style.left = `${rect.left + rect.width / 2 - tooltipRect.width / 2}px`;
        tooltip.style.top = `${rect.top - tooltipRect.height - 8}px`;
        break;
      case "bottom":
        tooltip.style.left = `${rect.left + rect.width / 2 - tooltipRect.width / 2}px`;
        tooltip.style.top = `${rect.bottom + 8}px`;
        break;
      case "left":
        tooltip.style.left = `${rect.left - tooltipRect.width - 8}px`;
        tooltip.style.top = `${rect.top + rect.height / 2 - tooltipRect.height / 2}px`;
        break;
      case "right":
        tooltip.style.left = `${rect.right + 8}px`;
        tooltip.style.top = `${rect.top + rect.height / 2 - tooltipRect.height / 2}px`;
        break;
    }

    requestAnimationFrame(() => {
      tooltip?.classList.add("tooltip--visible");
    });
  };

  const hideTooltip = () => {
    if (tooltip) {
      tooltip.classList.remove("tooltip--visible");
      hideTimeout = window.setTimeout(() => {
        if (tooltip) {
          tooltip.remove();
          tooltip = null;
        }
      }, 200);
    }
  };

  triggerElement.addEventListener("mouseenter", showTooltip);
  triggerElement.addEventListener("mouseleave", hideTooltip);
  triggerElement.addEventListener("click", (e) => {
    e.stopPropagation();
    if (tooltip?.classList.contains("tooltip--visible")) {
      hideTooltip();
    } else {
      showTooltip();
    }
  });
}

