# Agent Note: 可插拔的 markdown fence

Status: implemented

[English](2026-09-21-pluggable-markdown-fences.md) | 中文

> [客户端壳与动态包边界](2026-08-15-client-shells-and-dynamic-packages.zh.md)这篇笔记拥有包放置与动态/静态的取舍。本笔记把该模型应用到 markdown 渲染，并拥有 seat 配对、fence 请求与规则认领。

## Problem

编译进静态链接库的渲染规则无法通过安装来贡献。文档渲染器把 fence 分派作为代码持有：它通过同一模块中的分支识别 `mermaid` fence 与每一个 TeX 数学节点，因此为新 fence 语言添加一条渲染规则就是对 Web 壳静态链接的某个包做源码修改，任何安装进运行中 profile 的插件都无法添加规则。

同一个渲染器通过一个共享组件服务四种不同界面——Chat 记录、编辑器的问题详情、trajectory 视图与右侧栏文档预览。它们的 markdown 差异只能用库的 prop 表达，而每个界面的文案需要各自的 label 构造器。

## Decision

### markdown 组合移入动态插件

`@deepseek-ai/dsh-client-ui-markdown` 是一个动态客户端插件。它的 Host 半边为空；浏览器半边注册进 slot 注册表。Web bundle 把它作为一行普通条目挂载，因此部署方可以选择是否出现 markdown 渲染，而渲染规则以插件形式发布，而不是作为对壳的修改。

`ui-primitives` 保持静态库，并保留不属于组合的部分：两套 mdast 语法（`parseGfm`、`parseGfmWithMath`）、纯文本投影（`extractMarkdownPlainText`）、Shiki 高亮、`CodeBlock` 与 `JsonBlock`。它不再导出 `MarkdownText` 或 markdown label 类型。

### 每个渲染界面声明一个 markdown seat 与一个 fence seat

四组配对，均为 Session 作用域，且由渲染 markdown 的界面在自己的 entry 中声明两个 slot：

| 界面 | markdown seat | fence seat |
| --- | --- | --- |
| Chat 记录 | `conversation.chat.markdown` | `conversation.chat.markdown.fence` |
| 编辑器问题详情 | `conversation.composer.markdown` | `conversation.composer.markdown.fence` |
| Trajectory 记录 | `conversation.trajectory.markdown` | `conversation.trajectory.markdown.fence` |
| 右侧栏文档预览 | `sidebar.right.tab.document.markdown` | `sidebar.right.tab.document.markdown.fence` |

markdown seat 的 `kind` 是 `'single'`；它的 fence 兄弟是 `'chain'`。一个 slot 名称仍然只有一个声明方，因此每个界面声明自己的洞，插件先通过 `ctx.slots.inject` 等待该声明，再注册进去。配对以任意顺序加载，且每个界面独立消失。

`MarkdownSeatOwnerProps` 携带 `text`、`streaming`、`mentions`、`pathImages` 与 `renderFence`。声明界面拥有 `renderFence` 闭包，那是它渲染该位置的授权；该闭包必须保持引用稳定，因为流式渲染缓存以它的标识为键。

### 规则通过纯 selector 认领请求

渲染器为每个已落定 fence 和每个数学节点分派一个 `MarkdownFenceRequest`：

```ts
type MarkdownFenceRequest =
  | { kind: 'fence'; lang: string | undefined; info: string; source: string }
  | { kind: 'display'; source: string }
  | { kind: 'inline'; source: string }
```

一条规则把 `select` 函数与它的组件一起注册。`select(request)` 返回该规则的匹配值或 `null`；链上条目按注册顺序执行，第一个非 null 匹配负责渲染。命令、链接目标与图片目标永远不会到达该 seat，因此规则无法认领它们。

插件自带两条规则。Mermaid 规则认领归一化语言 token 为 `mermaid` 的 fence。数学规则认领 `inline` 或 `display` 数学节点以及已落定的 `math` fence，并通过 KaTeX 排版。

### 被拒绝的请求保留渲染器的回退

`renderFence` 返回 `null` 表示没有规则认领该节点，文档渲染器便绘制自己的回退：fence 回退为高亮代码分支，数学回退为作者书写的源码。没有规则认领的 fence 语言渲染结果与没有特殊渲染器的语言完全一致，因此添加规则永远不会移除文档已有的行为。数学节点每一趟都会分派；fence 只在已落定的一趟分派，因为未闭合的 fence 无法渲染，而每个分片都重新分派会让每一个中间状态都重复解析。

