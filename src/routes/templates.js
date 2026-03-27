const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const { pool } = require('../config/database');
const { authMiddleware, optionalAuth } = require('../middleware/auth');

const aiTaskStore = new Map();

// When official templates in DB have `bead_data = null`,
// frontend cannot render a correct pattern. Generate a deterministic
// bead_data by template name so `bead_data` and `canvas_data` stay consistent.
function generateTemplateByName(name, width = 32, height = 32) {
  const n = String(name || '')
  const size = Number(width) || 32
  const w = Number(width) || size
  const h = Number(height) || size

  const normalizeName = (s) =>
    String(s || '')
      .replace(/[\uFE0F]/g, '') // emoji variation selector
      .replace(/[^\p{L}\p{N}]+/gu, '') // keep letters/numbers across locales

  const nn = normalizeName(n)

  const detectColor = () => {
    if (/(粉|pink)/i.test(nn)) return 'pink'
    if (/(金|黄|gold|yellow)/i.test(nn)) return 'gold'
    if (/(红|red)/i.test(nn)) return 'red'
    if (/(蓝|blue)/i.test(nn)) return 'blue'
    if (/(绿|green)/i.test(nn)) return 'green'
    if (/(紫|purple)/i.test(nn)) return 'purple'
    if (/(橙|orange)/i.test(nn)) return 'orange'
    if (/(黑|black)/i.test(nn)) return 'black'
    if (/(白|white)/i.test(nn)) return 'white'
    return null
  }

  const makeCells = (predicate, color) => {
    const cells = []
    const centerX = w / 2
    const centerY = h / 2
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (predicate(x, y, centerX, centerY)) {
          cells.push({ row: y, col: x, color })
        }
      }
    }
    return { cells, width: w, height: h }
  }

  const pointInPolygon = (px, py, vertices) => {
    // Ray casting algorithm
    let inside = false
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x
      const yi = vertices[i].y
      const xj = vertices[j].x
      const yj = vertices[j].y
      const intersect =
        yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi
      if (intersect) inside = !inside
    }
    return inside
  }

  const makeStarVertices = (cx, cy, outerR, innerR, points = 5, rotation = -Math.PI / 2) => {
    const verts = []
    const step = Math.PI / points
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR
      const a = rotation + i * step
      verts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
    }
    return verts
  }

  if (/心/i.test(nn)) {
    // Heart formula (same spirit as scripts/sync-templates.js)
    const centerX = w / 2
    const centerY = h / 2 - 2
    const scale = w / 8
    return {
      ...makeCells((x, y) => {
        const dx = (x - centerX) / scale
        const dy = (y - centerY) / scale
        const heart = Math.pow(dx * dx + dy * dy - 1, 3) - dx * dx * dy * dy * dy
        return heart <= 0
      }, detectColor() || 'pink')
    }
  }

  if (/星/i.test(nn)) {
    const centerX = (w - 1) / 2
    const centerY = (h - 1) / 2
    const outerR = Math.min(w, h) * 0.42
    const innerR = outerR * 0.48
    const verts = makeStarVertices(centerX, centerY, outerR, innerR, 5, -Math.PI / 2)
    return {
      ...makeCells((x, y) => pointInPolygon(x + 0.5, y + 0.5, verts), detectColor() || 'gold')
    }
  }

  if (/(方|方块|正方|square)/i.test(nn)) {
    const margin = 2
    return makeCells(
      (x, y) => x >= margin && x < w - margin && y >= margin && y < h - margin,
      detectColor() || 'green'
    )
  }

  if (/(圆|圆形|circle)/i.test(nn) && detectColor() === 'blue') {
    const centerX = w / 2
    const centerY = h / 2
    const radius = w / 2.3
    return makeCells((x, y) => {
      const dx = x - centerX
      const dy = y - centerY
      return Math.sqrt(dx * dx + dy * dy) < radius
    }, 'blue')
  }

  if (/(圆|圆形|circle)/i.test(nn) && detectColor() === 'purple') {
    const centerX = w / 2
    const centerY = h / 2
    const radius = w / 2.3
    return makeCells((x, y) => {
      const dx = x - centerX
      const dy = y - centerY
      return Math.sqrt(dx * dx + dy * dy) < radius
    }, 'purple')
  }

  // default red circle
  {
    const centerX = w / 2
    const centerY = h / 2
    const radius = w / 2.3
    return makeCells((x, y) => {
      const dx = x - centerX
      const dy = y - centerY
      return Math.sqrt(dx * dx + dy * dy) < radius
    }, detectColor() || 'red')
  }
}

