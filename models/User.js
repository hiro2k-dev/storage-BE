const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    googleId: { type: String, unique: true },
    avatar: { type: String },
    createdAt: { type: Date, default: Date.now },
    storageUsed: { type: Number, default: 0 }, // Track storage usage (bytes)
    role: { type: String, enum: ["user", "admin"], default: "user" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
