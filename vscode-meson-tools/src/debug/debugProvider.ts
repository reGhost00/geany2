import * as vscode from 'vscode';
import * as path from 'path';
import type { MesonDriver } from '../meson/mesonDriver';
import { getExecutableTargets } from '../meson/targetScanner';
import { getWorkspaceRoot } from '../util/config';

/**
 * MesonDebugProvider provides debug configurations for Meson executable targets.
 * It supports both C/C++ debugging via cppdbg (GDB/LLDB).
 */
export class MesonDebugProvider implements vscode.DebugConfigurationProvider {
    constructor(private driver: MesonDriver) {}

    async provideDebugConfigurations(
        _folder: vscode.WorkspaceFolder | undefined,
        _token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration[]> {
        const data = this.driver.introspectData;
        if (!data) {
            return [];
        }

        const execs = getExecutableTargets(data.targets);
        const workspaceRoot = getWorkspaceRoot() ?? '';

        return execs.map((t) => {
            const program = path.isAbsolute(t.filename[0] ?? '')
                ? t.filename[0]
                : path.join(workspaceRoot, t.filename[0] ?? t.name);

            return {
                type: 'cppdbg',
                request: 'launch',
                name: `Meson: Debug ${t.name}`,
                program,
                args: [],
                cwd: workspaceRoot,
                MIMode: 'gdb',
                setupCommands: [
                    {
                        description: 'Enable pretty-printing for gdb',
                        text: '-enable-pretty-printing',
                        ignoreFailures: true,
                    },
                ],
            };
        });
    }

    resolveDebugConfiguration(
        _folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken
    ): vscode.DebugConfiguration | undefined {
        // If the config is incomplete, provide defaults
        if (!config.type && !config.request && !config.name) {
            return undefined; // Let VS Code show the config picker
        }

        return config;
    }
}
