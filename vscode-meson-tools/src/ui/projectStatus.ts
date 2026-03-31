import * as vscode from 'vscode';
import type { MesonDriver } from '../meson/mesonDriver';
import type { MesonIntrospectData } from '../util/types';

/**
 * Tree node types for project status panel.
 */
type StatusNode =
    | ProjectInfoNode
    | BuildOptionNode
    | StatusLabelNode
    | ActionNode;

class ProjectInfoNode {
    readonly kind = 'info' as const;
    constructor(
        public readonly label: string,
        public readonly value: string,
        public readonly icon: string
    ) {}
}

class BuildOptionNode {
    readonly kind = 'option' as const;
    constructor(
        public readonly name: string,
        public readonly value: string,
        public readonly description: string,
        public readonly type: string
    ) {}
}

class StatusLabelNode {
    readonly kind = 'label' as const;
    constructor(
        public readonly label: string,
        public readonly icon: string,
        public readonly children: StatusNode[]
    ) {}
}

class ActionNode {
    readonly kind = 'action' as const;
    constructor(
        public readonly label: string,
        public readonly command: string,
        public readonly icon: string
    ) {}
}

/**
 * ProjectStatusProvider displays the project configuration status
 * including project info, build options, and quick action buttons.
 */
export class ProjectStatusProvider
    implements vscode.TreeDataProvider<StatusNode>, vscode.Disposable
{
    private _onDidChangeTreeData = new vscode.EventEmitter<StatusNode | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private data: MesonIntrospectData | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(private driver: MesonDriver) {
        this.disposables.push(
            driver.onDidChangeData((data) => {
                this.data = data;
                this._onDidChangeTreeData.fire(null);
            })
        );
        this.data = driver.introspectData;
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(null);
    }

    getTreeItem(element: StatusNode): vscode.TreeItem {
        switch (element.kind) {
            case 'info': {
                const item = new vscode.TreeItem(
                    element.label,
                    vscode.TreeItemCollapsibleState.None
                );
                item.description = element.value;
                item.iconPath = new vscode.ThemeIcon(element.icon);
                item.contextValue = 'info';
                return item;
            }
            case 'option': {
                const item = new vscode.TreeItem(
                    element.name,
                    vscode.TreeItemCollapsibleState.None
                );
                item.description = String(element.value);
                item.tooltip = new vscode.MarkdownString(
                    `**${element.name}** (${element.type})\n\n${element.description}\n\nCurrent value: \`${element.value}\``
                );
                item.iconPath = new vscode.ThemeIcon('settings');
                item.contextValue = 'option';
                return item;
            }
            case 'label': {
                const item = new vscode.TreeItem(
                    element.label,
                    element.children.length > 0
                        ? vscode.TreeItemCollapsibleState.Collapsed
                        : vscode.TreeItemCollapsibleState.None
                );
                item.iconPath = new vscode.ThemeIcon(element.icon);
                item.contextValue = 'label';
                return item;
            }
            case 'action': {
                const item = new vscode.TreeItem(
                    element.label,
                    vscode.TreeItemCollapsibleState.None
                );
                item.iconPath = new vscode.ThemeIcon(element.icon);
                item.command = {
                    command: element.command,
                    title: element.label,
                };
                item.contextValue = 'action';
                return item;
            }
        }
    }

    getChildren(element?: StatusNode): StatusNode[] {
        // Root level
        if (!element) {
            return this.getRootNodes();
        }

        // Children of a label node
        if (element.kind === 'label') {
            return element.children;
        }

        return [];
    }

    private getRootNodes(): StatusNode[] {
        const nodes: StatusNode[] = [];

        if (!this.driver.isConfigured) {
            nodes.push(
                new ActionNode('Configure Project', 'meson.configure', 'gear')
            );
            nodes.push(
                new ProjectInfoNode('Status', 'Not Configured', 'warning')
            );
            return nodes;
        }

        if (!this.data) {
            nodes.push(
                new ProjectInfoNode('Status', 'Loading...', 'loading~spin')
            );
            return nodes;
        }

        // Project info
        const pi = this.data.projectInfo;
        nodes.push(
            new ProjectInfoNode('Project', pi.descriptive_name, 'project')
        );
        nodes.push(new ProjectInfoNode('Version', pi.version, 'tag'));

        // Statistics
        const targetCount = this.data.targets.length;
        const testCount = this.data.tests.length;
        const execCount = this.data.targets.filter(
            (t) => t.type === 'executable'
        ).length;
        const libCount = this.data.targets.filter(
            (t) =>
                t.type === 'static library' ||
                t.type === 'shared library' ||
                t.type === 'shared module'
        ).length;

        nodes.push(
            new ProjectInfoNode(
                'Targets',
                `${targetCount} (${execCount} exe, ${libCount} lib)`,
                'symbol-class'
            )
        );
        nodes.push(
            new ProjectInfoNode('Tests', String(testCount), 'beaker')
        );

        // Build options (user section only, limit displayed)
        const userOptions = this.data.buildOptions.filter(
            (o) => o.section === 'user'
        );
        if (userOptions.length > 0) {
            const optionNodes: StatusNode[] = userOptions.map(
                (o) =>
                    new BuildOptionNode(
                        o.name,
                        String(o.value),
                        o.description,
                        o.type
                    )
            );
            nodes.push(
                new StatusLabelNode(
                    `Project Options (${userOptions.length})`,
                    'symbol-property',
                    optionNodes
                )
            );
        }

        // Core build options
        const coreOptions = this.data.buildOptions.filter(
            (o) => o.section === 'core'
        );
        if (coreOptions.length > 0) {
            const importantCore = coreOptions.filter((o) =>
                [
                    'buildtype',
                    'backend',
                    'default_library',
                    'warning_level',
                    'optimization',
                    'debug',
                ].includes(o.name)
            );
            if (importantCore.length > 0) {
                const coreNodes: StatusNode[] = importantCore.map(
                    (o) =>
                        new BuildOptionNode(
                            o.name,
                            String(o.value),
                            o.description,
                            o.type
                        )
                );
                nodes.push(
                    new StatusLabelNode('Build Settings', 'wrench', coreNodes)
                );
            }
        }

        // Subprojects
        if (pi.subprojects && pi.subprojects.length > 0) {
            const subNodes: StatusNode[] = pi.subprojects.map(
                (sp) =>
                    new ProjectInfoNode(
                        sp.descriptive_name || sp.name,
                        sp.version,
                        'package'
                    )
            );
            nodes.push(
                new StatusLabelNode(
                    `Subprojects (${pi.subprojects.length})`,
                    'package',
                    subNodes
                )
            );
        }

        // Quick actions
        nodes.push(
            new StatusLabelNode('Actions', 'play', [
                new ActionNode('$(gear) Configure', 'meson.configure', 'gear'),
                new ActionNode('$(tools) Build All', 'meson.build', 'tools'),
                new ActionNode('$(beaker) Run Tests', 'meson.test', 'beaker'),
                new ActionNode('$(trash) Clean', 'meson.clean', 'trash'),
                new ActionNode(
                    '$(cloud-download) Install',
                    'meson.install',
                    'cloud-download'
                ),
            ])
        );

        return nodes;
    }
}
