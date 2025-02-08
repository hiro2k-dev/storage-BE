require("dotenv").config();
require("./db")();
const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 10040;
const UPLOAD_DIR = path.join(__dirname, "uploads");

// Ensure upload directory exists
fs.ensureDirSync(UPLOAD_DIR);

app.use(cors());
// app.use(express.json());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// ? Health Check
app.get("/status", (req, res) => {
  res.json({ message: "? Server is running!", timestamp: new Date().toISOString() });
});
// ? Health Check
app.get("/", (req, res) => {
  res.json({ message: "Hiro Storage BE"});
});

// ?? Upload Chunks (Handles Large Files & Folder Structure)
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post("/upload", upload.single("chunk"), async (req, res) => {
  try {
    const { filename, chunkIndex, totalChunks } = req.body;
    const filePath = path.join(UPLOAD_DIR, filename);

    // Ensure the directory exists for nested files
    fs.ensureDirSync(path.dirname(filePath));

    await fs.writeFile(filePath + `.part${chunkIndex}`, req.file.buffer);
    res.json({ message: `? Chunk ${chunkIndex}/${totalChunks} uploaded` });
  } catch (err) {
    res.status(500).json({ error: "? Upload error" });
  }
});

// ?? Merge Chunks (Ensures Folder Structure)
app.post("/merge", async (req, res) => {
  const { filename, totalChunks } = req.body;
  const finalPath = path.join(UPLOAD_DIR, filename);

  try {
    const fileStream = fs.createWriteStream(finalPath);
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = finalPath + `.part${i}`;
      if (!fs.existsSync(chunkPath)) {
        return res.status(400).json({ error: `Missing chunk ${i}` });
      }
      fileStream.write(fs.readFileSync(chunkPath));
      fs.unlinkSync(chunkPath);
    }
    fileStream.end();
    res.json({ message: "? File merge complete" });
  } catch (err) {
    res.status(500).json({ error: "? Merge error" });
  }
});

// List Files & Folders Recursively (Now Includes File Size)
app.get("/files", async (req, res) => {
  try {
    const getAllFiles = (dir, filesList = []) => {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          getAllFiles(filePath, filesList);
        } else {
          filesList.push({
            filename: path.relative(UPLOAD_DIR, filePath),
            size: stats.size, // File size in bytes
          });
        }
      });
      return filesList;
    };

    res.json(getAllFiles(UPLOAD_DIR));
  } catch (err) {
    res.status(500).json({ error: "❌ Error retrieving files" });
  }
});


// ?? Fast File Download (Streaming)
app.get("/download/:filename(*)", (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.setHeader("Content-Disposition", `attachment; filename="${path.basename(req.params.filename)}"`);
  res.setHeader("Content-Type", "application/octet-stream");

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// ??? Delete File or Folder
app.delete("/delete/:filename(*)", async (req, res) => {
  const filePath = path.join(UPLOAD_DIR, req.params.filename);
  try {
    if (fs.existsSync(filePath)) {
      if (fs.lstatSync(filePath).isDirectory()) {
        fs.removeSync(filePath);
      } else {
        fs.unlinkSync(filePath);
      }
      res.json({ message: `? Deleted: ${req.params.filename}` });
    } else {
      res.status(404).json({ error: "File/Folder not found" });
    }
  } catch (err) {
    res.status(500).json({ error: "? Delete error" });
  }
});

// ?? Start Server
app.listen(port, () => console.log(`Server running on port ${port}`));
