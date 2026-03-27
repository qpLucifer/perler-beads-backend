const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const {
  parsePageLimit,
  parseKeyword,
  parseBooleanFlag,
  parseSort,
  parseEnum
} = require('../utils/query');

// 管理员权限中间件
const adminMiddleware = async (req, res, next) => {
  try {
    await authMiddleware(req, res, async () => {
      const [results] = await pool.query(
        'SELECT role FROM users WHERE id = ?',
        [req.user.id]
      );
      
      if (results.length === 0 || results[0].role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: '需要管理员权限'
        });
      }
      
      next();
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: '未授权'
    });
  }
};

function serializeTemplateForAdmin(t) {
  return {
    ...t,
    is_official: Number(t.is_official) === 1,
    use_count: Number(t.download_count) || 0,
    like_count: Number(t.like_count) || 0
  }
}

// ============ 仪表盘 ============

router.get('/dashboard/stats', adminMiddleware, async (req, res) => {
  try {
    const [userStats] = await pool.query(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as today
      FROM users
    `);

    const [orderStats] = await pool.query(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as revenue
      FROM orders
    `);

    const [productStats] = await pool.query(`
      SELECT COUNT(*) as total, SUM(stock) as total_stock,
        SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) as out_of_stock
      FROM products
    `);

    const [artworkStats] = await pool.query('SELECT COUNT(*) as total FROM artworks');

    res.json({
      success: true,
      data: {
        users: userStats[0] || {},
        orders: orderStats[0] || {},
        products: productStats[0] || {},
        artworks: artworkStats[0] || {}
      }
    });
  } catch (error) {
    console.error('获取统计数据错误:', error);
    res.status(500).json({
      success: false,
      message: '获取统计数据失败',
      error: error.message
    });
  }
});

router.get('/dashboard/recent-orders', adminMiddleware, async (req, res) => {
  try {
    const [orders] = await pool.query(`
      SELECT o.*, u.username, u.nickname 
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC LIMIT 10
    `);
    res.json({ success: true, data: { orders } });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取订单失败', error: error.message });
  }
});

// ============ 用户管理 ============

router.get('/users', adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, keyword, status, sort_by = 'created_at', sort_order = 'desc' } = req.query;
    const { pageNum, limitNum, offset } = parsePageLimit(page, limit);
    const searchKeyword = parseKeyword(keyword);
    const normalizedStatus = parseBooleanFlag(status);
    let whereClause = '1=1';
    const params = [];

    if (searchKeyword) {
      whereClause += ' AND (username LIKE ? OR email LIKE ? OR nickname LIKE ?)';
      params.push(`%${searchKeyword}%`, `%${searchKeyword}%`, `%${searchKeyword}%`);
    }
    if (normalizedStatus !== null) {
      whereClause += ' AND status = ?';
      params.push(normalizedStatus);
    }
    const { sortColumn, sortDir, sortByKey, sortOrderValue } = parseSort(
      sort_by,
      sort_order,
      { created_at: 'created_at', last_login_at: 'last_login_at', id: 'id' },
      'created_at'
    );

    const [users] = await pool.query(
      `SELECT id, username, email, nickname, avatar_url, phone, role, status, created_at, last_login_at 
       FROM users WHERE ${whereClause} ORDER BY ${sortColumn} ${sortDir} LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM users WHERE ${whereClause}`, params);

    res.json({
      success: true,
      data: {
        users,
        applied_filters: {
          keyword: searchKeyword,
          status: normalizedStatus,
          sort_by: sortByKey,
          sort_order: sortOrderValue
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limitNum)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取用户列表失败', error: error.message });
  }
});

router.get('/users/:id', adminMiddleware, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (users.length === 0) return res.status(404).json({ success: false, message: '用户不存在' });
    delete users[0].password_hash;
    res.json({ success: true, data: { user: users[0] } });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取用户详情失败', error: error.message });
  }
});

router.put('/users/:id', adminMiddleware, async (req, res) => {
  try {
    const { email, nickname, phone, role, status } = req.body;
    await pool.query('UPDATE users SET email = ?, nickname = ?, phone = ?, role = ?, status = ? WHERE id = ?',
      [email, nickname, phone, role, status, req.params.id]);
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败', error: error.message });
  }
});

