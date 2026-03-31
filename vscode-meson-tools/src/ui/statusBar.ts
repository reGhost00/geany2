import * as vscode from 'vscode';
import type { MesonDriver } from '../meson/mesonDriver';
import type { MesonTarget, MesonIntrospectData } from '../util/types';
import { getExecutableTargets } from '../meson/targetScanner';
import { getConfig } from '../util/config';

/**
 * MesonStatusBar manages the status bar items for quick build/run/debug access.
 * Similar to CMake Tools' status bar.
 */
export class MesonStatusBar implements vscode.Disposable {
    private buildTypeItem: vscode.StatusBarItem;
    private buildItem: vscode.StatusBarItem;
    private buildTargetItem: vscode.StatusBarItem;
    private runItem: vscode.StatusBarItem;
    private debugItem: vscode.StatusBarItem;

    private disposables: vscode.Disposable[] = [];
    private _selectedBuildTarget: string | undefined;
    private _selectedRunTarget: MesonTarget | undefined;
    private _selectedDebugTarget: MesonTarget | undefined;
    private data: MesonIntrospectData | undefined;

    get selectedBuildTarget(): string | undefined {
        return this._selectedBuildTarget;
    }

    get selectedRunTarget(): MesonTarget | undefined {
        return this._selectedRunTarget;
    }

    get selectedDebugTarget(): MesonTarget | undefined {
        return this._selectedDebugTarget;
    }

    constructor(private driver: MesonDriver) {
        // Build type selector (leftmost)
        this.buildTypeItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            105
        );
        this.buildTypeItem.command = 'meson.selectBuildType';
        this.buildTypeItem.tooltip = 'Click to select Meson build type';

        // Build button
        this.buildItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            104
        );
        this.buildItem.command = 'meson.build';
        this.buildItem.text = '$(tools) Build';
        this.buildItem.tooltip = 'Build the project (Meson)';

        // Build target selector
        this.buildTargetItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            103
        );
        this.buildTargetItem.command = 'meson.selectBuildTarget';
        this.buildTargetItem.tooltip = 'Click to select build target';

        // Run button
        this.runItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            102
        );
        this.runItem.command = 'meson.run';
        this.runItem.tooltip = 'Run the selected target (Meson)';

        // Debug button
        this.debugItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            101
        );
        this.debugItem.command = 'meson.debug';
        this.debugItem.tooltip = 'Debug the selected target (Meson)';

        // Subscribe to introspect data changes
        this.disposables.push(
            driver.onDidChangeData((data) => {
                this.data = data;
                this.updateItems();
            })
        );

        this.data = driver.introspectData;
        this.updateItems();
    }

    dispose(): void {
        this.buildTypeItem.dispose();
        this.buildItem.dispose();
        this.buildTargetItem.dispose();
        this.runItem.dispose();
        this.debugItem.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    /**
     * Show all status bar items.
     */
    show(): void {
        this.buildTypeItem.show();
        this.buildItem.show();
        this.buildTargetItem.show();
        this.runItem.show();
        this.debugItem.show();
    }

    /**
     * Hide all status bar items.
     */
    hide(): void {
        this.buildTypeItem.hide();
        this.buildItem.hide();
        this.buildTargetItem.hide();
        this.runItem.hide();
        this.debugItem.hide();
    }

    /**
     * Show quick pick to select build type.
     */
    async selectBuildType(): Promise<void> {
        const buildTypes = [
            { label: 'debug', description: 'Debug build with no optimization' },
            {
                label: 'debugoptimized',
                description: 'Debug build with optimization',
            },
            { label: 'release', description: 'Release build' },
            {
                label: 'minsize',
                description: 'Release build optimized for size',
            },
            { label: 'plain', description: 'No flags set' },
        ];

        const selected = await vscode.window.showQuickPick(buildTypes, {
            placeHolder: 'Select build type',
        });

        if (selected) {
            const config = vscode.workspace.getConfiguration('meson');
            await config.update(
                'buildType',
                selected.label,
                vscode.ConfigurationTarget.Workspace
            );
            this.updateItems();
        }
    }

    /**
     * Show quick pick to select build target.
     */
    async selectBuildTarget(): Promise<void> {
        if (!this.data) {
            vscode.window.showWarningMessage('No targets available. Configure the project first.');
            return;
        }

        const items: vscode.QuickPickItem[] = [
            { label: '[all]', description: 'Build all targets' },
            ...this.data.targets.map((t) => ({
                label: t.name,
                description: t.type,
                detail: t.defined_in,
            })),
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select build target',
        });

        if (selected) {
            this._selectedBuildTarget =
                selected.label === '[all]' ? undefined : selected.label;
            this.updateItems();
        }
    }

    /**
     * Show quick pick to select run target.
     */
    async selectRunTarget(): Promise<MesonTarget | undefined> {
        if (!this.data) {
            vscode.window.showWarningMessage('No targets available. Configure the project first.');
            return undefined;
        }

        const execs = getExecutableTargets(this.data.targets);
        if (execs.length === 0) {
            vscode.window.showWarningMessage('No executable targets found.');
            return undefined;
        }

        const items = execs.map((t) => ({
            label: t.name,
            description: t.filename[0] ?? '',
            target: t,
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select target to run',
        });

        if (selected) {
            this._selectedRunTarget = selected.target;
            this.updateItems();
            return selected.target;
        }

        return undefined;
    }

    /**
     * Show quick pick to select debug target.
     */
    async selectDebugTarget(): Promise<MesonTarget | undefined> {
        if (!this.data) {
            vscode.window.showWarningMessage('No targets available. Configure the project first.');
            return undefined;
        }

        const execs = getExecutableTargets(this.data.targets);
        if (execs.length === 0) {
            vscode.window.showWarningMessage('No executable targets found.');
            return undefined;
        }

        const items = execs.map((t) => ({
            label: t.name,
            description: t.filename[0] ?? '',
            target: t,
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select target to debug',
        });

        if (selected) {
            this._selectedDebugTarget = selected.target;
            this.updateItems();
            return selected.target;
        }

        return undefined;
    }

    /**
     * Update all status bar items with current state.
     */
    private updateItems(): void {
        const config = getConfig();

        // Build type
        this.buildTypeItem.text = `$(symbol-property) [${config.buildType}]`;

        // Build target
        const targetName = this._selectedBuildTarget ?? 'all';
        this.buildTargetItem.text = `[${targetName}]`;

        // Run target
        const runName = this._selectedRunTarget?.name ?? 'No Target';
        this.runItem.text = `$(play) ${runName}`;

        // Debug target
        const debugName = this._selectedDebugTarget?.name ?? 'No Target';
        this.debugItem.text = `$(bug) ${debugName}`;
    }
}
