# Competitive Analysis Generator SaaS

This project is a starter implementation of a competitive analysis generator built as a web service.  It allows product managers and founders to create SWOT analyses for a set of competitors, automatically assigns users to one of two UI variants (A/B testing), collects simple metrics, and provides endpoints that can be integrated into external websites to track conversions.

## Features

- **SWOT Analysis Generation:**
  - Accepts a list of competitors (name and description) via a JSON API or the built‑in web form.
  - Uses heuristic keyword matching to extract strengths and weaknesses from each description.
  - Generates generic opportunities and threats to complete the SWOT analysis.

- **A/B Testing:**
  - When an analysis is generated, users are randomly assigned to Variant A (card‑based layout) or Variant B (table layout).
  - View counts for each variant are recorded in `metrics.json`.

- **Metrics & Conversion Tracking:**
  - `GET /api/metrics` returns aggregated view and conversion counts for each variant.
  - `GET /api/variant` returns a variant assignment without running the analysis.  This endpoint is intended for embedding on external sites to determine which variant a user should see.
  - `POST /api/convert` records a conversion event (e.g., a sign‑up or purchase) for a given variant.

- **Client‑Side Integration Script:**
  - `integration.js` demonstrates how a third‑party site can request a variant and report conversions.  Site owners can include it on their page and call `recordConversion()` when appropriate.

- **Dashboard Placeholder:**
  - Future iterations can add an authenticated dashboard showing charts of variant performance, competitor trends, etc.

## Getting Started

1. **Install Node.js** (version 18 or later is recommended).

2. **Clone the repository** and install dependencies (there are none besides Node’s built‑in modules):

   ```bash
   git clone https://github.com/your‑username/competitive‑analysis‑generator.git
   cd competitive‑analysis‑generator
   npm install   # not strictly necessary; no external deps
   ```

3. **Run the server:**

   ```bash
   node server.js
   ```

   The server defaults to `http://localhost:3000`.  Open this URL in your browser to use the web form.

4. **API usage:**

   - `POST /api/generate` – send `{ competitors: [ { name, description }, ... ] }` and receive `{ variant, results }`.
   - `GET /api/metrics` – returns the current counters.
   - `GET /api/variant` – returns `{ variant }` and increments the view counter.
   - `POST /api/convert` – send `{ variant: 'A' | 'B' }` to record a conversion.

5. **Embed the integration script:**

   Copy `integration.js` to your website and set `SERVER_URL` to the deployed service.  Include it in your HTML, and call `recordConversion()` when a conversion happens.

## Roadmap / Next Steps

This repository provides a functional prototype.  To evolve it into a high‑quality SaaS product ready for market, consider the following steps:

1. **Modern Front‑End Framework:**  Replace the vanilla JS front‑end with a React or Vue application for improved maintainability and a richer UI/UX.  Use a component library like Material‑UI or Tailwind for polished visuals.

2. **Robust Back‑End Framework:**  Swap out the bare‑bones Node HTTP server for Express.js or FastAPI.  These frameworks provide routing, middleware, request validation, CORS handling and more out of the box.

3. **Persistent Database:**  Store analyses, users, and metrics in a proper database (e.g., PostgreSQL, MongoDB).  This will allow you to support user accounts, historical analysis retrieval, and more sophisticated analytics.

4. **Authentication & Accounts:**  Implement user registration and login so that customers can save analyses and access dashboards securely.  Consider using OAuth for social sign‑in options.

5. **Detailed Metrics & Analytics:**  Expand the metrics system to include per‑project dashboards with visualizations (charts/graphs) showing variant performance, competitor rankings over time, and custom KPIs.  Tools like Chart.js or D3.js can help.

6. **Deployment & Scaling:**  Prepare the service for deployment (Dockerfile, CI/CD) and host on a cloud provider (AWS, Azure, Heroku, Vercel).  Configure HTTPS, domain names and environment variables for the server URL used by `integration.js`.

7. **AI‑Powered Insights:**  Replace the heuristic SWOT analysis with a machine‑learning model or integrate with a language model API to generate more nuanced insights.  Fine‑tune prompts for your domain.

8. **Integrations & API Keys:**  Allow customers to generate API keys for programmatic use.  Build plugins or integrations for popular analytics platforms (Google Analytics, Segment) to correlate A/B test results with other events.

9. **Testing & Quality Assurance:**  Add unit tests and end‑to‑end tests.  Use tools like Jest, Mocha or Cypress to ensure reliability as the codebase grows.

10. **Documentation & Onboarding:**  Provide comprehensive documentation and onboarding tutorials.  Offer sample code snippets and templates so customers can get value quickly.

By following this roadmap and iteratively adding features, you can transform this prototype into a production‑ready SaaS product.