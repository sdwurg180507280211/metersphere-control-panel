import { useState, useEffect } from 'react';
import '../styles/SqlTab.css';

export default function SqlTab() {
  const [sql, setSql] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sqlHistory') || '[]');
    } catch {
      return [];
    }
  });
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/sql/status');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      setStatus({ connected: false, error: err.message });
    }
  };

  const executeQuery = async () => {
    if (!sql.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/sql/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql })
      });

      const data = await res.json();

      if (res.ok) {
        setResult(data);
        const newHistory = [{ sql, timestamp: Date.now() }, ...history].slice(0, 20);
        setHistory(newHistory);
        localStorage.setItem('sqlHistory', JSON.stringify(newHistory));
      } else {
        setError(data.error || '查询失败');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      executeQuery();
    }
  };

  return (
    <div className="sql-tab">
      <div className="sql-header">
        <h2>SQL 查询</h2>
        {status && (
          <div className={`sql-status ${status.connected ? 'connected' : 'disconnected'}`}>
            {status.connected ? `✓ ${status.database}@${status.host}` : `✗ ${status.error}`}
          </div>
        )}
      </div>

      <div className="sql-input-section">
        <textarea
          className="sql-input"
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入 SQL 查询... (Ctrl/Cmd + Enter 执行)"
          rows={8}
        />
        <button
          className="sql-execute-btn"
          onClick={executeQuery}
          disabled={loading || !sql.trim()}
        >
          {loading ? '执行中...' : '执行查询'}
        </button>
      </div>

      {error && <div className="sql-error">{error}</div>}

      {result && (
        <div className="sql-result">
          <div className="sql-meta">
            查询返回 {result.rowCount} 行，耗时 {result.executionTime}ms
            {result.truncated && ` (已截断至 ${result.rows.length} 行)`}
          </div>
          <div className="sql-table-wrapper">
            <table className="sql-table">
              <thead>
                <tr>
                  {result.columns.map(col => <th key={col}>{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i}>
                    {result.columns.map(col => (
                      <td key={col}>{row[col] === null ? 'NULL' : String(row[col])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="sql-history">
          <h3>查询历史</h3>
          <div className="sql-history-list">
            {history.slice(0, 10).map((item, i) => (
              <div
                key={i}
                className="sql-history-item"
                onClick={() => setSql(item.sql)}
              >
                <code>{item.sql}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
