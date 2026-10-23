/**
 * Scale a data URL image and return a new PNG data URL.
 * @param {string} dataUrl
 * @param {number} scale 0.1–3
 */
export async function scaleDataUrl(dataUrl, scale = 1) {
  if (!dataUrl || scale === 1) return dataUrl;

  const img = await loadImage(dataUrl);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Draw an image covering a rect (like CSS background-size: cover/contain).
 */
export function drawImageFit(ctx, img, dx, dy, dw, dh, mode = 'cover') {
  const ir = img.width / img.height;
  const tr = dw / dh;
  let sw = img.width;
  let sh = img.height;
  let sx = 0;
  let sy = 0;
  let tw = dw;
  let th = dh;
  let tx = dx;
  let ty = dy;

  if (mode === 'contain') {
    if (ir > tr) {
      th = dw / ir;
      ty = dy + (dh - th) / 2;
    } else {
      tw = dh * ir;
      tx = dx + (dw - tw) / 2;
    }
    ctx.drawImage(img, tx, ty, tw, th);
    return;
  }

  // cover
  if (ir > tr) {
    sw = img.height * tr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / tr;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
