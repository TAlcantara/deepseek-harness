# Agent Note: Models 页面上的接口兼容性开关

Status: implemented

[English](2026-09-21-models-page-wire-compat-switches.md) | 中文

## Problem

`dsh-llm-pi-ai` 暴露了一组兼容性开关，手工声明的网关必须自行声明它们，因为 pi-ai 的 baseURL 探测会把一个无法识别的端点当作 OpenAI 本身来回答。此前只有 `settings.yaml` 能设置这些开关：通过 Models 页面创建的网关可以保存，却无法从界面上纠正，而适配器的拒绝信息会点名一个页面根本没有提供控件的 compat 字段。

加这样一个控件并不只是多渲染一个输入框。设置面不会拒绝适配器 `Config` 从未声明的键：schemastery 以 `strict = false` 解析，object 分支会把未知键一并合并过去。于是针对未声明字段的控件写入会成功、在下次 describe 时返回、把存储值渲染回来——却不改变任何请求。这正是本页存在的意义所要避免的失败，而它在浏览器一侧完全不可见。

第二条约束决定了控件的形态：适配器会拒绝模型协议未声明的开关，而且这种拒绝会让整份 profile 写入失败，而不是只失败那一个字段。

## Decision

### 由适配器自己的 schema 决定存在哪些开关

`compatFieldsByProtocol(namespace, schema)`（位于 [`src/client/store.ts`](../../../../packages/client/ui-settings-models/src/client/store.ts)）读取该 namespace 序列化后的 `Config`，返回本页可编辑的开关，按线上协议分组。只有两道门都通过，开关才会成为控件：协议在本页自己的 `COMPAT_PAGE_FIELDS` 表内，且适配器 schema 在 `providers.<route>.compat.<field>` 声明了该字段。本页在每次渲染该区块时调用一次，并把结果传给每张卡片，因此新建卡片、已保存行与引导弹窗不会彼此漂移。

枚举选项从该字段序列化后的 `union` 列表读取，这使本页无法给出适配器会拒绝的取值。schema 无法枚举的枚举同样会被丢弃，而不是退化为自由文本，理由相同。

### 路由的协议必须可被证明

开关是按模型的，所以本页必须知道该模型说的是哪个协议。只有当路由自己声明了 `api` 时它才能证明这一点：每一条手工声明的路由都是如此，而目录路由不是——目录路由的每个模型各自携带其安装目录条目所声明的协议，浏览器读到的任何东西都不暴露它。因此目录路由完全不获得开关控件。靠猜会把一次选错变成整份 profile 写入被拒，而页面无法判断是哪个模型出的问题。

### 布尔开关是三态的

`true`、`false` 与未设置是三种不同的请求：未设置表示把该字段留给 profile 之下的层——安装目录条目，然后是 pi-ai 自己的探测。因此控件是三选项下拉（提供方默认 / 是 / 否），而不是复选框；清除模型的最后一个开关会删除 `compat` 对象，而不是存下 `{}`——后者会让该行渲染成已配置，而适配器读到的是什么都没声明。

## Alternatives considered

**卡片上的请求头（`headers`）编辑器。** 已实现，并在落地前移除。三处彼此独立的记录都认定 profile `headers` 被刻意排除在 Models 页面字段之外：[`dsh-llm-pi-ai` README](../../../../packages/llm/llm-pi-ai/README.zh.md) 说部署 headers 能到达模型发现、但「不会成为 discovery 请求字段或 Models 页面字段」，[`dsh-client-ui-settings-models` README](../../../../packages/client/ui-settings-models/README.zh.md) 声明本页没有该编辑器，而[草稿提供方端点询问](../../implemented/architecture/2026-08-04-draft-provider-endpoint-interrogation.zh.md)把它保留为 Host 侧的例外。实现它还暴露了那些记录所预言的缺陷：**获取可用模型**发送的是**已存储**的 headers，因此改了但未保存的请求头会被静默忽略——正是那份 note 用来否决「整段读取已存储 profile」的「表单显示 X、请求使用 Y」失败。何况请求头的值只是普通字符串字典，脱敏器不会剥离它，编辑器等于邀请用户把凭据填进一个页面随后会明文返回的字段。要重新考虑这件事，需要先就脱敏、以及把草稿 headers 接入发现流程作出决定，而不是先加一个编辑器。

**由 schema 驱动的通用表单。** 否决：本编辑器是按版式手写的，渲染每一个已声明字段会把重试策略、图片预算与超时变成没有产品文案的裸控件。精选字段集是本包已经记录的取舍。

**用提供方级 compat 取代模型级。** 属于推迟而非否决：路由级默认值是适配器自己的一等字段，当一条路由的模型共用同一协议时它是更省事的控件。本次变更只交付模型级控件。

**枚举值自由文本。** 否决：本页会给出适配器随后拒绝的取值，而且它会拒绝整份 profile 而不只是该字段。

## Testing

[`tests/provider-form.client.spec.tsx`](../../../../packages/client/ui-settings-models/tests/provider-form.client.spec.tsx) 直接钉住这次 schema 读取——枚举取值与页面顺序、schema 未声明的开关、由非 const schema 组成的枚举、缺失的 namespace、以及没有 profile schema 的 namespace——并让渲染出的控件走完整区块：同时写入一个布尔与两个枚举、把开关设回提供方默认、清除某个模型的最后一个开关、Responses 协议获得属于自己的开关、目录路由与不支持的协议一个都拿不到、以及相邻行原样带过。`tests/components.client.spec.tsx` 直接渲染该编辑器以覆盖非 pi-ai 的 namespace。`tests/styles.client.spec.ts` 让新增的类只使用已声明的主题 token。本包处于逐文件 100% 覆盖率门禁之下。

## Consequences

网关现在可以在创建它的页面上被纠正，且纠正会在下一个请求生效，因为设置是每次操作重新读取的。本页无法写入适配器不会读取的兼容性键，也无法给出适配器会拒绝的取值——这两个性质都通过读取适配器 schema 来保证，而不是重述它。

代价是：目录路由仍然无法获得模型级开关，因为浏览器无从得知其目录条目声明的协议；该路由仍可在 `settings.yaml` 中纠正，而自行声明 `api` 的路由不受影响。本页现在还依赖序列化后 `compat` 对象的形态，因此若 schema 重命名或嵌套了这些字段，控件会消失而不是写错——失败方向是少一个控件，这正是本页更愿意承受的方向。
