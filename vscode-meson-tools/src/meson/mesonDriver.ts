import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig, getBuildDir, getWorkspaceRoot, log } from '../util/config';
import type {
    MesonTarget,
    MesonTest,
    MesonProjectInfo,
    MesonBuildOption,
    MesonIntrospectData,
} from '../util/types';

/**
 * MesonDriver manages all interactions with the meson build system.
 * It handles configuration, building, testing, and introspection.
 */
export class MesonDriver implements vscode.Disposable {
    private _onDidChangeData = new vscode.EventEmitter<MesonIntrospectData | undefined>();
    readonly onDidChangeData = this._onDidChangeData.event;

    private _introspectData: MesonIntrospectData | undefined;
    private _isConfigured = false;

    get isConfigured(): boolean {
        return this._isConfigured;
    }

    get introspectData(): MesonIntrospectData | undefined {
        return this._introspectData;
    }

    constructor() {
        this.checkConfigured();
    }

    dispose(): void {
        this._onDidChangeData.dispose();
    }

    /**
     * Check if the project is already configured (build directory exists).
     */
    checkConfigured(): boolean {
        try {
            const buildDir = getBuildDir();
            this._isConfigured = fs.existsSync(
                path.join(buildDir, 'meson-private', 'build.dat')
            );
        } catch {
            this._isConfigured = false;
        }
        return this._isConfigured;
    }

    /**
     * Run `meson setup` to configure the project.
     */
    async configure(): Promise<boolean> {
        const config = getConfig();
        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder open');
            return false;
        }

        const buildDir = getBuildDir();
        const args: string[] = ['setup'];

        // Add build type
        args.push(`--buildtype=${config.buildType}`);

        // Add user-configured options
        for (const opt of config.configureOptions) {
            args.push(opt);
        }

        // If already configured, use --reconfigure
        if (this._isConfigured) {
            args.push('--reconfigure');
        }

        args.push(buildDir);

        log(`Running: ${config.mesonPath} ${args.join(' ')}`);