function serializeTemplate(t) {
  let beadData = typeof t.bead_data === 'string' ? JSON.parse(t.bead_data) : t.bead_data
  if (!beadData) {
    beadData = generateTemplateByName(t.name, t.width || 32, t.height || 32)
  }

  return {
    ...t,
    bead_data: beadData,
    is_official: Number(t.is_official) === 1,
    my_liked: Number(t.my_liked) === 1,
    // DTO aliases for consistency across clients.
    use_count: Number(t.download_count) || 0,
    like_count: Number(t.like_count) || 0
  }
}

function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {}
  const codeMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeMatch) {
    try {
      return JSON.parse(codeMatch[1]);
    } catch (_) {}
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch (_) {}
  }
  return null;
}

function normalizeAiCanvas(parsed, size) {
  const width = Number(parsed?.width) || size;
  const height = Number(parsed?.height) || size;
  const matrix = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => null)
  );

  const cells = Array.isArray(parsed?.cells) ? parsed.cells : [];
  cells.forEach((cell) => {
    const row = Number(cell?.row);
    const col = Number(cell?.col);
    const hex = String(cell?.hex || '').trim();
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) return;
    if (row < 0 || row >= height || col < 0 || col >= width) return;
    const fullHex = hex.startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`;
    matrix[row][col] = {
      id: `ai_${fullHex.slice(1)}`,
      name: `AI_${fullHex.slice(1)}`,
      hex: fullHex,
      price: 0.1
    };
  });

  return {
    width,
    height,
    canvas_data: matrix
  };
}

function calcCanvasFillRatio(canvasData) {
  if (!Array.isArray(canvasData) || !canvasData.length) return 0;
  const h = canvasData.length;
  const w = Array.isArray(canvasData[0]) ? canvasData[0].length : 0;
  if (!w) return 0;
  let filled = 0;
  for (let r = 0; r < h; r += 1) {
    const row = canvasData[r] || [];
    for (let c = 0; c < w; c += 1) {
      if (row[c]) filled += 1;
    }
  }
  return filled / (w * h);
}

function calcBorderTouchRatio(canvasData) {
  if (!Array.isArray(canvasData) || !canvasData.length) return 0;
  const h = canvasData.length;
  const w = Array.isArray(canvasData[0]) ? canvasData[0].length : 0;
  if (!w) return 0;
  let filled = 0;
  let borderFilled = 0;
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      if (!canvasData[r]?.[c]) continue;
      filled += 1;
      if (r === 0 || c === 0 || r === h - 1 || c === w - 1) {
        borderFilled += 1;
      }
    }
  }
  if (!filled) return 0;
  return borderFilled / filled;
}

function calcBoundingBoxStats(canvasData) {
  if (!Array.isArray(canvasData) || !canvasData.length) {
    return { areaRatio: 0, widthRatio: 0, heightRatio: 0 };
  }
  const h = canvasData.length;
  const w = Array.isArray(canvasData[0]) ? canvasData[0].length : 0;
  if (!w) return { areaRatio: 0, widthRatio: 0, heightRatio: 0 };
  let minR = h, minC = w, maxR = -1, maxC = -1;
  let filled = 0;
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) {
      if (!canvasData[r]?.[c]) continue;
      filled += 1;
      if (r < minR) minR = r;
      if (c < minC) minC = c;
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    }
  }
  if (!filled || maxR < 0 || maxC < 0) {
    return { areaRatio: 0, widthRatio: 0, heightRatio: 0 };
  }
  const boxW = maxC - minC + 1;
  const boxH = maxR - minR + 1;
  return {
    areaRatio: (boxW * boxH) / (w * h),
    widthRatio: boxW / w,
    heightRatio: boxH / h
  };
}

function postProcessCanvasData(canvasData, sizeHint = 32) {
  if (!Array.isArray(canvasData) || !canvasData.length || !Array.isArray(canvasData[0])) {
    return canvasData;
  }

  const h = canvasData.length;
  const w = canvasData[0].length;
  const size = Number(sizeHint) || Math.max(w, h) || 32;
  const cfg = (() => {
    if (size <= 16) {
      return {
        paletteLimit: 16,
        rareColorMaxCount: 1,
        outlierMajorCountMin: 6,
        holeFillNeighborMin: 6,
        smoothMajorCountMin: 6
      };
    }
    if (size <= 32) {
      return {
        paletteLimit: 22,
        rareColorMaxCount: 2,
        outlierMajorCountMin: 5,
        holeFillNeighborMin: 5,
        smoothMajorCountMin: 5
      };
    }
    if (size <= 48) {
      return {
        paletteLimit: 28,
        rareColorMaxCount: 2,
        outlierMajorCountMin: 5,
        holeFillNeighborMin: 5,
        smoothMajorCountMin: 5
      };
    }
    return {
      paletteLimit: 32,
      rareColorMaxCount: 3,
      outlierMajorCountMin: 4,
      holeFillNeighborMin: 4,
      smoothMajorCountMin: 4
    };
  })();
  const dirs8 = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];
  const clone = (v) => (v ? { ...v } : null);
  let out = canvasData.map((row) => row.map((cell) => clone(cell)));

  const countNeighbors = (matrix, r, c) => {
    let filled = 0;
    const colorCount = new Map();
    for (const [dr, dc] of dirs8) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= h || nc < 0 || nc >= w) continue;
      const n = matrix[nr][nc];
      if (!n) continue;
      filled += 1;
      const hex = String(n.hex || '').toUpperCase();
      colorCount.set(hex, (colorCount.get(hex) || 0) + 1);
    }
    let majorHex = '';
    let majorCount = 0;
    for (const [hex, cnt] of colorCount.entries()) {
      if (cnt > majorCount) {
        majorCount = cnt;
        majorHex = hex;
      }
    }
    return { filled, majorHex, majorCount };
  };

  const makeCell = (hex) => ({
    id: `ai_${String(hex).replace('#', '')}`,
    name: `AI_${String(hex).replace('#', '')}`,
    hex: String(hex).startsWith('#') ? String(hex).toUpperCase() : `#${String(hex).toUpperCase()}`,
    price: 0.1
  });

  const hexToRgb = (hex) => {
    const h2 = String(hex || '').replace('#', '').toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(h2)) return { r: 0, g: 0, b: 0 };
    return {
      r: parseInt(h2.slice(0, 2), 16),
      g: parseInt(h2.slice(2, 4), 16),
      b: parseInt(h2.slice(4, 6), 16)
    };
  };
  const colorDist = (a, b) => {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    const dr = ca.r - cb.r;
    const dg = ca.g - cb.g;
    const db = ca.b - cb.b;
    return dr * dr + dg * dg + db * db;
  };
  const isEdgePixel = (matrix, r, c) => {
    const cur = matrix[r]?.[c];
    if (!cur) return false;
    const stat = countNeighbors(matrix, r, c);
    // Boundary pixels are precious for silhouette fidelity; avoid over-smoothing them.
    return stat.filled <= 5;
  };

  // Pass 0: palette convergence (mild) — snap very rare colors to nearest major color.
  {
    const colorCount = new Map();
    for (let r = 0; r < h; r += 1) {
      for (let c = 0; c < w; c += 1) {
        const cell = out[r][c];
        if (!cell) continue;
        const hex = String(cell.hex || '').toUpperCase();
        colorCount.set(hex, (colorCount.get(hex) || 0) + 1);
      }
    }
    const uniqueColors = [...colorCount.keys()];
    if (uniqueColors.length > cfg.paletteLimit) {
      const majors = [...colorCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, cfg.paletteLimit)
        .map(([hex]) => hex);
      const majorSet = new Set(majors);
      for (let r = 0; r < h; r += 1) {
        for (let c = 0; c < w; c += 1) {
          const cell = out[r][c];
          if (!cell) continue;
          const hex = String(cell.hex || '').toUpperCase();
          const cnt = colorCount.get(hex) || 0;
          if (majorSet.has(hex) || cnt > cfg.rareColorMaxCount) continue;
          let best = majors[0];
          let bestDist = Number.MAX_SAFE_INTEGER;
          for (const mh of majors) {
            const d = colorDist(hex, mh);
            if (d < bestDist) {
              bestDist = d;
              best = mh;
            }
          }
          out[r][c] = makeCell(best);
        }
      }
    }
  }

  // Pass 1: remove isolated single pixels and color outliers.
  {
    const base = out.map((row) => row.map((cell) => clone(cell)));
    for (let r = 1; r < h - 1; r += 1) {
      for (let c = 1; c < w - 1; c += 1) {
        const cur = base[r][c];
        const stat = countNeighbors(base, r, c);
        if (cur && stat.filled <= 1) {
          out[r][c] = null;
          continue;
        }
        if (cur && stat.majorHex && stat.majorCount >= cfg.outlierMajorCountMin) {
          const curHex = String(cur.hex || '').toUpperCase();
          if (curHex !== stat.majorHex) {
            out[r][c] = makeCell(stat.majorHex);
          }
        }
      }
    }
  }

  // Pass 2: fill tiny 1-pixel holes inside a region.
  {
    const base = out.map((row) => row.map((cell) => clone(cell)));
    for (let r = 1; r < h - 1; r += 1) {
      for (let c = 1; c < w - 1; c += 1) {
        if (base[r][c]) continue;
        const stat = countNeighbors(base, r, c);
        if (stat.filled >= cfg.holeFillNeighborMin && stat.majorHex) {
          out[r][c] = makeCell(stat.majorHex);
        }
      }
    }
  }

  // Pass 3: edge-aware smoothing for interiors (keep silhouette, smooth inner regions).
  {
    const base = out.map((row) => row.map((cell) => clone(cell)));
    for (let r = 1; r < h - 1; r += 1) {
      for (let c = 1; c < w - 1; c += 1) {
        if (!base[r][c]) continue;
        if (isEdgePixel(base, r, c)) continue;
        const stat = countNeighbors(base, r, c);
        if (stat.majorHex && stat.majorCount >= cfg.smoothMajorCountMin) {
          const curHex = String(base[r][c].hex || '').toUpperCase();
          // Keep high-contrast feature colors (eyes/nose) if they are very dark.
          const rgb = hexToRgb(curHex);
          const isVeryDark = rgb.r < 48 && rgb.g < 48 && rgb.b < 48;
          if (!isVeryDark && curHex !== stat.majorHex) {
          out[r][c] = makeCell(stat.majorHex);
          }
        }
      }
    }
  }

  // Pass 4: bridge tiny 1-pixel gaps horizontally/vertically.
  {
    const base = out.map((row) => row.map((cell) => clone(cell)));
    for (let r = 1; r < h - 1; r += 1) {
      for (let c = 1; c < w - 1; c += 1) {
        if (base[r][c]) continue;
        const left = base[r][c - 1];
        const right = base[r][c + 1];
        if (left && right) {
          const lh = String(left.hex || '').toUpperCase();
          const rh = String(right.hex || '').toUpperCase();
          if (lh === rh) {
            out[r][c] = makeCell(lh);
            continue;
          }
        }
        const up = base[r - 1][c];
        const down = base[r + 1][c];
        if (up && down) {
          const uh = String(up.hex || '').toUpperCase();
          const dh = String(down.hex || '').toUpperCase();
          if (uh === dh) {
            out[r][c] = makeCell(uh);
          }
        }
      }
    }
  }

  return out;
}

