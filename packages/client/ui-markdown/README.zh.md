---
description: "dsh Web 客户端的 Markdown 文档渲染：每个界面都会填充的共享 markdown seat，以及可插拔的 TeX 数学与 Mermaid 图表 fence 规则。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-markdown

[English](README.md) | 中文

## 概述

在 Web 客户端中渲染作者撰写的 Markdown，并在不触碰文档渲染器的前提下添加 fence 渲染规则。Chat、提问编辑器、trajectory 视图与文档预览各自声明一个 markdown seat 和一个 fence seat；本包填充两者，并注册内置的 TeX 数学与 Mermaid 规则。规则通过 selector 认领一个 fence 或数学节点；未被认领的请求保留渲染器自身的回退，fence 回退为高亮代码块，数学回退为作者书写的源码。原始 HTML 以及不安全的链接与图片协议继续被拦截。

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

把该插件作为一行组合挂载，每个声明了 markdown 配对的界面就会获得一个渲染器以及两条内置 fence 规则。界面声明该配对；本包负责填充它。

### markdown 配对

渲染界面声明一个 `single` 的 markdown seat 和一个 `chain` 的 fence seat，两者都是 Session 作用域。seat 渲染该界面中作者撰写的 Markdown；fence seat 分派每个围栏代码块与数学节点。

| 界面 | markdown seat | fence seat |
|---|---|---|
| Chat 记录 | `conversation.chat.markdown` | `conversation.chat.markdown.fence` |
| 编辑器问题详情 | `conversation.composer.markdown` | `conversation.composer.markdown.fence` |
| Trajectory 记录 | `conversation.trajectory.markdown` | `conversation.trajectory.markdown.fence` |
| 右侧栏文档预览 | `sidebar.right.tab.document.markdown` | `sidebar.right.tab.document.markdown.fence` |

### fence 请求与回退

渲染器会为每个已落定的 fence 和每个数学节点分派一个 `MarkdownFenceRequest`：围栏代码块为 `{ kind: 'fence'; lang; info; source }`，其中 `lang` 是归一化的语言 token，`info` 是作者书写的 info 字符串；数学节点为 `{ kind: 'display'; source }` 或 `{ kind: 'inline'; source }`。命令、链接目标与图片目标永远不会到达 fence seat。

一条规则是一个 `select` 函数加一个组件。selector 返回匹配值或 `null`；各条目 selector 按链上顺序执行，第一个返回值的规则渲染该节点。没有任何规则认领的请求保留渲染器自身的回退：fence 回退为高亮代码分支，数学回退为作者书写的源码。

### 内置规则

Mermaid 规则认领语言 token 为 `mermaid` 的 fence 并渲染图表；在消息仍在流式输出、图表仍在等待以及渲染失败后，都保留代码分支。数学规则认领行内与展示数学节点以及 `math` fence，并通过 KaTeX 排版；`math` fence 按展示 TeX 渲染。

### 最小配置

该插件不接受任何 `Config`。组合以一行挂载它：

```yaml
- id: ui-markdown
  name: '@deepseek-ai/dsh-client-ui-markdown'
```

浏览器半边注入 slot 注册表与共享 locale 服务，并等待各界面完成声明，因此本插件与各界面以任意顺序加载。注册文案沿用 `common` locale 命名空间——`copy`、`copied`、`markdown.footnotes` 与 `markdown.diagram` 是 `locale` 插件已经拥有的跨功能词汇。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包向 slot 注册表贡献两样东西，而两个 seat 都由界面声明。一个 `MarkdownSeat` 组件服务于全部四个 markdown seat：它绑定 `common` 外框文案，并转发声明界面通过 owner props 传入的 fence 渲染器。该回调的标识由界面拥有，因为流式渲染缓存以它为键。

