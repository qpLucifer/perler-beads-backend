const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const adminMiddleware = async (req, res, next) => {
  try {
    await authMiddleware(req, res, async () => {
      const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
      if (!rows.length || rows[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: '需要管理员权限' });
      }
      next();
    });
  } catch (_ERR) {
    return res.status(401).json({ success: false, message: '未授权' });
  }
};

// 获取优惠券列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;

    // Frontend may send `active`/`inactive`,
    // but DB column is TINYINT (1/0).
    const normalizedStatus =
      status === 'active' ? 1 : status === 'inactive' ? 0 : status;
    
    let sql = `SELECT * FROM coupons WHERE 1=1`;
    const params = [];

    if (normalizedStatus !== undefined && normalizedStatus !== null && normalizedStatus !== '') {
      sql += ` AND status = ?`;
      params.push(normalizedStatus);
    }

    const [coupons] = await pool.query(sql, params);

    res.json({
      success: true,
      data: { coupons }
    });

  } catch (error) {
    console.error('获取优惠券列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取优惠券列表失败',
      error: error.message
    });
  }
});

// 获取用户优惠券
router.get('/user/my', authMiddleware, async (req, res) => {
  try {
    const { status } = req.query;
    
    let sql = `
      SELECT c.*, uc.id as user_coupon_id, uc.status as user_status, uc.used_at
      FROM user_coupons uc
      JOIN coupons c ON uc.coupon_id = c.id
      WHERE uc.user_id = ?
    `;
    const params = [req.user.id];

    if (status) {
      sql += ` AND uc.status = ?`;
      params.push(status);
    }

    const [coupons] = await pool.query(sql, params);

    res.json({
      success: true,
      data: { coupons }
    });

  } catch (error) {
    console.error('获取用户优惠券错误:', error);
    res.status(500).json({
      success: false,
      message: '获取用户优惠券失败',
      error: error.message
    });
  }
});

// 领取优惠券
router.post('/claim/:couponId', authMiddleware, async (req, res) => {
  try {
    const { couponId } = req.params;
    
    // 检查优惠券是否存在
    const [coupons] = await pool.query('SELECT * FROM coupons WHERE id = ?', [couponId]);
    
    if (coupons.length === 0) {
      return res.status(404).json({
        success: false,
        message: '优惠券不存在'
      });
    }

    const coupon = coupons[0];
    
    // 检查是否已领取
    const [existing] = await pool.query(
      'SELECT * FROM user_coupons WHERE user_id = ? AND coupon_id = ?',
      [req.user.id, couponId]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: '你已经领取过该优惠券'
      });
    }

    // 插入用户优惠券
    await pool.query(
      'INSERT INTO user_coupons (user_id, coupon_id, status) VALUES (?, ?, ?)',
      [req.user.id, couponId, 'unused']
    );

    res.json({
      success: true,
      message: '领取成功'
    });

  } catch (error) {
    console.error('领取优惠券错误:', error);
    res.status(500).json({
      success: false,
      message: '领取优惠券失败',
      error: error.message
    });
  }
});

// 使用优惠券
router.post('/:id/use', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { orderId } = req.body;

    const [result] = await pool.query(
      `UPDATE user_coupons 
       SET status = 'used', used_at = CURRENT_TIMESTAMP, order_id = ? 
       WHERE id = ? AND user_id = ? AND status = 'unused'`,
      [orderId, id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({
        success: false,
        message: '优惠券不可用'
      });
    }

    res.json({
      success: true,
      message: '使用成功'
    });

  } catch (error) {
    console.error('使用优惠券错误:', error);
    res.status(500).json({
      success: false,
      message: '使用优惠券失败',
      error: error.message
    });
  }
});

// 退回优惠券（将已使用恢复为未使用）
router.post('/:id/return', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.query(
      `UPDATE user_coupons
       SET status = 'unused', used_at = NULL, order_id = NULL
       WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '优惠券不存在'
      });
    }

    res.json({
      success: true,
      message: '优惠券已退回'
    });
  } catch (error) {
    console.error('退回优惠券错误:', error);
    res.status(500).json({
      success: false,
      message: '退回优惠券失败',
      error: error.message
    });
  }
});

// 后台管理 - 创建优惠券
router.post('/admin/create', adminMiddleware, async (req, res) => {
  try {
    const { 
      name, 
      description, 
      discount_type, 
      discount_value, 
      min_amount, 
      max_discount,
      valid_from,
      valid_until,
      total_count,
      per_user_limit
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO coupons 
       (name, description, discount_type, discount_value, min_amount, max_discount, 
        valid_from, valid_until, total_count, per_user_limit, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, description, discount_type, discount_value, min_amount, max_discount || null,
        valid_from || new Date(), valid_until || null, total_count || 0, per_user_limit || 1, 1
      ]
    );

    res.status(201).json({
      success: true,
      message: '优惠券创建成功',
      data: {
        coupon: {
          id: result.insertId,
          name,
          description,
          discount_type,
          discount_value,
          min_amount,
          max_discount,
          valid_from,
          valid_until,
          total_count,
          per_user_limit
        }
      }
    });

  } catch (error) {
    console.error('创建优惠券错误:', error);
    res.status(500).json({
      success: false,
      message: '创建优惠券失败',
      error: error.message
    });
  }
});

// 后台管理 - 优惠券列表
router.get('/admin/list', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.query;

    const normalizedStatus =
      status === 'active' ? 1 : status === 'inactive' ? 0 : status;
    
    let sql = `SELECT * FROM coupons WHERE 1=1`;
    const params = [];

    if (normalizedStatus !== undefined && normalizedStatus !== null && normalizedStatus !== '') {
      sql += ` AND status = ?`;
      params.push(normalizedStatus);
    }

    sql += ` ORDER BY created_at DESC`;

    const [coupons] = await pool.query(sql, params);

    res.json({
      success: true,
      data: { coupons }
    });

  } catch (error) {
    console.error('获取优惠券列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取优惠券列表失败',
      error: error.message
    });
  }
});

module.exports = router;