function setTask(taskId, patch) {
  const current = aiTaskStore.get(taskId) || {};
  const next = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString()
  };
  aiTaskStore.set(taskId, next);
  // Persist async job state so admin can audit historical runs.
  void syncTaskToDb(taskId, next);
}

function isFinalStatus(status) {
  return status === 'succeeded' || status === 'failed';
}

async function createTaskRecord({ taskId, userId, canvasSize }) {
  await pool.query(
    `INSERT INTO template_ai_jobs
      (task_id, user_id, canvas_size, status, progress, progress_text, started_at, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', 5, '任务已创建', NULL, NOW(), NOW())`,
    [taskId, Number(userId) || null, Number(canvasSize) || 32]
  );
}

async function syncTaskToDb(taskId, task) {
  try {
    const status = String(task?.status || 'queued');
    const progress = Number(task?.progress) || 0;
    const progressText = String(task?.progress_text || '');
    const errorText = task?.error ? String(task.error) : null;
    const resultText = task?.result ? JSON.stringify(task.result) : null;
    await pool.query(
      `UPDATE template_ai_jobs
       SET status = ?,
           progress = ?,
           progress_text = ?,
           error_message = ?,
           result_json = ?,
           started_at = CASE WHEN started_at IS NULL AND ? = 'running' THEN NOW() ELSE started_at END,
           finished_at = CASE WHEN ? IN ('succeeded', 'failed') THEN NOW() ELSE finished_at END,
           updated_at = NOW()
       WHERE task_id = ?`,
      [status, progress, progressText, errorText, resultText, status, status, taskId]
    );
  } catch (err) {
    console.error('同步 AI 任务到数据库失败:', err.message);
  }
}

