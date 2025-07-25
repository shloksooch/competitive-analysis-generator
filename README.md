# Competitive Analysis Generator SaaS

This project is an evolving competitive analysis generator built as a web service.  Beyond generating SWOT analyses for a list of competitors, it now supports user accounts, stores analyses for later retrieval, includes a built‑in dashboard for visualising A/B test metrics, and exposes endpoints for embedding on external sites to track conversions.  It still uses heuristic keyword matching but is structured so that more sophisticated AI models can be plugged in later.

## Features

- **User Accounts & Authentication:**  
  Users can register and log in with a username and password.  Passwords are salted and hashed on the server, and sessions are tracked via simple tokens stored on the client.  Authenticated users can save their analyses, view their history and access metrics specific to their account.

- **SWOT Analysis Generation:**  
  Accepts a list of competitors (name and description) via a JSON API or the built‑in web form.  Uses heuristic keyword matching to extract strengths and weaknesses, and generates generic opportunities and threats.  Each analysis is stored with the user’s ID and timestamp.

- **A/B Testing:**  
  When an analysis is generated, users are randomly assigned to one of two interface variants: Variant A (card‑based layout) or Variant B (table layout).  View and conversion counts for each variant are tracked to support A/B testing experiments.

- **Metrics & Dashboard:**  
  Global metrics are available at `/api/metrics`, while authenticated users can retrieve their own summary via `/api/metrics/user`.  The built‑in dashboard (implemented with React and Chart.js) visualizes views and conversions for each variant in a bar chart.

- **Analysis Management:**  
  Authenticated endpoints allow users to list, retrieve and delete their analyses (`GET /api/analysis/list`, `GET /api/analysis/:id`, `DELETE /api/analysis/:id`).  The analysis creation endpoint (`POST /api/analysis`) persists results and returns the assigned variant.

- **Client‑Side Integration:**  
  A script served at `/integration.js` can be embedded on third‑party sites.  It fetches a variant assignment and exposes a global `recordConversion()` function.  Calling this function reports a conversion back to the server.

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

   - `POST /api/register` – Create a new user account.  Send `{ username, password }` and receive `{ message, token }` on success.  The returned token should be stored on the client (e.g. in `localStorage`) and sent in the `Authorization` header as `Bearer <token>` for subsequent authenticated requests.

   - `POST /api/login` – Log in an existing user.  Send `{ username, password }` and receive `{ token }` if credentials are correct.

   - `POST /api/analysis` – Authenticated endpoint to generate a SWOT analysis.  Send `{ competitors: [ { name, description }, ... ] }` and receive the created analysis object `{ id, userId, timestamp, competitors, results, variant }`.

   - `GET /api/analysis/list` – Authenticated endpoint that returns an array of the user’s saved analyses.

   - `GET /api/analysis/:id` – Authenticated endpoint that returns a specific analysis object.

   - `DELETE /api/analysis/:id` – Authenticated endpoint to delete an analysis.

   - `GET /api/metrics` – Returns global view and conversion counts for each variant.

   - `GET /api/metrics/user` – Authenticated endpoint that returns a summary of the user’s analyses and variant distribution along with global conversions.

   - `GET /api/variant` – Returns `{ variant }` and increments the global view counter.  Used by the integration script or other external contexts where you need a variant assignment.

   - `POST /api/convert` – Send `{ variant: 'A' | 'B' }` to record a conversion for the given variant.

   The legacy `POST /api/generate` endpoint is still available for anonymous usage and returns `{ variant, results }` but does not save the analysis.

5. **Embed the integration script:**

   Include the script served from your SaaS instance by adding the following tag to your page:

   ```html
   <script src="https://your-domain.com/integration.js"></script>
   ```

   The script will automatically fetch a variant assignment and store it as a `data-variant` attribute on the `<body>` element.  To record a conversion event (e.g. when a user signs up or completes a purchase), call:

   ```javascript
   window.recordConversion();
   ```

   The script assumes it is served from the same domain as your SaaS backend.  If your deployment is on a different domain, set the environment variable `SERVER_URL` when running the server to configure the correct URL in the integration script.

## Roadmap / Next Steps

This repository now includes authentication and a React‑based dashboard, but there are still many steps required to deliver a fully fledged SaaS platform.  Consider the following next steps:

1. **Polished Front‑End Experience:**  Continue iterating on the React front‑end to improve usability.  Introduce routing (e.g., React Router) to handle multiple pages, add form validation, and use a UI framework like Material‑UI or Tailwind for a consistent visual language.

2. **Robust Back‑End Framework:**  Migrate the server to Express.js or FastAPI.  Frameworks provide middleware for authentication, logging, rate limiting and request validation, enabling you to scale and secure the API.

3. **Persistent Database:**  Replace the JSON file storage with a database such as PostgreSQL, MySQL or MongoDB.  Use an ORM (Sequelize, TypeORM, Mongoose) to define models for users, analyses and metrics.  A relational database will allow you to join data across tables and build advanced reporting queries.

4. **Enhanced Authentication & Accounts:**  While this version includes basic session tokens, upgrade to JWTs for stateless authentication or integrate with OAuth providers (Google, GitHub, etc.).  Implement password reset flows and multi‑factor authentication for enhanced security.

5. **Detailed Metrics & Analytics:**  Expand the metrics system to include per‑project dashboards with visualizations (charts/graphs) showing variant performance, competitor rankings over time, and custom KPIs.  Integrate with third‑party analytics platforms (Google Analytics, Mixpanel) to correlate A/B test results with real business outcomes.

6. **Deployment & Scaling:**  Prepare the service for deployment (Dockerfile, CI/CD) and host on a cloud provider (AWS, Azure, Heroku, Vercel).  Configure HTTPS, domain names and environment variables for the server URL used by `integration.js`.  Use container orchestration and auto‑scaling to handle traffic spikes.

7. **AI‑Powered Insights:**  Replace the heuristic SWOT analysis with a machine‑learning model or integrate with a language model API to generate more nuanced insights.  Fine‑tune prompts for your domain.

8. **Integrations & API Keys:**  Allow customers to generate API keys for programmatic use.  Build plugins or integrations for popular analytics platforms (Google Analytics, Segment) to correlate A/B test results with other events.

9. **Testing & Quality Assurance:**  Add unit tests and end‑to‑end tests.  Use tools like Jest, Mocha or Cypress to ensure reliability as the codebase grows.

10. **Documentation & Onboarding:**  Provide comprehensive documentation and onboarding tutorials.  Offer sample code snippets and templates so customers can get value quickly.

By following this roadmap and iteratively adding features, you can transform this prototype into a production‑ready SaaS product.