router.post('/users/:id/reset-password', adminMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: '密码长度至少 6 位' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.params.id]);
    res.json({ success: true, message: '密码重置成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '重置密码失败', error: error.message });
  }
});

router.delete('/users/:id', adminMiddleware, async (req, res) => {
  try {
    const [user] = await pool.query('SELECT role FROM users WHERE id = ?', [req.params.id]);
    if (user.length > 0 && user[0].role === 'admin') {
      return res.status(400).json({ success: false, message: '不能删除管理员账号' });
    }
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
});

// ============ 商品管理 ============

router.get('/products', adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, category, keyword, sort_by = 'created_at', sort_order = 'desc' } = req.query;
    const { pageNum, limitNum, offset } = parsePageLimit(page, limit);
    const searchKeyword = parseKeyword(keyword);
    let whereClause = '1=1';
    const params = [];

    if (category) { whereClause += ' AND p.category = ?'; params.push(category); }
    if (searchKeyword) { whereClause += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push(`%${searchKeyword}%`, `%${searchKeyword}%`); }
    const { sortColumn, sortDir, sortByKey, sortOrderValue } = parseSort(
      sort_by,
      sort_order,
      { created_at: 'p.created_at', price: 'p.price', stock: 'p.stock', id: 'p.id' },
      'created_at'
    );

    const [products] = await pool.query(
      `SELECT p.* FROM products p WHERE ${whereClause} ORDER BY ${sortColumn} ${sortDir} LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM products p WHERE ${whereClause}`, params);

    res.json({
      success: true,
      data: {
        products,
        applied_filters: {
          category: category || null,
          keyword: searchKeyword,
          sort_by: sortByKey,
          sort_order: sortOrderValue
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('获取商品列表错误:', error);
    res.status(500).json({ success: false, message: '获取商品列表失败', error: error.message });
  }
});

router.post('/products', adminMiddleware, async (req, res) => {
  try {
    const { name, description, price, original_price, category, stock, image_url, is_on_sale } = req.body;
    const [result] = await pool.query(
      `INSERT INTO products (name, description, price, original_price, category, stock, image_url, is_on_sale) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description, price, original_price, category, stock, image_url, is_on_sale ? 1 : 0]
    );
    res.status(201).json({ success: true, message: '商品创建成功', data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建商品失败', error: error.message });
  }
});

router.put('/products/:id', adminMiddleware, async (req, res) => {
  try {
    const { name, description, price, original_price, category, stock, image_url, is_on_sale } = req.body;
    await pool.query(
      `UPDATE products SET name=?, description=?, price=?, original_price=?, category=?, stock=?, image_url=?, is_on_sale=? WHERE id=?`,
      [name, description, price, original_price, category, stock, image_url, is_on_sale ? 1 : 0, req.params.id]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败', error: error.message });
  }
});

router.delete('/products/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
});

// ============ 订单管理 ============

router.get('/orders', adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, keyword, sort_by = 'created_at', sort_order = 'desc' } = req.query;
    const { pageNum, limitNum, offset } = parsePageLimit(page, limit);
    const searchKeyword = parseKeyword(keyword);
    const normalizedStatus = parseEnum(status, ['pending', 'paid', 'shipped', 'completed', 'cancelled']);
    let whereClause = '1=1';
    const params = [];

    if (normalizedStatus) { whereClause += ' AND o.status = ?'; params.push(normalizedStatus); }
    if (searchKeyword) { whereClause += ' AND (o.order_no LIKE ? OR u.username LIKE ?)'; params.push(`%${searchKeyword}%`, `%${searchKeyword}%`); }
    const { sortColumn, sortDir, sortByKey, sortOrderValue } = parseSort(
      sort_by,
      sort_order,
      { created_at: 'o.created_at', total_amount: 'o.total_amount', id: 'o.id' },
      'created_at'
    );

    const [orders] = await pool.query(
      `SELECT o.*, u.username, u.nickname, u.phone 
       FROM orders o LEFT JOIN users u ON o.user_id = u.id 
       WHERE ${whereClause} ORDER BY ${sortColumn} ${sortDir} LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM orders o WHERE ${whereClause}`, params);

    // 获取订单商品
    for (let order of orders) {
      const [items] = await pool.query(
        `SELECT oi.*, p.name, p.image_url, a.title AS artwork_title
         FROM order_items oi
         LEFT JOIN products p ON oi.product_id = p.id
         LEFT JOIN artworks a ON oi.artwork_id = a.id
         WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;
    }

    res.json({
      success: true,
      data: {
        orders,
        applied_filters: {
          status: normalizedStatus,
          keyword: searchKeyword,
          sort_by: sortByKey,
          sort_order: sortOrderValue
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('获取订单列表错误:', error);
    res.status(500).json({ success: false, message: '获取订单列表失败', error: error.message });
  }
});

router.get('/orders/:id', adminMiddleware, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.*, u.username, u.nickname, u.phone, u.email 
       FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ?`,
      [req.params.id]
    );
    if (orders.length === 0) return res.status(404).json({ success: false, message: '订单不存在' });

    const order = orders[0];
    const [items] = await pool.query(
      `SELECT oi.*, p.name, p.image_url, a.title AS artwork_title
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       LEFT JOIN artworks a ON oi.artwork_id = a.id
       WHERE oi.order_id = ?`,
      [order.id]
    );
    order.items = items;

    const [addresses] = await pool.query('SELECT * FROM addresses WHERE id = ?', [order.address_id]);
    order.address = addresses[0] || null;

    res.json({ success: true, data: { order } });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取订单详情失败', error: error.message });
  }
});

router.put('/orders/:id/status', adminMiddleware, async (req, res) => {
  try {
    const { status, remark } = req.body;
    const validStatus = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];
    if (!validStatus.includes(status)) {
      return res.status(400).json({ success: false, message: '无效的订单状态' });
    }
    await pool.query(
      'UPDATE orders SET status = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, remark, req.params.id]
    );
    res.json({ success: true, message: '订单状态更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新订单状态失败', error: error.message });
  }
});

// ============ 作品管理 ============

router.get('/artworks', adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, keyword, sort_by = 'created_at', sort_order = 'desc' } = req.query;
    const { pageNum, limitNum, offset } = parsePageLimit(page, limit);
    const searchKeyword = parseKeyword(keyword);
    let whereClause = '1=1';
    const params = [];

    if (searchKeyword) { whereClause += ' AND (a.title LIKE ? OR u.username LIKE ?)'; params.push(`%${searchKeyword}%`, `%${searchKeyword}%`); }
    const { sortColumn, sortDir, sortByKey, sortOrderValue } = parseSort(
      sort_by,
      sort_order,
      { created_at: 'a.created_at', id: 'a.id' },
      'created_at'
    );

    const [artworks] = await pool.query(
      `SELECT a.*, u.username, u.nickname FROM artworks a LEFT JOIN users u ON a.user_id = u.id 
       WHERE ${whereClause} ORDER BY ${sortColumn} ${sortDir} LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM artworks a WHERE ${whereClause}`, params);

    res.json({
      success: true,
      data: {
        artworks,
        applied_filters: {
          keyword: searchKeyword,
          sort_by: sortByKey,
          sort_order: sortOrderValue
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limitNum)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取作品列表失败', error: error.message });
  }
});

router.delete('/artworks/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM artworks WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
});

// ============ 模板管理 ============

router.get('/templates', adminMiddleware, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      keyword,
      is_official,
      category,
      difficulty,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;
    const { pageNum, limitNum, offset } = parsePageLimit(page, limit);
    const searchKeyword = parseKeyword(keyword);
    const officialFlag = parseBooleanFlag(is_official);
    let whereClause = '1=1';
    const params = [];

    if (searchKeyword) { whereClause += ' AND (t.name LIKE ? OR t.description LIKE ?)'; params.push(`%${searchKeyword}%`, `%${searchKeyword}%`); }
    if (officialFlag !== null) {
      whereClause += ' AND t.is_official = ?';
      params.push(officialFlag);
    }
    if (category) {
      whereClause += ' AND t.category = ?';
      params.push(category);
    }
    if (difficulty) {
      whereClause += ' AND t.difficulty = ?';
      params.push(difficulty);
    }

    const { sortColumn, sortDir, sortByKey, sortOrderValue } = parseSort(
      sort_by,
      sort_order,
      {
        created_at: 't.created_at',
        download_count: 't.download_count',
        like_count: 't.like_count',
        id: 't.id'
      },
      'created_at'
    );

    const [templates] = await pool.query(
      `SELECT t.*, u.username as creator_name FROM templates t 
       LEFT JOIN users u ON t.user_id = u.id 
       WHERE ${whereClause} ORDER BY ${sortColumn} ${sortDir} LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );

    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM templates t WHERE ${whereClause}`, params);

    res.json({
      success: true,
      data: {
        templates: templates.map(serializeTemplateForAdmin),
        applied_filters: {
          keyword: searchKeyword,
          is_official: officialFlag,
          category: category || null,
          difficulty: difficulty || null,
          sort_by: sortByKey,
          sort_order: sortOrderValue
        },
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limitNum)
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取模板列表失败', error: error.message });
  }
});

router.post('/templates', adminMiddleware, async (req, res) => {
  try {
    const {
      name,
      description,
      category = '图案',
      difficulty = '简单',
      width = 32,
      height = 32,
      bead_data,
      canvas_size,
      canvas_data,
      image_url = null,
      is_official = 0
    } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: '模板名称不能为空' });
    }
    if (String(name).length > 100) {
      return res.status(400).json({ success: false, message: '模板名称长度不能超过100' });
    }

    // Keep image_url if admin provides one. Otherwise store NULL.

    const parsedCanvasSize = (() => {
      if (!canvas_size) return null
      if (typeof canvas_size === 'number') return { width: canvas_size, height: canvas_size }
      if (typeof canvas_size === 'object' && canvas_size.width && canvas_size.height) return canvas_size
      return null
    })()

    const w = parsedCanvasSize ? Number(parsedCanvasSize.width) || 32 : width
    const h = parsedCanvasSize ? Number(parsedCanvasSize.height) || 32 : height
    if (w < 8 || h < 8 || w > 128 || h > 128) {
      return res.status(400).json({ success: false, message: '画布尺寸需在 8 到 128 之间' });
    }

    const parsedBeadData = (value) => {
      if (!value) return null
      if (typeof value === 'object') return value
      if (typeof value === 'string') {
        try { return JSON.parse(value) } catch { return null }
      }
      return null
    }

    const finalBeadData = parsedBeadData(bead_data) || parsedBeadData(canvas_data)
    
    const [result] = await pool.query(
      `INSERT INTO templates (name, category, difficulty, description, width, height, bead_data, image_url, is_official) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, category, difficulty, description, w, h, finalBeadData ? JSON.stringify(finalBeadData) : null, image_url, is_official ? 1 : 0]
    );
    res.status(201).json({ success: true, message: '模板创建成功', data: { id: result.insertId } });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建模板失败', error: error.message });
  }
});

router.put('/templates/:id', adminMiddleware, async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      difficulty,
      width,
      height,
      bead_data,
      canvas_size,
      canvas_data,
      image_url = null,
      is_official
    } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: '模板名称不能为空' });
    }

    const parsedCanvasSize = (() => {
      if (!canvas_size) return null
      if (typeof canvas_size === 'number') return { width: canvas_size, height: canvas_size }
      if (typeof canvas_size === 'object' && canvas_size.width && canvas_size.height) return canvas_size
      return null
    })()

    const w = parsedCanvasSize ? Number(parsedCanvasSize.width) || 32 : width
    const h = parsedCanvasSize ? Number(parsedCanvasSize.height) || 32 : height
    if (w < 8 || h < 8 || w > 128 || h > 128) {
      return res.status(400).json({ success: false, message: '画布尺寸需在 8 到 128 之间' });
    }

    const parsedBeadData = (value) => {
      if (!value) return null
      if (typeof value === 'object') return value
      if (typeof value === 'string') {
        try { return JSON.parse(value) } catch { return null }
      }
      return null
    }

    const finalBeadData = parsedBeadData(bead_data) || parsedBeadData(canvas_data)

    await pool.query(
      `UPDATE templates 
       SET name=?, category=?, difficulty=?, description=?, width=?, height=?, bead_data=?, image_url=?, is_official=? 
       WHERE id=?`,
      [
        name,
        category,
        difficulty,
        description,
        w,
        h,
        finalBeadData ? JSON.stringify(finalBeadData) : null,
        image_url,
        is_official ? 1 : 0,
        req.params.id
      ]
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新失败', error: error.message });
  }
});

