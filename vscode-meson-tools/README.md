# Meson Build Tools for VS Code

A full-featured [Meson build system](https://mesonbuild.com/) integration for Visual Studio Code, inspired by [CMake Tools](https://github.com/microsoft/vscode-cmake-tools).

## Features

### 🎯 Side Panel — Build Targets & Project Status

- **Build Targets** tree view: Browse all targets organized by category (Executables, Libraries, Custom Targets, Tests)
- **Project Status** tree view: View project info, build options, subprojects, and quick actions
- Click any target to open its `meson.build` definition
- Right-click targets for context-menu actions (build, run, debug)

### ⚡ Status Bar — Quick Access

Status bar items for one-click access:

| Item | Description |
|------|-------------|
| `[debug]` | Current build type — click to change (debug/release/etc.) |
| `$(tools) Build` | Build the project — click to build |
| `[all]` | Current build target — click to select a specific target |
| `$(play) target` | Run the selected executable — click to run |
| `$(bug) target` | Debug the selected executable — click to debug |

### 🔧 Build System Integration

- **Configure**: `meson setup` with build type and custom options
- **Build**: `meson compile` with target selection
- **Test**: `meson test` with individual test execution
- **Install**: `meson install`
- **Clean**: `meson compile --clean`
- **Introspect**: Automatic target discovery via `meson introspect`

### 🐛 Debugging

- Automatic debug configurations for executable targets
- Integrates with C/C++ debugger (GDB/LLDB via `cppdbg`)
- Build-before-debug workflow

### 📋 Task Provider

Meson tasks are available in the VS Code task system (`Terminal > Run Task...`):
- Meson: Configure
- Meson: Reconfigure
- Meson: Build
- Meson: Clean
- Meson: Test
- Meson: Install

### 📁 File Watching

- Automatically refreshes targets when `meson.build` files change
- Detects configuration changes and prompts for reconfigure

## Requirements

- [Meson](https://mesonbuild.com/Getting-meson.html) (>= 0.56)
- [Ninja](https://ninja-build.org/) (or another Meson backend)
- For debugging: [C/C++ extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools)

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `meson.buildDirectory` | `builddir` | Build directory name (relative to workspace) |
| `meson.mesonPath` | `meson` | Path to meson executable |
| `meson.ninjaPath` | `ninja` | Path to ninja executable |
| `meson.buildType` | `debug` | Build type (debug/debugoptimized/release/minsize/plain) |
| `meson.configureOnOpen` | `true` | Auto-configure when workspace opens |
| `meson.configureOptions` | `[]` | Additional `meson setup` options |
| `meson.compileOptions` | `[]` | Additional `meson compile` options |
| `meson.testOptions` | `[]` | Additional `meson test` options |
| `meson.environment` | `{}` | Environment variables for meson commands |

## Commands

All commands are available from the Command Palette (`Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `Meson: Configure` | Configure the project with `meson setup` |
| `Meson: Reconfigure` | Reconfigure an existing build directory |
| `Meson: Build` | Build selected target (or all) |
| `Meson: Build Target` | Select and build a specific target |
| `Meson: Clean` | Clean the build directory |
| `Meson: Install` | Install built targets |
| `Meson: Run Tests` | Run all or specific tests |
| `Meson: Run` | Run the selected executable target |
| `Meson: Debug` | Debug the selected executable target |
| `Meson: Select Build Type` | Change build type |
| `Meson: Select Build Target` | Choose which target to build |
| `Meson: Select Run Target` | Choose which target to run |
| `Meson: Select Debug Target` | Choose which target to debug |
| `Meson: Refresh Targets` | Refresh introspect data |
| `Meson: Open Meson Log` | View meson log file |
| `Meson: Edit Options` | Edit project build options |

## Getting Started

1. Open a workspace containing a `meson.build` file
2. The extension will prompt you to configure the project
3. Use the Meson panel in the activity bar to browse targets
4. Use status bar buttons for quick build/run/debug

## Architecture

```
src/
├── extension.ts              # Entry point, activation, command registration
├── meson/
│   ├── mesonDriver.ts        # Meson CLI integration (setup, compile, test, introspect)
│   └── targetScanner.ts      # Target grouping and filtering utilities
├── ui/
│   ├── targetOutline.ts      # TreeDataProvider: Build Targets panel
│   ├── projectStatus.ts      # TreeDataProvider: Project Status panel
│   └── statusBar.ts          # Status bar items with target selection
├── tasks/
│   └── mesonTaskProvider.ts   # VS Code Task Provider for meson tasks
├── debug/
│   └── debugProvider.ts       # Debug Configuration Provider
└── util/
    ├── types.ts               # TypeScript interfaces for Meson data
    └── config.ts              # Configuration helper utilities
```

## Building from Source

```bash
cd vscode-meson-tools
npm install
npm run compile
```

To create a `.vsix` package:
```bash
npx @vscode/vsce package
```

## License

MIT
