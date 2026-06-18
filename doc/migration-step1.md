# Geany GTK4 迁移 Step 1 文档

本文档描述将 Geany 迁移到 GTK4 的第一阶段，目标：**先用 GTK4 编译运行，接受部分功能或样式缺失，然后逐步补充**。

## 1. 编辑器核心：用 GtkSourceView5 替换 Scintilla

### 1.1 背景

当前架构：
- `GeanyDocument -> GeanyEditor -> ScintillaObject`
- `sciwrappers.c/h` 封装了全部 `SCI_*` 消息
- 以下模块直接依赖 Scintilla：editor.c, document.c, sciwrappers.c, search.c, printing.c, highlighting.c, symbols.c, pluginutils.c, navqueue.c, vte.c

Scintilla 没有 GTK4 原生封装，继续使用 Scintilla 需要自行移植其 GTK 后端（工作量极大）。因此 Step 1 选择直接迁移到 GtkSourceView5。

### 1.2 需要改动的地方

#### 核心数据结构替换

| 文件 | 改动 |
|------|------|
| `src/editor.h` / `src/editor.c` | `GeanyEditor` 中的 `ScintillaObject *sci` 改为 `GtkSourceView *view`。新增 `GtkSourceBuffer *buffer` 字段管理文本和语法高亮。|
| `src/document.h` / `src/document.c` | 文档的编辑器关联、notebook child、光标位置、选区、查找操作点都需要适配新接口。|
| `src/sciwrappers.h` / `src/sciwrappers.c` | **整个包装层需要重写**。建议新建 `src/editorbackend.h` 抽象接口，原 `sciwrappers` 函数签名保留但内部桥接到 GtkSourceView。|

#### 高亮与语法

| 文件 | 改动 |
|------|------|
| `src/highlighting.c` | 当前使用 Scintilla lexer ID 和 style slot。需要改为 GtkSourceLanguage / GtkSourceStyleScheme。|
| `src/highlightingmappings.h` | 当前 `SCLEX_*` -> lexer 映射需要转为 GtkSourceLanguageManager 的语言 ID 字符串。|
| `src/filetypes.c` | filetype 到 lexer 的映射改为语言 ID。|

#### 搜索与替换

| 文件 | 改动 |
|------|------|
| `src/search.c` | 查找、替换、选区、定位依赖 Scintilla 位置模型。需要改用 `GtkTextIter` / `GtkTextMark` 模型。GtkSourceSearchContext 可处理高级搜索。|

#### 打印

| 文件 | 改动 |
|------|------|
| `src/printing.c` | 当前使用 `Sci_RangeToFormat`。改用 `GtkSourcePrintCompositor`。|

#### 符号与自动补全

| 文件 | 改动 |
|------|------|
| `src/symbols.c` | 符号树、tag 解析、auto-completion 都与编辑器状态耦合。需要通过 `GtkTextBuffer` 信号（如 `cursor-position-changed`）驱动符号更新。|

#### 其他波及模块

| 文件 | 改动 |
|------|------|
| `src/callbacks.c` / `src/tools.c` / `src/navqueue.c` | 大量 `doc->editor->sci` 直接调用需要改为新接口。|
| `src/vte.c` | 从编辑器选区向终端发送内容的逻辑需要适配新的选区模型。|
| `src/pluginutils.c` / `src/plugindata.h` | `GeanyEditor.sci` 是公开结构成员，ABI 会破坏。需要决定是否提供 Scintilla 兼容 facade，或宣告 API break 并提供新接口。|

### 1.3 可以先忽略的高级功能

以下功能在 Step 1 可以用简化实现或暂时禁用：

