/**
 * Core RTL (Right-to-Left) CSS management module.
 * Provides per-bundle RTL CSS loading and switching capabilities.
 *
 * This module is exposed globally and accessed by webpack bundles to enable
 * dynamic RTL/LTR CSS switching without page reloads.
 */

import { languageDirection, languageDirections } from 'kolibri/utils/i18n';

class RTLManager {
  constructor() {
    // Map of bundleId -> RTL state (boolean)
    this.bundleStates = new Map();
  }

  /**
   * Register a webpack bundle for RTL management.
   * Called by webpack runtime code injected into each bundle.
   *
   * @param {string} bundleId - The webpack bundle identifier (compilation.name)
   * @returns {Object} Bundle-scoped API with miniCssF method for URL transformation
   */
  registerBundle(bundleId) {
    if (!this.bundleStates.has(bundleId)) {
      // Initialize bundle state based on current global language direction
      const isRtl = languageDirection === languageDirections.RTL;
      this.bundleStates.set(bundleId, isRtl);
    }

    return {
      /**
       * Transform CSS URL based on current RTL state.
       * Called by webpack's miniCssF hook to transform chunk URLs.
       *
       * @param {string} originalPath - Original CSS file path
       * @returns {string} Transformed path (.rtl.css if RTL enabled)
       */
      miniCssF: (originalPath) => {
        if (!originalPath) return originalPath;
        return this.bundleStates.get(bundleId)
          ? originalPath.replace(/\.css($|\?)/, '.rtl.css$1')
          : originalPath;
      },
    };
  }

  /**
   * Enable RTL mode for a bundle.
   * @param {string} bundleId - Bundle identifier
   * @returns {Promise<void>}
   */
  async enableRTL(bundleId) {
    if (this.bundleStates.get(bundleId)) return;
    this.bundleStates.set(bundleId, true);
    await this.reloadBundleCSS(bundleId);
  }

  /**
   * Disable RTL mode for a bundle.
   * @param {string} bundleId - Bundle identifier
   * @returns {Promise<void>}
   */
  async disableRTL(bundleId) {
    if (!this.bundleStates.get(bundleId)) return;
    this.bundleStates.set(bundleId, false);
    await this.reloadBundleCSS(bundleId);
  }

  /**
   * Reload all CSS for a bundle with the current direction.
   * Finds all link elements, creates new ones with correct direction,
   * waits for them to load, then removes old ones.
   *
   * @param {string} bundleId - Bundle identifier
   * @returns {Promise<void>}
   * @throws {Error} If CSS file fails to load
   */
  async reloadBundleCSS(bundleId) {
    const bundleLinks = document.querySelectorAll(
      `link[rel="stylesheet"][data-webpack-bundle="${bundleId}"]`
    );

    for (const link of bundleLinks) {
      const href = link.href;
      const isRTL = href.includes('.rtl.css');
      const shouldBeRTL = this.bundleStates.get(bundleId);

      // Only reload if direction needs to change
      if (isRTL !== shouldBeRTL) {
        const newHref = shouldBeRTL
          ? href.replace(/\.css($|\?)/, '.rtl.css$1')
          : href.replace(/\.rtl\.css($|\?)/, '.css$1');

        const newLink = document.createElement('link');
        newLink.rel = 'stylesheet';
        newLink.href = newHref;
        newLink.setAttribute('data-webpack-bundle', bundleId);

        // Insert new link before removing old one to prevent FOUC
        link.parentNode.insertBefore(newLink, link.nextSibling);

        await new Promise((resolve, reject) => {
          // Handle load errors - keep old CSS if new one fails
          newLink.onerror = () => {
            newLink.remove();
            reject(new Error(`Failed to load ${newHref}`));
          };

          // Use double requestAnimationFrame to ensure CSS is applied
          // This is more reliable than onload for CSS link elements
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              link.remove();
              resolve();
            });
          });
        });
      }
    }
  }
}

// Export singleton instance
export const rtlManager = new RTLManager();
