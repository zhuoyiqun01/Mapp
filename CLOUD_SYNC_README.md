# 云端同步功能 - 快速开始

## ✅ 已完成的工作

1. ✅ 创建了云端同步工具 (`utils/sync.ts`)
2. ✅ 集成到主应用 (`App.tsx`)
3. ✅ 添加了同步状态指示器
4. ✅ 更新了依赖 (`package.json`)
5. ✅ 安装了 Supabase 客户端库

## 🚀 接下来需要做的

### 1. 创建 Supabase 项目（5分钟）

1. 访问 https://supabase.com 注册/登录
2. 创建新项目
3. 等待项目初始化完成

### 2. 创建数据库表（2分钟）

在 Supabase Dashboard > SQL Editor 中执行：

```sql
CREATE TABLE IF NOT EXISTS user_projects (
  device_id TEXT PRIMARY KEY,
  projects_data JSONB NOT NULL,
  last_sync_time BIGINT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_projects_updated_at ON user_projects(updated_at);
```

### 3. 获取 API 密钥（1分钟）

在 Supabase Dashboard > Settings > API 中：
- 复制 **Project URL**
- 复制 **anon/public key**

### 4. 配置 Vercel 环境变量（2分钟）

在 Vercel 项目设置中添加：
- `VITE_SUPABASE_URL` = 你的 Project URL
- `VITE_SUPABASE_ANON_KEY` = 你的 anon key

### 5. 重新部署

```bash
git add .
git commit -m "添加云端同步功能"
git push
```

## 📖 详细文档

查看 `supabase-setup.md` 获取完整设置指南。

## 🎯 功能说明

- **自动同步**: 数据更改后 2 秒自动同步到云端
- **启动同步**: 应用启动时从云端加载最新数据
- **本地优先**: 数据先保存到本地，确保快速响应
- **状态指示**: 右上角显示同步状态（同步中/已同步/失败）

## ⚠️ 注意事项

- 首次使用需要配置 Supabase 环境变量
- 如果未配置，应用会继续使用本地存储（不影响现有功能）
- 每个设备有独立的同步数据（未来可扩展为多设备共享）















