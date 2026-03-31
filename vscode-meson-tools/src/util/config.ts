import * as vscode from 'vscode';
import * as path from 'path';
import type { MesonConfig } from './types';

/**
 * Get the Meson extension configuration.
 */
export function getConfig(): MesonConfig {
    const config = vscode.workspace.getConfiguration('meson');
    return {
        buildDirectory: config.get<string>('buildDirectory', 'builddir'),
        mesonPath: config.get<string>('mesonPath', 'meson'),
        ninjaPath: config.get<string>('ninjaPath', 'ninja'),
        buildType: config.get<string>('buildType', 'debug'),
        configureOnOpen: config.get<boolean>('configureOnOpen', true),
        configureOptions: config.get<string[]>('configureOptions', []),
        compileOptions: config.get<string[]>('compileOptions', []),
        testOptions: config.get<string[]>('testOptions', []),
        environment: config.get<Record<string, string>>('environment', {}),
    };
}

/**
 * Get the absolute build directory path.
 */
export function getBuildDir(): string {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) {
        throw new Error('No workspace folder open');
    }
    const config = getConfig();
    return path.join(workspaceRoot, config.buildDirectory);
}

/**
 * Get the workspace root directory.
 */
export function getWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Get the output channel for Meson extension.
 */
let _outputChannel: vscode.OutputChannel | undefined;
export function getOutputChannel(): vscode.OutputChannel {
    if (!_outputChannel) {
        _outputChannel = vscode.window.createOutputChannel('Meson');
    }
    return _outputChannel;
}

/**
 * Log a message to the Meson output channel.
 */
export function log(message: string): void {
    getOutputChannel().appendLine(`[${new Date().toISOString()}] ${message}`);
}
