import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MesonDriver } from './meson/mesonDriver';
import { TargetOutlineProvider } from './ui/targetOutline';
import { ProjectStatusProvider } from './ui/projectStatus';
import { MesonStatusBar } from './ui/statusBar';
import { MesonTaskProvider } from './tasks/mesonTaskProvider';
import { MesonDebugProvider } from './debug/debugProvider';
import { getWorkspaceRoot, getConfig, log, getOutputChannel } from './util/config';
import { findTargetByName, getExecutableTargets } from './meson/targetScanner';

let driver: MesonDriver;
let statusBar: MesonStatusBar;
let targetOutline: TargetOutlineProvider;
let projectStatus: ProjectStatusProvider;

/**
 * Extension activation.
 * Called when VS Code detects a meson.build file in the workspace.
 */
export async function activate(
    context: vscode.ExtensionContext
): Promise<void> {
    log('Meson Build Tools extension activating...');

    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        log('No workspace folder found, aborting activation.');
        return;
    }

    // Check if this is a meson project
    const mesonBuildPath = path.join(workspaceRoot, 'meson.build');
    if (!fs.existsSync(mesonBuildPath)) {
        log('No meson.build found in workspace root, aborting activation.');
        return;
    }

    // Set context for when clauses
    await vscode.commands.executeCommand('setContext', 'meson:hasProject', true);

    // Create the Meson driver
    driver = new MesonDriver();
    context.subscriptions.push(driver);

    // Create UI components
    statusBar = new MesonStatusBar(driver);
    context.subscriptions.push(statusBar);
    statusBar.show();

    targetOutline = new TargetOutlineProvider(driver);
    context.subscriptions.push(targetOutline);

    projectStatus = new ProjectStatusProvider(driver);
    context.subscriptions.push(projectStatus);

    // Register tree views
    const targetOutlineView = vscode.window.createTreeView('mesonTargetOutline', {
        treeDataProvider: targetOutline,
        showCollapseAll: true,
    });
    context.subscriptions.push(targetOutlineView);

    const projectStatusView = vscode.window.createTreeView('mesonProjectStatus', {
        treeDataProvider: projectStatus,
    });
    context.subscriptions.push(projectStatusView);

    // Register task provider
    const taskProvider = vscode.tasks.registerTaskProvider(
        MesonTaskProvider.type,
        new MesonTaskProvider()
    );
    context.subscriptions.push(taskProvider);

    // Register debug configuration provider
    const debugProvider = new MesonDebugProvider(driver);
    context.subscriptions.push(
        vscode.debug.registerDebugConfigurationProvider('cppdbg', debugProvider)
    );

    // Register all commands
    registerCommands(context);

    // Watch for meson.build changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/meson.build');
    context.subscriptions.push(watcher);
    watcher.onDidChange(() => {
        log('meson.build changed, refreshing...');
        if (driver.isConfigured) {
            driver.refreshIntrospect();
        }
    });
    watcher.onDidCreate(() => {
        log('meson.build created');
        vscode.commands.executeCommand('setContext', 'meson:hasProject', true);
    });

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('meson')) {
                log('Meson configuration changed');
                statusBar.show(); // Force update
            }
        })
    );

    // Register output channel
    context.subscriptions.push(getOutputChannel());

    // Auto-configure on open if enabled
    const config = getConfig();
    if (config.configureOnOpen && !driver.isConfigured) {
        const shouldConfigure = await vscode.window.showInformationMessage(
            'Meson project detected. Configure now?',
            'Yes',
            'Not Now',
            'Never'
        );

        if (shouldConfigure === 'Yes') {
            await vscode.commands.executeCommand('meson.configure');
        } else if (shouldConfigure === 'Never') {
            const mesonConfig = vscode.workspace.getConfiguration('meson');
            await mesonConfig.update(
                'configureOnOpen',
                false,
                vscode.ConfigurationTarget.Workspace
            );
        }
    } else if (driver.isConfigured) {
        // Already configured, just refresh introspect data
        await driver.refreshIntrospect();
    }

    log('Meson Build Tools extension activated.');
}

/**
 * Register all extension commands.
 */
