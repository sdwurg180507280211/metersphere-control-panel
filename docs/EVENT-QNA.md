# Event Q&A 项目维护入口

本控制中心默认提供 event-qna 的公网访问入口，本地开发通过脚本操作，源码目录为同级 `../event-qna`（本机 `/Users/edy/ideaProjects/event-qna`）。应用、数据库及上线记录由 event-qna 仓库维护。

## Local Service Hub 中的一个项目

项目名称 **Event Q&A**，ID 为 `event-qna`，状态端口留空，默认访问地址为 `http://39.102.212.37:3036/event/demo/ask`。“启动”和“访问服务”直接打开公网提问页面，无需启动本地应用；“停止”仅提示云端服务继续运行。审核后台和 iPad 展示作为同一项目中的公网页面入口。

| 分组 | 页面入口 | 访问地址 |
| --- | --- | --- |
| 本地开发 | 提问页面 | http://127.0.0.1:3036/event/demo/ask |
| 本地开发 | 审核后台 | http://127.0.0.1:3036/admin |
| 本地开发 | iPad 展示 | http://127.0.0.1:3036/event/demo/display |
| 线上活动 | 提问页面 | http://39.102.212.37:3036/event/demo/ask |
| 线上活动 | 审核后台 | http://39.102.212.37:3036/admin |
| 线上活动 | iPad 展示 | http://39.102.212.37:3036/event/demo/display |

本机配置保存于 `~/.metersphere-control-panel/config.json`，使用已有配置服务原子保存并备份。线上三个页面通过项目的 `accessLinks` 维护，可在“配置项目”中修改名称、分组和地址，均设置 `requiresRunning=false`。上表本地地址用于开发脚本，不作为默认项目入口。

## 本地生命周期

启动脚本检测 Node.js、现有依赖及 .env，使用已缓存的 PostgreSQL 镜像启动数据库，然后运行 Next.js 开发服务。不会安装依赖、自动拉取镜像、重新初始化数据库或覆盖活动数据。首次初始化请按 event-qna README 执行。

若 3036 已由当前用户的 event-qna Node/Next 进程占用并通过数据库健康检查，重复启动直接返回成功。端口属于其他目录或用户时拒绝启动和关闭。关闭仅处理已确认属于该项目的应用进程，PostgreSQL 保留运行，云端服务不受影响。

日志：`../event-qna/.local/control-panel/development.log`。

应用通过独立进程组启动，启动命令完成或控制面板窗口关闭后仍可继续运行。

```sh
npm run qna:start
npm run qna:stop
npm run qna:status
npm run qna:open
npm run qna:admin
npm run qna:display
npm run qna:preview
npm run qna:live
npm run qna:live-admin
npm run qna:live-display
```

`qna:preview` 使用本地 brand-preview 演示活动。已有独立的 3040 品牌预览不由 3036 本地开发入口关闭。

## 换电脑或自定义目录

支持 `EVENT_QNA_ROOT`、`EVENT_QNA_PORT`、`EVENT_QNA_NODE`、`EVENT_QNA_LIVE_URL`。修改线上地址时，同时更新控制面板中的完整访问地址和页面入口。Node.js 需 22 或更新版本，默认优先使用本机 nvm 中最新的已安装版本。

可在控制面板“添加项目”中恢复一个 Event Q&A 项目：启动命令为 `/bin/bash <控制面板目录>/scripts/event-qna.command live`，关闭命令为相同脚本的 `live-stop`，状态端口留空，默认访问地址为公网提问页面。随后在“项目内的页面入口”加入上表三个线上地址，不勾选“本地项目运行后可访问”。本地开发继续使用 `npm run qna:start`、`npm run qna:stop` 及其他本地脚本命令。

## 当前版本边界

线上运行的是已恢复问题池的版本；FORUM 品牌视觉目前是本地预览。管理员后台发布直接公开，普通匿名提问先审核。该入口不包含部署、数据库迁移或清理现场数据动作。后台凭据保留于应用环境文件，不写入控制面板命令或 Git。

## 修正记录

2026-10-06：默认项目改为直接打开公网活动页面，启动、停止操作不再控制本地开发进程。桌面端外部链接支持不含账号密码的本机与公网 HTTP(S) 地址，保留 IPC 来源校验和窗口导航限制。

2026-10-01：纠正此前把不同页面注册成四个项目的问题，合并为一个 `event-qna` 项目。入口地址保留在项目内，其他项目继续使用原配置。实现与验收见 [页面入口修正](PROJECT-ACCESS-LINKS.md)。
