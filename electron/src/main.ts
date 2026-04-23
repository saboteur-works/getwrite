import { app, BrowserWindow } from "electron";
import { spawn, ChildProcess } from "child_process";
import path from "path";
import http from "http";
import fs from "fs";

const PORT = 3000;
let serverProcess: ChildProcess | null = null;

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

function startServer(
    dirs: ReturnType<typeof resolveDirectories>,
): ChildProcess {
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        PORT: String(PORT),
        HOSTNAME: "127.0.0.1",
        GETWRITE_PROJECTS_DIR: dirs.projectsDir,
        GETWRITE_TEMPLATES_DIR: dirs.templatesDir,
    };

    if (app.isPackaged) {
        fs.mkdirSync(dirs.projectsDir, { recursive: true });
        return spawn("node", [path.join(dirs.standaloneDir, "server.js")], {
            env,
        });
    }

    return spawn("pnpm", ["dev"], {
        cwd: path.join(getRepoRoot(), "frontend"),
        env,
        shell: true,
    });
}

async function createWindow() {
    const dirs = resolveDirectories();
    serverProcess = startServer(dirs);

    serverProcess.stdout?.on("data", (d) => process.stdout.write(d));
    serverProcess.stderr?.on("data", (d) => process.stderr.write(d));

    await waitForServer(`http://localhost:${PORT}`);

    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    win.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(createWindow).catch((err) => {
    console.error("Failed to start:", err);
    app.quit();
});

app.on("before-quit", () => {
    serverProcess?.kill();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