| 功能 | 描述 | 实现方式 |
|------|------|----------|
| **代码折叠** | GtkSourceView 原生支持折叠，但需要 `GtkSourceMap` 配合侧边栏。 | Step 1 禁用折叠，使用 `gtk_source_view_set_show_line_range_actions(false)`。后续用 `GtkSourceMap` 实现符号树折叠。|
| **自动补全（Completion）** | GtkSourceView 有 `GtkSourceCompletion`，但配置复杂。 | Step 1 禁用自动补全弹窗，保留 ctags 基础的符号补全（在 symbols.c 中通过下拉菜单实现）。后续再接入 `GtkSourceCompletionProvider`。|
| **Calltips / 参数提示** | Scintilla 有 `SCI_CALLTIP` / `SC_CALLTIP`，GTK 控件无直接对应。 | Step 1 忽略。后续可通过 `GtkSourceView` 的 overlay 或自定义 popover 实现。|
| **Snippets** | GtkSourceView 有 `GtkSourceSnippet*`，但需要大量配置。 | Step 1 忽略。可在 symbols.c 中实现简单的模板展开替代。|
| **Bracket Matching** | GtkSourceView 有 `show-line-highlight` 和 margin mark 可实现。 | Step 1 用 `gtk_source_view_set_highlight_matching_brackets(true)` 启用基础匹配高亮。高级（括号匹配时跳转、光标位置）后续补充。|
| **多选区 / 矩形选择** | Scintilla 多选区功能，GtkTextView 有基础多选但不如 Scintilla 完整。 | Step 1 只保留单选区支持。后续评估是否需要完整多选区。|
| **垂直选区** | Scintilla 的 `SCI_VISIBLE_FROM_DOC` / `SCI_ADDITIONAL_SELECTION` 相关的垂直选区。 | Step 1 忽略。|
| **标记（Markers）** | Scintilla 的 `SCI_MARKER_*` 用于书签、断点。 | Step 1 可用 `GtkSourceMark` + `GtkSourceMarkAttributes` 实现基础书签功能，放在 gutter。|

### 1.4 编辑器迁移的实施建议

1. 新建 `src/editorbackend.h` 定义抽象接口：
   ```c
   // 抽象编辑器后端接口
   typedef struct _EditorBackend EditorBackend;
   struct _EditorBackend {
       // 文本操作
       void (*set_text)(EditorBackend *backend, const char *text);
       void (*get_text)(EditorBackend *backend, char *text, gsize len);
       // 光标/选区
       gint (*get_current_pos)(EditorBackend *backend);
       void (*set_selection)(EditorBackend *backend, gint start, gint end);
       // 高亮
       void (*colourise)(EditorBackend *backend, gint start, gint end);
       // ... 其他必要接口
   };
   ```

2. 实现 `src/scitogsv5.c` 桥接层：把现有 `sci_*` 函数调用转为 GtkSourceView API 调用。

3. `sciwrappers.c/h` 保留接口签名，内部调用 `EditorBackend`。这样可以渐进式替换，而不必一次性改完所有调用点。

4. `GeanyEditor` 持有 `EditorBackend *backend` 而不是直接持有 `GtkSourceView*`。

## 2. UI 迁移：废弃 Glade，改用代码构建

### 2.1 Glade 文件问题

`data/geany.glade` 声明 `<requires lib="gtk+" version="3.20"/>`，大量使用：
- `GtkImageMenuItem`
- `stock` 属性（`gtk-new`, `gtk-open` 等）
- `use-stock` 属性

GTK4 的 `GtkBuilder` 仍然可以解析部分旧格式，但很多 GTK3 特有的控件和属性已不存在。**不能直接用于 GTK4**。

### 2.2 需要替换的 GTK3 控件

以下控件在 GTK4 中已移除或必须替换：

| GTK3 控件 | GTK4 替代方案 | 影响区域 |
|-----------|--------------|----------|
| `GtkToolbar` | `GtkBox` / `GtkCenterBox` + `GtkButton` | toolbar.c，主窗口工具栏 |
| `GtkToolButton` | `GtkButton` 或 `GtkMenuButton` | toolbar.c |
| `GtkImageMenuItem` | `GMenuItem` + `GtkMenuButton` 或直接在 `GMenu` 中指定 icon | geany.glade 菜单 |
| `GtkMenu` | `GtkPopoverMenu` | 上下文菜单、右键菜单 |
| `GtkEventBox` | 直接在目标 widget 上添加事件控制器 | sidebar.c, msgwindow.c 等 |
| `GtkAlignment` | `margin-*` / `halign` / `valign` 属性 | 散布在多个文件中 |
| `GtkMisc` | 对 `GtkLabel` 用 `gtk_label_set_xalign()` | 散布 |
| `GtkVBox` / `GtkHBox` | `GtkBox`（orientation 属性） | 散布 |
| `GtkTable` | `GtkGrid` | 散布 |
| `GtkStock` / `stock` 属性 | `GIcon` + `GtkImage::gicon` | 所有使用 stock icon 的地方 |

### 2.3 菜单系统迁移

当前：大量 `GtkImageMenuItem` + `GtkUIManager` + `ui_toolbar.xml`

