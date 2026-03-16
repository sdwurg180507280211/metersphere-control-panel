# SQL 查询面板可行性分析

## 功能概述

在控制面板中集成 SQL 查询功能，允许开发者在 Web 界面直接执行 SQL 查询并查看结果，提升开发调试效率。

## 核心需求

- 在控制面板添加"SQL 查询"Tab 页面
- 提供 SQL 输入框，支持多行输入
- 执行 SELECT 查询并返回结果集
- 以表格形式展示查询结果
- 支持查询历史记录

## 可行性分析

### 技术可行性

**优势：**

1. **现有技术栈支持**
   - 后端使用 Node.js + Express，可轻松集成 MySQL 客户端
   - 前端使用 React，已有完整的 Tab 页面结构
   - 项目已实现 WebSocket 通信，可用于实时查询反馈

2. **配置信息可获取**
   - 可从 `metersphere.properties` 读取数据库连接配置
   - 已有配置读取机制（`backend/config/redis.js` 中有类似实现）

3. **开发成本低**
   - 前端只需添加一个新 Tab 页面
   - 后端只需添加一个查询接口
   - 可复用现有的错误处理和日志机制

**挑战：**

1. **安全风险**
   - SQL 注入攻击风险
   - 误操作导致数据损坏
   - 敏感数据泄露风险

2. **性能问题**
   - 大结果集可能导致内存溢出
   - 长时间查询可能阻塞服务
   - 并发查询可能影响数据库性能

3. **用户体验**
   - 需要处理查询超时
   - 需要友好的错误提示
   - 大结果集的分页展示

## 技术方案

### 后端实现

**依赖库：**
```json
{
  "mysql2": "^3.6.0"  // 唯一必需依赖,支持 Promise 和连接池
}
```

**核心接口：**

1. `POST /api/sql/query` - 执行 SQL 查询
   - 请求体：`{ sql: string, limit?: number }`
   - 响应：`{ columns: string[], rows: any[][], rowCount: number, executionTime: number }`

2. `GET /api/sql/config` - 获取数据库连接状态
   - 响应：`{ connected: boolean, database: string, host: string }`

**数据库连接池配置：**
```javascript
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: config.host,
  user: config.user,
  password: config.password,
  database: config.database,
  connectionLimit: 2,        // 限制连接数,避免影响主业务
  queueLimit: 5,             // 最多排队 5 个查询
  waitForConnections: true,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});
```

