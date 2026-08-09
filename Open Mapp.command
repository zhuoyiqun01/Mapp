#!/bin/zsh
# 双击此文件即可启动 Mapp（mapping-app）并打开浏览器

cd "$(dirname "$0")"

# 确保依赖已安装
if [ ! -d "node_modules" ]; then
  echo "正在安装依赖…"
  npm install
fi

PORT=3000
URL="http://localhost:${PORT}"

# 若端口已被占用，直接打开浏览器
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "服务已在运行，正在打开 ${URL}"
  open "$URL"
  exit 0
fi

echo "正在启动 Mapp…"
# 后台启动后等就绪再开浏览器，终端保持输出便于查看日志
npm run dev &
DEV_PID=$!

for i in {1..30}; do
  if curl -sf "$URL" >/dev/null 2>&1; then
    open "$URL"
    echo "已打开 ${URL}（关闭本窗口会停止服务）"
    wait $DEV_PID
    exit $?
  fi
  sleep 0.5
done

echo "启动超时，请检查终端报错"
wait $DEV_PID
exit 1
