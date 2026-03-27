const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { parsePageLimit, parseIntInRange, parseSort } = require('../utils/query');

// 获取商品评价列表
router.get('/product/:productId', async (req, res) => {
  try {
    const { page = 1, limit = 20, rating, sort_by = 'created_at', sort_order = 'desc' } = req.query;
    const { pageNum, limitNum, offset } = parsePageLimit(page, limit);
    const normalizedRating = parseIntInRange(rating, 1, 5);
    const { sortColumn, sortDir, sortByKey, sortOrderValue } = parseSort(
      sort_by,
      sort_order,
      { created_at: 'r.created_at', rating: 'r.rating', id: 'r.id' },
      'created_at'
    );

    let sql = `
      SELECT r.*, u.username, u.nickname, u.avatar_url
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.product_id = ?
    `;
    const params = [req.params.productId];

    if (normalizedRating !== null) {
      sql += ' AND r.rating = ?';
      params.push(normalizedRating);
    }

    sql += ` ORDER BY ${sortColumn} ${sortDir} LIMIT ? OFFSET ?`;
    params.push(limitNum, offset);

    const [reviews] = await pool.query(sql, params);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM reviews WHERE product_id = ?',
      [req.params.productId]
    );

    // 计算平均评分
    const [ratingStats] = await pool.query(
      `SELECT 
        AVG(rating) as average_rating,
        COUNT(*) as total,
        SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
        SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
        SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
       FROM reviews WHERE product_id = ?`,
      [req.params.productId]
    );

    res.json({
      success: true,
      data: {
        reviews,
        ratingStats: ratingStats[0],
        applied_filters: {
          rating: normalizedRating,
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

// 获取用户的评价列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, sort_by = 'created_at', sort_order = 'desc' } = req.query;
    const { pageNum, limitNum, offset } = parsePageLimit(page, limit);
    const { sortColumn, sortDir, sortByKey, sortOrderValue } = parseSort(
      sort_by,
      sort_order,
      { created_at: 'r.created_at', rating: 'r.rating', id: 'r.id' },
      'created_at'
    );

    const [reviews] = await pool.query(`
      SELECT r.*, p.name as product_name, p.image_url
      FROM reviews r
      LEFT JOIN products p ON r.product_id = p.id
      WHERE r.user_id = ?
      ORDER BY ${sortColumn} ${sortDir}
      LIMIT ? OFFSET ?
    `, [req.user.id, limitNum, offset]);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM reviews WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        reviews,
        applied_filters: {
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
    console.error('获取用户评价列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取评价列表失败',
      error: error.message
    });
  }
});

// 创建评价
router.post('/', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { order_id, product_id, rating, content, images } = req.body;

    if (!product_id || !rating) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: '商品 ID 和评分不能为空'
      });
    }

    if (rating < 1 || rating > 5) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: '评分必须在 1-5 之间'
      });
    }

    // 验证用户是否购买过该商品（订单已完成）
    if (order_id) {
      const [orders] = await connection.query(
        `SELECT o.id FROM orders o
         LEFT JOIN order_items oi ON o.id = oi.order_id
         WHERE o.id = ? AND o.user_id = ? AND o.status = 'completed' AND oi.product_id = ?`,
        [order_id, req.user.id, product_id]
      );

      if (orders.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: '只能评价已完成的订单中的商品'
        });
      }

      // 检查是否已评价过
      const [existing] = await connection.query(
        'SELECT id FROM reviews WHERE order_id = ? AND product_id = ?',
        [order_id, product_id]
      );

      if (existing.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: '已评价过该商品'
        });
      }
    }

    // 创建评价
    const imagesJson = images ? JSON.stringify(images) : null;
    
    await connection.query(
      `INSERT INTO reviews (user_id, product_id, order_id, rating, content, images) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, product_id, order_id || null, rating, content || '', imagesJson]
    );

    // 更新商品评分统计
    await connection.query(`
      UPDATE products 
      SET avg_rating = (
        SELECT AVG(rating) FROM reviews WHERE product_id = ?
      ),
      review_count = (
        SELECT COUNT(*) FROM reviews WHERE product_id = ?
      )
      WHERE id = ?
    `, [product_id, product_id, product_id]);

    await connection.commit();

    res.status(201).json({
      success: true,
      message: '评价成功'
    });

  } catch (error) {
    await connection.rollback();
    console.error('创建评价错误:', error);
    res.status(500).json({
      success: false,
      message: '创建评价失败',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

// 更新评价
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { rating, content, images } = req.body;

    // 检查评价是否属于当前用户
    const [reviews] = await pool.query(
      'SELECT * FROM reviews WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (reviews.length === 0) {
      return res.status(404).json({
        success: false,
        message: '评价不存在'
      });
    }

    const imagesJson = images ? JSON.stringify(images) : null;

    await pool.query(
      `UPDATE reviews SET rating = ?, content = ?, images = ? WHERE id = ?`,
      [rating, content, imagesJson, req.params.id]
    );

    res.json({
      success: true,
      message: '评价已更新'
    });

  } catch (error) {
    console.error('更新评价错误:', error);
    res.status(500).json({
      success: false,
      message: '更新评价失败',
      error: error.message
    });
  }
});

// 删除评价
router.delete('/:id', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // 检查评价是否属于当前用户
    const [reviews] = await connection.query(
      'SELECT product_id FROM reviews WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (reviews.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: '评价不存在'
      });
    }

    const productId = reviews[0].product_id;

    await connection.query('DELETE FROM reviews WHERE id = ?', [req.params.id]);

    // 更新商品评分统计
    await connection.query(`
      UPDATE products 
      SET avg_rating = (
        SELECT AVG(rating) FROM reviews WHERE product_id = ?
      ),
      review_count = (
        SELECT COUNT(*) FROM reviews WHERE product_id = ?
      )
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

// 管理员删除任意评价
router.delete('/admin/:id', authMiddleware, async (req, res) => {
  // 这里可以添加管理员权限检查
  try {
    await pool.query('DELETE FROM reviews WHERE id = ?', [req.params.id]);

    res.json({
      success: true,
      message: '评价已删除'
    });

  } catch (error) {
    console.error('删除评价错误:', error);
    res.status(500).json({
      success: false,
      message: '删除评价失败',
      error: error.message
    });
  }
});

module.exports = router;
