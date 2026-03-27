const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

// 获取作品列表（公开的 + 自己的）
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { user_id, is_public = 1 } = req.query;
    
    let sql = `
      SELECT a.*, u.username, u.nickname 
      FROM artworks a 
      LEFT JOIN users u ON a.user_id = u.id 
      WHERE 1=1
    `;
    const params = [];

    if (user_id) {
      sql += ' AND a.user_id = ?';
      params.push(user_id);
    } else if (!req.user) {
      // 未登录只显示公开的
      sql += ' AND a.is_public = ?';
      params.push(parseInt(is_public));
    }

    sql += ' ORDER BY a.created_at DESC';

    const [artworks] = await pool.query(sql, params);

    // 解析 JSON 数据
    const parsedArtworks = artworks.map(a => ({
      ...a,
      canvas_data: typeof a.canvas_data === 'string' ? JSON.parse(a.canvas_data) : a.canvas_data
    }));

    res.json({
      success: true,
      data: { artworks: parsedArtworks }
    });

  } catch (error) {
    console.error('获取作品列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取作品列表失败',
      error: error.message
    });
  }
});

// 获取单个作品
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const [artworks] = await pool.query(`
      SELECT a.*, u.username, u.nickname 
      FROM artworks a 
      LEFT JOIN users u ON a.user_id = u.id 
      WHERE a.id = ?
    `, [req.params.id]);

    if (artworks.length === 0) {
      return res.status(404).json({
        success: false,
        message: '作品不存在'
      });
    }

    const artwork = {
      ...artworks[0],
      canvas_data: typeof artworks[0].canvas_data === 'string' 
        ? JSON.parse(artworks[0].canvas_data) 
        : artworks[0].canvas_data
    };

    // 检查权限
    if (artwork.is_public === 0 && (!req.user || req.user.id !== artwork.user_id)) {
      return res.status(403).json({
        success: false,
        message: '无权查看此作品'
      });
    }

    res.json({
      success: true,
      data: { artwork }
    });

  } catch (error) {
    console.error('获取作品详情错误:', error);
    res.status(500).json({
      success: false,
      message: '获取作品详情失败',
      error: error.message
    });
  }
});

// 创建作品
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, title, canvas_size, width, height, canvas_data, bead_data, bead_count, is_public } = req.body;

    if (!canvas_data && !bead_data) {
      return res.status(400).json({
        success: false,
        message: '画布数据不能为空'
      });
    }

    const artworkName = name || title || '未命名作品';
    const canvasWidth = width || (canvas_size ? (typeof canvas_size === 'object' ? canvas_size.width : canvas_size) : 32);
    const canvasHeight = height || (canvas_size ? (typeof canvas_size === 'object' ? canvas_size.height : canvas_size) : 32);
    const finalBeadData = canvas_data || bead_data;

    const [result] = await pool.query(
      `INSERT INTO artworks (user_id, title, width, height, bead_data, bead_count, is_public) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, artworkName, canvasWidth, canvasHeight, JSON.stringify(finalBeadData), bead_count || 0, is_public || 0]
    );

    res.status(201).json({
      success: true,
      message: '作品创建成功',
      data: {
        artwork: {
          id: result.insertId,
          name: artworkName,
          title: artworkName,
          width: canvasWidth,
          height: canvasHeight,
          canvas_size: { width: canvasWidth, height: canvasHeight },
          bead_count: bead_count || 0,
          created_at: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('创建作品错误:', error);
    res.status(500).json({
      success: false,
      message: '创建作品失败',
      error: error.message
    });
  }
});

// 删除作品
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    // 先检查作品所有权
    const [artworks] = await pool.query(
      'SELECT user_id FROM artworks WHERE id = ?',
      [req.params.id]
    );

    if (artworks.length === 0) {
      return res.status(404).json({
        success: false,
        message: '作品不存在'
      });
    }

    if (artworks[0].user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: '无权删除此作品'
      });
    }

    await pool.query('DELETE FROM artworks WHERE id = ?', [req.params.id]);

    res.json({
      success: true,
      message: '删除成功'
    });

  } catch (error) {
    console.error('删除作品错误:', error);
    res.status(500).json({
      success: false,
      message: '删除失败',
      error: error.message
    });
  }
});

module.exports = router;
