# 产品原型 · 开工须知

适用范围：本目录。Vue 3.5＋Vite＋Naive UI＋Vant的三端演示原型，全部mock数据，不接真实后端。通用纪律见[根AGENTS.md](../AGENTS.md)。

## 开工依据

- 先读[前端设计说明](前端设计说明.md)和[待改项](待改项.md)，业务口径回查[01全局背景信息](../01-全局背景信息/)。代码用来核实现状，01用来确定目标。两者不一致时记录差异，不为迁就原型改01。
- 原型里的状态名、单号前缀、演示假设都不是规则。新增假设先登记到`src/shared/config/assumptions.ts`，再同步设计说明第六节。
- 背景没有的事实不自己补。已有编号的用【待确认-xx】；新的缺口先补进[待对齐事项](../01-全局背景信息/12.待对齐事项.md)的索引，再同步`src/shared/config/pending.ts`。

## 实现约束

- 三端共用的类型、mock、计算放`src/shared`。端内页面放`src/apps/<端>/pages`。管理端和收银端只用Naive UI，移动端只用Vant，不混用。
- 页面只经过`src/shared/api`读写数据，不直接改`src/shared/mock`。中枢的动作只在`mock/hub.ts`里模拟，POS页面不能替中枢做决定。
- 金额用整数分。展示复用`src/shared/utils/format.ts`：金额2位小数加千分位，单价4位小数，空值`-`，主数据按Code-Name。
- 颜色从`src/shared/theme/tokens.ts`取，图标用Phosphor的`i-ph-*`类名。
- 不展示成本价和供应商价格。不计算提成、分成、履约佣金和盘亏赔偿金额。不让POS选择仓库、库位或承运商。不把核销金额加进成交净额。

## 交付验证

- 只改文档时检查内容和链接，不用起服务。
- 改代码后运行`npm run typecheck`、`npm test`、`npm run build`。
- 改页面或交互时，用`npm run dev`在浏览器走查受影响的页面、关键动作和控制台。需要截图时运行`npm run screenshots`。
- 构建通过不等于交互通过。验证受限时写明没验证的部分。不提交`node_modules`、`dist`和截图产物。
