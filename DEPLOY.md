# 发布为公共静态网页

这个目录可以直接部署到 GitHub Pages、Cloudflare Pages、Vercel 或 Netlify，不需要服务器和数据库。

## 公共和个人数据

- `data/question-bank.json`：所有同学共享的公开题库。
- `data/site-config.json`：站点名称、联系文案和微信二维码路径。
- 浏览器本地存储：每位使用者自己的错题、收藏、笔记和答题进度。

## 添加微信二维码

把二维码图片放到 `assets/wechat-qr.png`，然后修改 `data/site-config.json`：

```json
"wechatQr": "./assets/wechat-qr.png"
```

## 更新公共题库

把整理后的题目写入 `data/question-bank.json`。重新部署后，所有同学刷新页面即可获取最新题库，不会删除他们各自的学习进度。

## GitHub Pages

1. 创建一个公开仓库。
2. 将本目录全部文件放到仓库根目录。
3. 在仓库 Settings > Pages 中选择从默认分支根目录发布。
4. 等待 GitHub 生成公共网址。
