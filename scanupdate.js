require("dotenv").config();
const fs = require("fs-extra");
const path = require("path");
const mongoose = require("mongoose");
const User = require("./models/User");
const Folder = require("./models/Folder");
const File = require("./models/File");

// 📂 Set Uploads Directory (Root Folder)
const UPLOADS_DIR = path.join(__dirname, "uploads");

// 🔗 Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/file_manager", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected!"))
  .catch((err) => console.error("MongoDB connection error:", err));

// 📌 Function to Scan and Update Database
const scanUploadsFolder = async () => {
  console.log("🔍 Scanning uploads folder...");
  await scanFolder(UPLOADS_DIR, null);
  console.log("✅ Scan complete!");
  mongoose.connection.close();
};

// 📂 Recursive Function to Scan Folders
const scanFolder = async (folderPath, parentFolderId) => {
  const items = fs.readdirSync(folderPath);

  for (const item of items) {
    const itemPath = path.join(folderPath, item);
    const stats = fs.statSync(itemPath);

    if (stats.isDirectory()) {
      // 📂 Handle Folder
      let folder = await Folder.findOne({ path: itemPath });

      if (!folder) {
        folder = await Folder.create({
          name: item,
          path: itemPath,
          parentFolder: parentFolderId,
          owner: null, // Assign owner if needed
        });
      }

      // 🔁 Recursively scan subfolders
      await scanFolder(itemPath, folder._id);
    } else {
      // 📄 Handle File
      let file = await File.findOne({ path: itemPath });

      if (!file) {
        await File.create({
          filename: item,
          size: stats.size,
          path: itemPath,
          folder: parentFolderId,
          owner: null, // Assign owner if needed
          mimeType: getMimeType(item),
        });
      }
    }
  }
};

// 📄 Helper Function: Get MIME Type (Simple)
const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".mp3": "audio/mpeg",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".zip": "application/zip",
  };
  return mimeTypes[ext] || "application/octet-stream";
};

// 🚀 Run the Script
scanUploadsFolder();