### 文案沿用共享的 `common` 命名空间

seat 与两条规则都以 `locale: 'common'` 注册。它们拥有的外框文案——`copy`、`copied`、`markdown.footnotes` 与 `markdown.diagram`——是 `locale` 插件已携带的跨功能词汇，而非 markdown 专属措辞。各功能的 markdown label 构造器已删除。

### `WebBlock` 接受渲染器，而不是导入渲染器

`WebBlock` 不再渲染 markdown。`WebSearchBlockProps` 新增 `renderAnswer?: (answer: string) => ReactNode`，`WebBlockLabels` 去掉 `markdown` 字段；没有 `renderAnswer` 时答案按纯文本渲染。答案是否为 markdown、由哪个渲染器绘制，都由拥有它的渲染点决定。

## Alternatives considered

**把 fence 分派留在静态链接的渲染器中，并发布一个规则注册表。** 值导出的注册表能让规则在无需改动包的情况下运行，但注册表本身、它的顺序与回退仍会编译进 `ui-primitives`，而每个消费插件仍需从静态库做运行时值导入。slot 注册表已经提供注册、顺序、释放与 HMR 行为，第二个注册表是重复建设。

**只发布一个共享 markdown seat，让每个界面都注册进去。** slot 模型规定一个 slot 名称恰好只有一个声明方；共享 seat 需要一个包为它并不拥有的界面声明洞，而各界面的 owner props 与 fence 渲染器将没有声明好的到达位置。逐界面配对让声明与渲染该位置的代码留在一起。

**让每个界面自行注册内置规则。** 这能消除集中的注册成本，但 `ui-primitives` 无法承载规则组件，且任何功能插件都不得运行时导入另一个功能插件的值。它还会让数学与 Mermaid 规则按界面重复，并让各界面的渲染逐渐漂移。

**让 `WebBlock` 继续导入 `MarkdownText`。** `ui-primitives` 届时要么依赖渲染器包，要么保留第二套 markdown 渲染器，且调用方无法把答案渲染为纯文本或经由其他渲染器。

## Consequences

markdown 渲染成为一项组合选择：seat 与规则都来自一行插件条目，省略该行的部署仍会挂载各界面，只是没有它。规则作者支付固定的注册成本——每个 fence slot 一个条目，服务全部四个界面的规则需要四个。目前没有框架机制为插件枚举已声明的 fence seat，因此作者必须写出 slot 名称；把该列表发布出来要推迟到第二个规则包需要它时。

图表分支在 `DiagramBlock.module.css` 中自带一份代码块 fence 外壳副本，因为插件不能导入另一个包的样式表。两份样式表必须保持逐字节兼容；这份副本换来的，是图表的横幅、复制按钮与画布能和普通 fence 出现在同一条消息里。

seat 的授权是 owner props 闭包，而不是框架发布的注册通道。界面必须把 `renderFence` 传进 seat，且该闭包的标识对流式渲染至关重要。

`ui-primitives` 缩减为没有组合的部分：语法、纯文本投影、高亮，以及代码与 JSON 块。需要 markdown 的界面如今依赖插件条目，而它们的 markdown 外框文案来自共享命名空间，而不是各自的词典。

## Verification

`packages/client/ui-markdown/tests` 中的单元 spec 覆盖渲染器、内置规则、增量解析器、路径图片重写与手工构造的 mdast 树。`markdown-dom-parity.client.spec.tsx` 用 `tests/fixtures/markdown-dom` 逐字节固定渲染出的 DOM，因此标记不会漂移。

面向产品的客户端插件要求一个非单元的真实组合测试（[包规则](../../../../packages/AGENTS.md)）。文档预览的 markdown 注册 spec 通过 `SlotTestRuntime` 启动插件的真实 `apply` 与该界面的真实 `apply`，断言 seat 通过声明的配对完成渲染，并释放该界面以观察 seat 随声明一起离开。在图层面，`apps/web/tests/built-boot.expected.e2e.ts` 的 assembled-boot 冒烟测试挂载随包发布的 bundle 名单，其中包含 `ui-markdown` 条目。

规则是可选的，省略插件即可证明：assembled-boot 测试基架的 `mountAssembledApp` 接受一个包 id 的 `exclude` 列表，因此挂载同一组合但不含 `@deepseek-ai/dsh-client-ui-markdown` 时，每个界面的 markdown seat 都无人填充，也没有注册任何规则。在渲染器层面，selector 拒绝的 fence（例如 `ts` fence）保留代码分支，而无规则认领的数学节点保留作者书写的源码。
