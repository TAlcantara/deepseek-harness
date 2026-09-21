---
description: "dsh Web 客户端的内置 markdown fence 规则：注册进四个 markdown fence seat 的 TeX 数学与 Mermaid 图表。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-markdown-rules

[English](README.md) | 中文

## 概述

通过挂载承载内置规则的插件，让 fence 渲染超越代码分支。四个 chain seat——Chat、编辑器、trajectory 视图与文档预览——每个接受每条规则一个条目；Mermaid 规则认领已落定的 `mermaid` fence，数学规则通过 KaTeX 排版行内、展示以及 `math` fence 的 TeX。一条规则是一个 `select` 函数加一个组件，链上第一个非 null 匹配负责渲染。没有规则认领的请求保留渲染器自身的回退，因此省略本行时每个 fence 仍留在代码分支。

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

把该插件作为一行组合挂载，每个已声明 fence seat 的界面就会获得两条内置规则。[渲染器包](../ui-markdown/README.zh.md)拥有这些 seat、请求类型与回退；本包拥有规则。

### 规则是什么

一条规则是一个 `select` 函数加一个组件。`select(request)` 返回该规则的匹配值或 `null`；fence seat 是 chain，因此各条目按注册顺序执行，第一个非 null 匹配渲染该节点。没有任何规则认领的请求保留渲染器自身的回退：fence 回退为高亮代码分支，数学回退为作者书写的源码。

### 两条内置规则

| 规则 | 认领的请求 | 渲染结果 |
|---|---|---|
| Mermaid 图表 | 归一化语言 token 为 `mermaid` 的已落定 fence | `ui-primitives` 的 `MermaidBlock`；消息流式输出期间以及图表等待或失败期间保留代码分支 |
| TeX 数学 | 一个 `inline` 数学节点、一个 `display` 数学节点，以及已落定的 `math` fence | `ui-primitives` 的 `renderTexToReact`；`math` fence 按展示 TeX 排版，并补上其正文所需的末尾换行 |

两条规则都拒绝仍在流式输出的 fence，因为未闭合的 fence 无法渲染。因此 Mermaid 规则只在回复落定后替换代码分支。

### 规则如何注册

一次注册是某个 fence seat 中的一个条目，因此服务全部四个界面的规则会注册四次，每个 `…markdown.fence` seat 一个条目。`ctx.slots.inject` 在注册前等待界面完成声明，因此本插件与各界面以任意顺序加载，失去声明的界面只会带走自己的条目。

注册文案沿用 `common` locale 命名空间：`copy`、`copied` 与 `markdown.diagram` 是 `locale` 插件已携带的 fence 外框词汇。

### 最小配置

该插件不接受任何 `Config`。组合把它作为渲染器旁的一行挂载：

```yaml
- id: ui-markdown
  name: '@deepseek-ai/dsh-client-ui-markdown'
- id: ui-markdown-rules
  name: '@deepseek-ai/dsh-client-ui-markdown-rules'
```

两个包是相互独立的行，因此省略规则行的部署仍会渲染 markdown，并让每个 fence 留在代码分支。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

两个 selector 与两个组件承载本包。每个 selector 都是针对 `MarkdownFenceRequest` 的纯函数；每个组件通过静态链接的 `ui-primitives` 块渲染匹配值，并从共享命名空间绑定外框文案。规则自身不拥有任何样式表或第三方依赖。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/apply.ts`](src/client/apply.ts) | 通过 `ctx.slots.inject` 为每条规则注册四个条目——每个 fence seat 一个 |
| [`src/client/rules/MathFence.tsx`](src/client/rules/MathFence.tsx) | 数学规则：`selectMath`、`MathFence` 与导出的 `MathMatch` |
| [`src/client/rules/MermaidFence.tsx`](src/client/rules/MermaidFence.tsx) | 图表规则：`selectMermaid` 与 `MermaidFence` |
| [`src/index.ts`](src/index.ts) | Host 半边；浏览器半边承载全部贡献 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面拥有规则注册进的 seat、规则组合的块，以及这次拆分背后的决策。

- [ui-markdown](../ui-markdown/README.zh.md)——拥有四个 seat 配对、fence 请求、文档渲染器，以及被拒绝请求保留的回退。
- [ui-primitives](../ui-primitives/README.zh.md)——托管 `MermaidBlock` 与 `renderTexToReact`，并说明[为何惰性渲染器是静态的](../ui-primitives/README.zh.md#why-the-lazy-renderers-are-static)。
- [slots](../../../docs/subsystems/slots.zh.md)——界面如何声明 chain seat，占用方如何注册进来。
- [可插拔的 markdown fence](../../../.agents/notes/implemented/architecture/2026-09-21-pluggable-markdown-fences.zh.md)——seat 配对与规则认领背后的决策。

-----

<a id="model-experience"></a>
## 模型体验

无：本包渲染浏览器 UI，不注册任何面向模型的内容。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制定义规则能认领什么以及贡献一条规则的成本；它们是当前包约束。

- **一条规则需为每个 fence seat 注册一次**——服务于全部四个界面的规则需要四次注册，每个 `…markdown.fence` seat 一次。目前没有框架机制枚举已声明的 seat，因此规则作者必须显式写出 seat 名称。
- **规则的第三方渲染器是静态链接的**——动态插件 bundle 只发布其清单列出的文件，因此其中的动态 `import()` 或裸样式表会产出其发布闭包覆盖不到的 chunk 与资源文件。Mermaid 与 KaTeX 因此放在 `ui-primitives`，每条内置规则组合该块；见[为何惰性渲染器是静态的](../ui-primitives/README.zh.md#why-the-lazy-renderers-are-static)。
- **Fence 分派只处理已落定内容**——消息流式输出期间，每个 fence 都保留代码分支；只有已落定的一趟会询问 fence seat，因此规则无法接管仍在增长的 fence。
- **第三方渲染器保留各自的安全默认值**——KaTeX 在未启用 `trust` 的情况下运行，因此作者撰写的 TeX 中的 `\href` 与 `\includegraphics` 保持为字面文本；Mermaid 以 `securityLevel: 'strict'` 和 `htmlLabels: false` 运行，因此图表输出是纯 SVG 元素词汇、不含 HTML 孤岛。
- **分类图表调色板仍使用 Mermaid 自带方案**——pie、mindmap、timeline、gitgraph、sankey、radar、treemap 与 xychart 的颜色编码的是类别而非表面，因此它们保留库自带调色板并在渲染时固化：既不跟随 `--dsw-*` token，也不跟随实时主题切换。
- **`htmlLabels: false` 以标签换行为代价**——比节点更长的图表标签会溢出而不换行。该设置正是让图表输出成为不含 HTML 孤岛的纯 SVG 词汇的原因。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。每一项贡献都是 slot 注册，由 slot 注册表持有和观察；selector 的认领与渲染器的回退由本包的 spec 直接断言。
