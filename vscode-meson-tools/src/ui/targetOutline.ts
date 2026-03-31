import * as vscode from 'vscode';
import * as path from 'path';
import type { MesonDriver } from '../meson/mesonDriver';
import type { MesonTarget, MesonTargetType, MesonIntrospectData } from '../util/types';
import {
    groupTargetsByCategory,
    type TargetCategory,
} from '../meson/targetScanner';

/**
 * Tree node types for the target outline.
 */
type TreeNode = CategoryNode | TargetNode | TestCategoryNode | TestNode;

class CategoryNode {
    readonly kind = 'category' as const;
    constructor(
        public readonly label: string,
        public readonly targets: MesonTarget[]
    ) {}
}

class TargetNode {
    readonly kind = 'target' as const;
    constructor(public readonly target: MesonTarget) {}
}

class TestCategoryNode {
    readonly kind = 'testCategory' as const;
    constructor(public readonly label: string = 'Tests') {}
}

class TestNode {
    readonly kind = 'test' as const;
    constructor(
        public readonly name: string,
        public readonly suite: string[]
    ) {}
}

/**
 * Get the icon for a target type.
 */
function getTargetIcon(type: MesonTargetType): vscode.ThemeIcon {
    switch (type) {
        case 'executable':
            return new vscode.ThemeIcon('file-binary');
        case 'static library':
            return new vscode.ThemeIcon('library');
        case 'shared library':
        case 'shared module':
            return new vscode.ThemeIcon('package');
        case 'jar':
            return new vscode.ThemeIcon('file-zip');
        case 'custom':
        case 'run':
            return new vscode.ThemeIcon('terminal');
        default:
            return new vscode.ThemeIcon('file');
    }
}

/**
 * Get the icon for a category.
 */
function getCategoryIcon(cat: string): vscode.ThemeIcon {
    switch (cat) {
        case 'Executables':
            return new vscode.ThemeIcon('file-binary');
        case 'Libraries':
            return new vscode.ThemeIcon('library');
        case 'Custom Targets':
            return new vscode.ThemeIcon('terminal');
        case 'Tests':
            return new vscode.ThemeIcon('beaker');
        default:
            return new vscode.ThemeIcon('folder');
    }
}

/**
 * TargetOutlineProvider provides a tree view of all Meson build targets
 * grouped by category (Executables, Libraries, Custom Targets, Tests).
 */
export class TargetOutlineProvider
    implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable
{
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null>();
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

    getTreeItem(element: TreeNode): vscode.TreeItem {
        switch (element.kind) {
            case 'category': {
                const item = new vscode.TreeItem(
                    `${element.label} (${element.targets.length})`,
                    vscode.TreeItemCollapsibleState.Expanded
                );
                item.iconPath = getCategoryIcon(element.label);
                item.contextValue = 'category';
                return item;
            }
            case 'target': {
                const t = element.target;
                const item = new vscode.TreeItem(
                    t.name,
                    vscode.TreeItemCollapsibleState.None
                );
                item.description = t.type;
                item.iconPath = getTargetIcon(t.type);
                item.contextValue = `target.${t.type.replace(/\s/g, '_')}`;
                item.tooltip = new vscode.MarkdownString(
                    [
                        `**${t.name}** (${t.type})`,
                        '',
                        `Defined in: \`${t.defined_in}\``,
                        t.filename.length > 0
                            ? `Output: \`${t.filename.join(', ')}\``
                            : '',
                        `Build by default: ${t.build_by_default ? 'Yes' : 'No'}`,
                        t.subproject ? `Subproject: ${t.subproject}` : '',
                    ]
                        .filter(Boolean)
                        .join('\n')
                );
                // Make the item clickable to open the meson.build file
                if (t.defined_in) {
                    item.command = {
                        command: 'vscode.open',
                        title: 'Open Definition',
                        arguments: [vscode.Uri.file(t.defined_in)],
                    };
                }
                return item;
            }
            case 'testCategory': {
                const testCount = this.data?.tests.length ?? 0;
                const item = new vscode.TreeItem(
                    `Tests (${testCount})`,
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                item.iconPath = getCategoryIcon('Tests');
                item.contextValue = 'testCategory';
                return item;
            }
            case 'test': {
                const item = new vscode.TreeItem(
                    element.name,
                    vscode.TreeItemCollapsibleState.None
                );
                item.description =
                    element.suite.length > 0 ? element.suite.join(', ') : undefined;
                item.iconPath = new vscode.ThemeIcon('testing-unset-icon');
                item.contextValue = 'test';
                item.command = {
                    command: 'meson.test',
                    title: 'Run Test',
                    arguments: [element.name],
                };
                return item;
            }
        }
    }

    getChildren(element?: TreeNode): TreeNode[] {
        if (!this.data) {
            return [];
        }

        // Root level: show categories
        if (!element) {
            const categories: TreeNode[] = [];
            const grouped = groupTargetsByCategory(this.data.targets);

            // Show categories in a predictable order
            const order: TargetCategory[] = [
                'Executables',
                'Libraries',
                'Custom Targets',
            ];
            for (const cat of order) {
                const targets = grouped.get(cat);
                if (targets && targets.length > 0) {
                    categories.push(new CategoryNode(cat, targets));
                }
            }

            // Show tests category if there are tests
            if (this.data.tests.length > 0) {
                categories.push(new TestCategoryNode());
            }

            return categories;
        }

        // Category level: show targets
        if (element.kind === 'category') {
            return element.targets.map((t) => new TargetNode(t));
        }

        // Test category level: show tests
        if (element.kind === 'testCategory' && this.data.tests) {
            return this.data.tests.map(
                (t) => new TestNode(t.name, t.suite)
            );
        }

        return [];
    }
}
