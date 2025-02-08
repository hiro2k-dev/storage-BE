const mongoose = require("mongoose");

const FileSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    size: { type: Number, required: true }, // File size in bytes
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    folder: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null }, // Folder where file is stored
    path: { type: String, required: true }, // File storage path
    mimeType: { type: String }, // File type (e.g., image/png, application/pdf)
    isPublic: { type: Boolean, default: false }, // Public/Private file
  },
  { timestamps: true }
);

module.exports = mongoose.model("File", FileSchema);
