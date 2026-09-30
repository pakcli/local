export type RawFileMode = 'live' | 'source' | 'reading';

export interface RawFormatRule {
    extension: string;
    enabled: boolean;
    mode: RawFileMode;
    readOnly: boolean;
    description?: string;
}

export interface RawOpenerSettings {
    rawOpenerEnabled: boolean;
    rawDefaultMode: RawFileMode;
    rawDefaultReadOnly: boolean;
    rawShowHeaderBanner: boolean;
    rawRules: RawFormatRule[];
}

export const PRESET_CATEGORIES = {
    programming: {
        name: 'Programming Languages',
        icon: 'code-xml',
        extensions: [
            { ext: 'py', desc: 'Python Script' },
            { ext: 'js', desc: 'JavaScript' },
            { ext: 'ts', desc: 'TypeScript' },
            { ext: 'jsx', desc: 'React JSX' },
            { ext: 'tsx', desc: 'React TSX' },
            { ext: 'rs', desc: 'Rust Source' },
            { ext: 'go', desc: 'Go Source' },
            { ext: 'c', desc: 'C Source' },
            { ext: 'cpp', desc: 'C++ Source' },
            { ext: 'h', desc: 'C/C++ Header' },
            { ext: 'hpp', desc: 'C++ Header' },
            { ext: 'java', desc: 'Java Source' },
            { ext: 'kt', desc: 'Kotlin Source' },
            { ext: 'cs', desc: 'C# Source' },
            { ext: 'php', desc: 'PHP Script' },
            { ext: 'lua', desc: 'Lua Script' },
            { ext: 'r', desc: 'R Script' },
            { ext: 'dart', desc: 'Dart Source' },
            { ext: 'swift', desc: 'Swift Source' },
            { ext: 'rb', desc: 'Ruby Script' },
        ]
    },
    dataConfig: {
        name: 'Data & Configuration',
        icon: 'database',
        extensions: [
            { ext: 'json', desc: 'JSON Document' },
            { ext: 'yaml', desc: 'YAML Config' },
            { ext: 'yml', desc: 'YAML Config' },
            { ext: 'toml', desc: 'TOML Config' },
            { ext: 'csv', desc: 'CSV Spreadsheet' },
            { ext: 'tsv', desc: 'TSV Spreadsheet' },
            { ext: 'xml', desc: 'XML Document' },
            { ext: 'ini', desc: 'INI Config' },
            { ext: 'env', desc: 'Environment Config' },
            { ext: 'conf', desc: 'Configuration File' },
            { ext: 'config', desc: 'Config File' },
            { ext: 'properties', desc: 'Properties File' },
            { ext: 'sql', desc: 'SQL Query Script' },
            { ext: 'graphql', desc: 'GraphQL Query/Schema' },
        ]
    },
    scripts: {
        name: 'Shell & Automation Scripts',
        icon: 'terminal',
        extensions: [
            { ext: 'ps1', desc: 'PowerShell Script' },
            { ext: 'psm1', desc: 'PowerShell Module' },
            { ext: 'psd1', desc: 'PowerShell Data' },
            { ext: 'sh', desc: 'Shell Script' },
            { ext: 'bash', desc: 'Bash Script' },
            { ext: 'zsh', desc: 'Zsh Script' },
            { ext: 'bat', desc: 'Windows Batch' },
            { ext: 'cmd', desc: 'Windows Command' },
        ]
    },
    webText: {
        name: 'Web & Plain Text',
        icon: 'file-text',
        extensions: [
            { ext: 'txt', desc: 'Plain Text' },
            { ext: 'log', desc: 'System / Debug Log' },
            { ext: 'html', desc: 'HTML Page' },
            { ext: 'htm', desc: 'HTML Document' },
            { ext: 'css', desc: 'CSS Stylesheet' },
            { ext: 'scss', desc: 'SCSS Stylesheet' },
            { ext: 'less', desc: 'LESS Stylesheet' },
            { ext: 'svg', desc: 'SVG Vector' },
        ]
    }
};

export const DEFAULT_RAW_RULES: RawFormatRule[] = [
    // Data & Config (Default Live Preview, Editable)
    { extension: 'json', enabled: true, mode: 'live', readOnly: false, description: 'JSON Document' },
    { extension: 'yaml', enabled: true, mode: 'live', readOnly: false, description: 'YAML Config' },
    { extension: 'yml', enabled: true, mode: 'live', readOnly: false, description: 'YAML Config' },
    { extension: 'toml', enabled: true, mode: 'live', readOnly: false, description: 'TOML Config' },
    { extension: 'csv', enabled: true, mode: 'live', readOnly: false, description: 'CSV Spreadsheet' },
    { extension: 'tsv', enabled: true, mode: 'live', readOnly: false, description: 'TSV Spreadsheet' },
    { extension: 'xml', enabled: true, mode: 'live', readOnly: false, description: 'XML Document' },
    { extension: 'ini', enabled: true, mode: 'live', readOnly: false, description: 'INI Config' },
    { extension: 'env', enabled: true, mode: 'live', readOnly: false, description: 'Environment Config' },
    { extension: 'conf', enabled: true, mode: 'live', readOnly: false, description: 'Configuration File' },
    { extension: 'config', enabled: true, mode: 'live', readOnly: false, description: 'Config File' },
    { extension: 'sql', enabled: true, mode: 'live', readOnly: false, description: 'SQL Query Script' },
    
    // Text & Logs
    { extension: 'txt', enabled: true, mode: 'live', readOnly: false, description: 'Plain Text' },
    { extension: 'log', enabled: true, mode: 'live', readOnly: true, description: 'System / Debug Log (Read-Only)' },
    
    // Scripts & Programming
    { extension: 'py', enabled: true, mode: 'live', readOnly: false, description: 'Python Script' },
    { extension: 'js', enabled: true, mode: 'live', readOnly: false, description: 'JavaScript' },
    { extension: 'ts', enabled: true, mode: 'live', readOnly: false, description: 'TypeScript' },
    { extension: 'ps1', enabled: true, mode: 'live', readOnly: false, description: 'PowerShell Script' },
    { extension: 'sh', enabled: true, mode: 'live', readOnly: false, description: 'Shell Script' },
    { extension: 'bat', enabled: true, mode: 'live', readOnly: false, description: 'Windows Batch' },
    { extension: 'cmd', enabled: true, mode: 'live', readOnly: false, description: 'Windows Command' },
    { extension: 'html', enabled: true, mode: 'live', readOnly: false, description: 'HTML Document' },
    { extension: 'css', enabled: true, mode: 'live', readOnly: false, description: 'CSS Stylesheet' },
    { extension: 'rs', enabled: true, mode: 'live', readOnly: false, description: 'Rust Source' },
    { extension: 'go', enabled: true, mode: 'live', readOnly: false, description: 'Go Source' },
    { extension: 'c', enabled: true, mode: 'live', readOnly: false, description: 'C Source' },
    { extension: 'cpp', enabled: true, mode: 'live', readOnly: false, description: 'C++ Source' },
];

export const DEFAULT_RAW_OPENER_SETTINGS: RawOpenerSettings = {
    rawOpenerEnabled: true,
    rawDefaultMode: 'live',
    rawDefaultReadOnly: false,
    rawShowHeaderBanner: true,
    rawRules: DEFAULT_RAW_RULES,
};
