import { app, BrowserWindow, globalShortcut } from "electron";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import http from "http";
import fs from "fs";

const PORT = 3000;
let serverProcess: ChildProcess | null = null;
let logStream: fs.WriteStream | null = null;

function initLog() {
    const logPath = path.join(app.getPath("logs"), "getwrite.log");
    logStream = fs.createWriteStream(logPath, { flags: "a" });
}

function log(msg: string) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    process.stdout.write(line);
    logStream?.write(line);
}

function getRepoRoot(): string {
    // __dirname is electron/dist/ — two levels up reaches the repo root
    return app.isPackaged
        ? process.resourcesPath
        : path.join(__dirname, "..", "..");
}

function resolveDirectories() {
    const root = getRepoRoot();
    return {
        projectsDir: path.join(root, "projects"),
        templatesDir: path.join(
            root,
            "getwrite-config",
            "templates",
            "project-types",
        ),
        standaloneDir: path.join(root, "frontend", ".next", "standalone"),
    };
}

function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
    return new Promise((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;
        const check = () => {
            http.get(url, (res) => {
                if (res.statusCode && res.statusCode < 500) {
                    resolve();
                } else {
                    retry();
                }
            }).on("error", retry);
        };
        const retry = () => {
            if (Date.now() > deadline) {
                reject(new Error("Server did not start in time"));
                return;
            }
            setTimeout(check, 500);
        };
        check();
    });
}

function startServer(dirs: ReturnType<typeof resolveDirectories>): ChildProcess {
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: "127.0.0.1",
        GETWRITE_PROJECTS_DIR: dirs.projectsDir,
        GETWRITE_TEMPLATES_DIR: dirs.templatesDir,
    };

    log(`standaloneDir: ${dirs.standaloneDir}`);
    log(`projectsDir:   ${dirs.projectsDir}`);
    log(`templatesDir:  ${dirs.templatesDir}`);

    if (app.isPackaged) {
        fs.mkdirSync(dirs.projectsDir, { recursive: true });
        // pnpm monorepo: Next.js standalone mirrors the workspace layout,
        // so server.js lands at standalone/frontend/server.js (not standalone/server.js).
        const serverCwd = path.join(dirs.standaloneDir, "frontend");
        const serverScript = path.join(serverCwd, "server.js");
        log(`Spawning packaged server: ${process.execPath} ${serverScript}`);
        return spawn(process.execPath, [serverScript], {
            cwd: serverCwd,
            env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
        });
    }

    log(`Spawning dev server in: ${path.join(getRepoRoot(), "frontend")}`);
    return spawn("pnpm", ["dev"], {
        cwd: path.join(getRepoRoot(), "frontend"),
        env,
        shell: true,
    });
}

function createWindow(): BrowserWindow {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    win.once("ready-to-show", () => win.show());

    // Cmd+Shift+I toggles DevTools
    globalShortcut.register("CommandOrControl+Shift+I", () => {
        win.webContents.toggleDevTools();
    });

    return win;
}

function loadWhenReady(win: BrowserWindow): { abort: (msg: string) => void } {
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const abort = (msg: string) => {
        if (stopped) return;
        stopped = true;
        if (retryTimer) clearTimeout(retryTimer);
        if (!win.isDestroyed()) {
            const logDir = app.getPath("logs");
            win.loadURL(
                `data:text/html,<pre style="font-family:monospace;padding:2rem">${msg}\n\nLog: ${logDir}/getwrite.log</pre>`,
            ).catch(() => {});
        }
    };

    win.on("closed", () => {
        stopped = true;
        if (retryTimer) clearTimeout(retryTimer);
    });

    win.webContents.on("did-fail-load", (_e, code, desc) => {
        if (stopped) return;
        log(`did-fail-load ${code} ${desc} — retrying in 1s`);
        retryTimer = setTimeout(() => {
            if (!stopped && !win.isDestroyed()) {
                win.loadURL(`http://localhost:${PORT}`).catch(() => {});
            }
        }, 1000);
    });

    waitForServer(`http://localhost:${PORT}`)
        .then(() => {
            log("server ready");
            if (!stopped && !win.isDestroyed()) {
                win.loadURL(`http://localhost:${PORT}`).catch(() => {});
            }
        })
        .catch((err) => abort(`Server failed to start: ${err}`));

    return { abort };
}

app.whenReady().then(() => {
    initLog();
    log(`app ready — isPackaged: ${app.isPackaged}`);
    log(`resourcesPath: ${process.resourcesPath}`);

    const dirs = resolveDirectories();
    serverProcess = startServer(dirs);

    serverProcess.stdout?.on("data", (d) => log(d.toString().trim()));
    serverProcess.stderr?.on("data", (d) => log(`[stderr] ${d.toString().trim()}`));

    const win = createWindow();
    const { abort } = loadWhenReady(win);

    serverProcess.on("exit", (code) => {
        log(`server exited with code ${code}`);
        if (code !== 0) abort(`Server exited unexpectedly (code ${code})`);
    });
});

app.on("before-quit", () => {
    serverProcess?.kill();
    logStream?.end();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
