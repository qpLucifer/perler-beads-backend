const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

async function adminMiddleware(req, res, next) {
  try {
    await authMiddleware(req, res, async () => {
      const [rows] = await pool.query('SELECT role FROM users WHERE id = ?', [req.user.id]);
      if (rows.length === 0 || rows[0].role !== 'admin') {
        return res.status(403).json({ success: false, message: '需要管理员权限' });
      }
      next();
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: '未授权' });
  }
}

router.get('/:docKey', async (req, res) => {
  try {
    const { docKey } = req.params;
    const [rows] = await pool.query(
      `SELECT doc_key, title, content, version, effective_date, updated_at
       FROM legal_docs WHERE doc_key = ? LIMIT 1`,
      [docKey]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '文档不存在' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (error) {
    return res.status(500).json({ success: false, message: '获取文档失败', error: error.message });
  }
});

router.put('/:docKey', adminMiddleware, async (req, res) => {
  try {
    const { docKey } = req.params;
    const { title, content, version, effective_date } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'title 和 content 不能为空' });
    }

    const [currentRows] = await pool.query(
      `SELECT id, title, content, version, effective_date
       FROM legal_docs WHERE doc_key = ? LIMIT 1`,
      [docKey]
    );

    if (currentRows.length > 0) {
      const current = currentRows[0];
      await pool.query(
        `INSERT INTO legal_doc_versions
         (doc_key, title, content, version, effective_date, source_doc_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          docKey,
          current.title,
          current.content,
          current.version || 'v1.0.0',
          current.effective_date || null,
          current.id,
          req.user.id
        ]
      );
    }

    await pool.query(
      `INSERT INTO legal_docs (doc_key, title, content, version, effective_date, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       content = VALUES(content),
       version = VALUES(version),
       effective_date = VALUES(effective_date),
       updated_by = VALUES(updated_by)`,
      [docKey, title, content, version || 'v1.0.0', effective_date || null, req.user.id]
    );

    return res.json({ success: true, message: '文档更新成功' });
  } catch (error) {
    return res.status(500).json({ success: false, message: '更新文档失败', error: error.message });
  }
});

router.get('/:docKey/versions', adminMiddleware, async (req, res) => {
  try {
    const { docKey } = req.params;
    const [rows] = await pool.query(
      `SELECT id, doc_key, title, version, effective_date, created_by, created_at
       FROM legal_doc_versions
       WHERE doc_key = ?
       ORDER BY id DESC
       LIMIT 50`,
      [docKey]
    );
    return res.json({ success: true, data: { versions: rows } });
  } catch (error) {
    return res.status(500).json({ success: false, message: '获取历史版本失败', error: error.message });
  }
});

router.post('/:docKey/rollback/:versionId', adminMiddleware, async (req, res) => {
  try {
    const { docKey, versionId } = req.params;

    const [versionRows] = await pool.query(
      `SELECT id, title, content, version, effective_date
       FROM legal_doc_versions
       WHERE id = ? AND doc_key = ?
       LIMIT 1`,
      [versionId, docKey]
    );
    if (versionRows.length === 0) {
      return res.status(404).json({ success: false, message: '历史版本不存在' });
    }
    const targetVersion = versionRows[0];

    const [currentRows] = await pool.query(
      `SELECT id, title, content, version, effective_date
       FROM legal_docs WHERE doc_key = ? LIMIT 1`,
      [docKey]
    );
    if (currentRows.length > 0) {
      const current = currentRows[0];
      await pool.query(
        `INSERT INTO legal_doc_versions
         (doc_key, title, content, version, effective_date, source_doc_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          docKey,
          current.title,
          current.content,
          current.version || 'v1.0.0',
          current.effective_date || null,
          current.id,
          req.user.id
        ]
      );
    }

    await pool.query(
      `UPDATE legal_docs
       SET title = ?, content = ?, version = ?, effective_date = ?, updated_by = ?
       WHERE doc_key = ?`,
      [
        targetVersion.title,
        targetVersion.content,
        targetVersion.version || 'v1.0.0',
        targetVersion.effective_date || null,
        req.user.id,
        docKey
      ]
    );

    return res.json({ success: true, message: '回滚成功' });
  } catch (error) {
    return res.status(500).json({ success: false, message: '回滚失败', error: error.message });
  }
});

module.exports = router;