async function runAiImageToCanvas({ image_base64, canvas_size }) {
  const size = Number(canvas_size) || 32;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('未配置 OPENAI_API_KEY');
  }
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
  const requestTimeoutMs = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS || 360000);
  const modelCandidates = [...new Set([
    model,
    'qwen-vl-max-latest',
    'qwen-vl-plus-latest',
    'gpt-4o-mini'
  ])];

  const dataUrl = image_base64.startsWith('data:image/')
    ? image_base64
    : `data:image/png;base64,${image_base64}`;

  const prompt = [
    `Convert this image into a pixel-bead canvas JSON for exactly ${size}x${size}.`,
    'Goal: maximize visual similarity to the original subject (not abstract icon).',
    'If image is a screenshot/UI page, ignore toolbars/text/grids/panels and extract only the main visual subject.',
    'Return ONLY JSON object in this shape:',
    '{ "width": 32, "height": 32, "cells": [{ "row": 0, "col": 0, "hex": "#RRGGBB" }] }',
    'Strict rules:',
    '- Keep the subject centered and preserve full silhouette/body proportion',
    '- Preserve key facial features and major contour (eyes, nose, mouth, ears)',
    '- Ignore noisy background / watermark / tiny details',
    '- Keep a small margin from canvas border; avoid touching border heavily',
    '- Use integer row/col in valid range',
    '- Hex must be #RRGGBB',
    '- Prefer 14~28 major colors, avoid too many near-duplicate colors',
    '- Keep regions contiguous; avoid scattered isolated pixels',
    '- Fill enough cells so output is not too sparse (target 25%~75% filled cells)'
  ].join('\n');
  const strictPrompt = [
    prompt,
    'If your first draft is too abstract, refine it to be closer to the source image.',
    'Do not output minimalist logo style. Keep shape fidelity first, artistic simplification second.'
  ].join('\n');

  const trimSlash = (s) => String(s || '').replace(/\/+$/, '');
  const base = trimSlash(baseUrl);
  const candidateBases = [base];
  if (base.includes('coding.dashscope.aliyuncs.com')) {
    candidateBases.push(base.replace('coding.dashscope.aliyuncs.com', 'dashscope.aliyuncs.com'));
  }
  if (base.includes('dashscope.aliyuncs.com') && !base.includes('/compatible-mode/v1')) {
    candidateBases.push('https://dashscope.aliyuncs.com/compatible-mode/v1');
    candidateBases.push(`${base}/compatible-mode/v1`);
  }
  if (!base.endsWith('/v1')) {
    candidateBases.push(`${base}/v1`);
  }
  if (base.endsWith('/v1') && !base.includes('/compatible-mode/v1')) {
    candidateBases.push(base.replace(/\/v1$/, '/compatible-mode/v1'));
  }

  let aiRes = null;
  let normalizedResult = null;
  let lastError = null;
  let attemptNo = 0;
  const uniqueBases = [...new Set(candidateBases)];
  // Prefer the configured model first with full timeout; only fallback when endpoint/model is clearly unavailable.
  for (const c of uniqueBases) {
    for (let i = 0; i < modelCandidates.length; i += 1) {
      const m = modelCandidates[i];
      attemptNo += 1;
      const attemptPrompt = attemptNo <= 1 ? prompt : strictPrompt;
      try {
        const resp = await axios.post(
          `${c}/chat/completions`,
          {
            model: m,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: attemptPrompt },
                  { type: 'image_url', image_url: { url: dataUrl } }
                ]
              }
            ],
            temperature: 0.1
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: requestTimeoutMs
          }
        );
        const content = resp?.data?.choices?.[0]?.message?.content || '';
        const parsed = extractJson(content);
        if (!parsed) {
          lastError = new Error('AI 返回格式不可解析');
          continue;
        }
        const normalized = normalizeAiCanvas(parsed, size);
        const fillRatio = calcCanvasFillRatio(normalized.canvas_data);
        const borderTouchRatio = calcBorderTouchRatio(normalized.canvas_data);
        const bbox = calcBoundingBoxStats(normalized.canvas_data);
        if (fillRatio < 0.18 || fillRatio > 0.88) {
          lastError = new Error(`AI 结果过于稀疏/稠密（fill_ratio=${fillRatio.toFixed(2)}），自动重试中`);
          continue;
        }
        // Reject stripe-like or edge-dominated outputs.
        if (borderTouchRatio > 0.18) {
          lastError = new Error(`AI 结果边缘接触过高（border_ratio=${borderTouchRatio.toFixed(2)}），自动重试中`);
          continue;
        }
        // Subject should be neither tiny nor full-canvas sheet.
        if (bbox.areaRatio < 0.22 || bbox.areaRatio > 0.92) {
          lastError = new Error(`AI 主体框异常（bbox_area=${bbox.areaRatio.toFixed(2)}），自动重试中`);
          continue;
        }
        aiRes = resp;
        normalizedResult = {
          ...normalized,
          canvas_data: postProcessCanvasData(normalized.canvas_data, size)
        };
        break;
      } catch (e) {
        lastError = e;
        const status = e?.response?.status;
        // For configured model timeout, do not rush into fallback models; surface the timeout directly.
        if (i === 0 && e?.code === 'ECONNABORTED') {
          throw new Error(`AI 处理超时（>${Math.floor(requestTimeoutMs / 1000)}s），可在 .env 设置 OPENAI_REQUEST_TIMEOUT_MS 调大`);
        }
        // 400/401/403/404 usually means auth/model/endpoint mismatch; continue trying other candidates.
        if (status === 400 || status === 401 || status === 403 || status === 404 || e?.code === 'ECONNABORTED') {
          continue;
        }
        throw e;
      }
    }
    if (aiRes) break;
  }
  if (!aiRes || !normalizedResult) {
    const detail = lastError?.response?.status
      ? `status=${lastError.response.status}`
      : (lastError?.message || 'unknown');
    const tried = uniqueBases.join(' | ');
    const triedModels = modelCandidates.join(' | ');
    throw new Error(`AI 接口不可用或超时，请检查 OPENAI_BASE_URL / OPENAI_VISION_MODEL（当前: ${baseUrl}，${detail}，tried_base: ${tried}，tried_model: ${triedModels}）`);
  }
  return {
    canvas_size: { width: normalizedResult.width, height: normalizedResult.height },
    canvas_data: normalizedResult.canvas_data
  };
}