router.delete('/templates/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM templates WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除失败', error: error.message });
  }
});

// 批量删除模板
router.post('/templates/batch-delete', adminMiddleware, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0) : [];
    if (!ids.length) {
      return res.status(400).json({ success: false, message: '请选择要删除的模板' });
    }

    await pool.query(`DELETE FROM templates WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    res.json({ success: true, message: `已删除 ${ids.length} 个模板` });
  } catch (error) {
    res.status(500).json({ success: false, message: '批量删除失败', error: error.message });
  }
});

// 批量更新模板类型（官方/用户）
router.post('/templates/batch-type', adminMiddleware, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0) : [];
    const isOfficial = Number(req.body?.is_official) ? 1 : 0;
    if (!ids.length) {
      return res.status(400).json({ success: false, message: '请选择要更新的模板' });
    }

    await pool.query(
      `UPDATE templates SET is_official = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
      [isOfficial, ...ids]
    );
    res.json({ success: true, message: `已更新 ${ids.length} 个模板类型` });
  } catch (error) {
    res.status(500).json({ success: false, message: '批量更新失败', error: error.message });
  }
});

// 获取模板详情（包含 bead_data）
router.get('/templates/:id', adminMiddleware, async (req, res) => {
  try {
    const [templates] = await pool.query('SELECT * FROM templates WHERE id = ?', [req.params.id]);
    if (templates.length === 0) return res.status(404).json({ success: false, message: '模板不存在' });
    res.json({ success: true, data: { template: serializeTemplateForAdmin(templates[0]) } });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取模板详情失败', error: error.message });
  }
});