GTK4 方向：
- 菜单用 `GMenu` / `GMenuModel` / `GMenuItem` 构建
- 菜单栏用 `GtkPopoverMenuBar`
- 工具栏动作用 `GAction` + `gtk_application_set_accels_for_action()`
- 上下文菜单用 `GtkPopoverMenu`

**建议**：把 `data/ui_toolbar.xml` 的解释逻辑从 `GtkUIManager` 改为手动构建 `GtkBox` + `GtkButton`/`GtkMenuButton`。

### 2.4 样式迁移

当前：`geany.css` 使用 GTK3 `GtkCssProvider` + `gdk_screen_get_default()` + `provider_for_screen`。

GTK4 方向：
- 改用 `gtk_css_provider_new()` + `gtk_css_provider_load_from_path()` 或 `load_from_data()`
- provider 挂到 display 而不是 screen：`gtk_style_context_add_provider_for_display()`
- CSS 选择器可能需要调整（GTK4 使用 CSS node 名称而非 widget class name）

### 2.5 UI 构建重构建议

1. **优先构建核心窗口**：把 `geany.glade` 的主窗口部分用代码重写。基本结构：
   ```c
   GtkApplicationWindow *window = gtk_application_window_new(app);
   GtkBox *main_box = gtk_box_new(GTK_ORIENTATION_VERTICAL, 0);
   gtk_window_set_child(window, main_box);
   // 菜单栏、工具栏、侧边栏+编辑区、消息窗口
   ```

2. **菜单构建**：使用 `GMenu` 构建完整菜单树，然后通过 `gtk_application_set_menu_model()` 设置。

3. **工具栏**：遍历现有 `ui_toolbar.xml` 的项，用 `GtkButton` 或 `GtkMenuButton` 重新构建，图标用 `GIcon` 或 `GdkPaintable`。

4. **对话框**：先保持简单实现，用 `GtkDialog` 或 `GtkMessageDialog`，后续再优化。

### 2.6 可以先忽略的 UI 功能

| 功能 | 说明 |
|------|------|
| 工具栏自定义 | 用户拖拽调整工具栏按钮位置的功能可以暂时禁用。 |
| 侧边栏可折叠动画 | 先用简单 show/hide，后续补动画。 |
| 消息窗口自动隐藏 | 先固定显示，后续优化。 |
| VTE 终端 | vte.c 需要额外迁移工作，Step 1 可以禁用或标记为不可用。 |

## 3. 其他功能的迁移

### 3.1 应用生命周期

当前：`gtk_init_check()` + `gtk_main()` + `gtk_main_quit()`

GTK4 方向：
- 改用 `GtkApplication`
- 主循环改为 `g_application_run(G_APPLICATION(app), argc, argv)`
- 窗口创建挂到 `GApplication::activate` 信号
- 文件打开挂到 `GApplication::open` 或 command-line 处理

### 3.2 容器 API

GTK4 废除了：
- `gtk_container_add()` → 用特定容器的 `gtk_*_set_child()` 或 `gtk_*_append()`
- `gtk_container_remove()` → 用 `gtk_widget_unparent()`
- `gtk_widget_show_all()` → 用 `gtk_widget_show()` + 手动遍历或 CSS

影响范围：几乎所有文件都需要修改容器相关调用。

### 3.3 对话框

当前：大量 `gtk_dialog_run()` 是同步阻塞调用。

GTK4 方向：
- 改为创建 dialog → `gtk_window_present()` → 连接 `response` 信号 → 在回调中处理结果

受影响文件：dialogs.c, project.c, build.c, prefs.c, search.c 等。

### 3.4 事件系统

GTK4 把事件信号改为事件控制器：
- `button-press-event` → `GtkGestureClick`
- `key-press-event` → `GtkEventControllerKey`
- `motion-notify-event` → `GtkEventControllerMotion`

受影响文件：notebook.c, sidebar.c, msgwindow.c, editor.c, vte.c, callbacks.c。

### 3.5 剪贴板和 DND

- `GtkClipboard` → `GdkClipboard`
- `GtkTargetEntry` / `gtk_drag_dest_set()` → `GtkDropTarget` / `GtkDragSource` / `GdkContentProvider`

受影响文件：notebook.c, toolbar.c, vte.c, editor.c。

### 3.6 可以先忽略的功能

