# Geany 编辑器架构文档

> 版本: 2.2.0 | GTK 版本: 4.x | Scintilla 版本: 5.5.8 | Lexilla 版本: 5.4.6

---

## 目录

1. [项目总览](#1-项目总览)
2. [整体架构图](#2-整体架构图)
3. [目录结构](#3-目录结构)
4. [核心子系统](#4-核心子系统)
5. [文本编辑界面](#5-文本编辑界面)
6. [语法高亮系统](#6-语法高亮系统)
7. [语法检查与构建系统](#7-语法检查与构建系统)
8. [插件系统](#8-插件系统)
9. [文件类型系统](#9-文件类型系统)
10. [符号管理系统](#10-符号管理系统)
11. [扩展指南：添加新文件类型支持](#11-扩展指南添加新文件类型支持)
12. [扩展指南：内嵌语言服务(LSP)](#12-扩展指南内嵌语言服务lsp)
13. [扩展指南：AI 集成](#13-扩展指南ai-集成)
14. [扩展指南：二进制文件与图片显示](#14-扩展指南二进制文件与图片显示)
15. [关键源文件索引](#15-关键源文件索引)

---

## 1. 项目总览

Geany 是一个基于 GTK 和 Scintilla 的轻量级集成开发环境（IDE），使用 C 语言编写。其核心设计哲学是：

- **轻量快速**：最小化外部依赖（仅 GTK + GLib），启动和运行速度快
- **基于 Scintilla**：使用业界成熟的 Scintilla 编辑器组件，天然支持代码编辑功能
- **高度可扩展**：通过 GModule 加载的动态插件系统
- **文件类型驱动**：语法高亮、构建命令、符号解析均基于文件类型配置

### 核心依赖

| 依赖 | 最低版本 | 用途 |
|------|---------|------|
| GTK | 4.x | UI 框架 |
| GLib | 2.56+ | 核心工具库、GObject 系统 |
| GModule | 2.56+ | 动态插件加载 |
| Scintilla | 5.5.8（内嵌） | 文本编辑器组件 |
| Lexilla | 5.4.6（内嵌） | 语法词法分析器 |
| u-ctags | （内嵌） | 符号解析 |

---

## 2. 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    Geany 主应用 (libmain.c)                      │
│         初始化、主窗口管理、全局配置、生命周期控制                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────┐   ┌──────────────┐   ┌──────────────┐
│  文档管理器   │   │   UI 管理器    │   │  插件系统     │
│ document.c  │   │ ui_utils.c   │   │ plugins.c    │
│             │   │ dialogs.c    │   │ plugindata.h │
│ ┌─────────┐ │   │ sidebar.c    │   │ pluginutils  │
│ │ 编辑器   │ │   │ notebook.c   │   │ geanyplugin.h│
│ │editor.c │ │   │ msgwindow.c  │   └──────────────┘
│ │         │ │   └──────────────┘
│ │Scintilla│ │
│ └─────────┘ │
└─────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        支撑子系统                                 │
├──────────────┬───────────────┬──────────────┬──────────────────┤
│  语法高亮     │   构建系统     │   符号管理    │   搜索/替换       │
│highlighting.c│   build.c     │  symbols.c   │   search.c       │
│mappings.h    │              │  tagmanager/ │                   │
├──────────────┼───────────────┼──────────────┼──────────────────┤
│  文件类型     │   快捷键管理   │   项目管理    │   编码管理        │
│ filetypes.c  │keybindings.c │  project.c   │  encodings.c     │
├──────────────┴───────────────┴──────────────┴──────────────────┤
│                     配置系统 (keyfile.c, prefs.c, stash.c)       │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       内嵌组件                                    │
├──────────────────┬──────────────────┬──────────────────────────┤
│  Scintilla       │  Lexilla         │  u-ctags (ctags/)         │
│  scintilla/gtk/  │  scintilla/      │  符号解析引擎              │
│  文本编辑器控件   │  lexilla/        │                           │
│                  │  词法分析器库     │                           │
└──────────────────┴──────────────────┴──────────────────────────┘
```

---

## 3. 目录结构

```
geany2/
├── src/                  # 核心源代码（~98个C/H文件）
│   ├── tagmanager/       # 符号管理子系统（tm_*.c）
│   ├── editor.c          # 编辑器管理（5400行）
│   ├── document.c        # 文档/缓冲区管理（3838行）
│   ├── highlighting.c    # 语法高亮（2061行）
│   ├── build.c           # 构建系统集成（2777行）
│   ├── plugins.c         # 插件加载/管理（2003行）
│   ├── filetypes.c       # 文件类型管理（2061行）
│   ├── plugindata.h      # 插件 API 定义（400+行）
│   └── ...
├── scintilla/            # 内嵌 Scintilla 编辑器组件
│   ├── gtk/              # GTK 绑定层
│   ├── src/              # Scintilla 核心
│   ├── include/          # 公共头文件
│   └── lexilla/          # Lexilla 词法分析器库
├── ctags/                # 内嵌 u-ctags 符号解析器
├── plugins/              # 内置插件示例
├── data/                 # 配置数据
│   ├── filedefs/         # 文件类型定义（filetypes.*.conf）
│   ├── colorschemes/     # 配色方案
│   └── geany.glade       # 主窗口UI定义
├── doc/                  # 文档
├── tests/                # 测试套件
├── po/                   # 国际化文件
└── icons/                # 应用图标
```

---

## 4. 核心子系统

### 4.1 应用初始化 (`libmain.c`)

应用启动流程：

```
main() → main_lib()
  ├── 解析命令行参数
  ├── 初始化国际化 (i18n)
  ├── 初始化 GTK 应用
  ├── 加载配置 (keyfile.c)
  ├── 创建主窗口 (geany.glade)
  ├── 初始化子系统:
  │   ├── filetypes_init()      # 文件类型
  │   ├── editor_init()         # 编辑器
  │   ├── highlighting_init()   # 语法高亮
  │   ├── build_init()          # 构建系统
  │   ├── symbols_init()        # 符号系统
  │   └── plugins_init()        # 插件系统
  ├── 打开初始文件
  └── 进入 GTK 主循环
```

### 4.2 文档管理器 (`document.c`)

文档管理器负责文件的打开、保存、编码处理和标签页管理。

**核心数据结构：**

```c
// document.h
typedef struct GeanyDocument {
    gboolean    is_valid;       // 文档是否有效
    gint        index;          // documents_array 中的索引
    gchar      *file_name;     // 完整文件路径
    gchar      *encoding;      // 字符编码（如 "UTF-8"）
    gboolean    has_bom;       // 是否有 BOM 标记
    GeanyEditor *editor;       // 关联的编辑器实例
    GeanyFiletype *file_type;  // 文件类型
    TMSourceFile *tm_file;     // 符号源文件
    gchar      *real_path;     // 真实路径（解析符号链接后）
    // ... 更多字段
} GeanyDocument;
```

**关键操作：**

| 函数 | 用途 |
|------|------|
| `document_new_file()` | 创建新文档 |
| `document_open_file()` | 打开文件 |
| `document_save_file()` | 保存文件 |
| `document_close()` | 关闭文档 |
| `document_get_current()` | 获取当前活跃文档 |
| `document_set_filetype()` | 设置/切换文件类型 |

---

## 5. 文本编辑界面

### 5.1 架构概述

Geany 的文本编辑界面基于 **Scintilla** 编辑器组件（非 GtkSourceView），通过 GTK 绑定层封装为 GTK widget。

```
┌──────────────────────────────────────┐
│          GeanyDocument               │
│  ┌────────────────────────────────┐  │
│  │       GeanyEditor              │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │    ScintillaObject       │  │  │
│  │  │  (GTK Widget 封装)       │  │  │
│  │  │  ┌────────────────────┐  │  │  │
│  │  │  │  Scintilla Core    │  │  │  │
│  │  │  │  - 文本缓冲区      │  │  │  │
│  │  │  │  - 视图管理        │  │  │  │
│  │  │  │  - 撤销/重做       │  │  │  │
│  │  │  │  - 选区管理        │  │  │  │
│  │  │  └────────────────────┘  │  │  │
│  │  └──────────────────────────┘  │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### 5.2 Scintilla 集成

**文件位置：**

- `scintilla/gtk/ScintillaGTK.cxx` — Scintilla 的 GTK widget 绑定
- `scintilla/gtk/PlatGTK.cxx` — GTK 平台绘制层
- `scintilla/include/Scintilla.h` — Scintilla API 定义
- `scintilla/include/ScintillaWidget.h` — GTK widget 头文件

**消息传递机制：**

Scintilla 使用消息传递 API，Geany 通过 `sciwrappers.c` 封装：

```c
// sciwrappers.h — SSM 宏定义
#define SSM(s, m, w, l) scintilla_send_message(s, m, w, l)

// 示例封装函数
void sci_set_text(ScintillaObject *sci, const gchar *text);
gint sci_get_length(ScintillaObject *sci);
gint sci_get_current_position(ScintillaObject *sci);
void sci_set_current_position(ScintillaObject *sci, gint position, gboolean scroll_to_caret);
```

### 5.3 编辑器管理 (`editor.c`)

`editor.c` 是编辑器子系统的核心，管理每个编辑器实例的行为和配置。

**核心数据结构：**

```c
// editor.h
typedef struct GeanyEditor {
    GeanyDocument  *document;     // 所属文档
    ScintillaObject *sci;         // Scintilla widget 实例
    gboolean       line_wrapping; // 自动换行
    gboolean       auto_indent;   // 自动缩进
    gfloat         scroll_percent;// 滚动位置
    GeanyIndentType indent_type;  // 缩进类型（空格/Tab/混合）
    gint           indent_width;  // 缩进宽度
} GeanyEditor;
```

**编辑器指示器（Indicators）：**

指示器用于在编辑器中标记特定区域（如错误、搜索结果等）：

```c
typedef enum {
    GEANY_INDICATOR_ERROR  = 0,  // 红色波浪下划线（错误标记）
    GEANY_INDICATOR_SEARCH = 8,  // 搜索高亮
    GEANY_INDICATOR_SNIPPET = 9  // 代码片段标记
} GeanyIndicator;

// API 函数
void editor_indicator_set_on_range(GeanyEditor *editor, gint indic, gint start, gint end);
void editor_indicator_set_on_line(GeanyEditor *editor, gint indic, gint line);
void editor_indicator_clear_errors(GeanyEditor *editor);
```

### 5.4 关键编辑功能

| 功能 | 实现位置 | 说明 |
|------|---------|------|
| 自动完成 | `editor.c` | 基于符号表和关键字 |
| 自动缩进 | `editor.c` | 支持多种缩进风格 |
| 代码折叠 | `editor.c` + Scintilla | 基于 Scintilla 折叠机制 |
| 书签 | `editor.c` | Scintilla margin 标记 |
| 括号匹配 | `editor.c` | Scintilla 内置功能 |
| 搜索替换 | `search.c` | 支持正则、文件内/跨文件 |
| 撤销/重做 | Scintilla 内置 | 无限撤销栈 |
| 多行编辑 | Scintilla | 多光标/列选择 |

---

## 6. 语法高亮系统

### 6.1 架构

语法高亮基于 Scintilla 的 Lexer 机制，由 Lexilla 库提供词法分析器。

```
用户编辑文本
     │
     ▼
Scintilla 检测文本变化
     │
     ▼
Lexilla Lexer（词法分析器）
  ├── 根据 FiletypeID 选择对应 Lexer
  ├── 分析文本，标记每个 token 的样式 ID
  └── 返回样式信息
     │
     ▼
highlighting.c 样式映射
  ├── 读取配色方案（colorscheme）
  ├── 读取文件类型样式配置（filetypes.*.conf）
  └── 将样式 ID 映射为颜色/字体
     │
     ▼
Scintilla 渲染带颜色的文本
```

### 6.2 核心文件

| 文件 | 用途 |
|------|------|
| `src/highlighting.c` | 样式管理、配色方案加载 |
| `src/highlightingmappings.h` | Lexer 样式 ID → 命名样式的映射表（79KB） |
| `data/colorschemes/` | 配色方案文件 |
| `data/filedefs/filetypes.*.conf` | 每种文件类型的样式/关键字配置 |
| `scintilla/lexilla/` | Lexilla 词法分析器库 |

### 6.3 样式数据结构

```c
// highlighting.h
typedef struct GeanyLexerStyle {
    gint foreground;    // 前景色（0xBBGGRR 格式）
    gint background;    // 背景色
    gboolean bold;      // 粗体
    gboolean italic;    // 斜体
} GeanyLexerStyle;
```

### 6.4 配色方案配置示例

文件类型配置 (`data/filedefs/filetypes.c`)：

```ini
[styling]
# named_style         # 使用命名样式引用
default=default
comment=comment
commentline=comment
commentdoc=commentdoc
number=number
word=keyword_1
string=string_1
# ...

[keywords]
primary=auto break case const continue default do else enum extern for goto if inline register return sizeof static struct switch typedef union unsigned void volatile while
secondary=NULL TRUE FALSE
# ...
```

### 6.5 添加新语言的高亮

1. 确认 Lexilla 是否已有对应的 Lexer（查看 `scintilla/lexilla/lexers/`）
2. 在 `highlightingmappings.h` 中添加样式 ID 映射
3. 创建 `data/filedefs/filetypes.NEWLANG.conf` 定义关键字和样式
4. 在 `filetypes.c` 中注册文件类型

---

## 7. 语法检查与构建系统

### 7.1 概述

Geany **没有内置的实时语法检查器**（无 LSP 支持）。语法检查通过外部编译器/工具的构建命令实现——执行编译命令后解析输出中的错误和警告信息。

### 7.2 构建命令架构

```
用户触发构建
     │
     ▼
build.c 执行构建命令
  ├── 从文件类型配置读取命令模板
  ├── 替换占位符（%f=文件名, %e=无扩展名, %d=目录等）
  └── 启动子进程执行命令
     │
     ▼
捕获标准输出/标准错误
     │
     ▼
错误正则解析（error_regex）
  ├── 按文件类型的 error_regex_string 匹配
  └── 提取：文件名、行号、错误消息
     │
     ▼
显示到消息窗口 (msgwindow.c)
  └── 双击跳转到错误行
     │
     ▼
编辑器标记错误行 (editor.c)
  └── 使用 GEANY_INDICATOR_ERROR 在错误位置画红色波浪线
```

### 7.3 构建命令数据结构

```c
// build.h
typedef enum {
    GEANY_GBO_COMPILE,      // 编译单个文件
    GEANY_GBO_BUILD,        // 构建项目
    GEANY_GBO_MAKE_ALL,     // Make All
    GEANY_GBO_CUSTOM,       // 自定义目标
    GEANY_GBO_MAKE_OBJECT,  // Make Object
    GEANY_GBO_EXEC          // 执行/运行
} GeanyBuildType;

typedef struct GeanyBuildCommand {
    gchar *label;            // 菜单显示名称
    gchar *command;          // 命令模板
    gchar *working_dir;      // 工作目录
    // ...
} GeanyBuildCommand;
```

### 7.4 构建命令配置示例

```ini
# filetypes.c 中的构建命令
[build-menu]
FT_00_LB=_Compile
FT_00_CM=gcc -Wall -c "%f"
FT_00_WD=
FT_01_LB=_Build
FT_01_CM=gcc -Wall -o "%e" "%f"
FT_02_LB=_Lint
FT_02_CM=cppcheck --enable=warning,style --quiet "%f"
EX_00_LB=_Execute
EX_00_CM="./%e"
```

---

## 8. 插件系统

### 8.1 插件架构

```
┌──────────────────────────────────────────────────────────┐
│                     Geany 核心                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │            Plugin Manager (plugins.c)              │  │
│  │  ┌──────────────┐                                  │  │
│  │  │  GModule     │ ← 动态加载 .so/.dll              │  │
│  │  │  加载器      │                                  │  │
│  │  └──────┬───────┘                                  │  │
│  │         ▼                                          │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │        Plugin API (plugindata.h)             │  │  │
│  │  │  ┌────────┐ ┌──────────┐ ┌───────────────┐  │  │  │
│  │  │  │GeanyData│ │GeanyFuncs│ │GeanyPluginFuncs│  │  │  │
│  │  │  └────────┘ └──────────┘ └───────────────┘  │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
            │                    │
            ▼                    ▼
    ┌──────────────┐    ┌──────────────┐
    │  内置插件      │    │  外部插件      │
    │  filebrowser  │    │  ~/.config/   │
    │  splitwindow  │    │  geany/       │
    │  saveactions  │    │  plugins/     │
    │  htmlchars    │    │              │
    └──────────────┘    └──────────────┘
```

### 8.2 插件 API

**版本控制：**

```c
// plugindata.h
#define GEANY_API_VERSION  251    // 功能版本
#define GEANY_ABI_VERSION  (73 << 8)  // ABI 版本（GTK 主版本影响）
```

**插件注册流程：**

```c
// 插件必须实现的函数
void geany_load_module(GeanyPlugin *plugin) {
    plugin->info->name = "My Plugin";
    plugin->info->description = "Description";
    plugin->info->version = "1.0";
    plugin->info->author = "Author";

    plugin->funcs->init = my_init;
    plugin->funcs->cleanup = my_cleanup;
    plugin->funcs->configure = my_configure;  // 可选
    plugin->funcs->help = my_help;            // 可选

    GEANY_PLUGIN_REGISTER(plugin, 225);  // 最低 API 版本要求
}
```

**插件函数接口：**

```c
typedef struct GeanyPluginFuncs {
    gboolean (*init)(GeanyPlugin *plugin, gpointer pdata);
    GtkWidget* (*configure)(GeanyPlugin *plugin, GtkDialog *dialog, gpointer pdata);
    void (*help)(GeanyPlugin *plugin, gpointer pdata);
    void (*cleanup)(GeanyPlugin *plugin, gpointer pdata);
} GeanyPluginFuncs;
```

### 8.3 插件可访问的数据

通过 `GeanyData` 指针，插件可以访问：

| 数据 | 类型 | 说明 |
|------|------|------|
| `documents_array` | `GPtrArray*` | 所有打开的文档 |
| `filetypes_array` | `GPtrArray*` | 所有注册的文件类型 |
| `app` | `GeanyApp*` | 应用配置 |
| `main_widgets` | `GeanyMainWidgets*` | 主窗口 widgets |
| `editor_prefs` | `GeanyEditorPrefs*` | 编辑器偏好设置 |
| `prefs` | `GeanyPrefs*` | 全局偏好设置 |

### 8.4 插件信号系统

插件可以监听核心事件：

```c
static PluginCallback my_callbacks[] = {
    { "editor-notify",    (GCallback)on_editor_notify, FALSE, NULL },
    { "document-new",     (GCallback)on_doc_new,       FALSE, NULL },
    { "document-open",    (GCallback)on_doc_open,      FALSE, NULL },
    { "document-close",   (GCallback)on_doc_close,     FALSE, NULL },
    { "document-save",    (GCallback)on_doc_save,      FALSE, NULL },
    { "build-start",      (GCallback)on_build_start,   FALSE, NULL },
    { NULL, NULL, FALSE, NULL }
};
```

### 8.5 代理插件机制

代理插件允许用其他语言编写的插件：

```c
// 代理插件 API
typedef struct GeanyProxyFuncs {
    gint (*probe)(GeanyPlugin *proxy, const gchar *filename, gpointer pdata);
    gpointer (*load)(GeanyPlugin *proxy, GeanyPlugin *plugin,
                     const gchar *filename, gpointer pdata);
    void (*unload)(GeanyPlugin *proxy, GeanyPlugin *plugin,
                   gpointer load_data, gpointer pdata);
} GeanyProxyFuncs;
```

### 8.6 插件扩展 API (`pluginextension.h`)

扩展 API 允许插件覆盖编辑器的核心行为：

```c
typedef struct {
    // 自动完成
    gboolean (*autocomplete_provided)(GeanyDocument *doc, gpointer data);
    void (*autocomplete_perform)(GeanyDocument *doc, gboolean force, gpointer data);

    // 调用提示
    gboolean (*calltips_provided)(GeanyDocument *doc, gpointer data);
    void (*calltips_show)(GeanyDocument *doc, gboolean force, gpointer data);

    // 跳转到定义
    gboolean (*goto_provided)(GeanyDocument *doc, gpointer data);
    gboolean (*goto_perform)(GeanyDocument *doc, gint pos, gboolean definition, gpointer data);

    // 符号高亮
    gboolean (*doc_symbols_provided)(GeanyDocument *doc, gpointer data);
    GPtrArray* (*doc_symbols_get)(GeanyDocument *doc, gpointer data);
} PluginExtension;
```

---

## 9. 文件类型系统

### 9.1 文件类型数据结构

```c
// filetypes.h
typedef struct GeanyFiletype {
    GeanyFiletypeID id;              // 枚举 ID
    TMParserType    lang;            // 符号解析器类型
    gchar          *name;            // 内部名称（如 "C"）
    gchar          *title;           // 显示名称（如 "C source file"）
    gchar          *extension;       // 默认扩展名
    gchar         **pattern;         // 通配符模式（如 "*.c", "*.h"）
    gchar          *comment_open;    // 多行注释开始
    gchar          *comment_close;   // 多行注释结束
    gchar          *comment_single;  // 单行注释
    gchar          *mime_type;       // MIME 类型
    gchar          *error_regex_string; // 构建错误匹配正则
    GeanyFiletype  *lexer_filetype;  // 词法分析器引用
    GeanyFiletypeGroupID group;      // 文件类型分组
    GIcon          *icon;            // 图标
} GeanyFiletype;
```

### 9.2 内置文件类型

Geany 支持 50+ 种文件类型，定义在 `filetypes.h` 的 `GeanyFiletypeID` 枚举中：

- **编程语言**：C, C++, Java, Python, Ruby, Rust, Go, PHP, Perl, Lua, Vala, D, Haskell 等
- **脚本语言**：JavaScript, TypeScript, Shell, PowerShell, Batch, Tcl 等
- **标记语言**：HTML, XML, Markdown, LaTeX, reStructuredText 等
- **样式表**：CSS, SCSS, Less 等
- **数据格式**：JSON, YAML, SQL, CSV 等
- **配置文件**：Makefile, CMake, Meson, Docker, Nginx 等

### 9.3 文件类型配置文件

每种文件类型有独立的配置文件 `data/filedefs/filetypes.LANG.conf`：

```ini
# 文件头
[styling]
# 可以继承另一种语言的样式
# [styling=C]
default=default
comment=comment
number=number
word=keyword_1
string=string_1

[keywords]
primary=keyword1 keyword2 keyword3
secondary=type1 type2 type3
docComment=@param @return @throws

[lexer_properties]
# Lexilla 特定属性
fold.compact=0

[settings]
extension=ext
comment_single=//
comment_open=/*
comment_close=*/
lexer_filetype=C  # 使用C语言的Lexer

[build-menu]
FT_00_LB=_Compile
FT_00_CM=compiler "%f"
```

### 9.4 文件扩展名映射

`data/filetype_extensions.conf` 定义全局扩展名映射：

```ini
[Extensions]
C=*.c;
C++=*.cpp;*.cxx;*.c++;*.cc;*.h;*.hpp;
Python=*.py;*.pyw;
JavaScript=*.js;*.mjs;
HTML=*.html;*.htm;
```

---

## 10. 符号管理系统

### 10.1 架构

```
源代码文件
     │
     ▼
TagManager (tm_source_file.c)
  ├── 调用 u-ctags 解析器
  ├── 提取符号：函数、类、变量、宏等
  └── 生成 TMTag 列表
     │
     ▼
Workspace (tm_workspace.c)
  ├── 管理全局符号表
  ├── 合并所有文件的符号
  └── 提供符号查询接口
     │
     ▼
symbols.c
  ├── 填充侧边栏符号树
  ├── 支持跳转到定义
  └── 提供自动完成候选
```

### 10.2 TagManager 关键数据结构

```c
// tm_tag.h
typedef struct TMTag {
    gchar      *name;        // 符号名
    TMTagType   type;        // 类型（函数、类、变量等）
    gchar      *arglist;     // 参数列表
    gchar      *scope;       // 作用域
    gchar      *inheritance; // 继承信息
    gulong      line;        // 行号
    gchar      *var_type;    // 变量类型
    TMSourceFile *file;      // 所属文件
} TMTag;
```

---

## 11. 扩展指南：添加新文件类型支持

### 11.1 完整步骤

#### 步骤 1：确定 Lexer

检查 Lexilla 是否已有对应的 Lexer：

```bash
ls scintilla/lexilla/lexers/
# 查找 LexXXX.cxx
```

如果没有现成的 Lexer，可以：
- 复用已有的相似语言 Lexer（通过 `lexer_filetype` 配置）
- 开发自定义 Lexer（需在 Lexilla 中添加）

#### 步骤 2：注册文件类型

在 `src/filetypes.h` 中添加枚举值：

```c
typedef enum {
    // ... 现有类型
    GEANY_FILETYPES_NEWLANG,   // 新增
    GEANY_FILETYPES_NONE       // 必须是最后一个
} GeanyFiletypeID;
```

在 `src/filetypes.c` 中的 `filetypes_init_types()` 添加初始化：

```c
ft = filetypes_new(GEANY_FILETYPES_NEWLANG,
    "NewLang",           // 内部名称
    "New Language",      // 显示名称
    "newlang",           // 默认扩展名
    GEANY_FILETYPE_GROUP_COMPILED  // 分组
);
ft->comment_single = g_strdup("//");
ft->comment_open = g_strdup("/*");
ft->comment_close = g_strdup("*/");
ft->mime_type = g_strdup("text/x-newlang");
```

#### 步骤 3：创建配置文件

创建 `data/filedefs/filetypes.NewLang.conf`：

```ini
[styling=C]   # 或其他基础语言

[keywords]
primary=func var let const if else for while return
secondary=int string bool float void

[settings]
extension=nl
comment_single=//
comment_open=/*
comment_close=*/

[build-menu]
FT_00_LB=_Compile
FT_00_CM=newlangc "%f"
FT_01_LB=_Run
FT_01_CM=newlang "%f"
```

#### 步骤 4：添加扩展名映射

在 `data/filetype_extensions.conf` 添加：

```ini
NewLang=*.nl;*.newlang;
```

#### 步骤 5：高亮映射（如有自定义 Lexer）

在 `src/highlightingmappings.h` 添加样式映射。

#### 步骤 6：符号解析（可选）

如需符号侧边栏支持，在 `ctags/` 中添加解析器或在 `src/tagmanager/tm_parser.c` 中注册。

---

## 12. 扩展指南：内嵌语言服务（LSP）

### 12.1 当前状态

Geany 核心**没有内置 LSP 支持**。但 `pluginextension.h` 已提供了完善的扩展点，特别适合 LSP 集成。

### 12.2 推荐的集成方案

**方案一：通过插件扩展 API（推荐）**

利用 `PluginExtension` 接口：

```
┌──────────────────────┐
│    LSP 插件           │
│  ┌────────────────┐  │
│  │ LSP Client     │  │
│  │ (JSON-RPC)     │──────► Language Server 进程
│  └────────────────┘  │     (clangd, pyright, etc.)
│         │            │
│  实现 PluginExtension │
│  ├─ autocomplete     │
│  ├─ calltips         │
│  ├─ goto_definition  │
│  ├─ doc_symbols      │
│  └─ diagnostics      │──────► editor_indicator_set_on_range()
└──────────────────────┘
```

**关键扩展点：**

| PluginExtension 接口 | LSP 方法 | 说明 |
|----------------------|----------|------|
| `autocomplete_perform` | `textDocument/completion` | 自动完成 |
| `calltips_show` | `textDocument/signatureHelp` | 函数签名提示 |
| `goto_perform` | `textDocument/definition` | 跳转到定义 |
| `doc_symbols_get` | `textDocument/documentSymbol` | 文档符号 |
| 使用 indicator API | `textDocument/publishDiagnostics` | 错误诊断 |

**方案二：核心集成**

如需深度集成，可以在 `src/` 中添加 LSP 客户端模块：

```
src/
├── lsp.c              # LSP 协议实现（JSON-RPC）
├── lsp.h              # LSP 接口定义
├── lsp_client.c       # 与 Language Server 通信
└── lsp_diagnostics.c  # 诊断结果处理与显示
```

### 12.3 诊断显示方案

利用已有的 indicator 系统：

```c
// 在编辑器中标记 LSP 诊断
void lsp_show_diagnostics(GeanyEditor *editor, GArray *diagnostics) {
    editor_indicator_clear_errors(editor);
    for (guint i = 0; i < diagnostics->len; i++) {
        Diagnostic *diag = &g_array_index(diagnostics, Diagnostic, i);
        gint start = sci_get_position_from_line(editor->sci, diag->range.start.line)
                     + diag->range.start.character;
        gint end = sci_get_position_from_line(editor->sci, diag->range.end.line)
                   + diag->range.end.character;
        editor_indicator_set_on_range(editor, GEANY_INDICATOR_ERROR, start, end);
    }
}
```

---

## 13. 扩展指南：AI 集成

### 13.1 集成方案

AI 功能（代码补全、代码生成、代码解释等）可通过插件系统集成：

```
┌──────────────────────────┐
│       AI 插件             │
│  ┌────────────────────┐  │
│  │  HTTP Client       │  │
│  │  (libsoup/libcurl) │──────► AI API 服务
│  └────────────────────┘  │     (OpenAI, Claude, 本地LLM等)
│                          │
│  功能模块：               │
│  ├─ 代码补全（inline）    │ → PluginExtension.autocomplete
│  ├─ 代码解释             │ → 侧边栏面板或弹窗
│  ├─ 代码重构             │ → 编辑器内操作
│  ├─ 对话聊天             │ → 自定义侧边面板
│  └─ 错误修复建议          │ → msgwindow 或弹窗
└──────────────────────────┘
```

### 13.2 推荐实现方式

1. **内联代码补全**：使用 `PluginExtension.autocomplete_perform()`，将 AI 补全结果通过 Scintilla 的自动完成列表显示

2. **Chat 界面**：通过 `plugin_add_toolbar_item()` 或自定义侧边面板添加聊天 UI

3. **代码操作**：监听 `editor-notify` 信号，在用户选中文本后提供 AI 操作菜单

4. **后台分析**：使用 GLib 异步 I/O 在后台与 AI 服务通信，避免阻塞 UI

---

## 14. 扩展指南：二进制文件与图片显示

### 14.1 当前限制

Geany 当前仅支持纯文本文件显示。对于二进制文件和图片，需要扩展显示机制。

### 14.2 方案设计

**方案一：插件替换编辑器视图**

```
┌──────────────────────────────────────────┐
│  document_open()                          │
│    │                                      │
│    ├── 检测文件类型（MIME）                 │
│    │                                      │
│    ├── 文本文件 → 正常 Scintilla 编辑器    │
│    │                                      │
│    ├── 图片文件 → 图片查看器 Widget         │
│    │   ├── GtkPicture (GTK4)              │
│    │   ├── 缩放/平移/旋转                  │
│    │   └── 基本编辑（裁剪/标注）           │
│    │                                      │
│    ├── 十六进制查看 → Hex View Widget      │
│    │   ├── 十六进制 + ASCII 并排显示       │
│    │   └── 编辑/搜索/跳转                  │
│    │                                      │
│    └── PDF/文档 → 嵌入式预览               │
│        └── 使用 Poppler 或 WebKitGTK       │
└──────────────────────────────────────────┘
```

**方案二：Tab 内容替换机制**

核心修改思路：在 `document.c` 的 `document_open_file()` 中，根据 MIME 类型决定创建哪种 Widget：

```c
// 伪代码
GeanyDocument* document_open_file(const gchar *filename, ...) {
    gchar *mime = detect_mime_type(filename);

    if (g_str_has_prefix(mime, "image/")) {
        // 创建图片查看器
        GtkWidget *viewer = image_viewer_new(filename);
        notebook_add_tab(viewer, basename(filename));
    } else if (is_binary(filename)) {
        // 创建十六进制查看器
        GtkWidget *hex_view = hex_viewer_new(filename);
        notebook_add_tab(hex_view, basename(filename));
    } else {
        // 正常的 Scintilla 编辑器
        // ... 现有逻辑
    }
}
```

### 14.3 十六进制查看器设计

```c
// 可以作为插件实现
typedef struct HexViewer {
    GtkWidget   *widget;       // 主容器
    GtkWidget   *hex_view;     // 十六进制视图
    GtkWidget   *ascii_view;   // ASCII 视图
    GtkWidget   *offset_view;  // 偏移量视图
    guchar      *data;         // 文件数据
    gsize        data_len;     // 数据长度
    gsize        offset;       // 当前偏移
} HexViewer;
```

### 14.4 图片查看器设计

```c
// GTK4 图片查看器
typedef struct ImageViewer {
    GtkWidget   *widget;         // 主容器
    GtkWidget   *picture;        // GtkPicture widget
    GtkWidget   *scrolled;       // 滚动容器
    gdouble      zoom_level;     // 缩放级别
    gchar       *file_path;      // 文件路径
    GdkPixbuf   *original;       // 原始图像数据
} ImageViewer;
```

---

## 15. 关键源文件索引

### 核心文件

| 文件 | 行数 | 功能 |
|------|------|------|
| `src/editor.c` | 5400 | 编辑器管理、缩进、指示器 |
| `src/document.c` | 3838 | 文档管理、文件 I/O |
| `src/ui_utils.c` | 3243 | UI 工具函数、布局 |
| `src/build.c` | 2777 | 构建系统集成 |
| `src/keybindings.c` | 2721 | 快捷键管理 |
| `src/utils.c` | 2657 | 通用工具函数 |
| `src/search.c` | 2408 | 搜索/替换 |
| `src/symbols.c` | 2322 | 符号侧边栏 |
| `src/callbacks.c` | 2173 | 信号回调 |
| `src/highlighting.c` | 2061 | 语法高亮 |
| `src/filetypes.c` | 2061 | 文件类型管理 |
| `src/plugins.c` | 2003 | 插件管理 |
| `src/prefs.c` | 1936 | 偏好设置 |
| `src/sidebar.c` | 1797 | 侧边栏 |
| `src/libmain.c` | 1400+ | 主初始化 |
| `src/msgwindow.c` | 1100 | 消息窗口 |
| `src/encodings.c` | 1000+ | 编码检测/转换 |
| `src/project.c` | 1100 | 项目管理 |
| `src/sciwrappers.c` | - | Scintilla API 封装 |
| `src/highlightingmappings.h` | 79KB | 样式映射表 |

### 插件 API 文件

| 文件 | 用途 |
|------|------|
| `src/plugindata.h` | 插件 API 主定义 |
| `src/pluginutils.h` | 插件工具函数 |
| `src/pluginextension.h` | 插件扩展接口 |
| `plugins/geanyplugin.h` | 插件开发总头文件 |

### 内嵌组件

| 目录/文件 | 用途 |
|----------|------|
| `scintilla/gtk/` | Scintilla GTK 绑定 |
| `scintilla/src/` | Scintilla 核心 |
| `scintilla/lexilla/` | Lexilla 词法分析器 |
| `scintilla/include/` | 公共 API 头文件 |
| `ctags/` | u-ctags 符号解析器 |
| `src/tagmanager/` | 符号管理系统 |

### 配置数据

| 路径 | 用途 |
|------|------|
| `data/filedefs/filetypes.*.conf` | 文件类型配置 |
| `data/filetype_extensions.conf` | 扩展名映射 |
| `data/colorschemes/` | 配色方案 |
| `data/geany.glade` | 主窗口 UI 定义 |

---

*本文档基于 Geany 2.2.0 代码分析生成，旨在为后续功能扩展提供架构参考。*