// 获取模板列表
router.get('/', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id || null

    let sql = `
      SELECT 
        t.*, 
        u.username, 
        u.nickname,
        ${userId ? '(SELECT 1 FROM template_likes tl WHERE tl.template_id = t.id AND tl.user_id = ?) AS my_liked' : 'NULL AS my_liked'}
      FROM templates t 
      LEFT JOIN users u ON t.user_id = u.id 
    `;
    const params = userId ? [userId] : []

    sql += ' ORDER BY t.created_at DESC'

    const [templates] = await pool.query(sql, params);

    const parsedTemplates = templates.map(serializeTemplate)

    res.json({
      success: true,
      data: { templates: parsedTemplates }
    });

  } catch (error) {
    console.error('获取模板列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取模板列表失败',
      error: error.message
    });
  }
});

// 点赞 / 取消点赞（toggle）
router.post('/:id/like', authMiddleware, async (req, res) => {
  const templateId = Number(req.params.id)
  if (!Number.isFinite(templateId) || templateId <= 0) {
    return res.status(400).json({ success: false, message: '模板ID无效' })
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [exists] = await conn.query(
      'SELECT id FROM template_likes WHERE template_id = ? AND user_id = ? LIMIT 1',
      [templateId, req.user.id]
    )

    let liked = false
    if (exists.length) {
      await conn.query('DELETE FROM template_likes WHERE template_id = ? AND user_id = ?', [templateId, req.user.id])
      await conn.query('UPDATE templates SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?', [templateId])
      liked = false
    } else {
      await conn.query('INSERT INTO template_likes (template_id, user_id) VALUES (?, ?)', [templateId, req.user.id])
      await conn.query('UPDATE templates SET like_count = like_count + 1 WHERE id = ?', [templateId])
      liked = true
    }

    const [rows] = await conn.query('SELECT like_count FROM templates WHERE id = ? LIMIT 1', [templateId])
    await conn.commit()

    res.json({
      success: true,
      data: {
        template_id: templateId,
        liked,
        like_count: rows[0]?.like_count ?? 0
      }
    })
  } catch (error) {
    await conn.rollback()
    console.error('模板点赞错误:', error)
    res.status(500).json({ success: false, message: '操作失败', error: error.message })
  } finally {
    conn.release()
  }
})