| 功能 | 说明 |
|------|------|
| 插件系统 | 插件 ABI 变化太大，Step 1 可以禁用插件加载，主程序稳定后再恢复。 |
| VTE 终端 | vte.c 依赖 GTK3 VTE，GTK4 VTE API 变化较大，Step 1 禁用。 |
| 可访问性（ATK → GtkAccessible） | Scintilla 的自定义 ATK 实现工作量巨大，Step 1 先跳过。 |
| 打印高级功能 | `GtkSourcePrintCompositor` 基础打印可用，高级功能后续。 |
| 国际化/本地化 | 保持现有 gettext 机制不变。 |

### 3.7 其他模块迁移简表

| 模块 | 必须改动 | 可以忽略 |
|------|----------|----------|
| `libmain.c` | 应用生命周期重构，容器 API，样式 | - |
| `toolbar.c` | 完全重写，使用新控件 | 用户自定义布局 |
| `sidebar.c` | 事件控制器迁移，容器 API | 折叠动画 |
| `msgwindow.c` | 事件控制器迁移，容器 API | 自动隐藏 |
| `notebook.c` | 事件控制器迁移，DND 重写 | 拖拽tab动画 |
| `build.c` | 对话框改异步，容器 API | 高级 build 特性 |
| `project.c` | 对话框改异步，容器 API | - |
| `keybindings.c` | 适配 GtkApplication 快捷键系统 | - |
| `socket.c` | 单实例逻辑可复用，但要和 GtkApplication 协调 | - |

## 4. 迁移过程中可能遇到的坑和解决方案

### 4.1 编辑器相关

**坑 1：文本位置模型差异**
- Scintilla 使用字节偏移作为位置单位
- GtkTextBuffer 使用 `GtkTextIter`（字符单元）

**解决**：
- 定义 `EditorPosition` 类型，内部统一使用 UTF-8 字节偏移
- 在和 GtkTextBuffer 交互时转换：`gtk_text_buffer_get_iter_at_offset()` / `gtk_text_iter_get_offset()`
- 特别注意：多字节字符（如中文）时，字节偏移 ≠ 字符索引

**坑 2：选区模型差异**
- Scintilla 的 `SCI_GETSEL` 返回 `startPos` 和 `endPos`（字节偏移）
- GtkTextBuffer 的 `GtkTextMark` 可以是可见或不可见的，且方向可变

**解决**：
- 统一使用 `[anchor, caret]` 模型
- 获取选区时用 `gtk_text_buffer_get_selection_bounds()`，始终返回 `start < end` 的有序 bounds

**坑 3：语法高亮配置**
- Scintilla 通过 `SCI_SETPROPERTY("lexer.xml.script", "1")` 等设置 lexer 属性
- GtkSourceLanguage 通过 `.lang` 文件定义，关键字、语法等需要 .lang 文件支持

**解决**：
- Step 1 优先使用 GtkSourceView 自带语言（已经包含常见语言的 .lang 文件）
- 自定义语言可以后续编写 .lang 文件或从 gtksourceview-language-patterns 项目获取

**坑 4：文档修改状态（modified flag）**
- Scintilla 使用 `SCI_GETMODIFY` 检测文档是否修改
- GtkTextBuffer 使用 `gtk_text_buffer_get_modified()` + `gtk_text_buffer_set_modified()`

**解决**：
- 用 `notify::modified` 信号监听修改状态变化
- 打开文件时记得 `gtk_text_buffer_set_modified(buffer, FALSE)`

### 4.2 UI 相关

**坑 5：GTKBuilder 兼容性问题**
- 旧的 `.glade` 文件在 GTK4 中加载会失败或产生警告
- 部分控件属性不存在

**解决**：
- Step 1 完全放弃 Glade，纯代码构建 UI
- 如果需要渐进迁移，可以先尝试在 GTK4 下加载 glade 文件看哪些报错，然后针对性替换

**坑 6：stock icon 全部失效**
- `gtk-open`, `gtk-save` 等 stock icon 在 GTK4 中已不存在
- `GTK_STOCK_*` 常量全部废弃

**解决**：
- 使用 `GIcon` / `GThemedIcon`：`g_themed_icon_new("document-open")`
- 或使用自定义 icon name（如 "geany-open"）配合主题
- 可以临时用 `gtk_image_new_from_icon_name()` 并假设系统主题有这些 name

**坑 7：容器 API 导致的布局崩溃**
- 从 `gtk_container_add()` 改为 `gtk_box_append()` 或 `gtk_window_set_child()`
- 忘记移除旧 child 就添加新 child 会导致错误

**解决**：
- 仔细检查每个容器操作，确保先移除/解绑旧 child
- 用 `gtk_widget_unparent()` 清理

