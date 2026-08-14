import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import path from "path";
import authRoutes from "./routes/auth.js";
import interviewRoutes from "./routes/interviews.js";
import adminRoutes from "./routes/admin.js";
import googleSheetRoutes from "./routes/googleSheet.js";

if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required");
const app = express();
const allowedOrigins = [
  "http://localhost:5173",
  "https://smarthire-amber.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    exposedHeaders: ["Content-Disposition"],
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(path.resolve("uploads")));
app.get("/api/health", (_, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/interviews", interviewRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/google-sheet", googleSheetRoutes);
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === "ValidationError")
    return res.status(400).json({
      message: Object.values(err.errors)
        .map((e) => e.message)
        .join(", "),
    });
  res
    .status(err.status || 500)
    .json({ message: err.message || "Server error" });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log(`✅ MongoDB Connected Successfully`);
    console.log(`📂 Database: ${mongoose.connection.name}`);

    app.listen(process.env.PORT || 5000, () => {
      console.log(`🚀 API running on port ${process.env.PORT || 5000}`);
    });
  })
  .catch((e) => {
    console.error("❌ Database connection failed:", e.message);
    process.exit(1);
  });
