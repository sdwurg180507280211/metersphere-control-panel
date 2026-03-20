# Gateway + Eureka 负载均衡原理

## 核心角色

| 角色 | 说明 |
|------|------|
| **Eureka Server** | 服务注册中心，维护"服务名 → 实例列表"的映射表 |
| **微服务实例** | Eureka Client，启动时向 Eureka Server 注册自己 |
| **Gateway** | 也是 Eureka Client，从 Eureka Server 拉取服务列表并转发请求 |

## 完整流程

### 1. 服务注册（Register）

每个微服务启动时，Eureka Client 向 Eureka Server 发送 REST 请求，携带元数据：

- IP 地址
- 端口号
- 服务名（`spring.application.name`）
- 健康检查 URL
- 实例 ID

```
┌──────────┐    POST /eureka/apps/{appName}     ┌───────────────┐
│ Service A │  ──────────────────────────────►   │ Eureka Server │
│ 10.0.1.5  │   {ip: 10.0.1.5, port: 8080}     │               │
└──────────┘                                     │  注册表:       │
┌──────────┐    POST /eureka/apps/{appName}      │  service-a:   │
│ Service A │  ──────────────────────────────►   │   - 10.0.1.5  │
│ 10.0.1.6  │   {ip: 10.0.1.6, port: 8080}     │   - 10.0.1.6  │
└──────────┘                                     └───────────────┘
```

### 2. 服务拉取（Fetch Registry）

Gateway 作为 Eureka Client，从 Eureka Server 拉取完整注册表：

```
┌─────────┐     GET /eureka/apps                 ┌───────────────┐
│ Gateway  │  ◄──────────────────────────────    │ Eureka Server │
│          │     返回完整注册表（全量/增量）        │               │
└─────────┘                                      └───────────────┘
```

### 3. 请求转发 + 负载均衡

Gateway 根据本地缓存的注册表，将请求转发到具体实例：

```
Client ──► Gateway ──┬──► 10.0.1.5:8080 (Service A 实例1)
                     └──► 10.0.1.6:8080 (Service A 实例2)
```

## 关键机制

### 心跳续约（Renew）

- 每个实例注册后，默认**每 30 秒**发送一次心跳
- Eureka Server 在 **90 秒**内未收到心跳，将该实例从注册表中剔除
- 保证注册表中的实例都是存活的

### 注册表缓存（Registry Cache）

Gateway 不会每次请求都查询 Eureka Server，而是：

1. **启动时**：全量拉取注册表
2. **运行中**：每 30 秒增量拉取变更（delta fetch）
3. **本地维护**：在内存中缓存服务实例列表

### 负载均衡策略

Gateway 拿到服务名对应的实例列表后，通过负载均衡器（如 Spring Cloud LoadBalancer 或 Ribbon）选择实例：

| 策略 | 说明 |
|------|------|
| **轮询（Round Robin）** | 依次选择每个实例 |
| **随机（Random）** | 随机选择一个实例 |
| **加权（Weighted）** | 根据权重分配流量 |
| **最少连接（Least Connections）** | 选择当前连接数最少的实例 |

## 服务发现模式

Gateway + Eureka 采用的是**客户端发现模式（Client-Side Discovery）**：

- 服务发现逻辑在调用方（Gateway）完成
- Gateway 自己维护服务列表并做负载均衡
- 不依赖中间代理

与之对应的是**服务端发现模式（Server-Side Discovery）**，由独立的负载均衡器（如 Nginx、AWS ELB）负责路由，调用方无需感知服务实例。

## 总结

Gateway 本身不"知道"服务的 IP 地址。它通过内嵌的 Eureka Client 从 Eureka Server 拉取并缓存服务注册表，获得服务名到 IP 列表的映射，再配合负载均衡策略选择具体实例转发请求。
