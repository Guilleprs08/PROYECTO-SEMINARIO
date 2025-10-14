// backend-movieflow/src/routes/debug.firebase.routes.js
const express = require('express');
const { bucket } = require('../config/firebaseAdmin');

const router = express.Router();

router.get('/firebase-test', async (_req, res) => {
  try {
    const name = `diagnostics/test_${Date.now()}.txt`;
    const file = bucket.file(name);
    await file.save(Buffer.from('ok'), { resumable: false, metadata: { contentType: 'text/plain' } });
    const [exists] = await file.exists();
    res.json({ ok: true, bucket: bucket.name, wrote: name, exists });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

module.exports = router;
