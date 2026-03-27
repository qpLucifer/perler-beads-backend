-- 拼豆 DIY 数据库初始化脚本
-- 数据库：perler_beads

DROP DATABASE IF EXISTS perler_beads;
CREATE DATABASE perler_beads DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE perler_beads;

-- ============ 用户表 ============
CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  nickname VARCHAR(50),
  avatar_url VARCHAR(255),
  wechat_openid VARCHAR(100) UNIQUE,
  wechat_unionid VARCHAR(100),
  phone VARCHAR(20),
  role ENUM('user', 'admin') DEFAULT 'user',
  status TINYINT DEFAULT 1 COMMENT '1:正常 0:禁用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL,
  INDEX idx_username (username),
  INDEX idx_email (email),
  INDEX idx_wechat_openid (wechat_openid),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 商品表 ============
CREATE TABLE IF NOT EXISTS products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  original_price DECIMAL(10,2),
  category ENUM('set', 'board', 'tool', 'bead') NOT NULL,
  stock INT DEFAULT 0,
  image_url VARCHAR(255),
  is_on_sale TINYINT DEFAULT 1 COMMENT '1:上架 0:下架',
  avg_rating DECIMAL(3,2) DEFAULT 0,
  review_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_is_on_sale (is_on_sale)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 收货地址表 ============
CREATE TABLE IF NOT EXISTS addresses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  province VARCHAR(50),
  city VARCHAR(50),
  district VARCHAR(50),
  detail VARCHAR(255),
  is_default TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 购物车表 ============
