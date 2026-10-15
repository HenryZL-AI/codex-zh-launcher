# Codex 中文启动助手

独立的第三方 macOS 启动工具，启用已安装 Codex Desktop 自带的简体中文界面资源。实验版 `0.1.0`，MIT。

维护者：[HenryZL-AI](https://github.com/HenryZL-AI)。

它是启动器，不是 Codex Skill 或插件。不重打包官方应用，不修改官方签名、模型、API Key、中转站或会话。没有模型调用、遥测、网络调试端口、自动退出或登录常驻服务。

[English](README.en.md) · [兼容性](docs/COMPATIBILITY.md) · [实现与权限](docs/ARCHITECTURE.md) · [隐私与问题报告](docs/PRIVACY.md)

## 适用情况

你在官方设置中选择了简体中文，侧栏仍显示 New chat、Scheduled、Plugins 等英文。工具只调整运行时中文开关，其他开关交还原应用处理。如果官方版本已正常显示中文，直接使用官方设置即可。

已实际验证 macOS Intel、Codex `26.1007.71326`。Apple Silicon 和其他构建尚无本项目实测结论。每个新构建都检查官方签名、已知翻译接口和独立窗口的真实中文侧栏；不匹配就停止，不跳过检查强行汉化。

## 安装

需要已安装的官方 Codex Desktop、Node.js **22.12.0 或更高**以及 pnpm 10。不需要付费服务或额外模型 Key。macOS 自带 `osacompile` 用于创建独立启动入口。

在解压后的源码目录执行：

```sh
pnpm install --frozen-lockfile --ignore-scripts --prod
node bin/codex-zh.mjs doctor
node bin/codex-zh.mjs validate
node bin/codex-zh.mjs install
```

`doctor`只读检查；`validate`打开独立空白窗口验证，结束后关闭该测试窗口。不会关闭日常 Codex，不读取日常 Key，也不提交提示词。应用自身可能向官方服务加载界面资源；工具不建立模型请求。第一次验证通常需要几十秒，最多等待两分钟。

安装创建 `~/Applications/Codex 中文启动.app`。可自行拖到 Dock；安装器不改 Dock。它与官方应用、已有其他汉化工具的入口分开，遇到同名文件拒绝覆盖。

安装位置默认是 `~/Library/Application Support/CodexZhLauncher/`，只包含本工具运行代码、依赖和私有状态。`node`需要保留在安装时的位置；升级 Node 或移动安装目录后可卸载重装。

## 使用

先在 Codex 的 Settings → General → Language 选择简体中文。等当前工作完成后正常退出 Codex，然后点击“Codex 中文启动”。等待实际侧栏变为中文。

工具**不会替你退出正在运行的 Codex**。如果原版已经运行，只激活它并在日志记录需要正常退出再使用中文入口；不会弹出循环退出提示，也不会停止其他任务。官方退出确认仍由你决定。

也可以从源码目录启动与读回：

```sh
node bin/codex-zh.mjs launch
node bin/codex-zh.mjs status
```

前台启动命令需要保持运行，因为它持有该应用的私有管道；使用 `.app`入口时助手在后台仅随这次应用存活。`status`只有在实际中文侧栏已确认且对应应用、助手都活着时才报告 `verified: true`。

自动识别 `/Applications/Codex.app`、`/Applications/ChatGPT.app` 和用户 Applications 下对应路径，要求官方 bundle ID 和签名。需要指定路径时：

```sh
node bin/codex-zh.mjs doctor --app /Applications/Codex.app
node bin/codex-zh.mjs install --app /Applications/Codex.app
```

## 卸载和回滚

正常退出通过本工具启动的应用后，在源码目录执行：

```sh
node bin/codex-zh.mjs uninstall
```

卸载只删除安装清单中且未被修改的工具代码和新建入口，保留诊断状态。出现新增文件、修改或符号链接时拒绝盲删。官方应用、模型/API设置、个人会话和其他中文工具均保持原样。

如果安装时指定过 `--prefix` 或 `--launcher`，卸载时使用同样的参数。依赖管理器自带的目录内相对链接会完整保留和核对，指向安装目录外的新链接会被拒绝。

随时直接打开官方 Codex 就是回滚到原启动方式。此版本不安装后台恢复服务，不接管官方更新器。升级后从中文入口启动时重新验证；不承诺任意未来版本兼容。

## 开发与发布内容

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm check
pnpm release:archive
```

源码归档由固定白名单生成，包含源码、测试、锁文件、许可证和文档。排除官方程序/词典/图标、node_modules、个人配置/日志/截图和验证缓存。依赖由锁文件安装，原许可证保留。参见 [贡献说明](CONTRIBUTING.md)。

第一版不发布自动重开、任务日志扫描或原本机修复交接功能。之后若加入恢复功能，须独立验证并由用户明确启用；不会因“已安装”就默认获得关闭应用的权限。

这是独立社区工具，与 OpenAI 无隶属或背书关系。内部翻译开关可能随官方更新改变。许可证仅覆盖本项目自写代码；Codex 应用与其中文资源由使用者自行从官方取得。
