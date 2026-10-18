/**
 * Reusable loading progress indicator
 * 
 * Shows "Loading <thing>… NN%" with a thin progress bar.
 * Uses role="progressbar" with aria-valuenow, aria-valuemin, aria-valuemax, aria-label.
 * Design tokens only, 4.5:1 contrast minimum.
 * Static bar (no animation) under reduced motion.
 * Uses toLocaleString('en-US') for number formatting.
 * Percentage from real progress only - never invented.
 * Hides at 100% or on completion.
 * Shows error message with instructions on failure.
 * Indeterminate mode when total is unknown (no Content-Length).
 */
(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CrankProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  /**
   * Create a progress indicator in a container.
   * 
   * @param {Element} container - DOM element to show progress in
   * @param {Object} options
   * @param {string} options.label - What is being loaded (e.g., "cards", "deck list", "backup")
   * @param {boolean} options.indeterminate - True when total is unknown
   * @returns {Object} Progress controller with update(), complete(), and error() methods
   */
  function create(container, options = {}) {
    const label = String(options.label || 'data');
    const indeterminate = !!options.indeterminate;
    
    const id = 'cm-progress-' + Math.random().toString(36).slice(2, 9);
    const reducedMotion = typeof window !== 'undefined' && 
                         window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    const html = `
      <div class="cm-progress-container" id="${id}" role="status" aria-live="polite">
        <p class="cm-progress-label" id="${id}-label">
          Loading ${esc(label)}…${indeterminate ? '' : ' <span class="cm-progress-percent">0%</span>'}
        </p>
        <div 
          class="cm-progress-bar${indeterminate ? ' cm-progress-indeterminate' : ''}${reducedMotion ? ' cm-progress-static' : ''}"
          role="progressbar"
          aria-labelledby="${id}-label"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${indeterminate ? '' : '0'}"
        >
          <div class="cm-progress-fill" style="width: 0%"></div>
        </div>
      </div>
    `;
    
    container.insertAdjacentHTML('beforeend', html);
    const element = container.querySelector('#' + id);
    const bar = element.querySelector('.cm-progress-bar');
    const fill = element.querySelector('.cm-progress-fill');
    const percent = element.querySelector('.cm-progress-percent');
    
    let lastValue = 0;
    
    /**
     * Update progress. Only accepts monotonic increases.
     * 
     * @param {number} loaded - Bytes or items loaded
     * @param {number} total - Total bytes or items
     */
    function update(loaded, total) {
      if (indeterminate) return; // Indeterminate mode shows no percentage
      
      if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0) {
        return;
      }
      
      const value = Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
      
      // Monotonic only - never go backwards
      if (value < lastValue) return;
      lastValue = value;
      
      const formatted = value.toLocaleString('en-US');
      if (percent) percent.textContent = formatted + '%';
      bar.setAttribute('aria-valuenow', String(value));
      fill.style.width = value + '%';
    }
    
    /**
     * Mark as complete and hide the progress indicator.
     */
    function complete() {
      if (!indeterminate) {
        update(1, 1); // Set to 100%
      }
      
      // Hide after a brief moment so the user sees completion
      setTimeout(() => {
        if (element && element.parentNode) {
          element.remove();
        }
      }, 300);
    }
    
    /**
     * Show an error state with a message and instructions.
     * 
     * @param {string} message - Error description
     * @param {string} instructions - What the user should do
     */
    function error(message, instructions) {
      const errorHTML = `
        <div class="cm-progress-error" role="alert">
          <p class="cm-progress-error-message">${esc(String(message || 'Loading failed'))}</p>
          <p class="cm-progress-error-instructions">${esc(String(instructions || 'Check your connection and try again.'))}</p>
        </div>
      `;
      
      element.innerHTML = errorHTML;
      element.classList.add('cm-progress-has-error');
    }
    
    return { update, complete, error };
  }
  
  function esc(s) {
    return String(s).replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
  }
  
  /**
   * Track progress for a fetch Response with streaming.
   * Returns the Response body as text after tracking progress.
   * 
   * @param {string} label - What is being loaded
   * @param {Response} response - Fetch Response object
   * @param {Element} container - Where to show progress
   * @returns {Promise<string>} Response body text
   */
  async function track(label, response, container) {
    if (!response.body || !response.headers.has('Content-Length')) {
      // No streaming possible, show indeterminate
      const progress = create(container, {label, indeterminate: true});
      try {
        const text = await response.text();
        progress.complete();
        return text;
      } catch (error) {
        progress.error(error.message, 'Check the file and try again.');
        throw error;
      }
    }
    
    const progress = create(container, {label});
    const total = parseInt(response.headers.get('Content-Length'), 10);
    const reader = response.body.getReader();
    let received = 0;
    const chunks = [];
    
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        progress.update(received, total);
      }
      
      const blob = new Blob(chunks);
      const text = await blob.text();
      progress.complete();
      return text;
    } catch (error) {
      progress.error(error.message, 'Check your connection and try again.');
      throw error;
    }
  }
  
  return { create, track };
});