// ============ AI 模板任务记录 ============

router.get('/ai-template-jobs', adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, keyword, sort_by = 'created_at', sort_order = 'desc' } = req.query;
    const { pageNum, limitNum, offset } = parsePageLimit(page, limit);
    const searchKeyword = parseKeyword(keyword);
    const normalizedStatus = parseEnum(status, ['queued', 'running', 'succeeded', 'failed']);
    let whereClause = '1=1';
    const params = [];
    if (normalizedStatus) {
      whereClause += ' AND j.status = ?';
      params.push(normalizedStatus);
    }
    if (searchKeyword) {
      whereClause += ' AND (j.task_id LIKE ? OR u.username LIKE ?)';
      params.push(`%${searchKeyword}%`, `%${searchKeyword}%`);
    }

    const { sortColumn, sortDir } = parseSort(
      sort_by,
      sort_order,
      { created_at: 'j.created_at', updated_at: 'j.updated_at', progress: 'j.progress' },
      'created_at'
    );

    const [rows] = await pool.query(
      `SELECT j.id, j.task_id, j.user_id, u.username, j.canvas_size, j.status, j.progress, j.progress_text,
              j.error_message, j.created_at, j.updated_at, j.started_at, j.finished_at
       FROM template_ai_jobs j
       LEFT JOIN users u ON j.user_id = u.id
       WHERE ${whereClause}
       ORDER BY ${sortColumn} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM template_ai_jobs j LEFT JOIN users u ON j.user_id = u.id WHERE ${whereClause}`, params);
    return res.json({
      success: true,
      data: {
        jobs: rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limitNum)
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: '获取 AI 任务记录失败', error: error.message });
  }
});

