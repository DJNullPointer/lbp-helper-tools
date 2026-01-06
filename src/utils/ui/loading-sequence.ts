export interface LoadingSequenceOptions {
  container: HTMLElement;
  message?: string;
  workPromise?: Promise<void>;
  onComplete?: () => void;
  onProgress?: (current: number, total: number, message?: string) => void;
}

export function showLoadingSequence(
  options: LoadingSequenceOptions,
): Promise<void> {
  const { container, message = "Processing...", workPromise, onComplete, onProgress } = options;

  return new Promise((resolve, reject) => {
    const loadingContainer = document.createElement("div");
    loadingContainer.className = "loading-sequence";

    const spinner = document.createElement("div");
    spinner.className = "loading-spinner";
    spinner.innerHTML = `
      <div class="spinner-ring"></div>
      <div class="spinner-ring"></div>
      <div class="spinner-ring"></div>
    `;

    const messageEl = document.createElement("div");
    messageEl.className = "loading-message";
    messageEl.textContent = message;

    // Progress indicator (hidden by default)
    const progressEl = document.createElement("div");
    progressEl.className = "loading-progress";
    progressEl.style.display = "none";
    progressEl.style.marginTop = "8px";
    progressEl.style.fontSize = "0.75rem";
    progressEl.style.color = "#9ca3af";

    loadingContainer.appendChild(spinner);
    loadingContainer.appendChild(messageEl);
    loadingContainer.appendChild(progressEl);

    // Expose update function for progress tracking
    (loadingContainer as any).updateProgress = (current: number, total: number, detailMessage?: string) => {
      if (total > 0) {
        progressEl.style.display = "block";
        // Only show the simple progress text, not the detail message in parentheses
        if (detailMessage && detailMessage.includes("Complete!")) {
          // For completion, show the detail message
          progressEl.textContent = detailMessage;
          messageEl.textContent = "Complete!";
        } else {
          // For in-progress, show simple "X of Y" format
          progressEl.textContent = `${current} of ${total}`;
          messageEl.textContent = detailMessage || message;
        }
      }
      if (onProgress) {
        onProgress(current, total, detailMessage);
      }
    };

    container.innerHTML = "";
    container.appendChild(loadingContainer);

    requestAnimationFrame(() => {
      loadingContainer.classList.add("loading-sequence--visible");
    });

    const showSuccess = () => {
      loadingContainer.innerHTML = "";

      const successContainer = document.createElement("div");
      successContainer.className = "success-checkmark";

      const checkmarkSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      checkmarkSvg.setAttribute("viewBox", "0 0 52 52");
      checkmarkSvg.setAttribute("class", "checkmark-svg");

      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("class", "checkmark-circle");
      circle.setAttribute("cx", "26");
      circle.setAttribute("cy", "26");
      circle.setAttribute("r", "25");
      circle.setAttribute("fill", "none");

      const checkmarkPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      checkmarkPath.setAttribute("class", "checkmark-check");
      checkmarkPath.setAttribute("fill", "none");
      checkmarkPath.setAttribute("d", "M14.1 27.2l7.1 7.2 16.7-16.8");

      checkmarkSvg.appendChild(circle);
      checkmarkSvg.appendChild(checkmarkPath);
      successContainer.appendChild(checkmarkSvg);

      const successMessage = document.createElement("div");
      successMessage.className = "success-message";
      successMessage.textContent = "Complete!";

      successContainer.appendChild(successMessage);
      loadingContainer.appendChild(successContainer);

      requestAnimationFrame(() => {
        successContainer.classList.add("success-checkmark--visible");
      });

      setTimeout(() => {
        if (onComplete) {
          onComplete();
        }
        resolve();
      }, 1500);
    };

    if (workPromise) {
      workPromise
        .then(() => {
          showSuccess();
        })
        .catch((error) => {
          reject(error);
        });
    } else {
      const minLoadingTime = 1000;
      const startTime = Date.now();
      
      setTimeout(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed < minLoadingTime) {
          setTimeout(showSuccess, minLoadingTime - elapsed);
        } else {
          showSuccess();
        }
      }, minLoadingTime);
    }
  });
}

