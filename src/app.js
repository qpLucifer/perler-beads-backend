const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { testConnection } = require('./config/database');

// 导入路由
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const artworkRoutes = require('./routes/artworks');
const templateRoutes = require('./routes/templates');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const addressRoutes = require('./routes/addresses');
const couponRoutes = require('./routes/coupons');
const adminRoutes = require('./routes/admin');
const favoritesRoutes = require('./routes/favorites');
const reviewsRoutes = require('./routes/reviews');
const adminReviewsRoutes = require('./routes/admin-reviews');
const beadsRoutes = require('./routes/beads');
const legalRoutes = require('./routes/legal');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静态文件目录
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'perler-beads-backend'
  });
});

// API root index
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Perler Beads API',
    docs: '/api/docs',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      users: '/api/users',
      products: '/api/products',
      artworks: '/api/artworks',
      templates: '/api/templates',
      cart: '/api/cart',
      orders: '/api/orders',
      addresses: '/api/addresses',
      coupons: '/api/coupons',
      favorites: '/api/favorites',
      reviews: '/api/reviews',
      legal: '/api/legal',
      admin: '/api/admin'
    }
  });
});

// Simple API docs page
app.get('/api/docs', (req, res) => {
  const docsHtml = `
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Perler Beads API Docs</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f6f8fb; color: #1f2937; margin: 0; }
    .wrap { max-width: 980px; margin: 28px auto; padding: 0 16px; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,.06); padding: 16px 18px; margin-bottom: 16px; }
    h1 { margin: 0 0 8px; font-size: 26px; }
    h2 { margin: 6px 0 10px; font-size: 18px; }
    p { margin: 6px 0; color: #4b5563; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #eef2f7; font-size: 14px; }
    th { color: #334155; background: #f8fafc; }
    .method { font-weight: 700; }
    .get { color: #0f766e; } .post { color: #2563eb; } .put { color: #9333ea; } .delete { color: #b91c1c; }
    code { background: #f1f5f9; padding: 1px 6px; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Perler Beads API 文档（简易版）</h1>
      <p>基础地址：<code>http://localhost:${PORT}/api</code></p>
      <p>健康检查：<code>GET /health</code></p>
      <p>认证方式：在请求头中传 <code>Authorization: Bearer &lt;token&gt;</code></p>
    </div>

    <div class="card">
      <h2>公开接口</h2>
      <table>
        <tr><th>方法</th><th>路径</th><th>说明</th></tr>
        <tr><td class="method get">GET</td><td>/api/products</td><td>商品列表</td></tr>
        <tr><td class="method get">GET</td><td>/api/templates</td><td>模板列表</td></tr>
        <tr><td class="method get">GET</td><td>/api/artworks</td><td>作品列表</td></tr>
        <tr><td class="method post">POST</td><td>/api/auth/login</td><td>账号密码登录</td></tr>
        <tr><td class="method post">POST</td><td>/api/auth/register</td><td>用户注册</td></tr>
        <tr><td class="method post">POST</td><td>/api/auth/wechat-login</td><td>微信登录</td></tr>
        <tr><td class="method get">GET</td><td>/api/legal/user_agreement</td><td>用户协议</td></tr>
        <tr><td class="method get">GET</td><td>/api/legal/privacy_policy</td><td>隐私政策</td></tr>
      </table>
    </div>

    <div class="card">
      <h2>需要登录</h2>
      <table>
        <tr><th>方法</th><th>路径</th><th>说明</th></tr>
        <tr><td class="method get">GET</td><td>/api/auth/me</td><td>当前用户信息</td></tr>
        <tr><td class="method get">GET</td><td>/api/cart</td><td>购物车</td></tr>
        <tr><td class="method post">POST</td><td>/api/orders</td><td>创建订单</td></tr>
        <tr><td class="method get">GET</td><td>/api/orders</td><td>我的订单</td></tr>
        <tr><td class="method post">POST</td><td>/api/templates/:id/like</td><td>模板点赞/取消</td></tr>
      </table>
    </div>

    <div class="card">
      <h2>管理员接口</h2>
      <table>
        <tr><th>方法</th><th>路径</th><th>说明</th></tr>
        <tr><td class="method get">GET</td><td>/api/admin/dashboard/stats</td><td>仪表盘统计</td></tr>
        <tr><td class="method get">GET</td><td>/api/admin/users</td><td>用户管理列表</td></tr>
        <tr><td class="method get">GET</td><td>/api/admin/products</td><td>商品管理列表</td></tr>
        <tr><td class="method get">GET</td><td>/api/admin/orders</td><td>订单管理列表</td></tr>
        <tr><td class="method put">PUT</td><td>/api/admin/legal/:docKey</td><td>更新协议文档</td></tr>
        <tr><td class="method get">GET</td><td>/api/admin/legal/:docKey/versions</td><td>协议历史版本</td></tr>
        <tr><td class="method post">POST</td><td>/api/admin/legal/:docKey/rollback/:versionId</td><td>协议一键回滚</td></tr>
      </table>
    </div>
  </div>
</body>
</html>
  `;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(docsHtml);
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/artworks', artworkRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/beads', beadsRoutes);
app.use('/api/admin/reviews', adminReviewsRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/admin/legal', legalRoutes);

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误'
  });
});

// 启动服务器
async function startServer() {
  // 测试数据库连接
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.warn('⚠️  数据库连接失败，但服务器仍会启动');
  }

  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════╗
║       🎨 拼豆 DIY 后端服务已启动              ║
╠════════════════════════════════════════════════╣
║  📍 地址：http://localhost:${PORT}               ║
║  📊 健康检查：http://localhost:${PORT}/health    ║
║  📚 API 索引：http://localhost:${PORT}/api         ║
║  📚 API 文档：http://localhost:${PORT}/api/docs    ║
║  💾 环境：${process.env.NODE_ENV || 'development'}                          ║
╚════════════════════════════════════════════════╝
    `);
  });
}

startServer();

module.exports = app;
