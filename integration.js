/*
 * Client‑side integration script for the Competitive Analysis Generator SaaS.
 *
 * This script can be embedded on a customer’s website to enable A/B
 * testing and conversion tracking against the competitive analysis
 * service.  It performs the following:
 *   1. Fetches a variant assignment from the SaaS backend via
 *      GET /api/variant.
 *   2. Sets a data attribute on the <body> element to allow
 *      CSS/JS to style or modify the page differently for
 *      variants A and B.
 *   3. Exposes a global function `recordConversion()` that can be
 *      called when the user performs a conversion action (e.g., clicks
 *      a “Sign Up” button) to record the conversion via
 *      POST /api/convert.
 *
 * To use this script:
 *   1. Replace SERVER_URL with the full URL of your SaaS instance
 *      (e.g., https://yourdomain.com).
 *   2. Include it in your page:
 *        <script src="/path/to/integration.js"></script>
 *   3. In your conversion handler, call:
 *        recordConversion();
 */

(() => {
  // TODO: replace with your deployed server’s base URL.  When testing
  // locally, you might use "http://localhost:3000".
  const SERVER_URL = '';

  function fetchVariant() {
    return fetch(`${SERVER_URL}/api/variant`).then(res => res.json());
  }

  function sendConversion(variant) {
    return fetch(`${SERVER_URL}/api/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant })
    });
  }

  fetchVariant().then(data => {
    const variant = data.variant;
    if (!variant) return;
    // Mark the body with the assigned variant so CSS/JS can respond
    document.body.setAttribute('data-variant', variant);
    // Expose a global conversion function bound to the variant
    window.recordConversion = () => {
      sendConversion(variant);
    };
  });
})();