# Geany 升级到 GTK4 的改造面分析

本文面向后续迁移实施，说明把当前代码升级到 GTK4 时需要改哪些地方，并单独分析“改用 GtkSourceView5 替换当前编辑控件”的范围与风险。

## 1. 先说结论

Geany 当前升级到 GTK4 有两条路线，但不要混为一个任务：

1. **GTK 平台层迁移**：把主程序、窗口、菜单、工具栏、对话框、事件、DND、Clipboard、样式、辅助功能切到 GTK4。
2. **编辑器栈迁移**：决定保留 Scintilla 并把其 GTK 后端移植到 GTK4，还是直接改用 GtkSourceView5。

这两件事都大，但第二件更大。  
如果目标是“先跑在 GTK4 上”，更现实的路线通常是：

- **短期**：先完成 GTK4 平台层迁移，并保留 Scintilla（前提是补齐 Scintilla GTK4 后端）。
- **长期**：如果要换 GtkSourceView5，把它当成一次独立的大版本重构，而不是 GTK4 迁移顺手完成的子任务。

## 2. 当前阻塞项总表

| 领域 | 当前实现 | GTK4 方向 |
| --- | --- | --- |
| 依赖声明 | `gtk+-3.0 >= 3.24` | 改为 `gtk4`，同时审查 VTE / 插件 / Builder 资源兼容性。 |
| 主循环 | `gtk_init_check()` + `gtk_main()` | 改为 `GtkApplication` / `GApplication` 驱动。 |
| 菜单与动作 | `GtkAction` / `GtkActionGroup` / `GtkUIManager` | 改为 `GAction` / `GMenuModel` / `GtkPopoverMenuBar` / `GtkPopoverMenu`。 |
| 工具栏 | `GtkToolbar` + `ui_toolbar.xml` + stock item | GTK4 无 `GtkToolbar`，需要重建设计。 |
| 上下文菜单 | `GtkMenu` / `GtkImageMenuItem` | 改为 `GtkPopoverMenu` 或自定义 `GtkPopover`。 |
| 容器 API | `gtk_container_add/remove()`、`gtk_bin_get_child()`、`gtk_widget_show_all()` | 改为 widget-specific API 与显式可见性控制。 |
| 对话框 | 大量 `gtk_dialog_run()` | 改为 `response` 信号 / 异步或非阻塞流程。 |
| 文件选择 | `GtkFileChooserDialog` / `GtkFileChooserNative` | GTK4 可继续用但要改成非阻塞；长期优先新式文件对话框 API。 |
| 剪贴板 | `GtkClipboard` | 改为 `GdkClipboard`。 |
| DND | `GtkTargetEntry` / `GtkSelectionData` / `gtk_drag_dest_set()` | 改为 `GtkDragSource` / `GtkDropTarget` / `GdkContentProvider`。 |
| 样式 | `gdk_screen_get_default()` / `provider_for_screen` / `GtkStyle` | 改为 display 级 provider 和 CSS / style context 新模式。 |
| 辅助功能 | `AtkObject` / `AtkText` / `AtkEditableText` | 改为 `GtkAccessible` role/property/state/relation 体系。 |
| 编辑器控件 | 内置 ScintillaGTK + Lexilla | 二选一：移植 Scintilla GTK4 后端，或换 GtkSourceView5。 |
| 列表树控件 | `GtkTreeView` / `GtkTreeStore` / `GtkListStore` | GTK4 仍可用但 4.10 起已废弃，长期建议迁到 `GtkListView` / `GtkColumnView` / `GtkTreeListModel`。 |
| 状态栏 | `GtkStatusbar` | GTK4 仍可用但 4.10 起已废弃，长期建议自定义状态栏实现。 |

## 3. 构建与依赖层需要改什么

### 3.1 `meson.build` / `configure.ac`

当前构建文件明确写着 GTK3：

- `meson.build`：`gtk+-3.0 >= 3.24`
- `configure.ac`：`GEANY_CHECK_GTK`
- 编译选项中还显式压制了大量 GTK3 废弃告警

需要调整为：

1. 依赖切换到 GTK4。
2. 清理 `-Wno-deprecated-declarations` 与 GTK3 专用兼容假设。
3. 重新评估以下内置/外部依赖是否有 GTK4 对应版本：
   - VTE
   - Scintilla GTK backend
   - 插件编译头文件
   - Builder UI 文件