function registerCommands(context: vscode.ExtensionContext): void {
    // Configure
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.configure', async () => {
            await driver.configure();
        })
    );

    // Reconfigure
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.reconfigure', async () => {
            await driver.configure();
        })
    );

    // Build (all or selected target)
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.build', async () => {
            await driver.build(statusBar.selectedBuildTarget);
        })
    );

    // Build a specific target (from tree view context menu)
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.buildTarget', async (node?: any) => {
            const targetName = node?.target?.name;
            if (targetName) {
                await driver.build(targetName);
            } else {
                // Show quick pick
                await statusBar.selectBuildTarget();
                if (statusBar.selectedBuildTarget) {
                    await driver.build(statusBar.selectedBuildTarget);
                }
            }
        })
    );

    // Clean
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.clean', async () => {
            await driver.clean();
        })
    );

    // Install
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.install', async () => {
            await driver.install();
        })
    );

    // Test
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.test', async (testName?: string) => {
            await driver.test(testName);
        })
    );

    // Run selected target
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.run', async (node?: any) => {
            let target = node?.target ?? statusBar.selectedRunTarget;

            if (!target) {
                target = await statusBar.selectRunTarget();
            }

            if (target) {
                // Build first, then run
                const buildOk = await driver.build(target.name);
                if (buildOk) {
                    await driver.runTarget(target);
                }
            }
        })
    );

    // Debug selected target
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.debug', async (node?: any) => {
            let target = node?.target ?? statusBar.selectedDebugTarget;

            if (!target) {
                target = await statusBar.selectDebugTarget();
            }

            if (target) {
                // Build first, then debug
                const buildOk = await driver.build(target.name);
                if (buildOk) {
                    await driver.debugTarget(target);
                }
            }
        })
    );

    // Select build type
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.selectBuildType', async () => {
            await statusBar.selectBuildType();
        })
    );

    // Select build target
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.selectBuildTarget', async () => {
            await statusBar.selectBuildTarget();
        })
    );

    // Select run target
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.selectRunTarget', async () => {
            await statusBar.selectRunTarget();
        })
    );

    // Select debug target
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.selectDebugTarget', async () => {
            await statusBar.selectDebugTarget();
        })
    );

    // Refresh targets
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.refreshTargets', async () => {
            await driver.refreshIntrospect();
        })
    );

    // Open meson log
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.openMesonLog', async () => {
            const workspaceRoot = getWorkspaceRoot();
            if (!workspaceRoot) {
                return;
            }
            const config = getConfig();
            const logPath = path.join(
                workspaceRoot,
                config.buildDirectory,
                'meson-logs',
                'meson-log.txt'
            );
            if (fs.existsSync(logPath)) {
                const doc = await vscode.workspace.openTextDocument(logPath);
                await vscode.window.showTextDocument(doc);
            } else {
                vscode.window.showWarningMessage('Meson log file not found. Configure the project first.');
            }
        })
    );

    // Edit options
    context.subscriptions.push(
        vscode.commands.registerCommand('meson.editOptions', async () => {
            const data = driver.introspectData;
            if (!data) {
                vscode.window.showWarningMessage('Project not configured.');
                return;
            }

            const userOptions = data.buildOptions.filter(
                (o) => o.section === 'user'
            );
            if (userOptions.length === 0) {
                vscode.window.showInformationMessage('No user-configurable options found.');
                return;
            }

            const items = userOptions.map((o) => ({
                label: o.name,
                description: String(o.value),
                detail: o.description,
                option: o,
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select an option to edit',
            });

            if (!selected) {
                return;
            }

            const opt = selected.option;
            let newValue: string | undefined;

            if (opt.type === 'boolean') {
                const boolPick = await vscode.window.showQuickPick(
                    ['true', 'false'],
                    { placeHolder: `${opt.name} (current: ${opt.value})` }
                );
                newValue = boolPick;
            } else if (opt.type === 'combo' && opt.choices) {
                newValue = await vscode.window.showQuickPick(opt.choices, {
                    placeHolder: `${opt.name} (current: ${opt.value})`,
                });
            } else {
                newValue = await vscode.window.showInputBox({
                    prompt: `Enter value for ${opt.name}`,
                    value: String(opt.value),
                    placeHolder: opt.description,
                });
            }

            if (newValue !== undefined) {
                const config = getConfig();
                const buildDir = path.join(
                    getWorkspaceRoot()!,
                    config.buildDirectory
                );
                // Use meson configure to set the option
                const task = new vscode.Task(
                    { type: 'meson', command: 'configure' },
                    vscode.TaskScope.Workspace,
                    `Set ${opt.name}=${newValue}`,
                    'meson',
                    new vscode.ShellExecution(config.mesonPath, [
                        'configure',
                        buildDir,
                        `-D${opt.name}=${newValue}`,
                    ])
                );

                await vscode.tasks.executeTask(task);
                // Refresh after a delay
                setTimeout(() => driver.refreshIntrospect(), 2000);
            }
        })
    );
}

/**
 * Extension deactivation.
 */
export function deactivate(): void {
    log('Meson Build Tools extension deactivated.');
}
