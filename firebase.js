const admin = require("firebase-admin");
const serviceAccount = require("./firebase-service-account.json");
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("Firebase Admin SDK initialized successfully");
} catch (error) {
  console.error("Error initializing Firebase Admin SDK:", error);
}

module.exports = admin;