### 3.2 资源文件

`data\geany.glade` 当前声明 `<requires lib="gtk+" version="3.20"/>`，并大量使用：

- stock image / `use-stock`
- `GtkImageMenuItem`
- 旧式菜单与工具栏部件

这些都需要重写或转换，不能直接拿到 GTK4 里继续使用。

## 4. 应用生命周期与单实例模型

### 4.1 `gtk_main()` 需要退场

GTK4 官方迁移文档明确建议把 `gtk_main_*` 迁到 `GtkApplication` / `GApplication`。  
当前 `libmain.c` 使用的是：

- `gtk_init_check()`
- `gtk_main()`
- `gtk_main_quit()`

建议改造方向：

1. 引入 `GtkApplication` 作为主入口。
2. 把窗口创建逻辑挂到 `activate`。
3. 把打开文件逻辑挂到 `open` / command-line 处理。
4. 把退出确认改挂到 `GtkWindow::close-request`。

### 4.2 单实例 / IPC 可以重估

当前仓库自己维护了 `socket.c` 单实例和远程打开文件。  
迁到 `GtkApplication` 后，建议重新评估：

- 哪部分仍需保留自定义 socket
- 哪部分可交给 `GApplication` 的 activate/open/command-line 机制

这不一定能完全删除 `socket.c`，但至少值得把“单实例逻辑”和“GTK 初始化逻辑”拆开。

## 5. 菜单、动作、工具栏：这是第一大块重构

### 5.1 现状

当前代码大量依赖：

- `GtkAction`
- `GtkActionGroup`
- `GtkUIManager`
- `GTK_STOCK_*`
- `gtk_image_new_from_stock()`
- `GtkImageMenuItem`
- `GtkToolbar`

关键文件：

- `src\toolbar.c`
- `src\build.c`
- `src\navqueue.c`
- `src\callbacks.c`
- `data\ui_toolbar.xml`
- `data\geany.glade`

### 5.2 GTK4 替代方向

推荐统一迁到：

1. **动作层**：`GAction` / `GSimpleAction`
2. **菜单模型**：`GMenuModel` / `GMenu`
3. **菜单栏**：`GtkPopoverMenuBar`
4. **弹出菜单**：`GtkPopoverMenu`
5. **可触发控件**：实现 `GtkActionable` 的按钮 / 菜单按钮 / 自定义 widget
6. **快捷键**：`gtk_application_set_accels_for_action()`，必要时辅以 `GtkShortcutController`

### 5.3 工具栏必须重设计

GTK4 文档中已不存在 `GtkToolbar` 页面；当前工具栏自定义体系也完全建立在：

- `GtkUIManager`
- `GtkToolbar`
- `GtkToolButton`
- stock item

之上，因此不能“机械替换”。

比较现实的做法是：

1. 把工具栏看成一个普通容器，而不是 GTK3 的“专用工具栏控件”。
2. 用 `GtkBox` / `GtkCenterBox` / `GtkHeaderBar` + `GtkButton` / `GtkMenuButton` / `GtkEntry` 重构。
3. 保留用户自定义布局能力，但重写 `ui_toolbar.xml` 解释器和插件插入机制。

## 6. 容器、窗口和同步对话框

### 6.1 容器 API

当前代码中大量出现：

- `gtk_container_add()`
- `gtk_container_remove()`
- `gtk_bin_get_child()`
- `gtk_widget_show_all()`

GTK4 需要改成 widget-specific API，例如：

- `gtk_window_set_child()`
- `gtk_box_append()`
- `gtk_scrolled_window_set_child()`
- `gtk_paned_set_start_child()` / `gtk_paned_set_end_child()`
- `gtk_widget_set_visible()`

并且 `gtk_bin_get_child()` 这种通用取子控件方式要改成特定控件 API 或自己保存引用。

### 6.2 旧包装控件

当前代码里还有：

- `gtk_event_box_new()`
- `gtk_alignment_new()`
- `gtk_misc_set_alignment()`

建议替换为：

