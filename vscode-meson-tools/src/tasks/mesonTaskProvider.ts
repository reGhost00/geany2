import * as vscode from 'vscode';
import { getConfig, getBuildDir, getWorkspaceRoot } from '../util/config';

interface MesonTaskDefinition extends vscode.TaskDefinition {
    command: string;
    target?: string;
    options?: Record<string, string>;
}

/**
 * MesonTaskProvider provides meson tasks to VS Code's task system.
 * Tasks can be discovered and run from the terminal > Run Task menu.
 */
export class MesonTaskProvider implements vscode.TaskProvider {
    static readonly type = 'meson';

    provideTasks(): vscode.Task[] {
        const tasks: vscode.Task[] = [];
        const workspaceRoot = getWorkspaceRoot();

        if (!workspaceRoot) {
            return tasks;
        }

        try {
            const config = getConfig();
            const buildDir = getBuildDir();

            // Configure task
            tasks.push(
                this.createTask(
                    'configure',
                    'Meson: Configure',
                    config.mesonPath,
                    ['setup', `--buildtype=${config.buildType}`, buildDir],
                    workspaceRoot
                )
            );

            // Reconfigure task
            tasks.push(
                this.createTask(
                    'configure',
                    'Meson: Reconfigure',
                    config.mesonPath,
                    [
                        'setup',
                        '--reconfigure',
                        `--buildtype=${config.buildType}`,
                        buildDir,
                    ],
                    workspaceRoot
                )
            );

            // Build task
            tasks.push(
                this.createTask(
                    'build',
                    'Meson: Build',
                    config.mesonPath,
                    ['compile', '-C', buildDir],
                    workspaceRoot
                )
            );

            // Clean task
            tasks.push(
                this.createTask(
                    'build',
                    'Meson: Clean',
                    config.mesonPath,
                    ['compile', '-C', buildDir, '--clean'],
                    workspaceRoot
                )
            );

            // Test task
            tasks.push(
                this.createTask(
                    'test',
                    'Meson: Test',
                    config.mesonPath,
                    ['test', '-C', buildDir],
                    workspaceRoot
                )
            );

            // Install task
            tasks.push(
                this.createTask(
                    'install',
                    'Meson: Install',
                    config.mesonPath,
                    ['install', '-C', buildDir],
                    workspaceRoot
                )
            );
        } catch {
            // No workspace, return empty
        }

        return tasks;
    }

    resolveTask(task: vscode.Task): vscode.Task | undefined {
        const definition = task.definition as MesonTaskDefinition;
        if (definition.command) {
            const config = getConfig();
            const buildDir = getBuildDir();
            const workspaceRoot = getWorkspaceRoot();

            if (!workspaceRoot) {
                return undefined;
            }

            let args: string[];
            switch (definition.command) {
                case 'configure':
                    args = [
                        'setup',
                        `--buildtype=${config.buildType}`,
                        buildDir,
                    ];
                    break;
                case 'build':
                    args = ['compile', '-C', buildDir];
                    if (definition.target) {
                        args.push(definition.target);
                    }
                    break;
                case 'test':
                    args = ['test', '-C', buildDir];
                    if (definition.target) {
                        args.push(definition.target);
                    }
                    break;
                case 'install':
                    args = ['install', '-C', buildDir];
                    break;
                case 'clean':
                    args = ['compile', '-C', buildDir, '--clean'];
                    break;
                default:
                    return undefined;
            }

            return this.createTask(
                definition.command,
                task.name,
                config.mesonPath,
                args,
                workspaceRoot
            );
        }
        return undefined;
    }

    private createTask(
        command: string,
        name: string,
        mesonPath: string,
        args: string[],
        cwd: string
    ): vscode.Task {
        const config = getConfig();
        const definition: MesonTaskDefinition = {
            type: MesonTaskProvider.type,
            command,
        };

        const task = new vscode.Task(
            definition,
            vscode.TaskScope.Workspace,
            name,
            'meson',
            new vscode.ShellExecution(mesonPath, args, {
                cwd,
                env: config.environment,
            }),
            '$gcc'
        );

        task.group =
            command === 'build'
                ? vscode.TaskGroup.Build
                : command === 'test'
                ? vscode.TaskGroup.Test
                : command === 'clean'
                ? vscode.TaskGroup.Clean
                : undefined;

        task.presentationOptions = {
            reveal: vscode.TaskRevealKind.Always,
            panel: vscode.TaskPanelKind.Shared,
        };

        return task;
    }
}
