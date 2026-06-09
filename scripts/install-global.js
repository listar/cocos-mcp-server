const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXTENSION_NAME = 'cocos-mcp-server';
const DEFAULT_COCOS_VERSION = '3.8.8';

function getInstallPaths(options = {}) {
    const version = options.version
        || process.env.COCOS_CREATOR_VERSION
        || DEFAULT_COCOS_VERSION;
    const cocosHome = options.cocosHome
        || process.env.COCOS_CREATOR_HOME
        || path.join(os.homedir(), '.CocosCreator');
    const repoPath = options.repoPath || path.resolve(__dirname, '..');
    const extensionRoot = path.join(cocosHome, 'builtin-extensions', version);
    return {
        version,
        cocosHome,
        repoPath,
        extensionRoot,
        targetPath: path.join(extensionRoot, EXTENSION_NAME)
    };
}

function installGlobal(options = {}) {
    const paths = getInstallPaths(options);
    assertExtensionSource(paths.repoPath);
    fs.mkdirSync(paths.extensionRoot, { recursive: true });

    if (pathExists(paths.targetPath)) {
        if (isLinkTo(paths.targetPath, paths.repoPath)) {
            return { ...paths, changed: false, backupPath: null };
        }
        const backupRoot = path.join(paths.cocosHome, 'extension-backups');
        fs.mkdirSync(backupRoot, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupRoot, `${EXTENSION_NAME}-${stamp}`);
        fs.renameSync(paths.targetPath, backupPath);
        createDirectoryLink(paths.repoPath, paths.targetPath);
        return { ...paths, changed: true, backupPath };
    }

    createDirectoryLink(paths.repoPath, paths.targetPath);
    return { ...paths, changed: true, backupPath: null };
}

function assertExtensionSource(repoPath) {
    const packagePath = path.join(repoPath, 'package.json');
    const mainPath = path.join(repoPath, 'dist', 'main.js');
    if (!fs.existsSync(packagePath)) {
        throw new Error(`Extension package.json not found: ${packagePath}`);
    }
    const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (manifest.name !== EXTENSION_NAME) {
        throw new Error(`Expected extension name "${EXTENSION_NAME}"`);
    }
    if (!fs.existsSync(mainPath)) {
        throw new Error(`Build output not found: ${mainPath}. Run npm run build first.`);
    }
}

function pathExists(targetPath) {
    try {
        fs.lstatSync(targetPath);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

function isLinkTo(linkPath, expectedPath) {
    try {
        return fs.lstatSync(linkPath).isSymbolicLink()
            && fs.realpathSync(linkPath) === fs.realpathSync(expectedPath);
    } catch {
        return false;
    }
}

function createDirectoryLink(sourcePath, targetPath) {
    fs.symlinkSync(
        sourcePath,
        targetPath,
        process.platform === 'win32' ? 'junction' : 'dir'
    );
}

function main() {
    const versionFlag = process.argv.indexOf('--version');
    const version = versionFlag >= 0 ? process.argv[versionFlag + 1] : undefined;
    if (versionFlag >= 0 && !version) {
        throw new Error('--version requires a Cocos Creator version');
    }
    const result = installGlobal({ version });
    console.log(`Global extension: ${result.targetPath} -> ${result.repoPath}`);
    if (result.backupPath) console.log(`Previous extension backed up to: ${result.backupPath}`);
    console.log(
        result.changed
            ? 'Restart Cocos Creator to load the global extension.'
            : 'Global extension is already linked. Restart Cocos Creator after rebuilding.'
    );
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_COCOS_VERSION,
    EXTENSION_NAME,
    getInstallPaths,
    installGlobal
};