// 使用一次（+1 使用次数）
router.post('/:id/use', optionalAuth, async (req, res) => {
  try {
    const templateId = Number(req.params.id)
    if (!Number.isFinite(templateId) || templateId <= 0) {
      return res.status(400).json({ success: false, message: '模板ID无效' })
    }

    await pool.query('UPDATE templates SET download_count = download_count + 1 WHERE id = ?', [templateId])
    const [rows] = await pool.query('SELECT download_count FROM templates WHERE id = ? LIMIT 1', [templateId])

    res.json({
      success: true,
      data: {
        template_id: templateId,
        use_count: rows[0]?.download_count ?? 0
      }
    })
  } catch (error) {
    console.error('模板使用计数错误:', error)
    res.status(500).json({ success: false, message: '操作失败', error: error.message })
  }
})

// AI: image to canvas_data
router.post('/ai-from-image', authMiddleware, async (req, res) => {
  try {
    const { image_base64, canvas_size = 32 } = req.body || {};
    const size = Number(canvas_size) || 32;
    if (![16, 32, 48, 64].includes(size)) {
      return res.status(400).json({ success: false, message: 'canvas_size 仅支持 16/32/48/64' });
    }
    if (!image_base64 || typeof image_base64 !== 'string') {
      return res.status(400).json({ success: false, message: '缺少 image_base64' });
    }

    const normalized = await runAiImageToCanvas({ image_base64, canvas_size: size });
    return res.json({
      success: true,
      data: {
        canvas_size: normalized.canvas_size,
        canvas_data: normalized.canvas_data
      }
    });
  } catch (error) {
    console.error('AI 图片转模板错误:', error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: 'AI 生成失败',
      error: error.message
    });
  }
});

