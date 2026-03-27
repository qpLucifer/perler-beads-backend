# 拼豆 DIY 后端服务（Node.js + Express + MySQL）

本项目是拼豆 DIY 系统的核心后端，负责用户认证、作品与模板管理、商品与订单交易、优惠券、评价、收藏、后台管理等业务能力，并为小程序端与管理端提供统一 API。

## 1. 项目职责

- 对外提供 REST API（`/api/**`）。
- 统一管理业务数据与权限（普通用户/管理员）。
- 提供模板、订单、评价等多模块的筛选分页与参数校验能力。
- 对接两个前端项目：
  - `perler-beads-uniapp`（用户端）
  - `perler-beads-admin`（管理后台）

## 2. 技术栈

- Node.js + Express
- MySQL（`mysql2`）
- JWT 认证（`jsonwebtoken`）
- 密码加密（`bcryptjs`）
- 文件上传（`multer`）

## 3. 快速启动

### 3.1 安装依赖

```bash
npm install
```

### 3.2 配置环境变量

在项目根目录创建 `.env`，至少包含数据库与 JWT 配置（可参考项目现有配置约定）。

### 3.3 初始化数据库

```bash
npm run db:init
```

该命令会执行初始化脚本并补齐关键初始化数据（含模板相关初始化逻辑）。

### 3.4 启动服务

- 开发模式：

```bash
npm run dev
```

- 生产模式：

```bash
npm start
```

默认端口：`3000`（可通过环境变量覆盖）。

### 3.5 健康检查

```text
GET /health
```

## 4. 核心接口分组

> 下面是业务分组，不是完整 API 清单。

- 认证：`/api/auth`
- 用户：`/api/users`
- 商品：`/api/products`
- 作品：`/api/artworks`
- 模板：`/api/templates`
- 购物车：`/api/cart`
- 订单：`/api/orders`
- 地址：`/api/addresses`
- 优惠券：`/api/coupons`
- 收藏：`/api/favorites`
- 评价：`/api/reviews`、`/api/admin/reviews`
- 后台管理：`/api/admin`
- 拼豆基础数据：`/api/beads`

## 5. 目录结构（核心）

```text
perler-beads-backend/
├─ src/
│  ├─ app.js                 # 服务入口与路由注册
│  ├─ config/                # 数据库连接等配置
│  ├─ middleware/            # 认证与权限中间件
│  ├─ routes/                # 各业务路由
│  └─ utils/                 # 通用工具（含 query 参数解析）
├─ scripts/
│  └─ init-db.js             # 数据库初始化脚本
├─ init-db.sql               # 数据库结构与种子数据
├─ package.json
└─ README.md
```

## 6. 参数校验与查询规范

项目已逐步统一列表查询规范：

- 分页：统一解析 `page/limit`，限制边界。
- 筛选：枚举值与数值范围采用白名单/范围校验。
- 排序：`sort_by/sort_order` 白名单化，避免非法字段注入。
- 回显：部分接口返回 `applied_filters`，用于前端感知“服务端实际采纳参数”。

关键工具位于：`src/utils/query.js`。

## 7. 认证与权限

- 需要登录的接口通过 `Authorization: Bearer <token>` 传递 JWT。
- 管理接口要求管理员角色（由中间件校验）。
- 建议前后端统一处理 `401/403`，并做 token 失效自动跳转。

## 8. 开发与联调建议

- 联调顺序：先后端，再管理端/小程序端。
- 接口字段新增或重命名时，务必同步更新两个前端项目。
- 涉及价格、优惠券、订单状态流转的改动，请优先做端到端回归。

## 9. 常见问题

- 启动端口冲突：检查 `3000` 是否被占用。
- 数据库连接失败：检查 `.env` 中数据库地址、账号、密码、库名。
- 模板预览异常：重点排查 `bead_data` 字段结构与解析逻辑。
- 列表筛选无效：检查是否命中白名单限制及 `applied_filters` 回显。

## 10. 许可证

MIT
