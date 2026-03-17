import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
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

  const executeQuery = useCallback(async (customSql) => {
    const targetSql = typeof customSql === 'string' ? customSql : sql;
    if (!targetSql.trim()) return;

    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch('/api/sql/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: targetSql })
      });

      const data = await res.json();

      if (res.ok) {
        setResult(data);
        const newHistory = [
          { sql: targetSql, timestamp: Date.now() }, 
          ...history.filter(h => h.sql !== targetSql)
        ].slice(0, 50);
        setHistory(newHistory);
        localStorage.setItem('sqlHistory', JSON.stringify(newHistory));
      } else {
        setError(data.error || '查询执行出错');
      }
    } catch (err) {
      setError(`网络错误: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [sql, history]);

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      executeQuery();
    }
  };

  const formatSql = () => {
    // 简单的关键词大写格式化
    const keywords = ['select', 'from', 'where', 'and', 'or', 'group by', 'order by', 'limit', 'left join', 'inner join', 'on', 'as', 'insert into', 'values', 'update', 'set', 'delete', 'having', 'in', 'is', 'not', 'null', 'like', 'between'];
    let formatted = sql;
    keywords.forEach(kw => {
      const reg = new RegExp(`\\b${kw}\\b`, 'gi');
      formatted = formatted.replace(reg, kw.toUpperCase());
    });
    setSql(formatted);
    toast.success('已完成基础格式化');
  };

  const clearResults = () => {
    setResult(null);
    setError(null);
  };

  const exportCsv = () => {
    if (!result || !result.rows.length) return;
    
    const headers = result.columns.join(',');
    const rows = result.rows.map(row => 
      result.columns.map(col => {
        let val = row[col] === null ? 'NULL' : String(row[col]);
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    );
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sql_result_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderCellValue = (value) => {
    if (value === null) return <span className="cell-null">NULL</span>;
    if (typeof value === 'number') return <span className="cell-number">{value}</span>;
    if (typeof value === 'boolean') return <span className="cell-boolean">{String(value)}</span>;
    return String(value);
  };

  return (
    <div className="sql-tab-v2">
      <div className="sql-workspace">
        {/* 控制栏 */}
        <header className="sql-toolbar">
          <div className="toolbar-left">
            <h2 className="workspace-title">SQL 工作区</h2>
            {status && (
              <div className={`connection-badge ${status.connected ? 'is-online' : 'is-offline'}`}>
                <span className="badge-dot"></span>
                {status.connected ? `${status.database}@${status.host}` : '未连接'}
              </div>
            )}
          </div>
          <div className="toolbar-actions">
            <button className="action-btn secondary" onClick={formatSql} title="关键词转大写">
              <span>Aa</span> 格式化
            </button>
            <button className="action-btn secondary" onClick={() => setSql('')}>
              清空代码
            </button>
            <div className="divider"></div>
            <button 
              className="action-btn primary" 
              onClick={() => executeQuery()} 
              disabled={loading || !sql.trim()}
            >
              {loading ? (
                <><span className="spinner-small"></span> 执行中...</>
              ) : (
                <><span>▶</span> 运行查询</>
              )}
            </button>
          </div>
        </header>

        {/* 编辑器区域 */}
        <main className="sql-editor-container">
          <div className="editor-gutter">
            {sql.split('\n').map((_, i) => <div key={i} className="line-number">{i + 1}</div>)}
          </div>
          <textarea
            className="sql-textarea"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="在此输入 SQL 语句... (支持 Ctrl + Enter 快捷运行)"
            spellCheck="false"
          />
        </main>

        {/* 结果显示区 */}
        <section className="sql-output-area">
          {!result && !error && !loading && (
            <div className="output-empty">
              <div className="empty-icon">⚡</div>
              <p>准备就绪。编写查询并点击“运行”以查看结果。</p>
              <div className="quick-hints">
                <span>Ctrl + Enter 执行</span>
                <span>支持多行 SQL</span>
                <span>结果自动截断至 1000 行</span>
              </div>
            </div>
          )}

          {loading && !result && (
            <div className="output-loading">
              <div className="loading-spinner"></div>
              <p>正在从数据库检索数据...</p>
            </div>
          )}

          {error && (
            <div className="output-error">
              <div className="error-header">
                <span className="error-icon">⚠️</span>
                <strong>查询执行失败</strong>
              </div>
              <pre className="error-message">{error}</pre>
            </div>
          )}

          {result && (
            <div className="output-result">
              <div className="result-stats">
                <div className="stats-left">
                  <span className="stat-badge success">
                    成功
                  </span>
                  <span className="stat-item">
                    <strong>{result.rowCount}</strong> 行受影响
                  </span>
                  <span className="stat-item">
                    耗时 <strong>{result.executionTime}ms</strong>
                  </span>
                  {result.truncated && (
                    <span className="stat-badge warning">
                      结果已截断
                    </span>
                  )}
                </div>
                <div className="stats-right">
                  <button className="stats-action" onClick={exportCsv}>
                    导出 CSV
                  </button>
                  <button className="stats-action" onClick={clearResults}>
                    关闭结果
                  </button>
                </div>
              </div>
              
              <div className="result-table-container">
                <table className="result-table">
                  <thead>
                    <tr>
                      <th className="row-index">#</th>
                      {result.columns.map(col => <th key={col}>{col}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        <td className="row-index">{i + 1}</td>
                        {result.columns.map(col => (
                          <td key={col} title={String(row[col])}>
                            {renderCellValue(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* 历史记录侧边栏 */}
      <aside className="sql-history-sidebar">
        <div className="history-header">
          <h3>查询历史</h3>
          <span className="history-count">{history.length}</span>
        </div>
        <div className="history-list">
          {history.length === 0 ? (
            <div className="history-empty">暂无记录</div>
          ) : (
            history.map((item, i) => (
              <div 
                key={i} 
                className="history-card" 
                onClick={() => setSql(item.sql)}
                title="点击载入此查询"
              >
                <div className="history-card-sql">{item.sql}</div>
                <div className="history-card-time">
                  {new Date(item.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
