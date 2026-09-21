# Agent Note: Web Mermaid fence 渲染

Status: implemented

[English](2026-09-17-web-mermaid-fences.md) | 中文

## Problem

助手回复用 ` ```mermaid ` fence 表达流程图、时序图与状态机，而 Web 渲染器把它们全部画成等宽纯文本。Mermaid 是训练数据最厚的图语言，因此承载图表最多的会话恰恰是 GUI 画不出来的那些。

其他方案各自卡在不同约束上。在浏览器里渲染 Mermaid 意味着往 JavaScript 载荷约 1.27 MB 的 shell 里塞进一个大库；在浏览器之外转换需要 Host 进程，仅做 Web 侧改动不足以证明其必要；让模型改用 JSON Canvas 或 draw.io XML 这类带坐标的格式，等于把布局推给模型，而模型在估算文字宽度和避免重叠上表现很差。

## Decision

`MarkdownText` 把已定稿的 ` ```mermaid ` fence 交给 `MermaidBlock` 渲染，该组件位于 `@deepseek-ai/dsh-client-ui-primitives`。全部在浏览器内完成，不涉及任何 Host 服务。

**加载。** `mermaid` 是 `ui-primitives` 的 `devDependencies` 条目（仅浏览器的第三方构建输入），通过模块级加载器单例里的 `await import('mermaid')` 到达。静态浏览器库保留裸 specifier，最终 Vite 构建把它切成独立的异步 chunk。`apps/web/vite.config.ts` 里的 `VENDOR_PACKAGES` 是显式白名单，其注释已声明它只服务 eager 代码，因此 `mermaid` 绝不能加入其中。

**时机。** 回复流式输出期间、以及未进入视口期间，该 fence 保持代码形态。`src/useViewportActivation.ts` 持有文档级 `IntersectionObserver`，由该 fence 与 Shiki 高亮共用；`src/markdown/useViewportHighlighting.ts` 现在只是它之上的薄封装。代码块同时充当待渲染、失败与离屏三种外观，因此一个 fence 只有一次视觉切换而不是三次。

**信任。** Mermaid 把模型生成的文本变成 SVG。`securityLevel: 'strict'` 让它自己的 sanitizer 挡在输出之前，`htmlLabels: false` 去掉 `<foreignObject>`，从而把结果收敛为不含 HTML 的纯 SVG 元素词汇表。`src/dom-to-react.tsx` 通过浏览器 HTML 解析器把该词汇表映射为 React 元素；该模块正是从 `katex.tsx` 抽出的 `domToReact`/`styleObject`，对 KaTeX 输出用的是同一套技术。fence 无法降低自己的安全等级：`%%{init: …}%%` 指令与 YAML frontmatter 只能覆盖 Mermaid `secure` 列表之外的键，而该列表包含 `securityLevel`，`tests/mermaid.client.spec.tsx` 对此做了固定。

**主题。** Mermaid 把具体颜色烘进 SVG，并且拒绝 `themeVariables` 里的 CSS 函数——它在 `initialize()` 阶段就用一个颜色库处理每个值，而该库拒绝 `var(--dsw-…)`。但它会把 `themeCSS` 原样传进 SVG 自身的样式表，而该样式表会在实时文档中解析自定义属性。因此图表配色以 `!important` 引用 `--dsw-*` token（Mermaid 用自己的渲染 id 限定其规则作用域，其特异性高于普通类选择器），亮/暗切换无需重渲染即可重绘每张图。Mermaid 会把手在盒子和盒内标签上的同一个类分别用在两处，因此每条规则都必须用元素限定：`.actor` 既是 `rect.actor` 也是 `text.actor`，若在表面规则与文字规则里都裸写该类，盒子就会穿上文字的颜色、把标签吞掉。颜色编码分类而非表面的图表族——pie、mindmap、timeline、gitgraph、sankey、radar、treemap、xychart——保留库自带调色板。