- 直接把事件控制器挂在真实 widget 上
- 使用 `margin-*`、`halign`、`valign`
- 对 `GtkLabel` 用 `gtk_label_set_xalign()` / `gtk_label_set_yalign()`

### 6.3 窗口位置与状态保存

当前仍使用：

- `gtk_window_move()`
- `gtk_window_set_position()`

GTK4 迁移文档建议不要依赖这类窗口定位行为，尤其在 Wayland 下更不可靠。  
建议保留：

- `default-width`
- `default-height`
- `maximized`
- `fullscreened`

而不再把“绝对坐标恢复”当成必须语义。

### 6.4 `gtk_dialog_run()` 全部要改

`dialogs.c`、`project.c`、`build.c`、`prefs.c`、`search.c` 等模块大量依赖同步 `gtk_dialog_run()`。

GTK4 下建议统一改为：

1. 创建 dialog
2. `gtk_window_present()`
3. 连接 `response` 信号
4. 在回调中继续业务逻辑并销毁 dialog

对文件对话框来说：

- `GtkFileChooserDialog` 在 GTK4 中仍存在，但 **4.10 起已废弃**
- `GtkFileChooserNative` 仍可作为过渡
- 长期最好转向更新的文件对话框 API

## 7. 事件、快捷键、剪贴板与 DND

### 7.1 事件信号要迁到事件控制器

GTK4 官方迁移文档明确指出：

- `button-press-event` / `button-release-event` → `GtkGestureClick`
- `key-press-event` / `key-release-event` → `GtkEventControllerKey`
- `motion-notify-event` / `enter-notify-event` / `leave-notify-event` → `GtkEventControllerMotion`
- `scroll-event` → `GtkEventControllerScroll`
- `focus-in-event` / `focus-out-event` → `GtkEventControllerFocus`

受影响最明显的文件：

- `src\notebook.c`
- `src\sidebar.c`
- `src\msgwindow.c`
- `src\editor.c`
- `src\vte.c`
- `src\callbacks.c`

### 7.2 剪贴板

当前代码使用：

- `GtkClipboard`
- `gtk_clipboard_get()`
- `gtk_clipboard_wait_for_text()`

GTK4 迁移文档明确给出的方向是：

- 用 `GdkClipboard`
- 从 widget 或 display 获取 clipboard
- 通过 content provider / async API 读写内容

这会影响：

- 编辑器相关复制粘贴
- 消息窗口复制
- 搜索框读取主选区
- VTE 终端复制粘贴

### 7.3 DND

当前 notebook、toolbar、vte 都用了：

- `GtkTargetEntry`
- `GtkSelectionData`
- `gtk_drag_dest_set()`
- `gtk_drag_finish()`

GTK4 的替代方向是：

- `GtkDragSource`
- `GtkDropTarget`
- `GdkContentProvider`

这部分不是“改函数名”，而是要重写拖拽数据流。

## 8. 样式与显示系统

当前样式层使用：

- `gdk_screen_get_default()`
- `gtk_style_context_add_provider_for_screen()`
- `GtkStyle`
- `gtk_widget_override_color()`

GTK4 方向应改为：

- display 级 CSS provider（`..._for_display`）
- 更少依赖临时 style object
- 用 CSS class / CSS node / widget 属性驱动样式

同时，`GtkStyle` 与 `gtk_widget_override_color()` 相关代码需要直接重写，不能继续沿用。

## 9. 可访问性：ATK 要改成什么

### 9.1 当前问题在哪里

当前最重的辅助功能逻辑不在 Geany 主代码，而在内置 Scintilla GTK 后端：

- `scintilla\gtk\ScintillaGTKAccessible.cxx`
- `scintilla\gtk\ScintillaGTKAccessible.h`
- `scintilla\gtk\ScintillaGTK.h`

当前实现使用了：

- `AtkObject`
- `AtkText`
- `AtkEditableText`
- `atk_object_notify_state_change()`
- `AtkObjectFactory` / `AtkRegistry`
- ATK state set / attribute set / factory 注册

### 9.2 GTK4 替代方向

GTK4 官方 accessibility 文档的核心是 `GtkAccessible`：

