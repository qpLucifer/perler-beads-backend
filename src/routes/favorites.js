const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { parsePageLimit, parseSort } = require('../utils/query');

// 获取用户的收藏列表
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, sort_by = 'created_at', sort_order = 'desc' } = req.query;
    const { pageNum, limitNum, offset } = parsePageLimit(page, limit);
    const { sortColumn, sortDir, sortByKey, sortOrderValue } = parseSort(
      sort_by,
      sort_order,
      { created_at: 'f.created_at', id: 'f.id' },
      'created_at'
    );

    const [favorites] = await pool.query(`
      SELECT f.*, p.name, p.price, p.image_url, p.category, p.stock, p.is_on_sale
      FROM favorites f
      LEFT JOIN products p ON f.product_id = p.id
      WHERE f.user_id = ?
      ORDER BY ${sortColumn} ${sortDir}
      LIMIT ? OFFSET ?
    `, [req.user.id, limitNum, offset]);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM favorites WHERE user_id = ?',
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        favorites,
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
    console.error('获取收藏列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取收藏列表失败',
      error: error.message
    });
  }
});

// 检查商品是否已收藏
router.get('/check/:productId', authMiddleware, async (req, res) => {
  try {
    const [favorites] = await pool.query(
      'SELECT id FROM favorites WHERE user_id = ? AND product_id = ?',
      [req.user.id, req.params.productId]
    );

    res.json({
      success: true,
      data: { isFavorite: favorites.length > 0 }
    });

  } catch (error) {
    console.error('检查收藏状态错误:', error);
    res.status(500).json({
      success: false,
      message: '检查收藏状态失败',
      error: error.message
    });
  }
});

// 添加收藏
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { product_id } = req.body;

    if (!product_id) {
      return res.status(400).json({
        success: false,
        message: '商品 ID 不能为空'
      });
    }

    // 检查商品是否存在
    const [products] = await pool.query(
      'SELECT id FROM products WHERE id = ?',
      [product_id]
    );

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: '商品不存在'
      });
    }

    // 检查是否已收藏
    const [existing] = await pool.query(
      'SELECT id FROM favorites WHERE user_id = ? AND product_id = ?',
      [req.user.id, product_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: '已收藏该商品'
      });
    }

    await pool.query(
      'INSERT INTO favorites (user_id, product_id) VALUES (?, ?)',
      [req.user.id, product_id]
    );

    res.status(201).json({
      success: true,
      message: '收藏成功'
    });

  } catch (error) {
    console.error('添加收藏错误:', error);
    res.status(500).json({
      success: false,
      message: '添加收藏失败',
      error: error.message
    });
  }
});

// 取消收藏
router.delete('/:productId', authMiddleware, async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM favorites WHERE user_id = ? AND product_id = ?',
      [req.user.id, req.params.productId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: '收藏不存在'
      });
    }

    res.json({
      success: true,
      message: '已取消收藏'
    });

  } catch (error) {
    console.error('取消收藏错误:', error);
    res.status(500).json({
      success: false,
      message: '取消收藏失败',
      error: error.message
    });
  }
});

// 切换收藏状态
router.post('/toggle/:productId', authMiddleware, async (req, res) => {
  try {
    const [existing] = await pool.query(
      'SELECT id FROM favorites WHERE user_id = ? AND product_id = ?',
      [req.user.id, req.params.productId]
    );

    if (existing.length > 0) {
      await pool.query(
        'DELETE FROM favorites WHERE user_id = ? AND product_id = ?',
        [req.user.id, req.params.productId]
      );
      res.json({
        success: true,
        message: '已取消收藏',
        data: { isFavorite: false }
      });
    } else {
      await pool.query(
        'INSERT INTO favorites (user_id, product_id) VALUES (?, ?)',
        [req.user.id, req.params.productId]
      );
      res.json({
        success: true,
        message: '已收藏',
        data: { isFavorite: true }
      });
    }

  } catch (error) {
    console.error('切换收藏状态错误:', error);
    res.status(500).json({
      success: false,
      message: '操作失败',
      error: error.message
    });
  }
});

module.exports = router;