**查询接口实现示例：**
```javascript
app.post('/api/sql/query', async (req, res) => {
  const { sql, limit = 1000 } = req.body;
  const startTime = Date.now();

  try {
    const [rows] = await pool.query({
      sql: sql,
      timeout: 30000  // 30 秒超时
    });

    const limitedRows = rows.slice(0, limit);
    const columns = limitedRows.length > 0 ? Object.keys(limitedRows[0]) : [];

    res.json({
      columns,
      rows: limitedRows,
      rowCount: rows.length,
      executionTime: Date.now() - startTime,
      truncated: rows.length > limit
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**配置读取：**
- 从 `metersphere.properties` 读取数据库配置
- 参考 `backend/config/redis.js` 的实现方式
- 支持连接状态检查和重连机制

### 前端实现

**新增组件：**

1. `SqlTab.jsx` - SQL 查询主页面（约 150 行）
   - SQL 输入框（textarea 或集成编辑器）
   - 执行按钮 + Loading 状态
   - 结果表格
   - 查询历史（localStorage）

2. `SqlResultTable.jsx` - 结果表格组件（约 100 行）
   - 基础表格展示
   - 支持数据导出（CSV）
   - 可选：虚拟滚动（处理大结果集）

**技术选型建议：**

| 功能 | 简单方案 | 进阶方案 | 推荐 |
|------|---------|---------|------|
| SQL 编辑器 | `<textarea>` + CSS | CodeMirror / Monaco Editor | MVP 用 textarea |
| 表格展示 | 原生 `<table>` | 项目现有表格组件 | 复用现有组件 |
| 虚拟滚动 | 限制行数 | react-window | MVP 限制行数 |
| 状态管理 | useState | Zustand | useState 即可 |

**状态管理：**
```javascript
// 简单实现,无需 Zustand
const [sql, setSql] = useState('');
const [result, setResult] = useState(null);
const [loading, setLoading] = useState(false);
const [history, setHistory] = useState(() => {
  return JSON.parse(localStorage.getItem('sqlHistory') || '[]');
});
```

## 安全策略

### 1. SQL 限制

**只允许 SELECT 查询：**
```javascript
const SQL_WHITELIST = /^\s*SELECT\s+/i
const SQL_BLACKLIST = /\b(DELETE|UPDATE|INSERT|DROP|CREATE|ALTER|TRUNCATE|EXEC|EXECUTE)\b/i
```

**禁止的操作：**
- DELETE、UPDATE、INSERT（数据修改）
- DROP、CREATE、ALTER（结构修改）
- TRUNCATE（清空表）
- EXEC、EXECUTE（存储过程执行）

**注意：** 正则过滤可被绕过，生产环境建议使用数据库只读用户。

### 2. 结果集限制

- 默认最多返回 1000 行
- 可配置上限（最大 10000 行）
- 超过限制时返回警告信息

### 3. 查询超时

```javascript
// mysql2 原生支持超时
const [rows] = await pool.query({
  sql: userSql,
  timeout: 30000  // 30 秒自动终止
});
```

### 4. 权限控制

**建议方案：**
- 添加密码验证（类似系统 Reload）
- 或限制只能在开发环境使用
- 记录所有查询日志（审计）

### 5. 连接安全

- 使用只读数据库用户（推荐）
- 限制可访问的数据库/表
- 使用连接池避免连接耗尽（connectionLimit: 2）

## 技术难点与解决方案

### 难点 1: 大结果集处理

**问题：** 10 万行数据会导致浏览器卡死

**解决方案：**
- **方案 A（推荐 MVP）：** 后端限制返回行数（10 分钟实现）
- **方案 B：** 后端分页 + 前端翻页（1 小时实现）
- **方案 C：** 虚拟滚动（3 小时，需要 react-window）

### 难点 2: 查询超时处理

**问题：** 慢查询可能阻塞 Node.js 进程

**解决方案：** mysql2 原生支持超时，无需额外开发
```javascript
pool.query({ sql, timeout: 30000 })
```

### 难点 3: 字符编码和特殊值

**常见问题：**
- NULL 值显示：需要特殊处理显示为 "NULL" 字符串
- 日期格式：MySQL 日期需要格式化
- 大字段：BLOB/TEXT 字段需要截断显示
- 特殊字符：换行符、引号等需要转义

**解决方案：**
```javascript
// 后端处理特殊值
rows.map(row => {
  Object.keys(row).forEach(key => {
    if (row[key] === null) row[key] = 'NULL';
    if (typeof row[key] === 'string' && row[key].length > 1000) {
      row[key] = row[key].substring(0, 1000) + '...';
    }
  });
  return row;
});
```

### 难点 4: 连接池与现有业务隔离

**问题：** SQL 查询不应影响主业务的数据库连接

**解决方案：**
```javascript
// 创建独立的连接池,限制连接数
const sqlQueryPool = mysql.createPool({
  ...dbConfig,
  connectionLimit: 2,  // 只用 2 个连接
  queueLimit: 5        // 最多排队 5 个
});
```

## 实现步骤

### 阶段一：后端基础功能（1-2小时）

1. 安装 mysql2 依赖
2. 实现数据库配置读取
3. 创建数据库连接池
4. 实现 SQL 查询接口
5. 添加安全检查和限制

### 阶段二：前端基础功能（2-3小时）

1. 创建 SqlTab 组件
2. 添加 SQL 输入框
3. 实现查询执行和结果展示
4. 添加错误处理

### 阶段三：功能增强（1-2小时）

1. 添加查询历史
2. 实现结果导出
3. 添加语法高亮
4. 优化大结果集展示

### 阶段四：安全加固（1小时）

1. 添加密码验证
2. 完善查询日志
3. 添加使用文档

**总计：5-8 小时**

## 风险评估

### 高风险

1. **SQL 注入**
   - 缓解：严格的 SQL 语法检查
   - 缓解：使用参数化查询（如果支持）
   - 缓解：记录所有查询日志

2. **数据泄露**
   - 缓解：只允许 SELECT 查询
   - 缓解：添加密码验证
   - 缓解：限制生产环境使用

### 中风险

1. **性能影响**
   - 缓解：查询超时机制
   - 缓解：结果集大小限制
   - 缓解：使用独立的只读连接

2. **误操作**
   - 缓解：明确的操作提示
   - 缓解：查询确认机制
   - 缓解：详细的使用文档

### 低风险

1. **用户体验问题**
   - 缓解：友好的错误提示
   - 缓解：查询历史功能
   - 缓解：结果导出功能

## 替代方案

如果安全风险过高，可考虑以下替代方案：

1. **只读视图**
   - 预定义常用查询
   - 只允许执行预设的查询
   - 降低安全风险

2. **外部工具集成**
   - 推荐使用专业的数据库管理工具
   - 如 DBeaver、Navicat、MySQL Workbench
   - 控制面板提供数据库连接信息

3. **日志查询面板**
   - 只查询应用日志表
   - 不直接访问业务数据
   - 降低数据泄露风险

## 建议

### 推荐实现

建议实现 SQL 查询面板，但需要：

1. **严格的安全限制**
   - 只允许 SELECT 查询
   - 添加密码验证
   - 记录所有查询日志

2. **明确的使用场景**
   - 仅用于开发调试
   - 不在生产环境启用
   - 添加环境检测

3. **完善的文档**
   - 使用说明
   - 安全注意事项
   - 常见问题解答

### 配置建议

在 `config.json` 中添加 SQL 面板配置：

```json
{
  "sql": {
    "enabled": false,
    "requirePassword": true,
    "maxRows": 1000,
    "timeout": 30000,
    "allowedDatabases": ["metersphere"]
  }
}
```

## 总结

SQL 查询面板功能在技术上完全可行，开发成本低，对开发调试有很大帮助。但需要特别注意安全问题，建议：

1. 默认禁用，需要手动开启
2. 只在开发环境使用
3. 添加密码验证
4. 严格限制查询类型
5. 记录所有操作日志

如果按照上述安全策略实现，该功能的风险是可控的，收益大于风险。
