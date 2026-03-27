const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

// 拼豆颜色数据（与小程序一致）
const BEAD_COLORS = [
  { id: 1, name: '白色', hex: '#FFFFFF', price: 0.1, category: 'basic' },
  { id: 2, name: '黑色', hex: '#000000', price: 0.1, category: 'basic' },
  { id: 3, name: '红色', hex: '#FF0000', price: 0.1, category: 'basic' },
  { id: 4, name: '橙色', hex: '#FFA500', price: 0.1, category: 'basic' },
  { id: 5, name: '黄色', hex: '#FFFF00', price: 0.1, category: 'basic' },
  { id: 6, name: '绿色', hex: '#00FF00', price: 0.1, category: 'basic' },
  { id: 7, name: '蓝色', hex: '#0000FF', price: 0.1, category: 'basic' },
  { id: 8, name: '紫色', hex: '#8000FF', price: 0.1, category: 'basic' },
  { id: 9, name: '粉色', hex: '#FFC0CB', price: 0.1, category: 'basic' },
  { id: 10, name: '棕色', hex: '#8B4513', price: 0.1, category: 'basic' },
  { id: 11, name: '灰色', hex: '#808080', price: 0.1, category: 'basic' },
  { id: 12, name: '青色', hex: '#00FFFF', price: 0.1, category: 'basic' },
  { id: 13, name: '深蓝', hex: '#00008B', price: 0.15, category: 'special' },
  { id: 14, name: '深绿', hex: '#006400', price: 0.15, category: 'special' },
  { id: 15, name: '金色', hex: '#FFD700', price: 0.2, category: 'special' },
  { id: 16, name: '银色', hex: '#C0C0C0', price: 0.2, category: 'special' },
  { id: 17, name: '透明', hex: '#E0E0E0', price: 0.1, category: 'special' },
  { id: 18, name: '荧光红', hex: '#FF1493', price: 0.15, category: 'neon' },
  { id: 19, name: '荧光绿', hex: '#00FF7F', price: 0.15, category: 'neon' },
  { id: 20, name: '荧光蓝', hex: '#1E90FF', price: 0.15, category: 'neon' }
];

// 获取所有拼豆颜色
router.get('/colors', async (req, res) => {
  try {
    // 先尝试从数据库获取
    try {
      const [colors] = await pool.query('SELECT * FROM bead_colors ORDER BY id');
      if (colors && colors.length > 0) {
        return res.json({
          success: true,
          data: { colors }
        });
      }
    } catch (e) {
      // 表不存在，使用默认数据
    }
    
    // 数据库没有数据，返回默认数据
    res.json({
      success: true,
      data: { colors: BEAD_COLORS }
    });
  } catch (error) {
    console.error('获取拼豆颜色错误:', error);
    res.json({
      success: true,
      data: { colors: BEAD_COLORS }
    });
  }
});

// 获取单个颜色
router.get('/colors/:id', async (req, res) => {
  try {
    const color = BEAD_COLORS.find(c => c.id === parseInt(req.params.id));
    if (!color) {
      return res.status(404).json({
        success: false,
        message: '颜色不存在'
      });
    }
    res.json({
      success: true,
      data: { color }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取颜色失败',
      error: error.message
    });
  }
});

// 获取画布尺寸配置
router.get('/canvas-sizes', async (req, res) => {
  try {
    const sizes = [
      { id: 1, name: '小号', width: 16, height: 16, recommended: false },
      { id: 2, name: '标准', width: 32, height: 32, recommended: true },
      { id: 3, name: '大号', width: 48, height: 48, recommended: false },
      { id: 4, name: '超大', width: 64, height: 64, recommended: false }
    ];
    
    res.json({
      success: true,
      data: { sizes }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取画布尺寸失败',
      error: error.message
    });
  }
});

module.exports = router;
