import type { MesonTarget, MesonTargetType, MesonTest } from '../util/types';

/**
 * Target categories for grouping in the tree view.
 */
export type TargetCategory = 'Executables' | 'Libraries' | 'Custom Targets' | 'Tests';

/**
 * Get the category for a target type.
 */
export function getTargetCategory(type: MesonTargetType): TargetCategory {
    switch (type) {
        case 'executable':
            return 'Executables';
        case 'static library':
        case 'shared library':
        case 'shared module':
        case 'jar':
            return 'Libraries';
        case 'custom':
        case 'run':
        default:
            return 'Custom Targets';
    }
}

/**
 * Group targets by category.
 */
export function groupTargetsByCategory(
    targets: MesonTarget[]
): Map<TargetCategory, MesonTarget[]> {
    const map = new Map<TargetCategory, MesonTarget[]>();

    for (const target of targets) {
        const cat = getTargetCategory(target.type);
        if (!map.has(cat)) {
            map.set(cat, []);
        }
        map.get(cat)!.push(target);
    }

    // Sort targets within each category
    for (const [, targetList] of map) {
        targetList.sort((a, b) => a.name.localeCompare(b.name));
    }

    return map;
}

/**
 * Group tests by suite.
 */
export function groupTestsBySuite(
    tests: MesonTest[]
): Map<string, MesonTest[]> {
    const map = new Map<string, MesonTest[]>();

    for (const test of tests) {
        const suite = test.suite.length > 0 ? test.suite[0] : 'default';
        if (!map.has(suite)) {
            map.set(suite, []);
        }
        map.get(suite)!.push(test);
    }

    return map;
}

/**
 * Find executable targets (targets that can be run or debugged).
 */
export function getExecutableTargets(targets: MesonTarget[]): MesonTarget[] {
    return targets
        .filter((t) => t.type === 'executable')
        .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Find a target by name.
 */
export function findTargetByName(
    targets: MesonTarget[],
    name: string
): MesonTarget | undefined {
    return targets.find((t) => t.name === name);
}