router.get('/ai-template-jobs/:taskId', adminMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT j.id, j.task_id, j.user_id, u.username, j.canvas_size, j.status, j.progress, j.progress_text,
              j.error_message, j.result_json, j.created_at, j.updated_at, j.started_at, j.finished_at
       FROM template_ai_jobs j
       LEFT JOIN users u ON j.user_id = u.id
       WHERE j.task_id = ?
       LIMIT 1`,
      [req.params.taskId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }
    return res.json({ success: true, data: { job: rows[0] } });
  } catch (error) {
    return res.status(500).json({ success: false, message: '获取 AI 任务详情失败', error: error.message });
  }
});

// ============ 优惠券管理 ============

router.get('/coupons', adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, keyword, status, sort_by = 'created_at', sort_order = 'desc' } = req.query;
    const { pageNum, limitNum, offset } = parsePageLimit(page, limit);
    const searchKeyword = parseKeyword(keyword);
    const normalizedStatus = parseBooleanFlag(status);
    let whereClause = '1=1';
    const params = [];
    if (searchKeyword) {
      whereClause += ' AND (c.code LIKE ? OR c.name LIKE ?)';
      params.push(`%${searchKeyword}%`, `%${searchKeyword}%`);
    }
    if (normalizedStatus !== null) {
      whereClause += ' AND c.status = ?';
      params.push(normalizedStatus);
    }
    const { sortColumn, sortDir } = parseSort(
      sort_by,
      sort_order,
      { created_at: 'c.created_at', discount_value: 'c.discount_value', id: 'c.id' },
      'created_at'
    );

    const [rows] = await pool.query(
      `SELECT c.*
       FROM coupons c
       WHERE ${whereClause}
       ORDER BY ${sortColumn} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM coupons c WHERE ${whereClause}`, params);
    return res.json({
      success: true,
      data: {
        coupons: rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limitNum)
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: '获取优惠券列表失败', error: error.message });
  }
});

router.post('/coupons', adminMiddleware, async (req, res) => {
  try {
    const {
      code,
      name,
      description = '',
      discount_type,
      discount_value,
      min_amount = 0,
      max_discount = null,
      valid_from = null,
      valid_until = null,
      total_count = 0,
      per_user_limit = 1,
      status = 1
    } = req.body || {};
    if (!code || !name || !discount_type || !discount_value) {
      return res.status(400).json({ success: false, message: '缺少必要字段（code/name/discount_type/discount_value）' });
    }
    await pool.query(
      `INSERT INTO coupons
       (code, name, description, discount_type, discount_value, min_amount, max_discount, valid_from, valid_until, total_count, per_user_limit, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, name, description, discount_type, discount_value, min_amount, max_discount, valid_from, valid_until, total_count, per_user_limit, Number(status) ? 1 : 0]
    );
    return res.status(201).json({ success: true, message: '优惠券创建成功' });
  } catch (error) {
    return res.status(500).json({ success: false, message: '创建优惠券失败', error: error.message });
  }
});

