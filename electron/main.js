const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

// 是否为开发模式
const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;
let nextServer = null;
const PORT = 23456;

// 获取应用资源路径
function getAppPath() {
  if (isDev) {
    return path.join(__dirname, '..');
  }
  // 生产环境：standalone 输出在 resources/app 目录
  return path.join(process.resourcesPath, 'app');
}

// 检查端口是否可用
function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/',
      method: 'GET',
      timeout: 1000,
    }, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

// 等待服务器就绪
async function waitForServer(port, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const isReady = await checkPort(port);
    if (isReady) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// 启动 Next.js 服务器（仅生产环境）
async function startNextServer() {
  if (isDev) {
    return `http://localhost:3000`;
  }

  const appPath = getAppPath();
  const serverPath = path.join(appPath, 'server.js');

  console.log('[Electron] Starting Next.js server...');
  console.log('[Electron] App path:', appPath);
  console.log('[Electron] Server path:', serverPath);

  // 设置环境变量
  const env = {
    ...process.env,
    PORT: PORT.toString(),
    HOSTNAME: 'localhost',
    NODE_ENV: 'production',
  };

  return new Promise((resolve, reject) => {
    // 使用 Node.js 运行 standalone server
    nextServer = spawn(process.execPath, [serverPath], {
      cwd: appPath,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    nextServer.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Next.js]', output);
    });

    nextServer.stderr.on('data', (data) => {
      const output = data.toString();
      // Next.js 有时把正常日志输出到 stderr
      if (output.includes('Ready') || output.includes('started')) {
        console.log('[Next.js]', output);
      } else {
        console.error('[Next.js Error]', output);
      }
    });

    nextServer.on('error', (err) => {
      console.error('[Electron] Failed to start Next.js server:', err);
      reject(err);
    });

    nextServer.on('exit', (code) => {
      console.log('[Electron] Next.js server exited with code:', code);
    });

    // 等待服务器就绪
    waitForServer(PORT).then((ready) => {
      if (ready) {
        console.log('[Electron] Next.js server is ready');
        resolve(`http://localhost:${PORT}`);
      } else {
        console.log('[Electron] Timeout waiting for server, trying anyway...');
        resolve(`http://localhost:${PORT}`);
      }
    });
  });
}

// 创建主窗口
async function createWindow() {
  // 创建加载窗口
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'Video Workflow',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#0a0e17',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    show: false,
  });

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 获取服务器 URL
  let url;
  try {
    url = await startNextServer();
  } catch (err) {
    console.error('[Electron] Failed to start server:', err);
    url = `http://localhost:${PORT}`;
  }

  // 加载页面
  const loadPage = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        await mainWindow.loadURL(url);
        console.log('[Electron] Page loaded successfully');
        return;
      } catch (err) {
        console.error(`[Electron] Failed to load URL (attempt ${i + 1}):`, err.message);
        if (i < retries - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }
  };

  await loadPage();

  // 开发模式打开 DevTools
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // 外部链接在浏览器中打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 清理函数
function cleanup() {
  if (nextServer) {
    console.log('[Electron] Killing Next.js server...');
    nextServer.kill('SIGTERM');
    nextServer = null;
  }
}

// 应用就绪
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时
app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前
app.on('before-quit', () => {
  cleanup();
});

// 处理未捕获的异常
process.on('uncaughtException', (err) => {
  console.error('[Electron] Uncaught exception:', err);
  cleanup();
});
