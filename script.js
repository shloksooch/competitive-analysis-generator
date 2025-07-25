/*
 * Front‑end logic for the Competitive Analysis Generator.
 *
 * This script performs the following:
 *   - Dynamically adds/removes competitor input fields.
 *   - Submits competitor data to the backend via the /api/generate endpoint
 *     using Fetch and processes the response containing the SWOT analysis
 *     and assigned A/B variant.
 *   - Persists the assigned variant in localStorage so subsequent
 *     submissions from the same user use the same layout.
 *   - Renders the results in either a card (Variant A) or table
 *     (Variant B) format.
 */

// Wait for DOM to be fully loaded before attaching listeners
document.addEventListener('DOMContentLoaded', () => {
  const competitorsDiv = document.getElementById('competitors');
  const addBtn = document.getElementById('add-competitor');
  const form = document.getElementById('analysis-form');
  const resultsDiv = document.getElementById('results');

  // Function to create a competitor input block
  function createCompetitorFields() {
    const wrapper = document.createElement('div');
    wrapper.className = 'competitor';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Competitor Name:';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.name = 'name[]';
    nameInput.required = true;
    nameLabel.appendChild(nameInput);
    const descLabel = document.createElement('label');
    descLabel.textContent = 'Description:';
    const descTextarea = document.createElement('textarea');
    descTextarea.name = 'description[]';
    descTextarea.rows = 4;
    descTextarea.required = true;
    descLabel.appendChild(descTextarea);
    wrapper.appendChild(nameLabel);
    wrapper.appendChild(descLabel);
    return wrapper;
  }

  // Add initial competitor field on page load
  competitorsDiv.appendChild(createCompetitorFields());

  // Add competitor field when clicking the plus button
  addBtn.addEventListener('click', () => {
    competitorsDiv.appendChild(createCompetitorFields());
  });

  // Handle form submission
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    resultsDiv.innerHTML = '';

    // Gather competitor data into an array
    const names = Array.from(document.getElementsByName('name[]'));
    const descriptions = Array.from(document.getElementsByName('description[]'));
    const competitors = names.map((input, idx) => {
      return { name: input.value.trim(), description: descriptions[idx].value.trim() };
    }).filter(c => c.name || c.description);

    if (competitors.length === 0) {
      alert('Please provide at least one competitor with a description.');
      return;
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitors })
      });
      if (!response.ok) throw new Error('Network error');
      const data = await response.json();
      // Determine variant: if we've stored one, use it; otherwise use the server's assignment
      let variant = localStorage.getItem('swot_variant');
      if (!variant) {
        variant = data.variant;
        localStorage.setItem('swot_variant', variant);
      }
      renderResults(data.results, variant);
    } catch (err) {
      console.error(err);
      alert('There was an error generating the analysis.');
    }
  });

  /**
   * Render the results in the DOM according to the assigned variant.
   * @param {Array} results  The array of result objects from the server.
   * @param {string} variant 'A' or 'B'
   */
  function renderResults(results, variant) {
    resultsDiv.innerHTML = '';
    const heading = document.createElement('h2');
    heading.textContent = `Results (Variant ${variant})`;
    resultsDiv.appendChild(heading);
    if (variant === 'A') {
      // Card layout for each competitor
      results.forEach(item => {
        const card = document.createElement('div');
        card.className = 'result-card';
        const title = document.createElement('h3');
        title.textContent = item.name;
        card.appendChild(title);
        const grid = document.createElement('div');
        grid.className = 'swot-grid';
        ['strengths','weaknesses','opportunities','threats'].forEach(key => {
          const block = document.createElement('div');
          block.className = 'swot-item';
          const h4 = document.createElement('h4');
          h4.textContent = key.charAt(0).toUpperCase() + key.slice(1);
          block.appendChild(h4);
          const ul = document.createElement('ul');
          item.swot[key].forEach(str => {
            const li = document.createElement('li');
            li.textContent = str;
            ul.appendChild(li);
          });
          block.appendChild(ul);
          grid.appendChild(block);
        });
        card.appendChild(grid);
        resultsDiv.appendChild(card);
      });
    } else {
      // Table layout for all competitors
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
        // Name cell
        const nameTd = document.createElement('td');
        nameTd.textContent = item.name;
        row.appendChild(nameTd);
        // SWOT cells
        ['strengths','weaknesses','opportunities','threats'].forEach(key => {
          const td = document.createElement('td');
          const ul = document.createElement('ul');
          item.swot[key].forEach(str => {
            const li = document.createElement('li');
            li.textContent = str;
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
});