**标识与缓存。** 已渲染的 SVG 以 fence 源码为键缓存在有界的模块级 Map 中，不含主题维度，因为主题纯由 CSS 决定。Mermaid 用渲染 id 限定其样式表作用域，因此每次挂载在插入前都把该 id 重写为实例级取值；若不重写，同一份缓存 SVG 的第二次挂载会共用 DOM id 并丢失样式。

**标签。** `MarkdownLabels` 新增必填字段 `diagram`，用于渲染图的可访问名，因为 Mermaid 只输出 `role` 与 `aria-roledescription`，没有 `<title>` 或 `<desc>`。所有生产者均已更新：`ui-chat`、`ui-tool`、`ui-trajectory`、`ui-user-questions`（两处）、`ui-sidebar-documentpreview`，以及本包自身的测试夹具。

## Alternatives considered

**在 Host 渲染 Mermaid 并返回 SVG。** 这样能省掉包体积，并顺带解决 CJK 字体可用性，但会引入一个进程、一份缓存、一次远端往返，以及一个跑在模型生成文本上的转换服务。它同样无法在不搭建同一套管道的前提下服务文档预览与 trajectory 消费者。这是推迟而非否决：`plantuml` 与 `dot` 都没有同等可靠的浏览器路径，因此下一个图语言更可能需要 Host provider 而不是第二个客户端包。

**用 `var(--dsw-*)` 作为 `themeVariables` 的值。** 这样就不需要 `themeCSS` 和 `!important`。Mermaid 在 `initialize()` 阶段拒绝它：`Theme.updateColors` 通过 `khroma` 推导相关颜色，而后者对 CSS 函数抛出 `Unsupported color format`。

**用 `diagramTheme` prop 驱动主题。** 在 JavaScript 中读取当前配色并在变化时重渲染可行，但它会迫使新 prop 穿过 `MarkdownText` 抵达每个消费者，并在每次主题切换时重跑 Mermaid 布局。`themeCSS` 仅靠 CSS 达到同一结果。

**保留 `htmlLabels: true` 并映射内嵌 HTML。** `<foreignObject>` 能恢复标签换行，代价是映射 SVG 内部的 HTML 子树，并把信任面从封闭的元素词汇表扩大到标记。

**让模型改用 JSON Canvas 或 draw.io XML。** 两者都要求显式几何，而文本模型产出得很差；JSON Canvas 还把分组表达为"围住其他矩形的矩形"，模型必须自行计算边界框。

## Consequences

回复里的 ` ```mermaid ` fence 在 Web GUI 中变成图表，亮/暗主题皆然，且主 shell 各 chunk 不增长。图表在回复定稿后、且滚动进入视口后才出现；在此之前读者看到的是源码，也就是模型写下的同一段文本。

随之交付两条限制。超出节点的标签会溢出而不换行，因为 `htmlLabels: false` 正是让输出不含 HTML 的原因。分类配色的图表调色板沿用 Mermaid 并在渲染时固化，因此既不跟随 `--dsw-*` token 也不响应主题切换。

长会话浏览器基准的输入只含 ` ```ts ` fence，不含 `mermaid`，因此本次改动不触及既有前端性能预算的任一测量端点。

## Testing

`tests/mermaid.client.spec.tsx` 把懒加载的 `import('mermaid')` 替换为桩，因为 jsdom 无法对 SVG 文本布局，覆盖了流式门、视口门、配置、失败回退、缓存复用与淘汰、实例 id 重写、卸载竞态与复制行为。这个桩带来两个盲点，各自配有一道守卫。这些用例观察不到占位元素的盒子，因此有一条用例直接读取 `DiagramBlock.module.css` 并钉住占位元素的 `display` 声明：视口观察器盯的就是该元素，而没有盒子的它只会报告 0×0 矩形、永不进入相交状态，结果是每张图都停留在代码形态。这些用例同样无法证明 Mermaid 真能绘图，因此那份负担落在浏览器套件上：那里应当有一条带 `mermaid` fence 的 fixture。`tests/markdown-dom-parity.client.spec.tsx` 不新增 `mermaid` 用例：真实加载是非确定性的，而现有语料不含此类 fence，因此没有 fixture 漂移。
