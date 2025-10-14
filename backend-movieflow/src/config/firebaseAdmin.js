// backend-movieflow/src/config/firebaseAdmin.js
const admin = require('firebase-admin');
const { getStorage } = require('firebase-admin/storage');
const path = require('path');

// Ruta al service account (no lo subas al repo público)
const serviceAccount = require(path.join(__dirname, 'firebaseServiceAccount.json'));

const BUCKET_NAME = process.env.FB_BUCKET || 'movieflow-148af.appspot.com'; // ✅

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: BUCKET_NAME,
  });
  console.log('🔥 Firebase Admin inicializado con bucket:', BUCKET_NAME);
}

const storage = getStorage();
const bucket = storage.bucket(BUCKET_NAME); // ✅ instancia real de Bucket

module.exports = { admin, storage, bucket };