CREATE TABLE IF NOT EXISTS cart (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  artwork_id INT NULL,
  product_id INT NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_product (user_id, product_id),
  INDEX idx_user_id (user_id),
  INDEX idx_artwork_id (artwork_id),
  INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 订单表 ============
CREATE TABLE IF NOT EXISTS orders (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_no VARCHAR(50) UNIQUE NOT NULL,
  user_id INT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  status ENUM('pending', 'paid', 'shipped', 'completed', 'cancelled') DEFAULT 'pending',
  address_id INT,
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  paid_at TIMESTAMP NULL,
  shipped_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (address_id) REFERENCES addresses(id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_order_no (order_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 优惠券表 ============
CREATE TABLE IF NOT EXISTS coupons (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  discount_type ENUM('fixed', 'percent') NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  min_amount DECIMAL(10,2) DEFAULT 0,
  max_discount DECIMAL(10,2),
  valid_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valid_until TIMESTAMP NULL,
  total_count INT DEFAULT 0,
  per_user_limit INT DEFAULT 1,
  used_count INT DEFAULT 0,
  status TINYINT DEFAULT 1 COMMENT '1:有效 0:无效',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 用户优惠券表 ============
CREATE TABLE IF NOT EXISTS user_coupons (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  coupon_id INT NOT NULL,
  status ENUM('unused', 'used', 'expired') DEFAULT 'unused',
  used_at TIMESTAMP NULL,
  order_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  INDEX idx_user_id (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 作品表 ============
CREATE TABLE IF NOT EXISTS artworks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  title VARCHAR(100),
  image_url VARCHAR(255),
  width INT DEFAULT 32,
  height INT DEFAULT 32,
  bead_data JSON,
  bead_count INT DEFAULT 0,
  is_public TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id),
  INDEX idx_is_public (is_public)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- cart 依赖 artworks，延后添加外键
ALTER TABLE cart
  ADD CONSTRAINT fk_cart_artwork FOREIGN KEY (artwork_id) REFERENCES artworks(id) ON DELETE CASCADE;

-- ============ 订单商品表（依赖 orders + artworks）============
CREATE TABLE IF NOT EXISTS order_items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  product_id INT NULL,
  artwork_id INT NULL,
  product_name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (artwork_id) REFERENCES artworks(id),
  INDEX idx_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 收藏表 ============
CREATE TABLE IF NOT EXISTS favorites (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_product (user_id, product_id),
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 评价表 ============
CREATE TABLE IF NOT EXISTS reviews (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  order_id INT NULL,
  rating TINYINT NOT NULL,
  content TEXT,
  images JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_product_id (product_id),
  INDEX idx_user_id (user_id),
  INDEX idx_rating (rating),
  INDEX idx_order_id (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 商品表扩展字段 ============
-- 注意：MySQL 不支持 ALTER TABLE ... ADD COLUMN IF NOT EXISTS
-- 如果字段已存在会报错，可以手动执行或忽略错误
-- ALTER TABLE products ADD COLUMN avg_rating DECIMAL(3,2) DEFAULT 0;
-- ALTER TABLE products ADD COLUMN review_count INT DEFAULT 0;

-- ============ 模板表 ============
CREATE TABLE IF NOT EXISTS templates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) DEFAULT '图案',
  difficulty VARCHAR(50) DEFAULT '简单',
  description TEXT,
  image_url VARCHAR(255),
  width INT DEFAULT 32,
  height INT DEFAULT 32,
  bead_data JSON,
  download_count INT DEFAULT 0,
  like_count INT NOT NULL DEFAULT 0,
  is_official TINYINT DEFAULT 0 COMMENT '1:官方模板 0:用户模板',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_is_official (is_official)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 模板点赞表 ============
CREATE TABLE IF NOT EXISTS template_likes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  template_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_template (user_id, template_id),
  INDEX idx_template_id (template_id),
  INDEX idx_user_id (user_id),
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ AI 模板生成任务记录 ============
CREATE TABLE IF NOT EXISTS template_ai_jobs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_id VARCHAR(64) NOT NULL UNIQUE,
  user_id INT NULL,
  canvas_size INT DEFAULT 32,
  status ENUM('queued', 'running', 'succeeded', 'failed') DEFAULT 'queued',
  progress INT DEFAULT 0,
  progress_text VARCHAR(255) DEFAULT '',
  error_message TEXT NULL,
  result_json LONGTEXT NULL,
  started_at TIMESTAMP NULL,
  finished_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ai_jobs_status_created (status, created_at),
  INDEX idx_ai_jobs_user_created (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 协议文档表 ============
CREATE TABLE IF NOT EXISTS legal_docs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  doc_key VARCHAR(50) NOT NULL UNIQUE COMMENT 'user_agreement | privacy_policy',
  title VARCHAR(120) NOT NULL,
  content LONGTEXT NOT NULL,
  version VARCHAR(30) DEFAULT 'v1.0.0',
  effective_date DATE NULL,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_doc_key (doc_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 协议历史版本表 ============
CREATE TABLE IF NOT EXISTS legal_doc_versions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  doc_key VARCHAR(50) NOT NULL,
  title VARCHAR(120) NOT NULL,
  content LONGTEXT NOT NULL,
  version VARCHAR(30) DEFAULT 'v1.0.0',
  effective_date DATE NULL,
  source_doc_id INT NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_doc_key_created_at (doc_key, created_at),
  INDEX idx_source_doc_id (source_doc_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 初始化数据 ============

-- 管理员账号 (密码：admin123)
INSERT INTO users (username, email, password_hash, nickname, role, status) VALUES
('admin', 'admin@perlerbeads.com', '$2a$10$4HaO9b/7vby1q2J3YxL86.fTLbDy9HqTr3l.5cCNoXFUcreJRmvs2', '管理员', 'admin', 1);

-- 测试用户 (密码：user123)
INSERT INTO users (username, email, password_hash, nickname, role, status) VALUES
('testuser', 'test@perlerbeads.com', '$2a$10$u9G0/X3CRY5/Bo0UohkSfOqxgRQGxdHHVDES3.WTx6I8NHcWZ1sEG', '测试用户', 'user', 1);

-- 商品数据
INSERT INTO products (name, description, price, original_price, category, stock, image_url, is_on_sale) VALUES
('基础拼豆套装（20 色×100 颗）', '包含 20 种基础颜色，每种 100 颗，共 2000 颗拼豆', 39.90, 59.90, 'set', 50, 'https://via.placeholder.com/200?text=Set1', 1),
('32x32 透明底板', '高质量透明塑料底板，32x32 标准尺寸', 15.90, 19.90, 'board', 100, 'https://via.placeholder.com/200?text=Board1', 1),
('专业熨斗（恒温）', '恒温控制，安全熨烫拼豆作品', 45.00, 69.00, 'tool', 30, 'https://via.placeholder.com/200?text=Tool1', 1),
('夜光拼豆（10 色混合）', '10 种夜光颜色，黑暗中发光效果', 29.90, 39.90, 'bead', 80, 'https://via.placeholder.com/200?text=Bead1', 1),
('金属色拼豆（金银铜）', '金属光泽拼豆，金银铜三色混合', 25.90, 35.90, 'bead', 120, 'https://via.placeholder.com/200?text=Bead2', 1),
('迷你底板套装（6 个）', '6 个迷你底板，适合制作小饰品', 19.90, 29.90, 'board', 60, 'https://via.placeholder.com/200?text=Board2', 1);

-- 官方模板
INSERT INTO templates (name, description, image_url, width, height, is_official) VALUES
('❤️ 心形', '经典粉色心形图案', 'https://via.placeholder.com/100?text=Heart', 32, 32, 1),
('⭐ 星星', '金色五角星图案', 'https://via.placeholder.com/100?text=Star', 32, 32, 1),
('🔴 红色圆形', '简单红色圆形', 'https://via.placeholder.com/100?text=Circle', 32, 32, 1),
('🔵 蓝色圆形', '简单蓝色圆形', 'https://via.placeholder.com/100?text=Circle2', 32, 32, 1),
('🟩 绿色方块', '简单绿色方块', 'https://via.placeholder.com/100?text=Square', 32, 32, 1),
('🟣 紫色圆形', '简单紫色圆形', 'https://via.placeholder.com/100?text=Circle3', 32, 32, 1);

-- 优惠券
INSERT INTO coupons (code, name, description, discount_type, discount_value, min_amount, valid_until, total_count, status) VALUES
('WELCOME10', '新人优惠券', '新用户注册即送', 'fixed', 10.00, 50.00, DATE_ADD(NOW(), INTERVAL 30 DAY), 1000, 1),
('SAVE20', '满减优惠', '满 100 减 20', 'fixed', 20.00, 100.00, DATE_ADD(NOW(), INTERVAL 7 DAY), 500, 1),
('PERLER15', '折扣优惠', '全场 85 折', 'percent', 15.00, 30.00, DATE_ADD(NOW(), INTERVAL 14 DAY), 200, 1);

-- 协议文档
INSERT INTO legal_docs (doc_key, title, content, version, effective_date) VALUES
('user_agreement', '用户协议', '欢迎使用拼豆 DIY。\\n\\n1. 服务说明\\n我们提供拼豆创作、模板浏览、作品分享与商品购买等服务。\\n\\n2. 账号与安全\\n请妥善保管账号，不得出借或转让。\\n\\n3. 行为规范\\n禁止发布违法违规或侵权内容。\\n\\n4. 订单与支付\\n价格和库存以下单时页面展示为准。\\n\\n5. 协议更新\\n协议更新后将公示，继续使用视为同意。', 'v1.0.0', CURDATE()),
('privacy_policy', '隐私政策', '欢迎使用拼豆 DIY。\\n\\n1. 信息收集\\n我们会在必要范围收集账号、订单与设备信息。\\n\\n2. 信息使用\\n用于登录鉴权、交易履约、内容展示与安全风控。\\n\\n3. 信息共享\\n未经授权不会向无关第三方出售你的个人信息。\\n\\n4. 信息保护\\n我们采取合理安全措施保护你的信息。\\n\\n5. 政策更新\\n发生重大变化时将通过页面公示提醒。', 'v1.0.0', CURDATE());

SELECT '数据库初始化完成！' AS message;
