/*
 * Application logic for the Competitive Analysis Generator UI.
 *
 * This file wires together authentication, analysis submission,
 * A/B variant rendering and a simple metrics dashboard.  The front‑end
 * deliberately avoids any build tooling by using vanilla JavaScript
 * and a CDN‑hosted Chart.js.  Tokens and variant assignments are
 * persisted in localStorage so sessions survive page refreshes.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Grab navigation buttons
  const navAnalyze = document.getElementById('nav-analyze');
  const navDashboard = document.getElementById('nav-dashboard');
  const navLogin = document.getElementById('nav-login');
  const navRegister = document.getElementById('nav-register');
  const navLogout = document.getElementById('nav-logout');

  // Grab sections
  const loginSection = document.getElementById('login-section');
  const registerSection = document.getElementById('register-section');
  const analysisSection = document.getElementById('analysis-section');
  const dashboardSection = document.getElementById('dashboard-section');

  // Inputs and buttons for auth
  const loginButton = document.getElementById('login-button');
  const registerButton = document.getElementById('register-button');
  const showRegisterLink = document.getElementById('show-register');
  const showLoginLink = document.getElementById('show-login');

  // Analysis form elements
  const competitorsDiv = document.getElementById('competitors');
  const addCompetitorBtn = document.getElementById('add-competitor');
  const analysisForm = document.getElementById('analysis-form');
  const resultsDiv = document.getElementById('results');
  const analysisInfo = document.getElementById('analysis-info');

  // Dashboard elements
  const metricsSummaryDiv = document.getElementById('metrics-summary');
  const refreshMetricsBtn = document.getElementById('refresh-metrics');
  const metricsChartCanvas = document.getElementById('metrics-chart');
  let metricsChart; // Chart.js instance

  /**
   * Utility to update navigation button active state and show/hide
   * corresponding sections.  Accepts one of 'analyze', 'dashboard',
   * 'login' or 'register'.
   *
   * @param {string} view
   */
  function showView(view) {
    // Reset active classes
    [navAnalyze, navDashboard, navLogin, navRegister].forEach(btn => btn.classList.remove('active'));
    // Hide all sections initially
    loginSection.style.display = 'none';
    registerSection.style.display = 'none';
    analysisSection.style.display = 'none';
    dashboardSection.style.display = 'none';
    // Determine which section to show
    switch (view) {
      case 'analyze':
        navAnalyze.classList.add('active');
        analysisSection.style.display = '';
        break;
      case 'dashboard':
        navDashboard.classList.add('active');
        dashboardSection.style.display = '';
        break;
      case 'login':
        navLogin.classList.add('active');
        loginSection.style.display = '';
        break;
      case 'register':
        navRegister.classList.add('active');
        registerSection.style.display = '';
        break;
    }
  }

  /**
   * Check for an existing auth token and update navigation
   * accordingly.  If logged in, hide login/register buttons and show
   * logout.  If not, do the reverse.  Also hide dashboard nav if
   * logged out (dashboard requires auth).
   */
  function updateAuthUI() {
    const token = localStorage.getItem('auth_token');
    if (token) {
      // Logged in
      navLogin.style.display = 'none';
      navRegister.style.display = 'none';
      navLogout.style.display = '';
      navDashboard.style.display = '';
    } else {
      // Logged out
      navLogin.style.display = '';
      navRegister.style.display = '';
      navLogout.style.display = 'none';
      navDashboard.style.display = 'none';
      // Ensure the dashboard isn't visible when logged out
      if (dashboardSection.style.display !== 'none') {
        showView('analyze');
      }
    }
  }

  /**
   * Create a competitor input block.  Each block contains fields
   * for the competitor name and description.
   */
  function createCompetitorFields() {
    const wrapper = document.createElement('div');
    wrapper.className = 'competitor-input';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Competitor Name';
    const descTextarea = document.createElement('textarea');
    descTextarea.placeholder = 'Description';
    wrapper.appendChild(nameInput);
    wrapper.appendChild(descTextarea);
    return wrapper;
  }

  /**
   * Render SWOT results into the DOM based on the chosen variant.  If
   * variant 'A' then render card layout, else render table layout.
   *
   * @param {Array} results Array of result objects from the server
   * @param {string} variant 'A' or 'B'
   */
  function renderResults(results, variant) {
    // Clear previous output
    resultsDiv.innerHTML = '';
    analysisInfo.textContent = variant ? `Assigned variant: ${variant}` : '';
    if (!results || results.length === 0) return;
    if (variant === 'A') {
      // Card layout
      const container = document.createElement('div');
      container.className = 'results cards';
      results.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        const title = document.createElement('h3');
        title.textContent = item.name;
        card.appendChild(title);
        // For each SWOT category build columns
        const row = document.createElement('div');
        row.className = 'swot-row';
        ['strengths','weaknesses','opportunities','threats'].forEach(key => {
          const col = document.createElement('div');
          col.className = 'swot-col';
          const header = document.createElement('h4');
          header.textContent = key.charAt(0).toUpperCase() + key.slice(1);
          col.appendChild(header);
          const list = document.createElement('ul');
          item.swot[key].forEach(entry => {
            const li = document.createElement('li');
            li.textContent = entry;
            list.appendChild(li);
          });
          col.appendChild(list);
          row.appendChild(col);
        });
        card.appendChild(row);
        container.appendChild(card);
      });
      resultsDiv.appendChild(container);
    } else {
      // Table layout
      const table = document.createElement('table');
      table.className = 'swot-table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      ['Competitor','Strengths','Weaknesses','Opportunities','Threats'].forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      results.forEach(item => {
        const row = document.createElement('tr');
        const nameTd = document.createElement('td');
        nameTd.textContent = item.name;
        row.appendChild(nameTd);
        ['strengths','weaknesses','opportunities','threats'].forEach(key => {
          const td = document.createElement('td');
          const ul = document.createElement('ul');
          item.swot[key].forEach(entry => {
            const li = document.createElement('li');
            li.textContent = entry;
            ul.appendChild(li);
          });
          td.appendChild(ul);
          row.appendChild(td);
        });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      resultsDiv.appendChild(table);
    }
  }

  /**
   * Fetch global and per‑user metrics and update the dashboard.  If
   * logged in, user metrics will include the number of analyses the
   * user has run along with variant distribution.  Regardless of
   * authentication, global metrics (views and conversions) are
   * displayed.
   */
  async function refreshMetrics() {
    metricsSummaryDiv.innerHTML = 'Loading metrics…';
    const token = localStorage.getItem('auth_token');
    try {
      // Fetch global metrics
      const metricsResp = await fetch('/api/metrics');
      const metricsData = await metricsResp.json();
      let userSummary = null;
      if (token) {
        const userResp = await fetch('/api/metrics/user', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (userResp.ok) {
          userSummary = await userResp.json();
        }
      }
      // Build summary text
      const summaryParts = [];
      summaryParts.push(`Global views – Variant A: ${metricsData.variantA}, Variant B: ${metricsData.variantB}`);
      summaryParts.push(`Global conversions – Variant A: ${metricsData.conversionsA}, Variant B: ${metricsData.conversionsB}`);
      if (userSummary) {
        summaryParts.push(`Your analyses run: ${userSummary.analyses}`);
        summaryParts.push(`Your variant assignments – A: ${userSummary.variantA}, B: ${userSummary.variantB}`);
        summaryParts.push(`Global conversions (for reference) – A: ${userSummary.conversionsA}, B: ${userSummary.conversionsB}`);
      }
      metricsSummaryDiv.innerHTML = '';
      summaryParts.forEach(text => {
        const p = document.createElement('p');
        p.textContent = text;
        metricsSummaryDiv.appendChild(p);
      });
      // Prepare data for Chart.js.  We'll always show two bars for
      // variant views and two for conversions.  If user data is
      // available, include a separate series for the user's variant
      // distribution.
      const labels = ['Views A','Views B','Conversions A','Conversions B'];
      const datasets = [];
      datasets.push({
        label: 'Global',
        data: [metricsData.variantA, metricsData.variantB, metricsData.conversionsA, metricsData.conversionsB],
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      });
      if (userSummary) {
        datasets.push({
          label: 'You',
          data: [userSummary.variantA, userSummary.variantB, userSummary.conversionsA, userSummary.conversionsB],
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1
        });
      }
      // Destroy existing chart if present to avoid duplicates
      if (metricsChart) {
        metricsChart.destroy();
      }
      metricsChart = new Chart(metricsChartCanvas.getContext('2d'), {
        type: 'bar',
        data: { labels, datasets },
        options: {
          responsive: true,
          scales: {
            x: { title: { display: true, text: 'Metric' } },
            y: { beginAtZero: true, title: { display: true, text: 'Count' } }
          }
        }
      });
    } catch (err) {
      console.error('Metrics fetch error', err);
      metricsSummaryDiv.textContent = 'Failed to load metrics.';
    }
  }

  /**
   * Submit the competitor data to the appropriate endpoint.  If
   * authenticated, call the persistent /api/analysis endpoint; if
   * anonymous, fall back to /api/generate.  Persist the returned
   * variant in localStorage to maintain consistency for this user.
   *
   * @param {Array<{name:string, description:string}>} comps
   */
  async function submitAnalysis(comps) {
    const token = localStorage.getItem('auth_token');
    const payload = { competitors: comps };
    let endpoint = '/api/generate';
    const fetchOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    };
    if (token) {
      endpoint = '/api/analysis';
      fetchOptions.headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(endpoint, fetchOptions);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
  }

  // Navigation event handlers
  navAnalyze.addEventListener('click', () => showView('analyze'));
  navDashboard.addEventListener('click', () => {
    showView('dashboard');
    refreshMetrics();
  });
  navLogin.addEventListener('click', () => showView('login'));
  navRegister.addEventListener('click', () => showView('register'));
  navLogout.addEventListener('click', () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('swot_variant');
    updateAuthUI();
    showView('analyze');
  });

  // Toggle between login/register via links
  showRegisterLink.addEventListener('click', () => showView('register'));
  showLoginLink.addEventListener('click', () => showView('login'));

  // Register handler
  registerButton.addEventListener('click', async () => {
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    if (!username || !password) {
      alert('Please provide a username and password.');
      return;
    }
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('auth_token', data.token);
        updateAuthUI();
        showView('analyze');
        alert('Registration successful! You are now logged in.');
      } else {
        alert(data.error || 'Registration failed');
      }
    } catch (err) {
      console.error(err);
      alert('Registration error.');
    }
  });

  // Login handler
  loginButton.addEventListener('click', async () => {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    if (!username || !password) {
      alert('Please provide a username and password.');
      return;
    }
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('auth_token', data.token);
        updateAuthUI();
        showView('analyze');
        alert('Login successful!');
      } else {
        alert(data.error || 'Login failed');
      }
    } catch (err) {
      console.error(err);
      alert('Login error.');
    }
  });

  // Analysis form: add competitor fields
  addCompetitorBtn.addEventListener('click', () => {
    competitorsDiv.appendChild(createCompetitorFields());
  });
  // Add one competitor field on initial load
  competitorsDiv.appendChild(createCompetitorFields());

  // Analysis form submit handler
  analysisForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    // Gather competitor data
    const blocks = Array.from(competitorsDiv.getElementsByClassName('competitor-input'));
    const comps = blocks.map(block => {
      const inputs = block.querySelectorAll('input, textarea');
      const name = inputs[0].value.trim();
      const desc = inputs[1].value.trim();
      return { name, description: desc };
    }).filter(c => c.name || c.description);
    if (comps.length === 0) {
      alert('Please add at least one competitor and description.');
      return;
    }
    try {
      const data = await submitAnalysis(comps);
      // Determine variant.  Use stored value if present to keep consistent.
      let variant = localStorage.getItem('swot_variant');
      if (!variant) {
        variant = data.variant;
        localStorage.setItem('swot_variant', variant);
      }
      // The API returns either { variant, results } (for generate) or the full analysis object with variant and results.
      const results = data.results || (Array.isArray(data.competitors) ? data.competitors : []);
      renderResults(results, variant);
    } catch (err) {
      console.error(err);
      alert('An error occurred while generating your analysis.');
    }
  });

  // Refresh metrics button
  refreshMetricsBtn.addEventListener('click', refreshMetrics);

  // Initialise UI based on auth state
  updateAuthUI();
  showView('analyze');
});