// AI async job: create
router.post('/ai-from-image/jobs', authMiddleware, async (req, res) => {
  try {
    const { image_base64, canvas_size = 32 } = req.body || {};
    const size = Number(canvas_size) || 32;
    if (![16, 32, 48, 64].includes(size)) {
      return res.status(400).json({ success: false, message: 'canvas_size 仅支持 16/32/48/64' });
    }
    if (!image_base64 || typeof image_base64 !== 'string') {
      return res.status(400).json({ success: false, message: '缺少 image_base64' });
    }

    const taskId = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}_${Math.random()}`;
    const now = new Date().toISOString();
    aiTaskStore.set(taskId, {
      id: taskId,
      user_id: Number(req.user?.id) || null,
      status: 'queued',
      progress: 5,
      progress_text: '任务已创建',
      created_at: now,
      updated_at: now,
      result: null,
      error: null
    });
    await createTaskRecord({ taskId, userId: req.user?.id, canvasSize: size });

    const jobMaxDurationMs = Number(process.env.AI_JOB_MAX_DURATION_MS || 600000);
    let stoppedByTimeout = false;
    const killTimer = setTimeout(() => {
      const current = aiTaskStore.get(taskId);
      if (!current || isFinalStatus(current.status)) return;
      stoppedByTimeout = true;
      setTask(taskId, {
        status: 'failed',
        progress: 100,
        progress_text: '失败',
        error: `任务执行超时（>${Math.floor(jobMaxDurationMs / 1000)}s）`
      });
    }, jobMaxDurationMs);

    // background worker
    ;(async () => {
      try {
        setTask(taskId, { status: 'running', progress: 20, progress_text: '准备图像数据' });
        setTask(taskId, { progress: 40, progress_text: 'AI 正在识别图片' });
        const result = await runAiImageToCanvas({ image_base64, canvas_size: size });
        if (stoppedByTimeout) return;
        setTask(taskId, { progress: 85, progress_text: '解析与标准化结果' });
        setTask(taskId, { status: 'succeeded', progress: 100, progress_text: '完成', result });
      } catch (error) {
        if (stoppedByTimeout) return;
        console.error('AI 任务失败:', error?.response?.data || error.message);
        setTask(taskId, {
          status: 'failed',
          progress: 100,
          progress_text: '失败',
          error: error.message || 'AI 生成失败'
        });
      } finally {
        clearTimeout(killTimer);
      }
    })();

    return res.status(202).json({
      success: true,
      data: { task_id: taskId, status: 'queued' }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: '创建任务失败', error: error.message });
  }
});

// AI async job: query
router.get('/ai-from-image/jobs/:taskId', authMiddleware, async (req, res) => {
  let task = aiTaskStore.get(req.params.taskId);
  if (!task) {
    const [rows] = await pool.query(
      `SELECT task_id, user_id, status, progress, progress_text, created_at, updated_at, error_message, result_json
       FROM template_ai_jobs WHERE task_id = ? LIMIT 1`,
      [req.params.taskId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }
    const dbTask = rows[0];
    let parsedResult = null;
    if (dbTask.result_json) {
      try {
        parsedResult = JSON.parse(dbTask.result_json);
      } catch (_) {
        parsedResult = null;
      }
    }
    task = {
      id: dbTask.task_id,
      user_id: Number(dbTask.user_id) || null,
      status: dbTask.status,
      progress: Number(dbTask.progress) || 0,
      progress_text: dbTask.progress_text || '',
      created_at: dbTask.created_at,
      updated_at: dbTask.updated_at,
      error: dbTask.error_message || null,
      result: parsedResult
    };
  }
  const requesterId = Number(req.user?.id) || 0;
  const ownerId = Number(task.user_id) || 0;
  if (ownerId && ownerId !== requesterId) {
    const [roleRows] = await pool.query('SELECT role FROM users WHERE id = ? LIMIT 1', [requesterId]);
    const isAdmin = roleRows.length > 0 && roleRows[0].role === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: '无权访问该任务' });
    }
  }
  return res.json({
    success: true,
    data: {
      task_id: task.id,
      status: task.status,
      progress: task.progress || 0,
      progress_text: task.progress_text || '',
      created_at: task.created_at,
      updated_at: task.updated_at,
      result: task.status === 'succeeded' ? task.result : null,
      error: task.status === 'failed' ? task.error : null
    }
  });
});

// AI config check (safe diagnostics, no raw key leakage)
router.get('/ai-config-check', authMiddleware, async (req, res) => {
  try {
    const apiKey = String(process.env.OPENAI_API_KEY || '');
    const baseUrl = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1');
    const model = String(process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini');
    const hasApiKey = apiKey.length > 0;
    const maskedKey = hasApiKey
      ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`
      : '';

    const trimSlash = (s) => String(s || '').replace(/\/+$/, '');
    const probeUrl = `${trimSlash(baseUrl)}/models`;

    if (!hasApiKey) {
      return res.json({
        success: true,
        data: {
          has_api_key: false,
          api_key_masked: '',
          base_url: baseUrl,
          model,
          probe: { ok: false, status: 0, message: '缺少 OPENAI_API_KEY' }
        }
      });
    }

    try {
      const probeRes = await axios.get(probeUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15000
      });
      const modelList = Array.isArray(probeRes?.data?.data) ? probeRes.data.data : [];
      const modelNames = modelList.map((m) => m.id).filter(Boolean);
      const modelMatched = modelNames.length ? modelNames.includes(model) : null;
      return res.json({
        success: true,
        data: {
          has_api_key: true,
          api_key_masked: maskedKey,
          base_url: baseUrl,
          model,
          probe: {
            ok: true,
            status: probeRes.status,
            models_count: modelNames.length,
            model_matched: modelMatched
          }
        }
      });
    } catch (probeErr) {
      return res.json({
        success: true,
        data: {
          has_api_key: true,
          api_key_masked: maskedKey,
          base_url: baseUrl,
          model,
          probe: {
            ok: false,
            status: probeErr?.response?.status || 0,
            message: probeErr?.response?.data?.error?.message || probeErr.message || 'probe failed'
          }
        }
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'AI 配置自检失败', error: error.message });
  }
});

