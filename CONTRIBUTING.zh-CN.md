# 参与贡献

感谢你帮助改进 `sdf-glyph-atlas`。

[English](CONTRIBUTING.md)

## 环境准备

使用 Node.js 24 和 npm 11：

```sh
npm install
npx playwright install chromium
npm run check
```

`npm run check` 不会修改文件，浏览器覆盖默认只使用 Chromium。使用 `npm run format` 应用 Biome 的安全格式化和 lint 修复。

如需在本地复现完整 CI 与 Release 矩阵：

```sh
npx playwright install chromium firefox webkit
npm run check:ci
```

## 修改原则

- 除非提案证明存在明确需求，否则保持本包与渲染器无关且没有运行时依赖。
- 算法、打包或缓存行为的变化必须增加确定性单元测试。
- 依赖真实 Canvas 的行为应增加浏览器测试。
- 不保存精确浏览器像素快照，因为栅格化会随操作系统和字体后端变化。
- 公开行为变化时同步更新两种语言的 README。
- 不要修改生成的 `dist` 文件。

提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)：`fix:` 生成 patch 版本，`feat:` 生成 minor 版本，`!` 或 `BREAKING CHANGE` footer 表示不兼容修改。Release Please 根据合入 `master` 的提交维护版本 PR、版本号、CHANGELOG、tag 和 GitHub Release。

## Pull Request

发起 Pull Request 前运行：

```sh
npm run check
git status --short
```

请描述可观察行为的变化、兼容性影响并附带测试。`master` 分支应始终保持可发布状态。

仓库管理员应保持 `master` 为默认分支，并在 GitHub 中保护该分支：合并前要求 `Validate package` 状态检查通过，同时禁止强制推送和删除分支。

## 发布

合并 Release Please PR 后会创建 `vX.Y.Z` GitHub Release，并附加通过测试的 npm tarball 和 SHA-256 校验文件。npm 发布特意保留为人工操作：

1. 首次发布前执行 `npm view sdf-glyph-atlas name`，再次确认包名仍然可用；如果返回已有包，应停止发布。
2. 下载两个 Release 附件。
3. 使用 `.sha256` 文件验证 tarball。
4. 确认 npm 账号已启用双因素认证。
5. 执行 `npm publish ./sdf-glyph-atlas-X.Y.Z.tgz --access public`。
6. 使用 `npm view sdf-glyph-atlas@X.Y.Z` 验证 registry 元数据。

如果从干净的本地 checkout 发布，应安装三种 Playwright 浏览器，切换到准确的 `vX.Y.Z` tag 后执行 `npm publish`。`prepublishOnly` 会运行完整浏览器矩阵，并拒绝脏工作区、未打 tag 的提交、tag 与版本不一致或开发占位版本。