1. **role**：通过 `GtkAccessibleRole` 指定控件语义，例如 `BUTTON`、`TEXT_BOX`、`MENU_BAR`。
2. **state**：通过 `gtk_accessible_update_state()` 更新状态。
3. **property**：通过 `gtk_accessible_update_property()` 更新属性。
4. **relation**：通过 `gtk_accessible_update_relation()` 更新关系。

如果是自定义 widget，还要考虑：

- `get_accessible_parent`
- `get_first_accessible_child`
- `get_next_accessible_sibling`
- 必要时 `gtk_accessible_set_accessible_parent()`
- 必要时 `gtk_accessible_update_next_accessible_sibling()`

### 9.3 对当前仓库的实际含义

如果你继续保留自定义 Scintilla GTK widget，那么就需要把当前基于 `AtkText` / `AtkEditableText` 的实现重写为 GTK4 accessibility 体系。  
这是 **保留 Scintilla 路线** 中最棘手的子任务之一。

如果改用 `GtkSourceView5`，由于它本身已经建立在 GTK4 文本控件体系上，可访问性成本会明显下降。

## 10. `GtkTreeView` / `GtkStatusbar` 等旧控件的处置

GTK4 并不是所有老控件都立刻消失，但有些已经进入废弃通道：

- `GtkTreeView`：GTK4 中存在，但 **4.10 起已废弃**
- `GtkStatusbar`：GTK4 中存在，但 **4.10 起已废弃**
- `GtkFileChooserDialog`：GTK4 中存在，但 **4.10 起已废弃**

因此可以把迁移分成两层：

### 10.1 第一层：先跑起来

- `GtkNotebook` 可继续保留。
- `GtkTreeView` / `GtkStatusbar` 可在第一阶段先保留，以降低一次性重构规模。

### 10.2 第二层：长期清理

建议逐步迁往：

- `GtkListView`
- `GtkColumnView`
- `GtkTreeListModel`
- `GtkSingleSelection` / `GtkMultiSelection`

受影响的主要区域：

- `sidebar.c`：打开文件树、符号树
- `msgwindow.c`：状态/编译/消息列表
- `toolbar.c`：工具栏自定义列表
- 插件管理器等列表界面

## 11. 用 GtkSourceView5 替换当前编辑控件，需要改哪些地方

这部分要单独看，因为它不是“GTK4 API 迁移”，而是 **编辑器内核迁移**。

### 11.1 GtkSourceView5 提供什么

官方文档显示 GtkSourceView5 基于 `GtkTextView` / `GtkTextBuffer`，并提供：

- `GtkSourceView`
- `GtkSourceBuffer`
- `GtkSourceLanguage` / `GtkSourceLanguageManager`
- `GtkSourceCompletion`
- `GtkSourceSearchContext` / `GtkSourceSearchSettings`
- `GtkSourceGutter` / `GtkSourceGutterRenderer*`
- `GtkSourceMark` / `GtkSourceMarkAttributes`
- `GtkSourceSnippet*`
- `GtkSourceFileLoader` / `GtkSourceFileSaver`
- `GtkSourcePrintCompositor`
- `GtkSourceMap`

也就是说，它覆盖了“代码编辑器”所需的很多基础设施，但不等于与 Scintilla 1:1 对应。

### 11.2 可以映射的能力

下列能力可以在 GtkSourceView5 中找到相近承载点：

- 语法高亮
- 语言定义 / 语言管理
- style scheme
- 行号
- 右边距高亮
- 当前行高亮
- gutter / mark
- snippets
- 基础补全
- 搜索上下文
- 文件加载 / 保存
- 打印合成

### 11.3 需要大改的核心位置

如果改成 GtkSourceView5，至少这些模块需要重构：

