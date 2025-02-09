require("dotenv").config();
require("./db")();
const jwt = require("jsonwebtoken");
const admin = require("./firebase");
const cookieParser = require("cookie-parser");

const express = require("express");
const mongoose = require("mongoose");
const mime = require("mime-types");
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
// ✅ Use `cookie-parser`
app.use(cookieParser());

// ✅ Configure CORS to allow credentials
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true, // 🔥 Allow cookies from frontend
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
// ✅ Health Check
app.get("/status", (req, res) => {
  res.json({
    message: "✅ Server is running!",
    timestamp: new Date().toISOString(),
  });
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
    console.error(err.message);
    res.status(500).json({ error: "❌ Upload error" });
  }
});

app.post("/merge", async (req, res) => {
  try {
    const { filename, totalChunks, owner, folder, isPublic } = req.body;
    const finalPath = path.join(UPLOAD_DIR, filename);

    // ✅ Merge file chunks
    const fileStream = fs.createWriteStream(finalPath);
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = `${finalPath}.part${i}`;

      if (!fs.existsSync(chunkPath)) {
        return res.status(400).json({ error: `❌ Missing chunk ${i}` });
      }

      const chunkStream = fs.createReadStream(chunkPath);
      await new Promise((resolve, reject) => {
        chunkStream.pipe(fileStream, { end: false });
        chunkStream.on("end", () => {
          fs.unlinkSync(chunkPath); // ✅ Delete chunk after merging
          resolve();
        });
        chunkStream.on("error", reject);
      });
    }
    fileStream.end(); // ✅ Finalize file writing

    // ✅ Get final file size and MIME type
    const fileSize = fs.statSync(finalPath).size;
    const mimeType = mime.lookup(finalPath) || "application/octet-stream";

    // ✅ Save file info to MongoDB
    const file = await File.create({
      filename,
      size: fileSize,
      owner, // 🔥 Associate with user
      folder: folder || null, // 🔥 Associate with a folder
      path: `/uploads/${filename}`, // 🔥 Adjust based on frontend
      mimeType,
      isPublic: isPublic || false, // 🔥 Default to private
    });

    res.json({ message: "✅ File merge complete", file });

  } catch (err) {
    console.error("❌ Merge Error:", err);
    res.status(500).json({ error: "❌ Merge error" });
  }
});
app.post("/auth/google", async (req, res) => {
  try {
    const { name, email, googleId, avatar, token } = req.body;
    console.log(token);
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log(decodedToken, "decodedToken");
    if (decodedToken.uid !== googleId) {
      return res.status(401).json({ error: "Invalid Google ID Token" });
    }

    let user = await User.findOne({ email });
    console.log(user, "login");
    if (!user) {
      user = await User.create({ name, email, googleId, avatar });
    }

    const jwtToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.cookie("auth_token", jwtToken, {
      httpOnly: true, // 🔐 Secure from JavaScript access
      secure: process.env.NODE_ENV === "production", // 🔒 Set `true` in production (for HTTPS)
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ message: "✅ Login successful", user });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Authentication failed" });
  }
});

app.get("/auth/me", async (req, res) => {
  try {
    const token = req.cookies.auth_token; // ✅ Get token from cookies
    if (!token) {
      return res.status(401).json({ error: "❌ No authentication token" });
    }

    // ✅ Decode JWT Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ Find user in MongoDB
    const user = await User.findById(decoded.userId).select("-password"); // Exclude password field
    if (!user) {
      return res.status(401).json({ error: "❌ User not found" });
    }

    res.json({ user }); // ✅ Return full user details
  } catch (err) {
    console.error("❌ Authentication Error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie("auth_token");
  res.json({ message: "✅ Logged out" });
});

// 📂 Create Folder
app.post("/folder", async (req, res) => {
  try {
    const { name, parentFolderId } = req.body;
    const parentFolder = await Folder.findById(parentFolderId).lean();
    const folderPath = parentFolder
      ? path.join(parentFolder.path, name)
      : path.join(UPLOAD_DIR, name);

    fs.ensureDirSync(folderPath);
    const folder = await Folder.create({
      name,
      path: folderPath,
      parentFolder: parentFolderId || null,
      owner: null,
    });

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

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${req.params.filename}"`
  );
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
