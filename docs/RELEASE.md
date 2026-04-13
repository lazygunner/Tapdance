# 发布流程

## 分支规则

1. 日常开发只在 `desktop` 进行。
2. `desktop` 只能通过 Pull Request 合并到 `main`。
3. 正式发布 tag 只在 `main` 上创建，不要在 `desktop` 上打 tag。

## 发布步骤

1. 在 `desktop` 完成开发、自测并推送分支。
2. 提交 Pull Request：`desktop -> main`。
3. Pull Request 合并后，在本地切到 `main` 并同步最新代码：

```bash
git checkout main
git pull origin main
```

4. 按版本类型升级版本号：

```bash
npm run release:patch
```

或：

```bash
npm run release:minor
npm run release:major
```

5. 校验当前 tag 和 `package.json.version` 一致：

```bash
npm run version:check-tag -- v0.1.0
```

6. 推送 `main` 和 tag：

```bash
git push origin main
git push --tags
```

## 常用命令

```bash
npm run release:patch
npm run release:minor
npm run release:major
npm run version:check-tag
```

## 发布前检查

1. 当前分支是 `main`
2. 本地 `main` 已同步远端
3. 工作区干净
4. 版本号已通过 `npm version` 更新
5. tag 已创建
6. 已执行 `git push origin main` 和 `git push --tags`
