const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { parsePageLimit, parseIntInRange, parseSort } = require('../utils/query');

// 获取评价列表（管理员）
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, product_id, user_id, sort_by = 'created_at', sort_order = 'desc' } = req.query;
    const { pageNum, limitNum, offset } = parsePageLimit(page, limit);
    const productId = parseIntInRange(product_id, 1);
    const userId = parseIntInRange(user_id, 1);
    const { sortColumn, sortDir, sortByKey, sortOrderValue } = parseSort(
      sort_by,
      sort_order,
      { created_at: 'r.created_at', rating: 'r.rating', id: 'r.id' },
      'created_at'
    );

    let sql = `
      SELECT r.*, 
             u.username, u.nickname, u.avatar_url,
             p.name as product_name, p.image_url
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN products p ON r.product_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (productId !== null) {
      sql += ' AND r.product_id = ?';
      params.push(productId);
    }

    if (userId !== null) {
      sql += ' AND r.user_id = ?';
      params.push(userId);
    }

    sql += ` ORDER BY ${sortColumn} ${sortDir} LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);

    const [reviews] = await pool.query(sql, params);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM reviews r WHERE 1=1' + 
      (productId !== null ? ' AND r.product_id = ?' : '') +
      (userId !== null ? ' AND r.user_id = ?' : ''),
      productId !== null ? (userId !== null ? [productId, userId] : [productId]) : (userId !== null ? [userId] : [])
    );

    res.json({
      success: true,
      data: {
        reviews,
        applied_filters: {
          product_id: productId,
          user_id: userId,
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
    console.error('获取评价列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取评价列表失败',
      error: error.message
    });
  }
});

// 删除评价
router.delete('/:id', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // 获取评价信息
    const [reviews] = await connection.query(
      'SELECT product_id FROM reviews WHERE id = ?',
      [req.params.id]
    );

    if (reviews.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: '评价不存在'
      });
    }

    const productId = reviews[0].product_id;

    // 删除评价
    await connection.query('DELETE FROM reviews WHERE id = ?', [req.params.id]);

    // 更新商品评分统计
    await connection.query(`
      UPDATE products 
      SET avg_rating = COALESCE((
        SELECT AVG(rating) FROM reviews WHERE product_id = ?
      ), 0),
      review_count = COALESCE((
        SELECT COUNT(*) FROM reviews WHERE product_id = ?
      ), 0)
      WHERE id = ?
    `, [productId, productId, productId]);

    await connection.commit();

    res.json({
      success: true,
      message: '评价已删除'
    });

  } catch (error) {
    await connection.rollback();
    console.error('删除评价错误:', error);
    res.status(500).json({
      success: false,
      message: '删除评价失败',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

module.exports = router;