router.put('/coupons/:id', adminMiddleware, async (req, res) => {
  try {
    const {
      code,
      name,
      description = '',
      discount_type,
      discount_value,
      min_amount = 0,
      max_discount = null,
      valid_from = null,
      valid_until = null,
      total_count = 0,
      per_user_limit = 1,
      status = 1
    } = req.body || {};
    if (!code || !name || !discount_type || !discount_value) {
      return res.status(400).json({ success: false, message: '缺少必要字段（code/name/discount_type/discount_value）' });
    }
    await pool.query(
      `UPDATE coupons
       SET code = ?, name = ?, description = ?, discount_type = ?, discount_value = ?, min_amount = ?, max_discount = ?,
           valid_from = ?, valid_until = ?, total_count = ?, per_user_limit = ?, status = ?
       WHERE id = ?`,
      [code, name, description, discount_type, discount_value, min_amount, max_discount, valid_from, valid_until, total_count, per_user_limit, Number(status) ? 1 : 0, req.params.id]
    );
    return res.json({ success: true, message: '优惠券更新成功' });
  } catch (error) {
    return res.status(500).json({ success: false, message: '更新优惠券失败', error: error.message });
  }
});

router.delete('/coupons/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM coupons WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: '优惠券删除成功' });
  } catch (error) {
    return res.status(500).json({ success: false, message: '删除优惠券失败', error: error.message });
  }
});

