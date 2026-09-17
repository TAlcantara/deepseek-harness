---
description: "dsh Web 客户端的 MCP 设置页：服务器清单、新增/编辑表单、连通性测试，以及只读部署呈现的状态。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-mcp

[English](README.md) | 中文

## 概述

在设置的 **MCP** 区块里，你可以列出该部署已配置的外部 MCP 服务器、新增一台、编辑它、启用或禁用它、移除它，并测试它是否可达。每次写入都经 `mcpServers` Remote 命名空间完成，因此本页面不持有任何配置：它送出用户输入的内容，并渲染 Host 返回的完整清单。服务器的 namespace 一经添加即固定，因为它决定面向模型的工具名；因此编辑时表单将其显示为只读，并说明更换它意味着移除后重新添加。密钥是只写的：页面只显示设置了哪些变量，从不显示其值，并且可以在保存前先跑一次连通性测试。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在已经提供设置外壳、locale 席位与生成的 Remote 装配的客户端组合中挂载本插件。它贡献一个名为 `mcp` 的 `settings.section` 条目，排在「模型」与「插件」之间。

页面通过六个 Remote 方法读写：`list`、`add`、`update`、`remove`、`setEnabled` 与 `testConnection`。每次写入都提交它读到的 revision，因此表单下方已被改动的配置会报冲突而不是被覆盖；每次写入都返回完整清单，页面据此渲染。

### 用户看到什么

| 控件 | 行为 |
|---|---|
| 添加服务器 | 打开空表单：命名空间、展示名、传输方式、该传输方式的字段与超时 |
| 行内「测试」 | 测试已保存的服务器，并补齐页面从未从存储条目收到的值 |
| 启用开关 | 挂载或卸载服务器，而不丢弃它的配置 |
| 编辑 | 用已存值重新打开表单；命名空间只读 |
| 移除 | 先确认，再移除服务器及其工具 |
| 重试 | 读取失败后重新读取清单 |

当部署报告 `canEdit: false` 时，页面以只读方式渲染清单：新增、编辑、移除与启用控件消失，连通性测试仍可用。

### 密钥

Host 从不把密钥值发给页面，因此表单也无法显示它。已存储的变量以名称出现，并带一个标记移除的复选框；两个文本域用于新增 `NAME=value` 行。对已存变量不作处理意味着写入不携带它的任何操作，这正是它得以保留的原因。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

- **一个 store，一个面。** 页面状态存放在注册时创建的 snapshot store 中，并通过 inject 面的 `hooks` 分区发布；渲染器把它绑定为 `useSnapshot`，区块只从这个 hook 渲染。
- **操作拥有线路。** `operations.ts` 是唯一调用 Remote 命名空间的地方，负责把每个答案折进 store，并把失败码翻译成本地化文案。组件收到的是回调，从不接触 ctx。
- **表单产出值，不产出请求。** `buildDraft` 与 `buildPatch` 是作用于表单状态的纯函数；编辑补丁携带变量级密钥操作，因此移除与新增都是显式的。
- **编辑器状态属于 store。** 打开、关闭、写入后提示与移除确认都存在于 snapshot 中，因此重新渲染不会丢失草稿。

</details>

-----

<a id="model-experience"></a>
## 模型体验

无，本页只配置服务器；[`dsh-mcp-servers`](../../mcp/mcp-servers/README.zh.md) 负责挂载它们，[`dsh-mcp-client`](../../mcp/mcp-client/README.zh.md) 拥有面向模型的工具名、schema 与结果。

#### KV Cache 影响

本页只写配置，从不写请求内容：一次保存产生的工具定义就是 Host 挂载的那一份，因此本包本身不会使任何缓存失效。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **没有实时连接状态**——页面报告的是最近一次连通性测试，而不是某台已挂载服务器此刻是否连接；掉线的服务器会一直列出，直到测试或重载给出别的结论。
- **不能改名**——更换 namespace 按设计就是移除后重建，因此表单不提供改名路径。
- **从 `cordis.yml` 挂载的服务器不在此列**——同时以配置行组合服务器的部署有两处需要查看，本页只显示它管理的清单。
- **已保存不等于已测试**——保存从不测试，页面如实说明这一点，而不是暗示服务器可达。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

- 导入其他客户端的配置（粘贴一段 JSON 变成若干条目）是一个开放方向。
- 部署组合的条目应当显示为只读、而不是被省略，这一点尚未决定；Host 需要为每个条目标出来源。

</details>