**坑 8：对话框不响应**
- 从 `gtk_dialog_run()` 改为异步后，回调中如果 `this` 对象已释放会导致崩溃

**解决**：
- 使用 `g_object_set_data()` 或 `g_signal_connect()` 时确保对象生命周期
- 对话框回调中不要引用已销毁的对象

### 4.3 事件系统相关

**坑 9：事件信号迁移遗漏**
- 把 `button-press-event` 改用 `GtkGestureClick` 但忘记 `button-release-event`
- 某些 widget 仍然使用旧事件信号导致编译警告或崩溃

**解决**：
- 全面搜索 `*-event` 信号使用，逐一替换
- 编译时开启 `-Wdeprecated` 警告捕获遗漏

**坑 10：键盘快捷键不响应**
- 从 `GtkUIManager` 迁移到 `GAction` 时，`gtk_accel_map_load()` 等旧 API 不再有效

**解决**：
- 用 `gtk_application_set_accels_for_action()` 设置快捷键
- 或使用 `GtkShortcutController` + `GtkShortcut`

### 4.4 构建系统相关

**坑 11：依赖版本检查**
- `meson.build` 中的 `gtk+-3.0 >= 3.24` 需要改为 `gtk4`
- 某些依赖可能没有 GTK4 版本

**解决**：
- 依赖 VTE 时，检查系统是否有 `vte-2.91`（GTK4 版）
- Scintilla 相关依赖需要从构建中移除或替换
- 插件系统可能需要完全禁用直到插件系统也迁移完成

**坑 12：Windows 平台特殊处理**
- `win32.c` / `win32.h` 中的 GTK3 特定代码
- 路径分隔符、编码转换等

**解决**：
- 检查 `src/win32.h` 和 `src/win32.c`，针对性替换 GTK3 调用

### 4.5 通用迁移策略

1. **频繁编译**：每改一小部分就编译，尽早发现问题
2. **保留备份**：在 git branch 中工作，方便回退
3. **逐步推进**：先让程序启动，再逐个功能修复
4. **日志驱动**：GTK4 报错信息通常比较清晰，利用 `g_warning()` / `g_debug()` 定位问题
5. **参考官方文档**：<https://docs.gtk.org/gtk4/migrating-3to4.html> 是最重要的参考资料

## 5. Step 1 实施检查清单

### 5.1 编译环境
- [ ] 修改 `meson.build` 依赖从 `gtk+-3.0` 改为 `gtk4`
- [ ] 移除 Scintilla 相关编译目标
- [ ] 添加 `gtksourceview-5` 依赖
- [ ] 清理所有 `-Wno-deprecated` 编译选项（让警告暴露问题）

### 5.2 应用框架
- [ ] 引入 `GtkApplication` 替代 `gtk_init_check()` / `gtk_main()`
- [ ] 把 `main_lib()` 逻辑挂到 `GApplication::activate`
- [ ] 实现退出时的 `close-request` 处理

### 5.3 UI 构建
- [ ] 丢弃 `geany.glade`，用代码构建主窗口
- [ ] 用 `GMenu` + `GtkPopoverMenuBar` 构建菜单
- [ ] 用 `GtkBox` 重构工具栏
- [ ] 重构 CSS 加载方式为 display 级 provider

### 5.4 编辑器
- [ ] 创建 `editorbackend.h` 抽象接口
- [ ] 实现 `GtkSourceView` 版本的 editor backend
- [ ] 重写 `sciwrappers.c` 内部实现调用 backend
- [ ] 适配 `GeanyEditor` 结构
- [ ] 适配 `GeanyDocument` 结构
- [ ] 适配 `highlighting.c` 使用 GtkSourceLanguage
- [ ] 适配 `search.c` 使用 GtkTextBuffer / GtkSourceSearchContext
- [ ] 适配 `printing.c` 使用 `GtkSourcePrintCompositor`

### 5.5 功能启用/禁用
- [ ] 插件系统暂时禁用（设置编译宏 `GEANY_DISABLE_PLUGINS`）
- [ ] VTE 暂时禁用
- [ ] 可访问性暂时跳过

### 5.6 验证
- [ ] 编译通过，无错误
- [ ] 程序可以启动显示主窗口
- [ ] 可以打开文件并显示文本内容
- [ ] 可以保存文件
- [ ] 基本的光标移动和文本输入可用
- [ ] 菜单基本可用