// 发放优惠券给指定用户（与 user_coupons 绑定）
router.post('/coupons/:id/grant', adminMiddleware, async (req, res) => {
  try {
    const couponId = Number(req.params.id);
    const userId = Number(req.body?.user_id);
    if (!couponId || !userId) {
      return res.status(400).json({ success: false, message: '缺少 coupon_id 或 user_id' });
    }
    const [couponRows] = await pool.query('SELECT id FROM coupons WHERE id = ?', [couponId]);
    if (!couponRows.length) {
      return res.status(404).json({ success: false, message: '优惠券不存在' });
    }
    const [userRows] = await pool.query('SELECT id FROM users WHERE id = ?', [userId]);
    if (!userRows.length) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    const [exists] = await pool.query(
      'SELECT id FROM user_coupons WHERE user_id = ? AND coupon_id = ? LIMIT 1',
      [userId, couponId]
    );
    if (exists.length) {
      return res.status(400).json({ success: false, message: '该用户已绑定此优惠券' });
    }
    await pool.query(
      `INSERT INTO user_coupons (user_id, coupon_id, status, created_at)
       VALUES (?, ?, 'unused', NOW())`,
      [userId, couponId]
    );
    return res.json({ success: true, message: '发放成功' });
  } catch (error) {
    return res.status(500).json({ success: false, message: '发放优惠券失败', error: error.message });
  }
});

