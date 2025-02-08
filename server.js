require("dotenv").config();
require("./db")();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");

const User = require("./models/User");
const Folder = require("./models/Folder");
const File = require("./models/File");

const app = express();
const port = process.env.PORT || 10040;
const UPLOAD_DIR = path.join(__dirname, "uploads");


// ✅ Health Check
app.get("/status", (req, res) => {
  res.json({ message: "✅ Server is running!", timestamp: new Date().toISOString() });
});

// ✅ Create Upload Directory
fs.ensureDirSync(UPLOAD_DIR);

// 📤 Upload File
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post("/upload", upload.single("chunk"), async (req, res) => {
  try {
    const { filename, chunkIndex, totalChunks, folderId } = req.body;
    const filePath = path.join(UPLOAD_DIR, filename);

    fs.ensureDirSync(path.dirname(filePath));
    await fs.writeFile(filePath + `.part${chunkIndex}`, req.file.buffer);

    if (parseInt(chunkIndex) === totalChunks - 1) {
      // Store metadata in DB only after final chunk is uploaded
      await File.create({
        filename,
        size: req.file.size,
        path: filePath,
        folder: folderId || null,
        owner: null, // Assign an owner if needed
        mimeType: getMimeType(filename),
      });
    }

    res.json({ message: `✅ Chunk ${chunkIndex}/${totalChunks} uploaded` });
  } catch (err) {
    res.status(500).json({ error: "❌ Upload error" });
  }
});

// 📂 Create Folder
app.post("/folder", async (req, res) => {
  try {
    const { name, parentFolderId } = req.body;
    const parentFolder = await Folder.findById(parentFolderId).lean();
    const folderPath = parentFolder ? path.join(parentFolder.path, name) : path.join(UPLOAD_DIR, name);

    fs.ensureDirSync(folderPath);
    const folder = await Folder.create({ name, path: folderPath, parentFolder: parentFolderId || null, owner: null });

    res.json(folder);
  } catch (err) {
    res.status(500).json({ error: "❌ Error creating folder" });
  }
});

// 📄 List Files & Folders
app.get("/files", async (req, res) => {
  try {
    const files = await File.find();
    const folders = await Folder.find();
    res.json({ files, folders });
  } catch (err) {
    res.status(500).json({ error: "❌ Error retrieving files" });
  }
});

// 📥 Download File
app.get("/download/:filename", async (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  const fileRecord = await File.findOne({ path: filePath });

  if (!fileRecord || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.setHeader("Content-Disposition", `attachment; filename="${req.params.filename}"`);
  res.setHeader("Content-Type", "application/octet-stream");

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// 🗑️ Delete File or Folder
app.delete("/delete/:filename", async (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  const fileRecord = await File.findOneAndDelete({ path: filePath });

  if (!fileRecord || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  fs.unlinkSync(filePath);
  res.json({ message: `✅ Deleted: ${req.params.filename}` });
});

// 🚀 Start Server
app.listen(port, () => console.log(`✅ Server running on port ${port}`));

// 📄 Helper Function: Get MIME Type
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