| 模块 | 为什么必须改 |
| --- | --- |
| `src\editor.h` / `src\editor.c` | `GeanyEditor` 当前核心字段是 `ScintillaObject *sci`。 |
| `src\document.h` / `src\document.c` | 文档与 notebook child、光标位置、选区、查找、保存点都围绕 Scintilla。 |
| `src\sciwrappers.h` / `src\sciwrappers.c` | 整个包装层是 `SCI_*` 消息抽象，GtkSourceView5 下不成立。 |
| `src\highlighting.c` / `src\highlightingmappings.h` | 目前基于 Scintilla lexer ID、style slot、lexer property。 |
| `src\search.c` | 查找、替换、选区、定位逻辑依赖 Scintilla 位置模型。 |
| `src\printing.c` | 使用 `Sci_RangeToFormat`，需要改为 `GtkSourcePrintCompositor` 或重写。 |
| `src\symbols.c` | 与编辑器通知、当前光标、自动补全、brace/calltip 状态有直接关系。 |
| `src\callbacks.c` / `src\tools.c` / `src\navqueue.c` | 许多命令直接操纵 `doc->editor->sci`。 |
| `src\pluginutils.c` / 插件 API | 插件当前可以拿到 `ScintillaObject`；替换后会有 ABI/API 变化。 |
| `src\vte.c` | 有从编辑器/选区向终端发送内容的逻辑，当前依赖 Scintilla。 |

### 11.4 还会波及 public API / 插件 ABI

这是最容易低估的一点：

- `GeanyEditor.sci` 是公开可见结构成员。
- `sciwrappers` 也是公开 API 的一部分。
- 现有插件可能直接发送 `SCI_*` 消息或连接 Scintilla 信号。

因此一旦换成 GtkSourceView5，就不能只改 Geany 主程序，必须同步决定：

1. 是否接受插件 ABI 破坏。
2. 是否提供新的编辑器抽象层给插件。
3. 是否维护一层“Scintilla 兼容 facade”。

### 11.5 风险判断

**GtkSourceView5 替换不是低成本替换。**  
它本质上是：

- 换编辑器 widget
- 换文本模型
- 换高亮模型
- 换补全/搜索/打印接入点
- 同时动到插件 API

如果没有接受 ABI break 的准备，这条路很难在第一阶段完成。

## 12. 更现实的迁移路线建议

### 路线 A：先保留 Scintilla

适合目标：**尽快让 Geany 在 GTK4 上可运行，并尽量保留现有行为与插件模型**

建议阶段：

1. 先把主程序迁到 `GtkApplication`。
2. 重构菜单/工具栏/对话框/事件/DND/Clipboard/样式。
3. 处理 Scintilla GTK4 后端与 accessibility 改造。
4. 等应用稳定后，再评估是否需要替换编辑器内核。

优点：

- 行为变化更可控
- `sciwrappers`、高亮、搜索、打印、插件改动相对少

难点：

- Scintilla 自定义 GTK widget 与 accessibility 要自己扛

### 路线 B：直接换 GtkSourceView5

适合目标：**接受一次较大架构重构，并愿意同步处理插件兼容性**

建议阶段：

1. 先完成 GTK4 UI 平台迁移基线。
2. 抽象出独立的 editor backend 接口。
3. 分阶段替换 `editor/document/search/highlighting/printing/plugin API`。
4. 最后清理 Scintilla/Lexilla 依赖。

优点：

- 更贴近 GTK4 原生文本体系
- 可访问性与未来 GTK 演进压力更小

难点：

- 改动面最大
- 插件与行为兼容成本最高

## 13. 建议的实际实施顺序

如果这个 fork 的目标是“先把 Geany 换到 GTK4”，建议按下面顺序推进：

1. **先做 GTK3 清理**：在 GTK3 下尽量去掉明显废弃 API，减少迁移噪音。
2. **切应用生命周期**：`GtkApplication`、activate/open、close-request。
3. **重做菜单/动作/工具栏**：这是 GTK4 编译通过的关键阻塞项。
4. **改对话框与容器 API**：清掉 `gtk_dialog_run()`、`gtk_container_*`、`gtk_widget_show_all()`。
5. **改事件 / DND / Clipboard / CSS**。
6. **决定编辑器路线**：保留 Scintilla 还是上 GtkSourceView5。
7. **最后处理可访问性与长期 modernization**：`GtkTreeView` / `GtkStatusbar` / 新式列表模型。

## 14. 外部参考

- GTK4 迁移指南：<https://docs.gtk.org/gtk4/migrating-3to4.html>
- GTK4 Accessibility：<https://docs.gtk.org/gtk4/section-accessibility.html>
- `GtkAccessible`：<https://docs.gtk.org/gtk4/iface.Accessible.html>
- GtkSourceView5 文档入口：<https://gnome.pages.gitlab.gnome.org/gtksourceview/gtksourceview5/>