        const success = await this.runMesonTask('Configure', args);
        if (success) {
            this._isConfigured = true;
            await this.refreshIntrospect();
        }
        return success;
    }

    /**
     * Run `meson compile` to build targets.
     */
    async build(target?: string): Promise<boolean> {
        if (!this._isConfigured) {
            const shouldConfigure = await vscode.window.showWarningMessage(
                'Project is not configured. Configure now?',
                'Yes',
                'No'
            );
            if (shouldConfigure === 'Yes') {
                const ok = await this.configure();
                if (!ok) {
                    return false;
                }
            } else {
                return false;
            }
        }

        const config = getConfig();
        const buildDir = getBuildDir();
        const args: string[] = ['compile', '-C', buildDir];

        for (const opt of config.compileOptions) {
            args.push(opt);
        }

        if (target) {
            args.push(target);
        }

        const label = target ? `Build: ${target}` : 'Build All';
        log(`Running: ${config.mesonPath} ${args.join(' ')}`);
        return this.runMesonTask(label, args);
    }

    /**
     * Run `meson test` to execute tests.
     */
    async test(testName?: string): Promise<boolean> {
        if (!this._isConfigured) {
            vscode.window.showErrorMessage('Project is not configured. Run "Meson: Configure" first.');
            return false;
        }

        const config = getConfig();
        const buildDir = getBuildDir();
        const args: string[] = ['test', '-C', buildDir];

        for (const opt of config.testOptions) {
            args.push(opt);
        }

        if (testName) {
            args.push(testName);
        }

        const label = testName ? `Test: ${testName}` : 'Test All';
        log(`Running: ${config.mesonPath} ${args.join(' ')}`);
        return this.runMesonTask(label, args);
    }

    /**
     * Run `meson install`.
     */
    async install(): Promise<boolean> {
        if (!this._isConfigured) {
            vscode.window.showErrorMessage('Project is not configured. Run "Meson: Configure" first.');
            return false;
        }

        const buildDir = getBuildDir();
        const args: string[] = ['install', '-C', buildDir];
        log(`Running: meson ${args.join(' ')}`);
        return this.runMesonTask('Install', args);
    }

    /**
     * Clean the build directory.
     */
    async clean(): Promise<boolean> {
        if (!this._isConfigured) {
            vscode.window.showErrorMessage('Project is not configured.');
            return false;
        }

        const buildDir = getBuildDir();
        const config = getConfig();
        const args: string[] = ['compile', '-C', buildDir, '--clean'];
        log(`Running: ${config.mesonPath} ${args.join(' ')}`);
        return this.runMesonTask('Clean', args);
    }

    /**
     * Run a target executable.
     */
    async runTarget(target: MesonTarget): Promise<void> {
        if (target.filename.length === 0) {
            vscode.window.showErrorMessage(`No output file for target: ${target.name}`);
            return;
        }

        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            return;
        }

        const execPath = path.isAbsolute(target.filename[0])
            ? target.filename[0]
            : path.join(workspaceRoot, target.filename[0]);

        log(`Running target: ${execPath}`);

        const terminal = vscode.window.createTerminal({
            name: `Meson: Run ${target.name}`,
            cwd: workspaceRoot,
        });
        terminal.show();
        terminal.sendText(execPath);
    }

    /**
     * Debug a target executable using cppdbg.
     */
    async debugTarget(target: MesonTarget): Promise<void> {
        if (target.filename.length === 0) {
            vscode.window.showErrorMessage(`No output file for target: ${target.name}`);
            return;
        }

        const workspaceRoot = getWorkspaceRoot();
        if (!workspaceRoot) {
            return;
        }

        const execPath = path.isAbsolute(target.filename[0])
            ? target.filename[0]
            : path.join(workspaceRoot, target.filename[0]);

        const debugConfig: vscode.DebugConfiguration = {
            type: 'cppdbg',
            request: 'launch',
            name: `Meson: Debug ${target.name}`,
            program: execPath,
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

        log(`Debugging target: ${execPath}`);
        await vscode.debug.startDebugging(
            vscode.workspace.workspaceFolders?.[0],
            debugConfig
        );
    }

    /**
     * Refresh introspect data by running meson introspect commands.
     */
    async refreshIntrospect(): Promise<MesonIntrospectData | undefined> {
        if (!this._isConfigured) {
            this._introspectData = undefined;
            this._onDidChangeData.fire(undefined);
            return undefined;
        }

        try {
            const buildDir = getBuildDir();
            const config = getConfig();
            const mesonPath = config.mesonPath;

            const [targets, tests, projectInfo, buildOptions] = await Promise.all([
                this.runIntrospect<MesonTarget[]>(mesonPath, buildDir, '--targets'),
                this.runIntrospect<MesonTest[]>(mesonPath, buildDir, '--tests'),
                this.runIntrospect<MesonProjectInfo>(mesonPath, buildDir, '--projectinfo'),
                this.runIntrospect<MesonBuildOption[]>(mesonPath, buildDir, '--buildoptions'),
            ]);

            this._introspectData = { targets, tests, projectInfo, buildOptions };
            this._onDidChangeData.fire(this._introspectData);
            log(
                `Introspect: ${targets.length} targets, ${tests.length} tests, project: ${projectInfo.descriptive_name} v${projectInfo.version}`
            );
            return this._introspectData;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            log(`Introspect failed: ${errMsg}`);
            vscode.window.showWarningMessage(`Failed to introspect Meson project: ${errMsg}`);
            return undefined;
        }
    }

    /**
     * Run a meson introspect command and parse JSON output.
     */
    private runIntrospect<T>(
        mesonPath: string,
        buildDir: string,
        flag: string
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const args = ['introspect', buildDir, flag];
            const proc = cp.execFile(
                mesonPath,
                args,
                { maxBuffer: 10 * 1024 * 1024 },
                (error, stdout, stderr) => {
                    if (error) {
                        reject(new Error(`meson introspect ${flag} failed: ${stderr || error.message}`));
                        return;
                    }
                    try {
                        resolve(JSON.parse(stdout) as T);
                    } catch {
                        reject(new Error(`Failed to parse JSON from meson introspect ${flag}`));
                    }
                }
            );
            // Ensure process is killed if it takes too long
            setTimeout(() => proc.kill(), 30000);
        });
    }

    /**
     * Run a meson command as a VS Code task.
     * Returns true on success.
     */
    private runMesonTask(label: string, args: string[]): Promise<boolean> {
        return new Promise((resolve) => {
            const config = getConfig();
            const workspaceRoot = getWorkspaceRoot();

            const task = new vscode.Task(
                { type: 'meson', command: args[0] },
                vscode.TaskScope.Workspace,
                label,
                'meson',
                new vscode.ShellExecution(config.mesonPath, args, {
                    cwd: workspaceRoot,
                    env: config.environment,
                }),
                '$gcc' // Use gcc problem matcher for compile errors
            );

            task.presentationOptions = {
                reveal: vscode.TaskRevealKind.Always,
                panel: vscode.TaskPanelKind.Shared,
                clear: true,
            };

            const disposable = vscode.tasks.onDidEndTaskProcess((e) => {
                if (e.execution.task === task) {
                    disposable.dispose();
                    resolve(e.exitCode === 0);
                }
            });

            vscode.tasks.executeTask(task).then(undefined, () => {
                disposable.dispose();
                resolve(false);
            });
        });
    }
}
