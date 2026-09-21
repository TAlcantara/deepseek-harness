---
description: "dsh Web 客户端的 Markdown 文档渲染：每个界面都会填充的共享 markdown seat，以及规则贡献注册进的 fence seat。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-markdown

[English](README.md) | 中文

## 概述

在 Web 客户端中渲染作者撰写的 Markdown，并把每个 fence 分派给一条可插拔的规则链。Chat、提问编辑器、trajectory 视图与文档预览各自声明一个 markdown seat 和一个 fence seat；本包用一个共享组件填充 markdown seat，并拥有文档渲染器。规则通过 selector 认领一个 fence 或数学节点；未被认领的请求保留渲染器自身的回退，fence 回退为高亮代码块，数学回退为作者书写的源码。内置的 TeX 数学与 Mermaid 规则位于独立的 [ui-markdown-rules](../ui-markdown-rules/README.zh.md) 包。原始 HTML 以及不安全的链接与图片协议继续被拦截。

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

把该插件作为一行组合挂载，每个声明了 markdown 配对的界面就会获得共享渲染器。界面声明该配对；本包填充 markdown seat 并分派其 fence。

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

### fence 规则

本包不提供任何规则，因此没有规则认领的 fence 或数学节点保留渲染器自身的回退。内置的 TeX 数学与 Mermaid 规则位于独立的 [ui-markdown-rules](../ui-markdown-rules/README.zh.md) 包，它是规则贡献的样板示例。

### 最小配置

该插件不接受任何 `Config`。组合以一行挂载它：

```yaml
- id: ui-markdown
  name: '@deepseek-ai/dsh-client-ui-markdown'
```

浏览器半边注入 slot 注册表与共享 locale 服务，并等待各界面完成声明，因此本插件与各界面以任意顺序加载。注册文案沿用 `common` locale 命名空间——`copy`、`copied` 与 `markdown.footnotes` 是 `locale` 插件已经拥有的跨功能词汇。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包向 slot 注册表贡献一个组件，而两个 seat 都由界面声明。`MarkdownSeat` 服务于全部四个 markdown seat：它绑定 `common` 外框文案，并转发声明界面通过 owner props 传入的 fence 渲染器。该回调的标识由界面拥有，因为流式渲染缓存以它为键。

文档渲染器使用 `ui-primitives` 的 mdast 语法解析并直接遍历语法树。消息流式输出期间，它把除末尾两个块以外的所有块冻结为缓存的 React 元素，只重新解析尾部；已落定的一趟会为每个 fence 询问一次 fence seat，而数学节点每一趟都会分派。不受信任输出保持其策略：链接与图片目标需通过协议允许列表，原始 HTML 按字面文本渲染。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/apply.ts`](src/client/apply.ts) | 用共享组件填充每个 markdown seat |
| [`src/client/contract/slots.ts`](src/client/contract/slots.ts) | 四个 seat 配对、请求联合类型、owner props 与 seat 渲染器类型 |
| [`src/client/markdown/MarkdownSeat.tsx`](src/client/markdown/MarkdownSeat.tsx) | 共享 seat：绑定 `common` 外框文案并转发界面的 fence 渲染器 |
| [`src/client/markdown/MarkdownText.tsx`](src/client/markdown/MarkdownText.tsx) | 已落定与流式渲染：增量解析、冻结块缓存、脚注小节 |
| [`src/client/markdown/render.tsx`](src/client/markdown/render.tsx) | mdast→React 分支、不受信任输出策略、fence 分派与脚注 |
| [`src/index.ts`](src/index.ts) | Host 半边；浏览器半边承载全部贡献 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面拥有与渲染器一同挂载的规则、解析器、声明各 seat 的界面，以及 slot 机制。

- [ui-markdown-rules](../ui-markdown-rules/README.zh.md)——内置的 TeX 数学与 Mermaid fence 规则。
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


这些限制定义 seat 契约与渲染器的流式行为；它们是当前包约束。

- **Fence 分派只处理已落定内容**——消息流式输出期间，每个 fence 都保留代码分支；只有已落定的一趟会询问 fence seat，因此没有规则能接管仍在增长的 fence。
- **流式期间跨边界引用解析被推迟**——引用式链接或脚注的定义位于增量冻结边界的另一侧时，会在回复流式输出期间按字面文本渲染；收尾时的已落定完整解析会修正它。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。每一项贡献都是 slot 注册，由 slot 注册表持有和观察；渲染器声明的回退由本包的 spec 直接断言。