文档渲染器使用 `ui-primitives` 的 mdast 语法解析并直接遍历语法树。消息流式输出期间，它把除末尾两个块以外的所有块冻结为缓存的 React 元素，只重新解析尾部；已落定的一趟会为每个 fence 询问一次 fence seat，而数学节点每一趟都会分派。不受信任输出保持其策略：链接与图片目标需通过协议允许列表，原始 HTML 按字面文本渲染，KaTeX 在禁用 trusted commands 的情况下运行。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/apply.ts`](src/client/apply.ts) | 填充每个 markdown seat，并把两条内置规则注册进每个 fence seat |
| [`src/client/contract/slots.ts`](src/client/contract/slots.ts) | 四个 seat 配对、请求联合类型、owner props 与 seat 渲染器类型 |
| [`src/client/markdown/MarkdownSeat.tsx`](src/client/markdown/MarkdownSeat.tsx) | 共享 seat：绑定 `common` 外框文案并转发界面的 fence 渲染器 |
| [`src/client/markdown/MarkdownText.tsx`](src/client/markdown/MarkdownText.tsx) | 已落定与流式渲染：增量解析、冻结块缓存、脚注小节 |
| [`src/client/markdown/render.tsx`](src/client/markdown/render.tsx) | mdast→React 分支、不受信任输出策略、fence 分派与脚注 |
| [`src/client/markdown/MathFence.tsx`](src/client/markdown/MathFence.tsx) | 数学规则：认领三种请求，并通过 [`katex.tsx`](src/client/markdown/katex.tsx) 排版 |
| [`src/client/markdown/MermaidFence.tsx`](src/client/markdown/MermaidFence.tsx) | 图表规则，基于 [`mermaid.tsx`](src/client/markdown/mermaid.tsx) 与 [`dom-to-react.tsx`](src/client/markdown/dom-to-react.tsx) 中的 SVG 映射 |
| [`src/client/markdown/DiagramBlock.module.css`](src/client/markdown/DiagramBlock.module.css) | 图表分支自带的代码块 fence 外壳副本 |
| [`src/index.ts`](src/index.ts) | Host 半边；浏览器半边承载全部贡献 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面拥有解析器、声明各 seat 的界面，以及 slot 机制。

- [ui-primitives](../ui-primitives/README.zh.md)——本渲染器所依赖的 mdast 语法、纯文本投影与 `CodeBlock`。
- [ui-chat](../ui-chat/README.zh.md)——声明 Chat 的 markdown 配对。
- [ui-user-questions](../ui-user-questions/README.zh.md)——声明编辑器的 markdown 配对。
- [ui-trajectory](../ui-trajectory/README.zh.md)——声明 trajectory 的 markdown 配对。
- [ui-sidebar-documentpreview](../ui-sidebar-documentpreview/README.zh.md)——声明文档预览的 markdown 配对。
- [slots](../../../docs/subsystems/slots.zh.md)——界面如何声明 seat，占用方如何注册进来。

-----

<a id="model-experience"></a>
## 模型体验

无：本包渲染浏览器 UI，不注册任何面向模型的内容。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制定义 fence seat 契约与贡献一条规则的成本；它们是当前包约束。

- **一条规则需为每个 fence slot 注册一次**——服务于全部四个界面的规则需要四次注册，每个 `…markdown.fence` seat 一次。目前没有框架机制发布 slot 名称列表，因此规则作者必须显式写出这些 seat。
- **图表块重复了代码块 fence 外壳**——插件不能导入另一个包的样式表，因此 `DiagramBlock.module.css` 自带一份来自 `ui-primitives` 的 `CodeBlock.module.css` 的 fence 外壳规则副本；两份样式表必须保持逐字节兼容。
- **Fence 分派只处理已落定内容**——消息流式输出期间，每个 fence 都保留代码分支；只有已落定的一趟会询问 fence seat，因此规则无法接管仍在增长的 fence。
- **流式期间跨边界引用解析被推迟**——引用式链接或脚注的定义位于增量冻结边界的另一侧时，会在回复流式输出期间按字面文本渲染；收尾时的已落定完整解析会修正它。
- **分类图表调色板仍使用 Mermaid 自带方案**——pie、mindmap、timeline、gitgraph、sankey、radar、treemap 与 xychart 的颜色编码的是类别而非表面，因此它们保留库自带调色板并在渲染时固化：既不跟随 `--dsw-*` token，也不跟随实时主题切换。
- **`htmlLabels: false` 以标签换行为代价**——比节点更长的图表标签会溢出而不换行。该设置正是让图表输出成为不含 HTML 孤岛的纯 SVG 词汇的原因。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。每一项贡献都是 slot 注册，由 slot 注册表持有和观察；渲染器声明的回退由本包的 spec 直接断言。
