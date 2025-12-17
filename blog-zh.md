# AI Video Workflow：一键生成 AI 视频的开源工作流系统

> 从视频分析到成片输出，全流程 AI 自动化

## 前言

在 AI 视频生成领域，虽然已经有了 Sora、可灵、Seedance、Hailuo 等优秀的视频生成模型，但从一个创意到最终成片，中间仍然需要大量繁琐的人工操作：分析原视频、编写分镜脚本、生成角色参考图、制作每个镜头的画面、生成视频片段、最后合并……

**AI Video Workflow** 就是为了解决这个问题而生的。它是一个完全开源的 AI 视频生成工作流系统，将上述所有步骤串联成一个自动化流程，让你只需要输入一个视频或一段脚本，就能一键生成完整的 AI 视频。

**在线体验**：[https://workflow.gptproto.com](https://workflow.gptproto.com)

**开源地址**：[https://github.com/GPTProto/ai-workflow](https://github.com/GPTProto/ai-workflow)

---

## 核心功能

### 1. 智能视频分析

上传一个视频或输入视频 URL，系统会使用 **Gemini Pro** 模型自动分析视频内容，提取出：

- **角色信息**：识别视频中的主要角色，生成详细的角色描述和生成提示词
- **分镜脚本**：将视频拆分成多个场景，为每个场景生成图像提示词和视频提示词

这意味着你可以直接用一个参考视频作为输入，AI 会自动理解视频内容并生成对应的创作脚本。

### 2. 角色参考图生成

基于分析得到的角色描述，系统会自动调用 AI 图像生成模型，为每个角色生成高质量的参考图。这些参考图将用于后续的分镜生成，确保整个视频中角色形象的一致性。

支持的图像生成模型：
- **Gemini Pro Image** - Google 多模态图像模型，支持文生图和图生图
- **Seedream 4.0** - 字节跳动图像模型
- **Wan 2.5** - 阿里巴巴图像模型

### 3. 分镜图片生成

有了角色参考图后，系统会结合参考图和分镜描述，使用 **图生图（Image-to-Image）** 技术为每个场景生成精确的分镜画面。

这一步的关键在于：通过参考图的引导，生成的分镜画面能够保持角色形象的一致性，避免同一个角色在不同镜头中"变脸"的问题。

### 4. 视频片段生成

分镜图片准备好后，系统会调用视频生成模型，将静态的分镜图片转换为动态视频片段。

这里采用了**首尾帧技术**：将上一个镜头的最后一帧作为下一个镜头的起始帧，确保镜头之间的过渡自然流畅。

支持的视频生成模型：
- **Seedance 1.0 Pro** - 字节跳动视频模型，支持首尾帧
- **Hailuo 02 Standard** - MiniMax 视频模型，支持首尾帧
- **Wan 2.2 Plus** - 阿里巴巴视频模型

### 5. 智能视频合并

所有视频片段生成完成后，系统会自动使用 FFmpeg 将它们无缝合并成一个完整的视频。

整个过程全自动完成，你只需要等待最终的成片输出。

---

## 工作流程图

```
输入视频/脚本
      │
      ▼
┌─────────────┐
│  视频分析   │  ← Gemini Pro 分析内容
│  脚本生成   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 角色参考图  │  ← AI 文生图
│   生成      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  分镜图片   │  ← AI 图生图（结合参考图）
│   生成      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  视频片段   │  ← Seedance/Hailuo/Wan
│   生成      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  视频合并   │  ← FFmpeg
│   输出      │
└─────────────┘
```

---

## 两种运行模式

### 自动模式

适合对结果要求不高，或者想快速看到效果的场景。系统会自动完成所有步骤，无需人工干预。

### 手动模式

适合对质量有较高要求的场景。每个步骤完成后，系统会暂停，让你检查结果、修改参数，确认无误后再继续下一步。

你可以：
- 手动修改角色描述和提示词
- 重新生成不满意的角色参考图
- 调整分镜画面
- 为某个镜头选择不同的视频模型

---

## 技术栈

这个项目使用了现代化的技术栈，代码质量和开发体验都很不错：

| 技术 | 说明 |
|:---|:---|
| **Next.js 16** | React 全栈框架，支持 App Router |
| **React 19** | 最新版 React，性能更优 |
| **TypeScript** | 类型安全，减少运行时错误 |
| **Tailwind CSS 4** | 原子化 CSS，快速构建 UI |
| **React Flow** | 可视化工作流编辑器 |
| **Radix UI** | 无障碍 UI 组件库 |
| **FFmpeg** | 视频处理和合并 |
| **Electron** | 可选的桌面应用支持 |

后端服务可选配置：
- **阿里云 OSS** - 存储生成的图片和视频
- **Supabase** - PostgreSQL 数据库，用于保存工作流历史

---

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/GPTProto/ai-workflow.git
cd ai-workflow
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填入你的配置：

```bash
# 必需：OpenAI 兼容的 API
OPENAI_API_KEY=你的API密钥
OPENAI_BASE_URL=https://api.openai.com/v1

# 可选：阿里云 OSS
OSS_ACCESS_KEY_ID=你的AccessKeyId
OSS_ACCESS_KEY_SECRET=你的AccessKeySecret
OSS_BUCKET=你的Bucket名称

# 可选：Supabase
SUPABASE_URL=https://你的项目.supabase.co
SUPABASE_ANON_KEY=你的anon_key
```

### 4. 安装 FFmpeg

视频合并功能需要 FFmpeg：

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
choco install ffmpeg
```

### 5. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000` 即可使用。

---

## 使用场景

### 1. 视频翻拍/二创

有一个喜欢的视频，想用 AI 风格重新生成？直接把原视频丢进去，系统会自动分析并生成 AI 版本。

### 2. 分镜脚本可视化

写好了分镜脚本，想看看实际效果？直接输入 JSON 格式的脚本，一键生成完整视频。

### 3. 快速原型验证

有一个视频创意，想快速验证可行性？用这个工具几分钟就能看到效果。

### 4. 批量视频生成

结合 API，可以实现批量的视频生成流水线。

---

## 与其他工具的对比

| 功能 | AI Video Workflow | 传统剪辑软件 | 其他 AI 工具 |
|:---|:---:|:---:|:---:|
| 自动分析视频 | ✅ | ❌ | 部分支持 |
| 角色一致性 | ✅ | 需手动 | 部分支持 |
| 端到端自动化 | ✅ | ❌ | ❌ |
| 多模型支持 | ✅ | - | 单一模型 |
| 开源免费 | ✅ | ❌ | 部分 |
| 本地部署 | ✅ | ✅ | 部分 |

---

## 未来规划

- [ ] 支持更多视频生成模型（Sora、可灵等）
- [ ] 添加音频/配乐生成
- [ ] 支持字幕自动生成
- [ ] 优化角色一致性算法
- [ ] 添加更多预设模板

---

## 相关链接

- **在线体验**：[https://workflow.gptproto.com](https://workflow.gptproto.com)
- **GitHub 仓库**：[https://github.com/GPTProto/ai-workflow](https://github.com/GPTProto/ai-workflow)
- **GPT Proto**：[https://gptproto.com](https://gptproto.com) - AI 工具与资源
- **GPT Proto AI API**：[https://gptproto.com/model](https://gptproto.com/model) - OpenAI 兼容的 API 服务

---

## 总结

AI Video Workflow 是一个功能完整、开箱即用的 AI 视频生成工作流系统。它把原本需要多个工具、多个步骤才能完成的视频制作流程，简化成了一键操作。

无论你是想快速验证一个创意，还是想批量生成 AI 视频内容，这个工具都能帮到你。

项目完全开源，欢迎 Star、Fork 和贡献代码！

---

*如果这个项目对你有帮助，请给我们一个 ⭐ Star！*
