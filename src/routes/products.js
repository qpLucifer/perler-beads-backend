const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { optionalAuth } = require('../middleware/auth');

// 获取商品列表
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, is_on_sale = 1 } = req.query;
    
    let sql = 'SELECT * FROM products WHERE is_on_sale = ?';
    const params = [is_on_sale];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    sql += ' ORDER BY created_at DESC';

    const [products] = await pool.query(sql, params);

    res.json({
      success: true,
      data: { products }
    });

  } catch (error) {
    console.error('获取商品列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取商品列表失败',
      error: error.message
    });
  }
});

// 获取商品详情
router.get('/:id', async (req, res) => {
  try {
    const [products] = await pool.query(
      'SELECT * FROM products WHERE id = ? AND is_on_sale = 1',
      [req.params.id]
    );

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: '商品不存在'
      });
    }

    res.json({
      success: true,
      data: { product: products[0] }
    });

  } catch (error) {
    console.error('获取商品详情错误:', error);
    res.status(500).json({
      success: false,
      message: '获取商品详情失败',
      error: error.message
    });
  }
});

module.exports = router;
