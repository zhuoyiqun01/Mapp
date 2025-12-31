# Supabase 云端同步设置指南

## 1. 创建 Supabase 项目

1. 访问 [Supabase](https://supabase.com) 并注册/登录
2. 点击 "New Project" 创建新项目
3. 填写项目信息：
   - **Name**: 你的项目名称（如 `mapp-sync`）
   - **Database Password**: 设置数据库密码（请保存好）
   - **Region**: 选择离你最近的区域
4. 等待项目创建完成（约 2 分钟）

## 2. 创建数据库表

在 Supabase Dashboard 中：

1. 进入 **SQL Editor**
2. 点击 **New Query**
3. 复制并执行以下 SQL：

```sql
-- 创建用户项目表
CREATE TABLE IF NOT EXISTS user_projects (
  device_id TEXT PRIMARY KEY,
  projects_data JSONB NOT NULL,
  last_sync_time BIGINT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_user_projects_updated_at ON user_projects(updated_at);

-- 启用 Row Level Security (RLS) - 可选，如果未来需要用户认证
-- ALTER TABLE user_projects ENABLE ROW LEVEL SECURITY;

-- 如果需要允许匿名访问（当前方案），可以创建策略：
-- CREATE POLICY "Allow anonymous access" ON user_projects
--   FOR ALL USING (true);
```

## 3. 获取 API 密钥

1. 在 Supabase Dashboard 中，进入 **Settings** > **API**
2. 找到以下信息：
   - **Project URL** (例如: `https://xxxxx.supabase.co`)
   - **anon/public key** (以 `eyJ...` 开头的长字符串)

## 4. 配置环境变量

### 在 Vercel 中配置：

1. 进入你的 Vercel 项目
2. 进入 **Settings** > **Environment Variables**
3. 添加以下环境变量：

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 本地开发配置：

1. 在项目根目录创建 `.env` 文件（如果不存在）
2. 添加以下内容：

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

3. **重要**: 将 `.env` 添加到 `.gitignore` 中，不要提交到 Git

## 5. 安装依赖

```bash
npm install
```

## 6. 重新部署

配置完成后，重新部署到 Vercel：

```bash
git add .
git commit -m "添加云端同步功能"
git push
```

Vercel 会自动检测到更改并重新部署。

## 7. 测试同步功能

1. 打开部署后的网站
2. 创建或修改一些项目
3. 观察右上角的同步状态指示器：
   - 🔵 **同步中...**: 正在同步
   - 🟢 **已同步**: 同步成功
   - 🔴 **同步失败**: 同步出错（检查控制台）
   - ⚪ **云图标**: 已连接，等待同步

## 工作原理

- **本地优先**: 数据先保存到本地 IndexedDB，确保快速响应
- **后台同步**: 数据更改后 2 秒自动同步到云端
- **启动同步**: 应用启动时从云端加载数据并合并
- **设备识别**: 每个设备有唯一 ID，数据按设备存储
- **冲突处理**: 本地数据优先（可后续优化）

## 故障排除

### 同步失败

1. 检查环境变量是否正确配置
2. 检查 Supabase 项目是否正常运行
3. 检查浏览器控制台的错误信息
4. 确认数据库表已正确创建

### 数据不同步

1. 检查网络连接
2. 检查 Supabase 项目的 API 限制
3. 查看 Supabase Dashboard 的 Logs 查看错误

## 未来扩展

- 添加用户认证系统
- 实现多设备实时同步
- 添加冲突解决策略
- 实现数据版本控制




















