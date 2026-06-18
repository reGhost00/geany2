# Geany 当前架构说明

本文描述当前仓库在迁移前的整体架构，重点说明模块边界、启动流程、编辑器栈，以及与 GTK3 的主要耦合点。

## 1. 总览

当前仓库不是“仅包含一个主程序”的小型 GTK 应用，而是由多个子系统共同组成：

| 层次 | 主要目录 / 文件 | 作用 |
| --- | --- | --- |
| 构建与打包 | `meson.build`、`configure.ac`、`Makefile.am` | 同时支持 Meson 与 Autotools；定义依赖、静态库、插件和文档安装。 |
| 核心应用 | `src\main.c`、`src\libmain.c`、`src\*.c` | 主程序入口、UI 装配、文档管理、编辑器、搜索、项目、构建、插件等。 |
| 编辑器引擎 | `scintilla\`、`src\sciwrappers.*` | 内置 Scintilla GTK 版本与 Lexilla lexer；Geany 编辑功能围绕它构建。 |
| 符号 / 解析 | `ctags\`、`src\tagmanager\`、`src\symbols.c` | 代码标签、自动补全、符号树、全局 tags。 |
| UI 资源 | `data\geany.glade`、`data\ui_toolbar.xml`、`doc\geany.css` | 主界面、对话框、工具栏布局、CSS。 |
| 插件 | `plugins\`、`src\plugins.c`、`src\pluginutils.c` | 动态插件加载、信号桥接、工具栏/菜单集成。 |
| 可选终端 | `src\vte.c` | 动态加载 VTE，嵌入终端页。 |
| 测试 | `tests\` | 以 ctags 与若干核心模块测试为主。 |

## 2. 构建结构

### 2.1 双构建系统并存

- `meson.build` 直接声明核心依赖：`glib-2.0 >= 2.56`、`gmodule-2.0 >= 2.56`、`gtk+-3.0 >= 3.24`。
- `configure.ac` 仍保留传统 Autotools 流程，并通过 `GEANY_CHECK_GTK` 等宏配置 GTK3 环境。
- 顶层 `Makefile.am` 的 `SUBDIRS = ctags scintilla src plugins icons po doc data tests`，说明仓库仍按照“核心程序 + 静态子库 + 插件 + 文档 + 测试”的方式组织。

### 2.2 内置第三方组件

`meson.build` 会把以下组件一起编进仓库产物，而不是依赖系统版本：

1. `lexilla`：大量 lexer 源码直接编译进静态库。
2. `scintilla`：使用 `scintilla\gtk\ScintillaGTK.cxx`、`ScintillaGTKAccessible.cxx` 等 GTK 后端文件构建。
3. `ctags`：包含 parser、DSL、readtags、正则/fnmatch 兼容层等。

这意味着编辑器、语法高亮、可访问性、键盘/剪贴板/DND 行为并不只是“外部库行为”，而是仓库自身要维护的代码。

## 3. 启动流程

主入口非常集中：

1. `src\main.c` 只调用 `main_lib(argc, argv)`。
2. `src\libmain.c` 中的 `main_lib()` 才是真正的程序装配入口。

### 3.1 启动主线

`main_lib()` 的执行顺序大致如下：

1. `main_init_headless()`：初始化全局状态结构。
2. `log_handlers_init()`、`setup_paths()`、`main_locale_init()`：日志、资源路径、国际化。
3. `app->tm_workspace = tm_get_workspace()`：尽早准备 TagManager 工作区。
4. `parse_command_line_options()`：处理命令行，并在其中调用 `gtk_init_check()`。
5. `setup_config_dir()`：准备用户配置目录、模板目录、filedefs 目录。
6. `socket_init()`：单实例 / IPC 处理。
7. `geany_object = geany_object_new()`：创建供插件与核心信号使用的全局对象。
8. `main_init()`：创建窗口、Builder、工具栏、主部件树。
9. 依次初始化核心子系统。
10. 载入配置、插件、session、命令行文件。
11. 显示主窗口，进入 `gtk_main()`。

### 3.2 子系统初始化顺序

`main_lib()` 当前显式按以下顺序装配运行时：

`main_init -> encodings_init -> editor_init -> configuration_init -> ui_init_prefs -> search_init -> project_init -> plugins_init -> sidebar_init -> load_settings -> msgwin_init -> build_init -> keybindings_init -> notebook_init -> filetypes_init -> templates_init -> navqueue_init -> document_init_doclist -> symbols_init -> editor_snippets_init -> vte_init`

这条顺序很重要，因为说明当前代码并非完全模块化，而是存在明显的初始化依赖：

- `sidebar`、`msgwin`、`build`、`keybindings` 依赖主窗口与 Builder。
- `symbols` 依赖 `document` / `editor` / `TagManager` / `filetypes`。
- 插件必须在文件打开前加载，才能参与 UI 与行为扩展。

### 3.3 退出流程

退出同样集中在 `libmain.c` 的 `do_main_quit()` 中，按“保存配置 -> 关闭项目 -> 关闭所有文档 -> finalize/free”进行，顺序包括：

- `plugins_finalize()`
- `navqueue_free()`
- `keybindings_free()`
- `notebook_free()`
- `highlighting_free_styles()`
- `msgwin_finalize()`
- `search_finalize()`
- `build_finalize()`
- `document_finalize()`
- `symbols_finalize()`
- `project_finalize()`
- `editor_finalize()`
- `encodings_finalize()`
- `toolbar_finalize()`
- `sidebar_finalize()`
- `configuration_finalize()`
- `tm_workspace_free()`

## 4. 核心运行时数据模型

### 4.1 全局应用状态

- `GeanyApp`：保存配置目录、数据目录、文档目录、当前项目、TagManager 工作区。
- `main_widgets`：暴露主窗口、工具栏、主 notebook、侧边栏 notebook、消息窗口 notebook 等关键 UI 入口。
- `ui_widgets`：保存状态栏、偏好设置对话框、颜色/字体对话框等较少直接暴露的控件。
- `prefs` / `interface_prefs` / `toolbar_prefs` / `file_prefs` / `search_prefs` / `template_prefs`：跨模块共享的配置结构。

### 4.2 文档与编辑器对象

核心对象链是：

`GeanyDocument -> GeanyEditor -> ScintillaObject`

- `GeanyDocument` 表示一个打开的页签，管理文件名、编码、filetype、tags、只读/修改状态等。
- `GeanyEditor` 是文档持有的编辑器对象，核心字段就是 `ScintillaObject *sci`。
- `documents_array` 保存当前打开文档集合，很多模块直接遍历它。

这条对象链决定了“编辑器引擎”不是可随意拔插的小组件，而是贯穿整个应用状态模型。

## 5. UI 架构

### 5.1 Builder 与 UI 资源

当前主 UI 来源于：

- `data\geany.glade`
- `data\ui_toolbar.xml`

其中：

- `ui_utils.c` 使用 `GtkBuilder` 加载 `geany.glade`。
- `ui_hookup_widget()` / `ui_lookup_widget()` 把 Builder 创建的控件缓存到顶层 widget 的 object data 中。
- 工具栏不是单纯写死在 Glade 里，而是由 `toolbar.c` 通过 `GtkUIManager` 再次拼装。

### 5.2 主窗口分区

运行时主窗口大致由这些区域组成：

| 区域 | 主要模块 | 说明 |
| --- | --- | --- |
| 菜单栏 / 工具栏 | `ui_utils.c`、`toolbar.c`、`callbacks.c` | 命令入口、工具栏自定义、动作与快捷键绑定。 |
| 编辑区 | `document.c`、`editor.c`、`notebook.c` | 文档页签、Scintilla 编辑器、页签切换与 DND。 |
| 侧边栏 | `sidebar.c`、`symbols.c` | 打开文件树、符号树。 |
| 消息窗口 | `msgwindow.c`、`build.c` | 状态消息、编译输出、查找结果、scribble。 |
| 可选终端页 | `vte.c` | 嵌入式终端。 |

### 5.3 UI 风格

`ui_utils.c` 会加载：

- 系统数据目录下的 `geany.css`
- 用户配置目录下的自定义 `geany.css`

当前样式系统基于 GTK3 的 `GtkCssProvider + gdk_screen_get_default()`。

## 6. 编辑器与语法高亮架构

### 6.1 Scintilla 是当前编辑核心

下列模块直接绑定到 Scintilla：

- `editor.c` / `editor.h`
- `document.c` / `document.h`
- `sciwrappers.c` / `sciwrappers.h`
- `search.c`
- `printing.c`
- `highlighting.c`
- `symbols.c`
- `pluginutils.c`
- `navqueue.c`
- `vte.c`

其中 `sciwrappers.*` 提供了大量对 `SCI_*` 消息的包装；它们是当前编辑行为的统一抽象层，但这个抽象层本身仍是 Scintilla 专属抽象。

### 6.2 高亮与 filetype

- `highlighting.c` 使用 `SciLexer.h` 与 `SCI_SETPROPERTY`、style slot 等 Scintilla/Lexilla 机制。
- `filetypes.c` / `filetypes.h` 与 `highlightingmappings.h` 共同决定 filetype 到 lexer / 样式 / 关键字组的映射。
- `symbols.c` 再把 filetype、TagManager 和编辑器状态结合起来做自动补全、符号树和全局 tags。

### 6.3 打印与搜索

- `printing.c` 通过 `Sci_RangeToFormat` 直接基于 Scintilla 打印。
- `document.c` 与 `search.c` 的文本查找、选区、跳转、替换都围绕 Scintilla 的位置、行列、选区模型实现。

## 7. 符号与 TagManager

TagManager 是当前“代码智能”主干：

- `src\tagmanager\` 保存 Workspace / SourceFile / Tag 等核心对象。
- `symbols.c` 负责加载全局 tags、文档 tags、C/C++ ignore list，以及侧边栏符号树。
- `sidebar.c` 负责把文档私有的 `tag_tree` / `tag_store` 挂到左侧符号视图。

这部分与 GTK 的关系相对间接，但与文档生命周期、filetype、编辑器通知高度耦合。

## 8. 插件架构

### 8.1 插件加载

- `plugins.c` 负责扫描、装载、版本检查、激活、卸载。
- `pluginutils.c` 负责插件信号连接、工具栏注入、GSource 生命周期托管等。
- `plugins\meson.build` 说明插件与 `libgeany`、Scintilla 头文件一起构建。

### 8.2 对 UI 的暴露

插件可以直接接触：

- `main_widgets`
- `ui_utils` 中查找出的菜单/工具栏控件
- `GeanyEditor.sci`
- Geany 自己的全局信号对象 `geany_object`

这意味着任何 GTK4 迁移、工具栏重写、编辑器替换都会同时影响插件 ABI/API。

## 9. 可选与辅助子系统

### 9.1 构建与运行

- `build.c` 管理 Build 菜单、执行命令、错误跳转、编译消息解析。
- 工具栏构建按钮与消息窗口编译页签互相联动。

### 9.2 VTE

- `vte.c` 通过 `GModule` 动态加载 VTE API，而不是直接静态链接到某一版 VTE。
- 它同时依赖终端 widget、剪贴板、DND、快捷键和消息窗口页签。

### 9.3 单实例与 IPC

- `socket.c` 提供单实例与远程打开文件能力。
- 启动期由 `libmain.c` 决定是否把文件请求转发给现有实例。

## 10. 当前 GTK3 耦合面

当前代码对 GTK3 的依赖不是单点，而是多层次的：

| 耦合面 | 当前实现 | 影响 |
| --- | --- | --- |
| 应用生命周期 | `gtk_init_check()`、`gtk_main()`、`gtk_main_quit()` | 仍是 GTK3 时代的主循环模型。 |
| 动作 / 工具栏 | `GtkAction`、`GtkActionGroup`、`GtkUIManager`、`GtkToolbar`、`GTK_STOCK_*` | 是最重的旧 UI 基础设施之一。 |
| 菜单 | `GtkMenu`、`GtkImageMenuItem`、`gtk_menu_popup_at_pointer()` | 仍是旧菜单体系。 |
| 容器 API | `gtk_container_add/remove()`、`gtk_bin_get_child()`、`gtk_widget_show_all()` | 遍布大量模块。 |
| 对话框 | `gtk_dialog_run()`、循环处理 response | 同步阻塞式流程很多。 |
| 剪贴板 / DND | `GtkClipboard`、`GtkSelectionData`、`GtkTargetEntry`、`gtk_drag_dest_set()` | notebook、toolbar、vte 都在用。 |
| 样式 / 显示 | `gdk_screen_get_default()`、`gtk_style_context_add_provider_for_screen()`、`GtkStyle`、`gtk_widget_override_color()` | 依赖 GTK3/GDK3 显示模型。 |
| 旧控件 | `GtkTreeView`、`GtkStatusbar`、`GtkEventBox`、`GtkAlignment`、`GtkMisc` | 有的在 GTK4 中已移除，有的已进入废弃通道。 |
| 可访问性 | Scintilla 的 `AtkObject` / `AtkText` / `AtkEditableText` 自定义实现 | 自定义 widget 的 GTK4 迁移难点。 |

## 11. 现状结论

当前 Geany 的结构可以概括为：

1. **主程序装配集中在 `libmain.c`**，初始化顺序明确但耦合较强。
2. **UI 是 Builder + 动态工具栏双轨制**，且大量依赖 GTK3 旧动作系统。
3. **编辑器核心是 Scintilla/Lexilla**，并通过 `sciwrappers` 影响搜索、高亮、打印、插件等多条链路。
4. **TagManager / 插件 / 构建 / VTE 都直接或间接依赖当前 GTK3 与 Scintilla 结构**。
5. **GTK4 升级不是单纯 API 替换**，而是至少涉及：应用生命周期、动作/菜单体系、容器 API、DND/Clipboard、样式系统、可访问性，以及编辑器策略决策。

