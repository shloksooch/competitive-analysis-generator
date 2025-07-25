const { useState, useEffect, useRef } = React;

/**
 * Main React application component for the Competitive Analysis Generator.
 *
 * This component manages competitor input, generation of SWOT analyses,
 * A/B testing variant assignment, and a simple internal dashboard.  It
 * uses Chart.js to visualize view and conversion metrics on the
 * dashboard.  The front‑end communicates with the Node.js backend
 * through fetch calls to the `/api` endpoints.
 */
function App() {
  // Authentication token stored in localStorage.  If no token is
  // present, the user is considered logged out.  We also track
  // username/password fields for the login/register forms.
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [authView, setAuthView] = useState(token ? 'app' : 'login'); // 'login', 'register', or 'app'
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  // State for competitor input fields
  const [competitors, setCompetitors] = useState([{ name: '', description: '' }]);
  // Results returned from the server: array of { name, swot }
  const [results, setResults] = useState(null);
  // Assigned variant ('A' or 'B') returned by the server
  const [variant, setVariant] = useState(null);
  // Metrics returned from /api/metrics (global) or /api/metrics/user when logged in
  const [metrics, setMetrics] = useState(null);
  // Current view within authenticated app: 'analysis', 'dashboard', or 'list'
  const [view, setView] = useState('analysis');
  // Reference to the canvas element used by Chart.js
  const chartRef = useRef(null);
  // Holds the Chart.js instance
  const chartInstanceRef = useRef(null);

  /**
   * Add a new empty competitor row.
   */
  const addCompetitor = () => {
    setCompetitors([...competitors, { name: '', description: '' }]);
  };

  /**
   * Update a competitor field.
   */
  const handleCompetitorChange = (index, field, value) => {
    const updated = competitors.map((comp, i) => {
      if (i === index) {
        return { ...comp, [field]: value };
      }
      return comp;
    });
    setCompetitors(updated);
  };

  /**
   * Call the backend to generate SWOT analyses for the current list
   * of competitors.  Updates `variant`, `results` and refreshes
   * metrics.
   */
  const generateAnalysis = async () => {
    try {
      // When logged in call /api/analysis; otherwise use the anonymous
      // /api/generate endpoint for backwards compatibility
      const endpoint = token ? '/api/analysis' : '/api/generate';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ competitors })
      });
      const data = await response.json();
      // Support both anonymous (/api/generate) and authenticated (/api/analysis)
      setVariant(data.variant);
      setResults(data.results || data.results);
      // Refresh metrics to reflect the new view count
      fetchMetrics();
    } catch (err) {
      console.error('Error generating analysis:', err);
    }
  };

  /**
   * Fetch the current metrics from the backend and update state.
   */
  const fetchMetrics = async () => {
    try {
      let endpoint = '/api/metrics';
      const headers = {};
      if (token) {
        endpoint = '/api/metrics/user';
        headers['Authorization'] = 'Bearer ' + token;
      }
      const response = await fetch(endpoint, { headers });
      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      console.error('Error fetching metrics:', err);
    }
  };

  /**
   * Render the SWOT analysis results in variant‑specific layouts.
   */
  const renderResults = () => {
    if (!results) return null;
    // Card layout (Variant A)
    if (variant === 'A') {
      return (
        <div className="results cards">
          {results.map((item, idx) => (
            <div key={idx} className="card">
              <h3>{item.name}</h3>
              <div className="swot-row">
                <div className="swot-col">
                  <strong>Strengths</strong>
                  <ul>{item.swot.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
                <div className="swot-col">
                  <strong>Weaknesses</strong>
                  <ul>{item.swot.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              </div>
              <div className="swot-row">
                <div className="swot-col">
                  <strong>Opportunities</strong>
                  <ul>{item.swot.opportunities.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
                <div className="swot-col">
                  <strong>Threats</strong>
                  <ul>{item.swot.threats.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }
    // Table layout (Variant B)
    return (
      <table className="swot-table">
        <thead>
          <tr>
            <th>Competitor</th>
            <th>Strengths</th>
            <th>Weaknesses</th>
            <th>Opportunities</th>
            <th>Threats</th>
          </tr>
        </thead>
        <tbody>
          {results.map((item, idx) => (
            <tr key={idx}>
              <td>{item.name}</td>
              <td><ul>{item.swot.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></td>
              <td><ul>{item.swot.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul></td>
              <td><ul>{item.swot.opportunities.map((s, i) => <li key={i}>{s}</li>)}</ul></td>
              <td><ul>{item.swot.threats.map((s, i) => <li key={i}>{s}</li>)}</ul></td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  /**
   * Render the dashboard view showing metrics and a bar chart.  The
   * chart is created with Chart.js.  Whenever metrics change, we
   * re‑initialise the chart instance.
   */
  const renderDashboard = () => {
    if (!metrics) return <p>Loading metrics…</p>;
    // Use a ref to store the Chart instance so we can destroy it
    useEffect(() => {
      if (!chartRef.current) return;
      // Destroy existing chart before creating a new one
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
      const ctx = chartRef.current.getContext('2d');
      chartInstanceRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Variant A', 'Variant B'],
          datasets: [
            {
              label: 'Views',
              data: [metrics.variantA, metrics.variantB],
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1
            },
            {
              label: 'Conversions',
              data: [metrics.conversionsA, metrics.conversionsB],
              backgroundColor: 'rgba(255, 99, 132, 0.5)',
              borderColor: 'rgba(255, 99, 132, 1)',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            title: {
              display: true,
              text: 'A/B Test Performance'
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Count'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Variant'
              }
            }
          }
        }
      });
    }, [metrics]);
    return (
      <div className="dashboard">
        <h2>Dashboard</h2>
        <div className="metrics-summary">
          <p><strong>Views A:</strong> {metrics.variantA}</p>
          <p><strong>Views B:</strong> {metrics.variantB}</p>
          <p><strong>Conversions A:</strong> {metrics.conversionsA}</p>
          <p><strong>Conversions B:</strong> {metrics.conversionsB}</p>
        </div>
        <canvas ref={chartRef} width="400" height="300"></canvas>
        <button onClick={fetchMetrics}>Refresh</button>
      </div>
    );
  };

  /**
   * Authentication handlers
   */
  const handleRegister = async () => {
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setAuthView('app');
        setAuthUsername('');
        setAuthPassword('');
      } else {
        alert(data.error || 'Registration failed');
      }
    } catch (err) {
      console.error('Registration error:', err);
    }
  };

  const handleLogin = async () => {
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setAuthView('app');
        setAuthUsername('');
        setAuthPassword('');
        fetchMetrics();
      } else {
        alert(data.error || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setAuthView('login');
    setResults(null);
    setMetrics(null);
  };

  return (
    <div className="container">
      <header>
        <h1>Competitive Analysis Generator</h1>
      </header>
      {/* If not authenticated, show login/register forms */}
      {authView !== 'app' ? (
        <div className="auth-section">
          <h2>{authView === 'login' ? 'Log In' : 'Register'}</h2>
          <input
            type="text"
            placeholder="Username"
            value={authUsername}
            onChange={e => setAuthUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={authPassword}
            onChange={e => setAuthPassword(e.target.value)}
          />
          {authView === 'login' ? (
            <>
              <button onClick={handleLogin}>Log In</button>
              <p>
                No account?{' '}
                <a href="#" onClick={e => { e.preventDefault(); setAuthView('register'); }}>Register</a>
              </p>
            </>
          ) : (
            <>
              <button onClick={handleRegister}>Register</button>
              <p>
                Already have an account?{' '}
                <a href="#" onClick={e => { e.preventDefault(); setAuthView('login'); }}>Log In</a>
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <nav>
            <button onClick={() => setView('analysis')} className={view === 'analysis' ? 'active' : ''}>Analysis</button>
            <button onClick={() => { fetchMetrics(); setView('dashboard'); }} className={view === 'dashboard' ? 'active' : ''}>Dashboard</button>
            <button onClick={handleLogout}>Log Out</button>
          </nav>
          {view === 'analysis' && (
            <div className="form-section">
              {competitors.map((comp, idx) => (
                <div key={idx} className="competitor-input">
                  <input
                    type="text"
                    placeholder="Competitor Name"
                    value={comp.name}
                    onChange={e => handleCompetitorChange(idx, 'name', e.target.value)}
                  />
                  <textarea
                    placeholder="Competitor Description"
                    value={comp.description}
                    onChange={e => handleCompetitorChange(idx, 'description', e.target.value)}
                  />
                </div>
              ))}
              <button onClick={addCompetitor}>Add Competitor</button>
              <button onClick={generateAnalysis}>Generate Analysis</button>
              {variant && <p className="variant-info">Assigned Variant: <strong>{variant}</strong></p>}
              {renderResults()}
            </div>
          )}
          {view === 'dashboard' && renderDashboard()}
        </>
      )}
    </div>
  );
}

// Mount the React app into the root div
ReactDOM.render(<App />, document.getElementById('root'));