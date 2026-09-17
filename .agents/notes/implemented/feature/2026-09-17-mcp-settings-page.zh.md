# Agent Note：MCP 设置页面——由设置驱动的外部 MCP 服务器清单

Status: implemented

[English](2026-09-17-mcp-settings-page.md) | 中文

## 问题

挂载外部 MCP 服务器需要 `cordis.yml` 配置行或 ACP 的 `session/new` 参数，两者都无法从 Web 界面抵达：用户必须了解 profile 布局并手写 YAML，运行中的 Host 还得重载。设置界面完全没有 MCP 概念，而桥接本身也不暴露任何可供界面显示的连接状态。

## 决策

### 两个包复用一个既有接缝

`@deepseek-ai/dsh-mcp-servers`（宿主）拥有一个设置命名空间，把清单调和成 `dsh-mcp-client` 实例，并通过 Typert Remote 回答连通性测试。`@deepseek-ai/dsh-client-ui-settings-mcp`（浏览器）贡献一个 `settings.section` 条目。桥接保持"一台服务器一个实例"的既有约定：清单决定挂载哪些身份，命名、发现、执行与 stdio 环境清洗仍由 `dsh-mcp-client` 拥有。这与 ACP 桥接同构——后者早已用同样方式挂载会话级实例。

### 设置文档是唯一真源

清单存放在 `mcp` 设置命名空间中。写入先经设置 provider 持久化并返回；由 watcher 从文档收敛已挂载实例。服务从 provider 描述符读取 revision，而不自建计数器，因此两个编辑者要么收敛、要么报冲突，而不会互相覆盖；`initialServers` 让部署提供同一命名空间的 base 层。

### 服务器的 namespace 不可变

`serverName` 决定会话历史与权限规则已经记录的公开工具名 `mcp__<serverName>__<tool>`，因此 `update` 拒绝改动它。类型系统把该字段排除在编辑补丁之外，服务在运行时再拒绝一次；要更换只能移除该服务器并以新名称重新添加。

### 移除的导出名叫 `deleteServer`，不叫 `remove`

客户端 Remote 命名空间服务自身拥有内部方法 `remove(kind, method, token)`，因此把线缆方法导出为 `remove` 会让客户端装配以命名空间冲突失败。导出名取 `deleteServer`，与 agent preset 清单的 `deletePreset` 先例一致。

### 连通性靠测试，不靠追踪

`dsh-mcp-client` 只新增一个导出 `probeConnection(config, options)`：连接、取完 `tools/list`、关闭，总预算由调用方给出，关闭有界。它不注册工具、不预留 namespace，因此草稿可以在保存前测试，已挂载的名称也能在不冲突的情况下测试。页面因此报告最近一次测试结果，而不是实时连接状态；桥接不新增状态面。

### 密钥不跨线路

设置的 schema 把 `env` 与 `headers` 的值标为密钥，因此页面只读变量名、从不读值。正是"读取脱敏视图"这一点决定了编辑契约：`update` 接收变量级操作——字符串设置、`null` 移除、键缺失则保留已存值。测试可以指向一条已保存条目（`basedOn`），由 Host 用该条目补齐草稿未携带的键。

### 失败被隔离

连不上的服务器仍会挂载并重试，因此一个不可用条目不会妨碍整份清单收敛。只有装配冲突——namespace 已被别的注册占用——会让该条目失败，并通过 `mountError` 按条目上报，其余照常工作。

## 备选方案

- **由桥接提供实时状态。** 否决：界面将不得不建模运维无法处置的重连状态；"这份配置能不能用"这个可行动的问题由测试回答。
- **复用 ACP 的按会话挂载。** 否决：Web 清单是部署级的，不是会话级的。
- **把页面做成「插件」下的一个页签。** 否决：服务器清单不是插件，独立导航项才符合运维的心智模型。
- **持久化测试结果。** 否决：过期的"成功"比"未测试"更糟；结果是观测，不是配置。
- **自建清单文件。** 否决：那会重复设置命名空间已有的 revision 围栏、脱敏与外部编辑热重载。

## 测试

- `packages/mcp/mcp-client/tests/probe.spec.ts`——对真实子进程的探测：成功、spawn 失败、超时、调用方取消、复用已挂载命名空间，以及不注册任何工具。
- `packages/mcp/mcp-servers/tests/`——清单校验、对真实桥接的调和（含纯展示变更不重建、namespace 冲突）、探测网关，以及在真实文件型设置 provider 之上的 Remote 接口。
- `apps/cli/tests/mcp-servers-config.spec.ts`——经真实 Cordis Loader 的装配组合。
- `packages/client/ui-settings-mcp/tests/`——store、线路操作、注册与页面的各种渲染状态。

## 后果

- 从页面新增服务器对工具目录的影响与手写配置行完全一致；面向模型的契约仍归 `dsh-mcp-client`。
- 由 `cordis.yml` 行挂载的服务器不在页面内，因此混用两种来源的部署有两处需要查看。
- 页面无法报告实时连接状态；它报告最近一次测试，并在没有测试结果时说明这一点。
- Streamable HTTP 目标仍不受限制，用户输入的任何 URL 都会成为宿主的出站请求。
- `mcp` 组现在包含两个包，已列入组 README。
