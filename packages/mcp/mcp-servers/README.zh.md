---
description: "面向部署的、由设置驱动的 MCP 服务器清单：mcpServers 服务把每个已配置的服务器经 dsh-mcp-client 挂载，连同它的 Remote 方法与配置界面使用的连通性测试。"
kind: "package-reference"
---

# @deepseek-ai/dsh-mcp-servers

[English](README.md) | 中文

## 概述

当用户应当从设置界面配置外部 MCP 服务器、而不是编辑 `cordis.yml` 时，加入 `dsh-mcp-servers`。一个设置命名空间持有清单；每个条目挂载为独立的 `dsh-mcp-client` 实例，因此模型看到的工具名、schema 与结果，与手写配置行产生的完全一致。写入先落到设置文档，再由它收敛已挂载实例，从而保持文档是唯一真源。服务器的 namespace 在添加时固定，因为它决定面向模型的工具名；要更换就得移除该服务器再重新添加。本服务还按需回答一次有界连通性测试——界面据此说明一份配置是否可用，而无需跟踪实时连接状态。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在同时提供 `settings` 的宿主组合中挂载本服务：

```yaml
- id: mcp-servers
  name: '@deepseek-ai/dsh-mcp-servers'
  config:
    initialServers: []
    editable: true
    testTimeoutMs: 15000
    maxConcurrentTests: 2
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `initialServers` | `[]` | 设置的 base 层：部署组合的服务器，用户编辑可覆盖 |
| `editable` | `true` | 该部署是否接受清单写入 |
| `testTimeoutMs` | `15,000` | 单次连通性测试的总预算 |
| `maxConcurrentTests` | `2` | 同时可跑的测试数；更多调用方排队等待 |

每个清单条目携带 `id`、`serverName`、`enabled`、`label`、`transport`，`stdio` 字段（`command`、`args`、`cwd`、`env`）或 `streamable-http` 字段（`url`、`headers`），以及 `toolCallTimeoutMs`、`failOnStartupError` 与可选的 `reconnect` 策略。前四个桥接选项的含义与 [`dsh-mcp-client`](../mcp-client/README.zh.md) 文档所述完全一致；本包只负责保存并透传它们。

### Remote 接口

`ctx.remote.mcpServers` 把清单暴露给配置界面：

| 方法 | 参数 | 结果 |
|---|---|---|
| `list` | — | `McpServerSnapshot` |
| `add` | `draft`、`expectedRevision` | `McpServerSnapshot` |
| `update` | `id`、`patch`、`expectedRevision` | `McpServerSnapshot` |
| `deleteServer` | `id`、`expectedRevision` | `McpServerSnapshot` |
| `setEnabled` | `id`、`enabled`、`expectedRevision` | `McpServerSnapshot` |
| `testConnection` | `target`、`signal` | `McpConnectionTest` |

每次写入都提交它读到的 `revision`；当清单已越过该版本时写入被拒绝。每次写入都返回完整清单与新 revision，因此调用方永远不需要合并部分状态。`update` 拒绝 `serverName`，其 `env` 与 `headers` 是变量级补丁：字符串设置值，`null` 移除，键缺失则保留已存值——这样持有脱敏视图的界面可以在从未拿到密钥的情况下完成编辑。

`serverName` 的唯一性覆盖整个注册作用域，因此与 `cordis.yml` 挂载的桥接冲突的条目只会让该次挂载失败并通过 `mountError` 上报，不会拖垮 Host。

### 测试服务器

`testConnection` 连接目标一次、列出其工具、然后关闭。它不注册任何东西、不预留任何 namespace，因此既能测试尚未保存的草稿，也能测试名称已被挂载的服务器。传入已保存条目的 id 作为 `basedOn`，已存储的密钥值会补齐草稿未携带的键——这正是编辑表单无需重新输入凭据即可测试的原因。

测试失败是正常结果：`ok: false` 加一段绝不含凭据值的摘要。已保存条目的结果保存在内存中，Host 重启即清空。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

### 设计理念

- **文档是唯一真源。** 写入先落到 `mcp` 设置命名空间并返回；由 watcher 收敛已挂载实例。没有已持久化的条目在背后，就不会改动活动实例集合。
- **一个条目一个桥接实例。** 调和按清单 id 做 diff，因此配置变更会先卸载旧实例再挂载新实例；`label` 这类纯展示变更不会打扰正在运行的实例。
- **挂载失败被隔离。** 连不上的服务器仍会挂载并自行重试；只有装配冲突（namespace 已被别的注册占用）会让该条目失败，且条目留在清单里以便运维修正。
- **密钥留在宿主。** 视图只携带 `envKeys` 与 `headerKeys`，从不带值；连通性测试的失败摘要也不含凭据内容。
- **测试是有界的。** 超出的测试排队而不是失败；一次总预算覆盖连接、发现与关闭；卸载会中止在飞测试并等待它们结束。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服务：`Config`、设置注册、Remote 方法与视图投影 |
| [`src/settings.ts`](src/settings.ts) | 命名空间、schema、reconnect 归一化，以及到桥接配置的翻译 |
| [`src/validate.ts`](src/validate.ts) | 草稿归一化、变量级密钥补丁与清单规则 |
| [`src/supervisor.ts`](src/supervisor.ts) | 从清单到活动桥接实例的串行调和 |
| [`src/probe.ts`](src/probe.ts) | 连通性网关：并发上限、取消与按条目的结果 |
| — | 不发布运行时不变式伴生入口；已挂载集合由设置文档派生，本服务不额外暴露它的独立快照。 |

### 调和

一条 promise 链串行化每次调和，因此两次写入的卸载/挂载步骤绝不会交错。每一轮计算启用的条目，卸载已离开清单的，再逐条比较剩余条目的桥接配置与已挂载实例：配置相同则不动，配置变化则替换。卸载会把调和器标记为关闭、排空队列并卸载全部；此后入队的工作被丢弃。

### Revision

本服务从设置 provider 的描述符读取 revision，而不维护自己的计数器，因此写入能与同一文档的其他编辑者收敛。在服务存活期间被替换或撤销的 provider 会让下一次读取失败，而不是继续提供过期 revision。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [`dsh-mcp-client`](../mcp-client/README.zh.md)——本包挂载的桥接，以及由它拥有的命名、重连与结果约定。
- [设置子系统](../../../docs/subsystems/settings.zh.md)——本包每次写入都遵循的命名空间、revision 与用户层模型。
- [MCP 记忆指南](../../../docs/user/guide/mcp-memory.zh.md)——面向设置界面的可用服务器配置。
- [生成的配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-mcp-servers)——每个受支持字段及其源声明。

-----

<a id="model-experience"></a>
## 模型体验

间接地，通过 [`dsh-mcp-client`](../mcp-client/README.zh.md)：工具名、schema、描述与结果渲染都由该包拥有。

#### KV Cache 影响

挂载或移除一台服务器会增删该包所述的工具定义，与手写配置行的效果完全一致；清单不变则复现出不变的请求前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **只有清单管理的服务器出现在这里**——由 `cordis.yml` 行挂载的服务器不会列出、不可编辑、也无法从配置界面移除，因此混用两种来源的部署有两处需要查看。
- **已保存不等于可连接**——保存不做测试，服务器不可达时桥接仍保持挂载并重试，因此界面必须提供连通性测试来回答一份配置是否可用。
- **测试结果是进程局部的**——Host 重启即清空，也从不写入设置文档，因此界面无法报告历史结果。
- **更换 namespace 意味着移除后重建**——`serverName` 不可变，因为它决定面向模型的工具名，所以这个操作是两次写入而不是一次编辑。
- **Streamable HTTP 目标不受限制**——用户输入的任何 HTTP(S) URL 都会成为 Host 进程的出站请求，处于沙箱 fetch 网络策略之外。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是维护者的工作上下文：开放设计问题与尚未决定的探索方向。它明确不具权威性——已交付行为、限制与既定理由以上文、包代码与所链接的 Agent Note 为准。

- 每会话清单是一个开放方向：Agent Client Protocol 已经挂载会话级 MCP 服务器，而本服务目前持有一个全局清单。
- 限制 Streamable HTTP 目标——部署白名单，或默认仅 loopback——是一个开放的安全决定。
- 部署组合的条目是否应单独只读尚未决定；目前 `editable` 是整个部署的开关。

</details>
