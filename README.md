<div align="center">

# AI Video Workflow

**AI-Powered Intelligent Video Generation Workflow System**

**AI 驱动的智能视频生成工作流系统**

[![Next.js](https://img.shields.io/badge/Next.js-16.x-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.x-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**Live Demo / 在线演示**: [https://workflow.gptproto.com](https://workflow.gptproto.com)

[English](#english) | [中文](#中文)

</div>

---

<a name="english"></a>
## English

### Features

| Feature | Description |
|:---|:---|
| **Video Analysis** | Uses AI models to intelligently analyze video content, automatically extracting character info and scene scripts |
| **Character Reference Generation** | AI text-to-image technology generates high-quality character reference images from script descriptions |
| **Scene Image Generation** | Combines character references with AI image-to-image to generate precise scene frames |
| **Video Clip Generation** | Supports multiple AI video models (**Seedance**, **Hailuo**, **Wan**) with first/last frame technology for coherent videos |
| **Smart Video Merging** | Automatically merges generated video clips into a complete video |
| **History Management** | Save, restore, and continue editing workflow history |

### Workflow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Input     │───▶│  Analyze    │───▶│  Character  │───▶│   Scene     │───▶│   Video     │───▶│   Merge     │
│   Video     │    │   Script    │    │  Reference  │    │   Images    │    │   Clips     │    │   Output    │
└─────────────┘    └──────┬──────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │ Direct JSON │
                   │   Input     │
                   └─────────────┘
```

### Tech Stack

| Technology | Version | Description |
|:---:|:---:|:---|
| Next.js | 16.x | React full-stack framework |
| React | 19.x | UI framework |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Atomic CSS |
| React Flow | 11.x | Workflow visualization |
| FFmpeg | - | Video processing |
| Electron | 39.x | Desktop app (optional) |

### Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x
- **FFmpeg** (required for video merging)

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/GPTProto/ai-workflow.git
cd ai-workflow

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local with your settings

# 4. Start development server
npm run dev
```

Visit **http://localhost:3000** to see the application.

### Environment Configuration

Copy `.env.example` to `.env.local` and configure:

```bash
# Required: OpenAI-compatible API
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1

# Optional: Alibaba Cloud OSS (for cloud storage)
OSS_REGION=oss-us-west-1
OSS_ACCESS_KEY_ID=your_access_key
OSS_ACCESS_KEY_SECRET=your_secret
OSS_BUCKET=your_bucket
OSS_ENDPOINT=https://your-endpoint

# Optional: Supabase (for history persistence)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
```

### FFmpeg Installation

<details>
<summary><b>macOS</b></summary>

```bash
brew install ffmpeg
```

</details>

<details>
<summary><b>Windows</b></summary>

```bash
# Using Chocolatey
choco install ffmpeg

# Using Scoop
scoop install ffmpeg
```

</details>

<details>
<summary><b>Linux</b></summary>

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# Arch Linux
sudo pacman -S ffmpeg
```

</details>

Verify installation:
```bash
ffmpeg -version
```

### Available Commands

| Command | Description |
|:---|:---|
| `npm run dev` | Start development server |
| `npm run build:prod` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Code linting |
| `npm run electron:dev` | Electron dev mode |
| `npm run electron:build` | Build Electron app |

### Supported AI Models

**Video Analysis:**
- Gemini Pro - Analyzes video content, generates character and scene scripts

**Image Generation:**
- Gemini Pro Image (text-to-image / image-to-image)
- Seedream 4.0 (text-to-image)
- Wan 2.5 (text-to-image)

**Video Generation:**
- Seedance 1.0 Pro (supports first/last frame)
- Hailuo 02 Standard (supports first/last frame)
- Wan 2.2 Plus

---

<a name="中文"></a>
## 中文

### 功能特性

| 功能 | 说明 |
|:---|:---|
| **视频分析** | 使用 AI 模型智能分析视频内容，自动提取角色信息和分镜脚本 |
| **角色参考图生成** | 基于脚本描述，使用 AI 文生图技术生成高质量角色参考图 |
| **分镜图片生成** | 结合角色参考图，使用 AI 图生图生成精确的分镜画面 |
| **视频片段生成** | 支持多个 AI 视频模型（**Seedance**、**Hailuo**、**Wan**），采用首尾帧技术生成连贯视频 |
| **智能视频合并** | 自动将生成的视频片段无缝合并为完整视频 |
| **历史记录管理** | 支持工作流历史的保存、恢复和继续编辑 |

### 工作流程

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│             │    │             │    │             │    │             │    │             │    │             │
│  输入视频   │───▶│  分析脚本   │───▶│  角色参考图  │───▶│  分镜图片   │───▶│  视频片段   │───▶│  合并输出   │
│             │    │             │    │             │    │             │    │             │    │             │
└─────────────┘    └──────┬──────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │ JSON 直接   │
                   │ 输入（可选）│
                   └─────────────┘
```

### 技术栈

| 技术 | 版本 | 说明 |
|:---:|:---:|:---|
| Next.js | 16.x | React 全栈框架 |
| React | 19.x | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| Tailwind CSS | 4.x | 原子化 CSS |
| React Flow | 11.x | 工作流可视化 |
| FFmpeg | - | 视频处理 |
| Electron | 39.x | 桌面应用（可选） |

### 环境要求

- **Node.js** >= 18.x
- **npm** >= 9.x
- **FFmpeg**（用于视频合并）

### 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/GPTProto/ai-workflow.git
cd ai-workflow

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入你的配置

# 4. 启动开发服务器
npm run dev
```

访问 **http://localhost:3000** 查看应用

### 环境变量配置

复制 `.env.example` 到 `.env.local` 并配置：

```bash
# 必需：OpenAI 兼容的 API
OPENAI_API_KEY=你的API密钥
OPENAI_BASE_URL=https://api.openai.com/v1

# 可选：阿里云 OSS（用于云存储）
OSS_REGION=oss-us-west-1
OSS_ACCESS_KEY_ID=你的AccessKeyId
OSS_ACCESS_KEY_SECRET=你的AccessKeySecret
OSS_BUCKET=你的Bucket名称
OSS_ENDPOINT=https://你的endpoint

# 可选：Supabase（用于历史记录持久化）
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_ANON_KEY=你的anon_key
```

### FFmpeg 安装

<details>
<summary><b>macOS</b></summary>

```bash
brew install ffmpeg
```

</details>

<details>
<summary><b>Windows</b></summary>

```bash
# 使用 Chocolatey
choco install ffmpeg

# 使用 Scoop
scoop install ffmpeg
```

或者手动安装：
1. 访问 [FFmpeg 官网](https://ffmpeg.org/download.html) 下载
2. 解压到目标目录（如 `C:\ffmpeg`）
3. 将 `C:\ffmpeg\bin` 添加到系统 PATH 环境变量

</details>

<details>
<summary><b>Linux</b></summary>

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# Arch Linux
sudo pacman -S ffmpeg
```

</details>

验证安装：
```bash
ffmpeg -version
```

### 常用命令

| 命令 | 说明 |
|:---|:---|
| `npm run dev` | 启动开发服务器 |
| `npm run build:prod` | 生产构建 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | 代码检查 |
| `npm run electron:dev` | Electron 开发模式 |
| `npm run electron:build` | 构建 Electron 应用 |

### 支持的 AI 模型

**视频分析：**
- Gemini Pro - 分析视频内容，生成角色和分镜脚本

**图像生成：**
- Gemini Pro Image（文生图 / 图生图）
- Seedream 4.0（文生图）
- Wan 2.5（文生图）

**视频生成：**
- Seedance 1.0 Pro（支持首尾帧）
- Hailuo 02 Standard（支持首尾帧）
- Wan 2.2 Plus

### 项目结构

```
ai-workflow/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # 主页面
│   │   ├── history/           # 历史记录页面
│   │   └── api/               # API 路由
│   ├── components/            # React 组件
│   │   ├── workflow/          # 工作流组件
│   │   ├── nodes/             # React Flow 节点
│   │   └── ui/                # 通用 UI 组件
│   ├── config/                # 配置文件
│   ├── hooks/                 # React Hooks
│   ├── lib/                   # 工具库
│   ├── services/              # 服务层
│   ├── constants/             # 常量定义
│   └── types/                 # TypeScript 类型
├── sql/                       # 数据库脚本
├── electron/                  # Electron 文件
├── public/                    # 静态资源
└── package.json
```

---

<div align="center">

## License

**MIT License** © 2024

</div>