// 批量发放优惠券给用户
router.post('/coupons/:id/grant-batch', adminMiddleware, async (req, res) => {
  try {
    const couponId = Number(req.params.id);
    const userIds = Array.isArray(req.body?.user_ids)
      ? req.body.user_ids.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
      : [];
    if (!couponId || !userIds.length) {
      return res.status(400).json({ success: false, message: '缺少 coupon_id 或 user_ids' });
    }
    const [couponRows] = await pool.query('SELECT id FROM coupons WHERE id = ?', [couponId]);
    if (!couponRows.length) {
      return res.status(404).json({ success: false, message: '优惠券不存在' });
    }
    const [userRows] = await pool.query(
      `SELECT id FROM users WHERE id IN (${userIds.map(() => '?').join(',')})`,
      userIds
    );
    const validUserIds = userRows.map((u) => Number(u.id));
    if (!validUserIds.length) {
      return res.status(404).json({ success: false, message: '未找到有效用户' });
    }
    const values = validUserIds.map((uid) => [uid, couponId, 'unused']);
    const [insertResult] = await pool.query(
      `INSERT IGNORE INTO user_coupons (user_id, coupon_id, status)
       VALUES ${values.map(() => '(?, ?, ?)').join(',')}`,
      values.flat()
    );
    return res.json({
      success: true,
      message: '批量发放完成',
      data: {
        requested_count: userIds.length,
        valid_user_count: validUserIds.length,
        inserted_count: insertResult.affectedRows
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: '批量发放失败', error: error.message });
  }
});

// 按筛选条件批量发放（关键词/状态/角色/注册时间）
router.post('/coupons/:id/grant-by-filter', adminMiddleware, async (req, res) => {
  try {
    const couponId = Number(req.params.id);
    const {
      keyword,
      status,
      role,
      created_from,
      created_to,
      limit = 500
    } = req.body || {};
    if (!couponId) {
      return res.status(400).json({ success: false, message: '缺少 coupon_id' });
    }
    const [couponRows] = await pool.query('SELECT id FROM coupons WHERE id = ?', [couponId]);
    if (!couponRows.length) {
      return res.status(404).json({ success: false, message: '优惠券不存在' });
    }

    const searchKeyword = parseKeyword(keyword);
    const normalizedStatus = parseBooleanFlag(status);
    const normalizedRole = parseEnum(role, ['user', 'admin']);
    const maxRows = Math.min(2000, Math.max(1, parseInt(limit, 10) || 500));

    let whereClause = '1=1';
    const params = [];
    if (searchKeyword) {
      whereClause += ' AND (u.username LIKE ? OR u.nickname LIKE ? OR u.email LIKE ?)';
      params.push(`%${searchKeyword}%`, `%${searchKeyword}%`, `%${searchKeyword}%`);
    }
    if (normalizedStatus !== null) {
      whereClause += ' AND u.status = ?';
      params.push(normalizedStatus);
    }
    if (normalizedRole) {
      whereClause += ' AND u.role = ?';
      params.push(normalizedRole);
    }
    if (created_from) {
      whereClause += ' AND u.created_at >= ?';
      params.push(created_from);
    }
    if (created_to) {
      whereClause += ' AND u.created_at <= ?';
      params.push(created_to);
    }

    const [userRows] = await pool.query(
      `SELECT u.id
       FROM users u
       WHERE ${whereClause}
       ORDER BY u.id DESC
       LIMIT ?`,
      [...params, maxRows]
    );
    const userIds = userRows.map((u) => Number(u.id)).filter((x) => Number.isFinite(x) && x > 0);
    if (!userIds.length) {
      return res.json({
        success: true,
        message: '没有匹配用户',
        data: { matched_count: 0, inserted_count: 0 }
      });
    }
    const values = userIds.map((uid) => [uid, couponId, 'unused']);
    const [insertResult] = await pool.query(
      `INSERT IGNORE INTO user_coupons (user_id, coupon_id, status)
       VALUES ${values.map(() => '(?, ?, ?)').join(',')}`,
      values.flat()
    );
    return res.json({
      success: true,
      message: '按筛选条件批量发放完成',
      data: {
        matched_count: userIds.length,
        inserted_count: insertResult.affectedRows
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: '按筛选发放失败', error: error.message });
  }
});

// 按筛选条件预览命中用户（不发放）
router.post('/coupons/:id/grant-by-filter/preview', adminMiddleware, async (req, res) => {
  try {
    const couponId = Number(req.params.id);
    const {
      keyword,
      status,
      role,
      created_from,
      created_to,
      limit = 200
    } = req.body || {};
    if (!couponId) {
      return res.status(400).json({ success: false, message: '缺少 coupon_id' });
    }
    const [couponRows] = await pool.query('SELECT id FROM coupons WHERE id = ?', [couponId]);
    if (!couponRows.length) {
      return res.status(404).json({ success: false, message: '优惠券不存在' });
    }

    const searchKeyword = parseKeyword(keyword);
    const normalizedStatus = parseBooleanFlag(status);
    const normalizedRole = parseEnum(role, ['user', 'admin']);
    const maxRows = Math.min(1000, Math.max(1, parseInt(limit, 10) || 200));

    let whereClause = '1=1';
    const params = [];
    if (searchKeyword) {
      whereClause += ' AND (u.username LIKE ? OR u.nickname LIKE ? OR u.email LIKE ?)';
      params.push(`%${searchKeyword}%`, `%${searchKeyword}%`, `%${searchKeyword}%`);
    }
    if (normalizedStatus !== null) {
      whereClause += ' AND u.status = ?';
      params.push(normalizedStatus);
    }
    if (normalizedRole) {
      whereClause += ' AND u.role = ?';
      params.push(normalizedRole);
    }
    if (created_from) {
      whereClause += ' AND u.created_at >= ?';
      params.push(created_from);
    }
    if (created_to) {
      whereClause += ' AND u.created_at <= ?';
      params.push(created_to);
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.nickname, u.email, u.role, u.status, u.created_at
       FROM users u
       WHERE ${whereClause}
       ORDER BY u.id DESC
       LIMIT ?`,
      [...params, maxRows]
    );

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM users u WHERE ${whereClause}`,
      params
    );

    return res.json({
      success: true,
      data: {
        total: countRows[0].total,
        preview_limit: maxRows,
        users: rows
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: '预览命中用户失败', error: error.message });
  }
});

// 查看某张优惠券的绑定/发放记录
router.get('/coupons/:id/grants', adminMiddleware, async (req, res) => {
  try {
    const couponId = Number(req.params.id);
    const { page = 1, limit = 20, status } = req.query;
    const { pageNum, limitNum, offset } = parsePageLimit(page, limit);
    const normalizedStatus = parseEnum(status, ['unused', 'used', 'expired']);
    let whereClause = 'uc.coupon_id = ?';
    const params = [couponId];
    if (normalizedStatus) {
      whereClause += ' AND uc.status = ?';
      params.push(normalizedStatus);
    }
    const [rows] = await pool.query(
      `SELECT uc.id, uc.user_id, uc.coupon_id, uc.status, uc.used_at, uc.order_id, uc.created_at,
              u.username, u.nickname
       FROM user_coupons uc
       LEFT JOIN users u ON uc.user_id = u.id
       WHERE ${whereClause}
       ORDER BY uc.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset]
    );
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM user_coupons uc WHERE ${whereClause}`,
      params
    );
    return res.json({
      success: true,
      data: {
        grants: rows,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: countResult[0].total,
          totalPages: Math.ceil(countResult[0].total / limitNum)
        }
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: '获取发放记录失败', error: error.message });
  }
});

module.exports = router;
