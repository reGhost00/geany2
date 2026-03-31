/**
 * Shared types and utilities for the Meson VS Code extension.
 */

/**
 * Represents a Meson build target from `meson introspect --targets`.
 */
export interface MesonTarget {
    name: string;
    id: string;
    type: MesonTargetType;
    defined_in: string;
    filename: string[];
    build_by_default: boolean;
    target_sources?: MesonTargetSource[];
    subproject: string | null;
    install_filename?: string[];
    installed: boolean;
}

export type MesonTargetType =
    | 'executable'
    | 'static library'
    | 'shared library'
    | 'shared module'
    | 'custom'
    | 'run'
    | 'jar';

export interface MesonTargetSource {
    language: string;
    compiler: string[];
    parameters: string[];
    sources: string[];
    generated_sources: string[];
}

/**
 * Represents a Meson test from `meson introspect --tests`.
 */
export interface MesonTest {
    name: string;
    workdir: string | null;
    timeout: number;
    suite: string[];
    is_parallel: boolean;
    cmd: string[];
    env: Record<string, string>;
    depends: string[];
    protocol: string;
}

/**
 * Represents project info from `meson introspect --projectinfo`.
 */
export interface MesonProjectInfo {
    version: string;
    descriptive_name: string;
    subproject_dir: string;
    subprojects: MesonSubproject[];
}

export interface MesonSubproject {
    name: string;
    version: string;
    descriptive_name: string;
}

/**
 * Represents a Meson build option from `meson introspect --buildoptions`.
 */
export interface MesonBuildOption {
    name: string;
    description: string;
    type: 'string' | 'boolean' | 'combo' | 'integer' | 'array' | 'feature';
    value: string | boolean | number | string[];
    section: string;
    machine: string;
    choices?: string[];
}

/**
 * Combined introspect data for the project.
 */
export interface MesonIntrospectData {
    targets: MesonTarget[];
    tests: MesonTest[];
    projectInfo: MesonProjectInfo;
    buildOptions: MesonBuildOption[];
}

/**
 * Extension configuration options.
 */
export interface MesonConfig {
    buildDirectory: string;
    mesonPath: string;
    ninjaPath: string;
    buildType: string;
    configureOnOpen: boolean;
    configureOptions: string[];
    compileOptions: string[];
    testOptions: string[];
    environment: Record<string, string>;
}
