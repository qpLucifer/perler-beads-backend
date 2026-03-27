/**
 * 数据库初始化脚本
 * 使用方法：node scripts/init-db.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

function generateTemplateByName(name, width = 32, height = 32) {
  const n = String(name || '');
  const w = Number(width) || 32;
  const h = Number(height) || 32;

  const normalizeName = (s) =>
    String(s || '')
      .replace(/[\uFE0F]/g, '') // emoji variation selector
      .replace(/[^\p{L}\p{N}]+/gu, ''); // keep letters/numbers across locales

  const nn = normalizeName(n);

  const detectColor = () => {
    if (/(粉|pink)/i.test(nn)) return 'pink';
    if (/(金|黄|gold|yellow)/i.test(nn)) return 'gold';
    if (/(红|red)/i.test(nn)) return 'red';
    if (/(蓝|blue)/i.test(nn)) return 'blue';
    if (/(绿|green)/i.test(nn)) return 'green';
    if (/(紫|purple)/i.test(nn)) return 'purple';
    if (/(橙|orange)/i.test(nn)) return 'orange';
    if (/(黑|black)/i.test(nn)) return 'black';
    if (/(白|white)/i.test(nn)) return 'white';
    return null;
  };

  const makeCells = (predicate, color) => {
    const cells = [];
    const centerX = w / 2;
    const centerY = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (predicate(x, y, centerX, centerY)) {
          cells.push({ row: y, col: x, color });
        }
      }
    }
    return { cells, width: w, height: h };
  };

  const pointInPolygon = (px, py, vertices) => {
    // Ray casting algorithm
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x;
      const yi = vertices[i].y;
      const xj = vertices[j].x;
      const yj = vertices[j].y;
      const intersect =
        (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const makeStarVertices = (cx, cy, outerR, innerR, points = 5, rotation = -Math.PI / 2) => {
    const verts = [];
    const step = Math.PI / points;
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = rotation + i * step;
      verts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return verts;
  };

  if (/心/i.test(nn)) {
    const centerX = w / 2;
    const centerY = h / 2 - 2;
    const scale = w / 8;
    return makeCells(
      (x, y) => {
        const dx = (x - centerX) / scale;
        const dy = (y - centerY) / scale;
        const heart = Math.pow(dx * dx + dy * dy - 1, 3) - dx * dx * dy * dy * dy;
        return heart <= 0;
      },
      detectColor() || 'pink'
    );
  }

  if (/星/i.test(nn)) {
    const centerX = (w - 1) / 2;
    const centerY = (h - 1) / 2;
    const outerR = Math.min(w, h) * 0.42;
    const innerR = outerR * 0.48;
    const verts = makeStarVertices(centerX, centerY, outerR, innerR, 5, -Math.PI / 2);
    return makeCells(
      (x, y) => pointInPolygon(x + 0.5, y + 0.5, verts),
      detectColor() || 'gold'
    );
  }

  if (/(方|方块|正方|square)/i.test(nn)) {
    const margin = 2;
    return makeCells(
      (x, y) => x >= margin && x < w - margin && y >= margin && y < h - margin,
      detectColor() || 'green'
    );
  }

  if (/(圆|圆形|circle)/i.test(nn)) {
    const centerX = w / 2;
    const centerY = h / 2;
    const radius = Math.min(w, h) / 2.3;
    const c = detectColor();
    return makeCells(
      (x, y) => {
        const dx = x - centerX;
        const dy = y - centerY;
        return Math.sqrt(dx * dx + dy * dy) < radius;
      },
      c || 'red'
    );
  }

  // Default: red circle
  const centerX = w / 2;
  const centerY = h / 2;
  const radius = w / 2.3;
  return makeCells(
    (x, y) => {
      const dx = x - centerX;
      const dy = y - centerY;
      return Math.sqrt(dx * dx + dy * dy) < radius;
    },
    detectColor() || 'red'
  );
}

async function initDatabase() {
  console.log('🎨 拼豆 DIY 数据库初始化\n');

  let connection;

  try {
    // 连接到 MySQL（不指定数据库）
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'root',
      multipleStatements: true
    });

    console.log('✅ 已连接到 MySQL 服务器');

    // 读取 SQL 文件
    const sqlPath = path.join(__dirname, '../init-db.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 读取数据库初始化脚本...');

    // 执行 SQL
    await connection.query(sqlContent);

    // Fill templates.bead_data so the frontend can render thumbnails/editor immediately.
    const dbName = process.env.DB_NAME || 'perler_beads';
    await connection.query(`USE ${dbName}`);

    // Keep schema compatible with older MySQL versions.
    const safeAlter = async (sql) => {
      try {
        await connection.query(sql);
      } catch (err) {
        const ignorableCodes = new Set(['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME']);
        if (!ignorableCodes.has(err.code)) throw err;
      }
    };

    await safeAlter('ALTER TABLE users ADD COLUMN wechat_openid VARCHAR(100) NULL');
    await safeAlter('ALTER TABLE users ADD COLUMN wechat_unionid VARCHAR(100) NULL');
    await safeAlter('ALTER TABLE users ADD UNIQUE KEY uniq_wechat_openid (wechat_openid)');
    await safeAlter('ALTER TABLE users ADD INDEX idx_wechat_openid (wechat_openid)');

    await connection.query(`
      CREATE TABLE IF NOT EXISTS legal_docs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        doc_key VARCHAR(50) NOT NULL UNIQUE,
        title VARCHAR(120) NOT NULL,
        content LONGTEXT NOT NULL,
        version VARCHAR(30) DEFAULT 'v1.0.0',
        effective_date DATE NULL,
        updated_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_doc_key (doc_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(`
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await connection.query(
      `INSERT INTO legal_docs (doc_key, title, content, version, effective_date)
       VALUES
       ('user_agreement', '用户协议', ?, 'v1.0.0', CURDATE()),
       ('privacy_policy', '隐私政策', ?, 'v1.0.0', CURDATE())
       ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       content = VALUES(content),
       version = COALESCE(legal_docs.version, VALUES(version)),
       effective_date = COALESCE(legal_docs.effective_date, VALUES(effective_date))`,
      [
        '欢迎使用拼豆 DIY。\n\n1. 服务说明\n我们提供拼豆创作、模板浏览、作品分享与商品购买等服务。\n\n2. 账号与安全\n请妥善保管账号，不得出借或转让。\n\n3. 行为规范\n禁止发布违法违规或侵权内容。\n\n4. 订单与支付\n价格和库存以下单时页面展示为准。\n\n5. 协议更新\n协议更新后将公示，继续使用视为同意。',
        '欢迎使用拼豆 DIY。\n\n1. 信息收集\n我们会在必要范围收集账号、订单与设备信息。\n\n2. 信息使用\n用于登录鉴权、交易履约、内容展示与安全风控。\n\n3. 信息共享\n未经授权不会向无关第三方出售你的个人信息。\n\n4. 信息保护\n我们采取合理安全措施保护你的信息。\n\n5. 政策更新\n发生重大变化时将通过页面公示提醒。'
      ]
    );

    const forceAll = String(process.env.FORCE_ALL || '').trim() === '1';

    const [templates] = await connection.query(
      `SELECT id, name, width, height, bead_data
       FROM templates
       ${forceAll ? '' : 'WHERE bead_data IS NULL OR bead_data = "null"'}`
    );

    let updatedCount = 0;
    for (const t of templates) {
      const beadData = generateTemplateByName(t.name, t.width || 32, t.height || 32);
      await connection.query(
        'UPDATE templates SET bead_data = ? WHERE id = ?',
        [JSON.stringify(beadData), t.id]
      );
      updatedCount += 1;
    }

    console.log(`🧩 templates.bead_data 已补齐/更新：${updatedCount} 条`);

    console.log('✅ 数据库初始化完成！\n');

    // 验证
    const [databases] = await connection.query(
      'SHOW DATABASES LIKE ?',
      [process.env.DB_NAME || 'perler_beads']
    );

    if (databases.length > 0) {
      console.log('📊 数据库验证:');
      console.log(`   数据库：${process.env.DB_NAME || 'perler_beads'}`);
      
      // 切换到数据库
      await connection.query(`USE ${process.env.DB_NAME || 'perler_beads'}`);
      
      // 统计表数量
      const [tables] = await connection.query('SHOW TABLES');
      console.log(`   表数量：${tables.length}`);
      
      // 统计每个表的数据
      for (const table of tables) {
        const tableName = Object.values(table)[0];
        const [rows] = await connection.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        console.log(`   - ${tableName}: ${rows[0].count} 条记录`);
      }
    }

  } catch (error) {
    console.error('❌ 数据库初始化失败:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }

  console.log('\n✨ 初始化完成！可以启动后端服务了\n');
  console.log('🔐 默认账号信息（初始化数据）：');
  console.log('   管理员：admin / admin123');
  console.log('   测试用户：testuser / user123\n');
  console.log('   运行：npm run dev\n');
}

initDatabase();