// 创建模板
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      difficulty,
      image_url,
      // small program payload
      canvas_size,
      canvas_data,
      // backoffice payload
      bead_data,
      // optional direct sizes
      width,
      height
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: '模板名称不能为空'
      });
    }
    if (String(name).length > 100) {
      return res.status(400).json({ success: false, message: '模板名称长度不能超过100' });
    }

    const parsedCanvasSize = (() => {
      if (!canvas_size) return null
      if (typeof canvas_size === 'number') return { width: canvas_size, height: canvas_size }
      if (typeof canvas_size === 'object' && canvas_size.width && canvas_size.height) return canvas_size
      return null
    })()

    const w = parsedCanvasSize ? Number(parsedCanvasSize.width) || 32 : Number(width) || 32
    const h = parsedCanvasSize ? Number(parsedCanvasSize.height) || 32 : Number(height) || 32
    if (w < 8 || h < 8 || w > 128 || h > 128) {
      return res.status(400).json({ success: false, message: '画布尺寸需在 8 到 128 之间' });
    }

    const parsedBeadData = (value) => {
      if (!value) return null
      if (typeof value === 'object') return value
      if (typeof value === 'string') {
        try {
          return JSON.parse(value)
        } catch {
          return null
        }
      }
      return null
    }

    // Prefer `bead_data` (backoffice), but keep compatibility with `canvas_data` (mini program).
    const finalBeadData = parsedBeadData(bead_data) || parsedBeadData(canvas_data)

    const [result] = await pool.query(
      `INSERT INTO templates (user_id, name, category, difficulty, description, image_url, width, height, bead_data, is_official) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        req.user.id,
        name,
        category || '图案',
        difficulty || '简单',
        description || null,
        image_url || null,
        w,
        h,
        finalBeadData ? JSON.stringify(finalBeadData) : null
      ]
    );

    res.status(201).json({
      success: true,
      message: '模板上传成功',
      data: {
        template: {
          id: result.insertId,
          name,
          description: description || '',
          width: w,
          height: h,
          category: category || '图案',
          difficulty: difficulty || '简单',
          is_official: false,
          use_count: 0,
          like_count: 0,
          created_at: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('创建模板错误:', error);
    res.status(500).json({
      success: false,
      message: '创建模板失败',
      error: error.message
    });
  }
});

// 删除模板
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const [templates] = await pool.query(
      'SELECT user_id FROM templates WHERE id = ?',
      [req.params.id]
    );

    if (templates.length === 0) {
      return res.status(404).json({
        success: false,
        message: '模板不存在'
      });
    }

    if (templates[0].user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: '无权删除此模板'
      });
    }

    await pool.query('DELETE FROM templates WHERE id = ?', [req.params.id]);

    res.json({
      success: true,
      message: '删除成功'
    });

  } catch (error) {
    console.error('删除模板错误:', error);
    res.status(500).json({
      success: false,
      message: '删除失败',
      error: error.message
    });
  }
});

module.exports = router;
