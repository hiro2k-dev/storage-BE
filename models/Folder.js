const mongoose = require("mongoose");

const FolderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    parentFolder: { type: mongoose.Schema.Types.ObjectId, ref: "Folder", default: null }, // Parent folder (null if root)
    path: { type: String, required: true }, // Full folder path
  },
  { timestamps: true }
);

module.exports = mongoose.model("Folder", FolderSchema);
