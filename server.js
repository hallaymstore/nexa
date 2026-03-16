require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { Server } = require("socket.io");
const { v2: cloudinary } = require("cloudinary");

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 5000);
const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MONEY_STEP = 0.0005;
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const MONGODB_URI = process.env.MONGODB_URI || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "nexa-dev-session";
const DB_MODE = MONGODB_URI ? "mongo" : "json";
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");
const GOOGLE_SITE_VERIFICATION = process.env.GOOGLE_SITE_VERIFICATION || "";
const BING_SITE_VERIFICATION = process.env.BING_SITE_VERIFICATION || "";
const JSON_DB_PATH = path.join(__dirname, "fallback-db.json");
const UPLOADS_ROOT = path.join(__dirname, "public", "uploads");
const CLOUDINARY_READY = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

let jsonDb = null;

const DEFAULT_ADS = [
  {
    title: "Safar uchun qulay sumka",
    image:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
    text: "Yengil, zamonaviy va kundalik hayotga mos premium backpack kolleksiyasi.",
    ctaText: "Ko'rish",
    ctaLink: "https://example.com/bag",
    isActive: true,
  },
  {
    title: "Uy uchun issiq dekor",
    image:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80",
    text: "Minimal interyer uchun chiroyli va ixcham bezak mahsulotlari.",
    ctaText: "Batafsil",
    ctaLink: "https://example.com/decor",
    isActive: true,
  },
  {
    title: "Mobil fotografiya kursi",
    image:
      "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80",
    text: "Telefon bilan professional darajada suratga olishni o'rganing.",
    ctaText: "Boshlash",
    ctaLink: "https://example.com/photo-course",
    isActive: true,
  },
  {
    title: "Yangi coffee spot",
    image:
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80",
    text: "Toshkent markazidagi yangi qahvaxona. Sokin atmosfera va ajoyib dessert.",
    ctaText: "Menyu",
    ctaLink: "https://example.com/coffee",
    isActive: true,
  },
];

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 20,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 120,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  bio: {
    type: String,
    default: "",
    maxlength: 240,
  },
  avatar: {
    type: String,
    default: "",
  },
  followers: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [],
  },
  following: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [],
  },
  followersCount: {
    type: Number,
    default: 0,
  },
  followingCount: {
    type: Number,
    default: 0,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  walletBalance: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const postSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  caption: {
    type: String,
    default: "",
    maxlength: 1200,
  },
  images: {
    type: [String],
    validate: [
      (value) => Array.isArray(value) && value.length >= 1 && value.length <= MAX_IMAGES,
      "Post kamida 1 ta va ko'pi bilan 5 ta rasmga ega bo'lishi kerak.",
    ],
  },
  tags: {
    type: [String],
    default: [],
  },
  likesCount: {
    type: Number,
    default: 0,
  },
  likedBy: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [],
  },
  commentsCount: {
    type: Number,
    default: 0,
  },
  adViewsCount: {
    type: Number,
    default: 0,
  },
  adRevenue: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const commentSchema = new mongoose.Schema({
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Post",
    required: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  text: {
    type: String,
    required: true,
    maxlength: 600,
  },
  likesCount: {
    type: Number,
    default: 0,
  },
  likedBy: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [],
  },
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Comment",
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const adSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  image: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
    maxlength: 220,
  },
  ctaText: {
    type: String,
    required: true,
    maxlength: 40,
  },
  ctaLink: {
    type: String,
    required: true,
    maxlength: 200,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const chatRoomSchema = new mongoose.Schema({
  participants: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    validate: [
      (value) => Array.isArray(value) && value.length >= 2,
      "Chat xonada kamida 2 ishtirokchi bo'lishi kerak.",
    ],
  },
  lastMessageText: {
    type: String,
    default: "",
    maxlength: 600,
  },
  lastMessageAt: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const chatMessageSchema = new mongoose.Schema({
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ChatRoom",
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  text: {
    type: String,
    required: true,
    maxlength: 1200,
  },
  readBy: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "User",
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

postSchema.index({ createdAt: -1 });
commentSchema.index({ post: 1, createdAt: 1 });
commentSchema.index({ parentComment: 1 });
adSchema.index({ isActive: 1, createdAt: -1 });
chatRoomSchema.index({ participants: 1, lastMessageAt: -1 });
chatMessageSchema.index({ room: 1, createdAt: 1 });

const User = mongoose.model("User", userSchema);
const Post = mongoose.model("Post", postSchema);
const Comment = mongoose.model("Comment", commentSchema);
const Ad = mongoose.model("Ad", adSchema);
const ChatRoom = mongoose.model("ChatRoom", chatRoomSchema);
const ChatMessage = mongoose.model("ChatMessage", chatMessageSchema);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
const sessionConfig = {
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL,
  },
};

if (DB_MODE === "mongo") {
  sessionConfig.store = MongoStore.create({
    mongoUrl: MONGODB_URI,
    collectionName: "sessions",
  });
}

const sessionMiddleware = session(sessionConfig);
app.use(sessionMiddleware);
app.use("/media", express.static(path.join(__dirname, "media")));
app.use(express.static(path.join(__dirname, "public"), { index: false }));

const io = new Server(server, {
  transports: ["websocket", "polling"],
});

const memoryStorage = multer.memoryStorage();
const imageFilter = (req, file, cb) => {
  if (!file.mimetype || !file.mimetype.startsWith("image/")) {
    const error = new Error("Faqat rasm fayllarini yuklash mumkin.");
    error.status = 400;
    cb(error);
    return;
  }
  cb(null, true);
};

const postUpload = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: MAX_IMAGES,
  },
});

const avatarUpload = multer({
  storage: memoryStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1,
  },
});

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100000) / 100000;
}

function formatMoney(value) {
  return roundMoney(value).toFixed(5);
}

function sanitizeText(value, maxLength = 280) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeMultiline(value, maxLength = 1200) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function escapeHtmlServer(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2brServer(value = "") {
  return escapeHtmlServer(value).replace(/\n/g, "<br>");
}

function normalizeUsername(value) {
  return sanitizeText(value, 20).toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUsername(username) {
  return /^[a-z0-9._]{3,20}$/.test(username);
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function parseTags(rawTags) {
  if (!rawTags) {
    return [];
  }

  const source = Array.isArray(rawTags) ? rawTags.join(",") : String(rawTags);

  return [
    ...new Set(
      source
        .split(/[,\s]+/)
        .map((tag) => sanitizeText(tag.replace(/^#+/, ""), 24).toLowerCase())
        .filter(Boolean)
        .slice(0, 8)
    ),
  ];
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeSearchQuery(value = "") {
  return sanitizeText(value, 120)
    .toLowerCase()
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 2)
    .slice(0, 8);
}

function buildUserSearchHaystack(user) {
  if (!user) {
    return "";
  }

  const source = user.toObject ? user.toObject() : user;
  return `${source.fullName || ""} ${source.username || ""} ${source.bio || ""}`.toLowerCase();
}

function buildPostSearchHaystack(post) {
  if (!post) {
    return "";
  }

  const source = post.toObject ? post.toObject() : post;
  const author = source.author || {};
  return [
    source.caption || "",
    Array.isArray(source.tags) ? source.tags.join(" ") : "",
    author.fullName || "",
    author.username || "",
    author.bio || "",
  ]
    .join(" ")
    .toLowerCase();
}

function matchesAllTokens(haystack, tokens) {
  if (!tokens.length) {
    return false;
  }
  return tokens.every((token) => haystack.includes(token));
}

function randomItem(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return null;
  }
  return list[Math.floor(Math.random() * list.length)];
}

function makePlacementKey(postId, adId) {
  return `${postId}:${adId}:${Date.now().toString(36)}:${crypto.randomBytes(4).toString("hex")}`;
}

function ensureImpressionCache(req) {
  if (!Array.isArray(req.session.countedAdImpressions)) {
    req.session.countedAdImpressions = [];
  }
  if (req.session.countedAdImpressions.length > 500) {
    req.session.countedAdImpressions = req.session.countedAdImpressions.slice(-250);
  }
}

async function fetchUserById(id) {
  if (!id) {
    return null;
  }

  if (DB_MODE === "json") {
    await loadJsonDb();
    return jsonFindUserById(id);
  }

  return User.findById(id);
}

async function fetchUserByUsername(username) {
  if (DB_MODE === "json") {
    await loadJsonDb();
    return jsonDb.users.find((entry) => entry.username === username) || null;
  }

  return User.findOne({ username });
}

async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    res.status(401).json({ message: "Bu amal uchun tizimga kirish kerak." });
    return;
  }

  const user = await fetchUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ message: "Sessiya tugagan. Qayta kiring." });
    return;
  }

  if (user.isBlocked) {
    req.session.destroy(() => {});
    res.status(403).json({ message: "Hisobingiz vaqtincha cheklangan." });
    return;
  }

  req.currentUser = user;
  next();
}

async function requireAdmin(req, res, next) {
  const user = req.currentUser || (await fetchUserById(req.session.userId));
  if (!user || !user.isAdmin) {
    res.status(403).json({ message: "Bu bo'lim faqat admin uchun." });
    return;
  }

  req.currentUser = user;
  next();
}

function computeCounts(user) {
  const followers = Array.isArray(user.followers) ? user.followers : [];
  const following = Array.isArray(user.following) ? user.following : [];
  user.followersCount = followers.length;
  user.followingCount = following.length;
}

function buildAdminOverviewPayload({ users, posts, comments, ads }) {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const usersToday = users.filter((user) => new Date(user.createdAt).getTime() >= dayAgo).length;
  const postsToday = posts.filter((post) => new Date(post.createdAt).getTime() >= dayAgo).length;
  const usersThisWeek = users.filter((user) => new Date(user.createdAt).getTime() >= weekAgo).length;
  const postsThisWeek = posts.filter((post) => new Date(post.createdAt).getTime() >= weekAgo).length;

  const totalLikes = posts.reduce((sum, post) => sum + (post.likesCount || 0), 0);
  const totalComments = comments.length;
  const totalAdViews = posts.reduce((sum, post) => sum + (post.adViewsCount || 0), 0);
  const totalRevenue = roundMoney(posts.reduce((sum, post) => sum + (post.adRevenue || 0), 0));
  const postsWithCaption = posts.filter((post) => sanitizeText(post.caption || "", 1200)).length;
  const postsWithTags = posts.filter((post) => Array.isArray(post.tags) && post.tags.length > 0).length;
  const seoReadyProfiles = users.filter(
    (user) => sanitizeText(user.bio || "", 240) || sanitizeText(user.avatar || "", 500)
  ).length;
  const averageLikesPerPost = posts.length ? totalLikes / posts.length : 0;
  const averageCommentsPerPost = posts.length ? totalComments / posts.length : 0;
  const averageViewsPerPost = posts.length ? totalAdViews / posts.length : 0;
  const averageRevenuePerPost = posts.length ? totalRevenue / posts.length : 0;

  const tagCounts = new Map();
  posts.forEach((post) => {
    (post.tags || []).forEach((tag) => {
      const normalized = sanitizeText(tag, 24).toLowerCase();
      if (!normalized) {
        return;
      }
      tagCounts.set(normalized, (tagCounts.get(normalized) || 0) + 1);
    });
  });

  const topTags = [...tagCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));

  const topPosts = [...posts]
    .sort(
      (left, right) =>
        (right.likesCount || 0) +
          (right.commentsCount || 0) +
          (right.adViewsCount || 0) * 0.05 -
        ((left.likesCount || 0) +
          (left.commentsCount || 0) +
          (left.adViewsCount || 0) * 0.05)
    )
    .slice(0, 5)
    .map((post) => ({
      id: String(post._id || post.id),
      caption: post.caption || "Sarlavhasiz post",
      likesCount: post.likesCount || 0,
      commentsCount: post.commentsCount || 0,
      adViewsCount: post.adViewsCount || 0,
      author: serializeUser(post.author || post.user || post.owner || null),
      createdAt: post.createdAt,
    }));

  const topUsers = [...users]
    .sort((left, right) => (right.followersCount || 0) - (left.followersCount || 0))
    .slice(0, 5)
    .map((user) => serializeUser(user, { includePrivate: true }));

  const recentUsers = [...users]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 5)
    .map((user) => serializeUser(user, { includePrivate: true }));

  const recentPosts = [...posts]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 5)
    .map((post) => ({
      id: String(post._id || post.id),
      caption: post.caption || "Sarlavhasiz post",
      createdAt: post.createdAt,
      author: serializeUser(post.author || null),
      likesCount: post.likesCount || 0,
      commentsCount: post.commentsCount || 0,
    }));

  return {
    totals: {
      users: users.length,
      admins: users.filter((user) => user.isAdmin).length,
      blockedUsers: users.filter((user) => user.isBlocked).length,
      posts: posts.length,
      comments: totalComments,
      ads: ads.length,
      activeAds: ads.filter((ad) => ad.isActive).length,
      likes: totalLikes,
      adViews: totalAdViews,
      revenue: totalRevenue,
    },
    growth: {
      usersToday,
      postsToday,
      usersThisWeek,
      postsThisWeek,
    },
    averages: {
      likesPerPost: roundMoney(averageLikesPerPost),
      commentsPerPost: roundMoney(averageCommentsPerPost),
      viewsPerPost: roundMoney(averageViewsPerPost),
      revenuePerPost: roundMoney(averageRevenuePerPost),
    },
    seo: {
      indexablePosts: posts.length,
      postsWithCaption,
      postsWithTags,
      seoReadyProfiles,
    },
    topTags,
    topPosts,
    topUsers,
    recentUsers,
    recentPosts,
  };
}

async function loadAdminCollections() {
  if (DB_MODE === "json") {
    await loadJsonDb();
    return {
      users: sortByDate(jsonDb.users),
      posts: sortByDate(jsonDb.posts).map((post) => jsonPopulatePost(post)),
      comments: sortByDate(jsonDb.comments).map((comment) => jsonPopulateComment(comment)),
      ads: sortByDate(jsonDb.ads),
    };
  }

  const [users, posts, comments, ads] = await Promise.all([
    User.find({}).sort({ createdAt: -1 }).lean(),
    Post.find({})
      .sort({ createdAt: -1 })
      .populate("author", "username fullName avatar followers followersCount followingCount createdAt")
      .lean(),
    Comment.find({})
      .sort({ createdAt: -1 })
      .populate("author", "username fullName avatar")
      .lean(),
    Ad.find({}).sort({ createdAt: -1 }).lean(),
  ]);

  return { users, posts, comments, ads };
}

function buildAvatarPlaceholder(name) {
  if (!name) {
    return "";
  }
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function serializeUser(user, options = {}) {
  if (!user) {
    return null;
  }

  const includePrivate = Boolean(options.includePrivate);
  const viewerId = options.viewerId || null;
  const source = user.toObject ? user.toObject() : user;
  const sourceId = String(source._id || source.id);
  const followers = Array.isArray(source.followers) ? source.followers : [];
  const following = Array.isArray(source.following) ? source.following : [];
  const payload = {
    id: sourceId,
    username: source.username,
    fullName: source.fullName,
    bio: source.bio || "",
    avatar: source.avatar || "",
    avatarFallback: buildAvatarPlaceholder(source.fullName || source.username),
    followersCount:
      typeof source.followersCount === "number" ? source.followersCount : followers.length,
    followingCount:
      typeof source.followingCount === "number" ? source.followingCount : following.length,
    walletBalance: roundMoney(source.walletBalance || 0),
    createdAt: source.createdAt,
    isCurrentUser: viewerId ? sourceId === String(viewerId) : false,
    isFollowing: viewerId
      ? followers.some((entry) => String(entry) === String(viewerId))
      : false,
  };

  if (includePrivate) {
    payload.email = source.email;
    payload.isAdmin = Boolean(source.isAdmin);
    payload.isBlocked = Boolean(source.isBlocked);
  }

  return payload;
}

function serializeComment(comment, viewerId) {
  const source = comment.toObject ? comment.toObject() : comment;
  const likedBy = Array.isArray(source.likedBy) ? source.likedBy : [];
  return {
    id: String(source._id || source.id),
    post: String(source.post),
    parentComment: source.parentComment ? String(source.parentComment) : null,
    text: source.text,
    likesCount: source.likesCount || 0,
    likedByUser: viewerId ? likedBy.some((entry) => String(entry) === String(viewerId)) : false,
    createdAt: source.createdAt,
    author: serializeUser(source.author, { viewerId }),
  };
}

function serializePost(post, viewerId, commentsPreviewMap = {}) {
  const source = post.toObject ? post.toObject() : post;
  const likedBy = Array.isArray(source.likedBy) ? source.likedBy : [];
  const postId = String(source._id || source.id);

  return {
    id: postId,
    caption: source.caption || "",
    images: Array.isArray(source.images) ? source.images : [],
    tags: Array.isArray(source.tags) ? source.tags : [],
    likesCount: source.likesCount || 0,
    likedByUser: viewerId ? likedBy.some((entry) => String(entry) === String(viewerId)) : false,
    commentsCount: source.commentsCount || 0,
    adViewsCount: source.adViewsCount || 0,
    adRevenue: roundMoney(source.adRevenue || 0),
    createdAt: source.createdAt,
    author: serializeUser(source.author, { viewerId }),
    commentsPreview: commentsPreviewMap[postId] || [],
  };
}

function jsonPopulateChatRoom(room) {
  if (!room) {
    return null;
  }

  return {
    ...room,
    participants: (room.participants || []).map((participantId) => jsonFindUserById(participantId)),
  };
}

function jsonPopulateChatMessage(message) {
  if (!message) {
    return null;
  }

  return {
    ...message,
    sender: jsonFindUserById(message.sender),
  };
}

function roomParticipantIds(room) {
  const source = room?.toObject ? room.toObject() : room;
  return Array.isArray(source?.participants)
    ? source.participants.map((entry) => String(entry?._id || entry))
    : [];
}

function roomIncludesUser(room, userId) {
  return roomParticipantIds(room).some((entry) => entry === String(userId));
}

function directRoomKey(leftId, rightId) {
  return [String(leftId), String(rightId)].sort().join(":");
}

function serializeChatRoom(room, viewerId, unreadCount = 0) {
  const source = room.toObject ? room.toObject() : room;
  const participants = Array.isArray(source.participants)
    ? source.participants.map((entry) =>
        typeof entry === "object" ? serializeUser(entry, { viewerId }) : null
      )
    : [];
  const otherParticipant =
    participants.find((participant) => participant && participant.id !== String(viewerId)) || null;

  return {
    id: String(source._id || source.id),
    participants: participants.filter(Boolean),
    participant: otherParticipant,
    lastMessageText: source.lastMessageText || "",
    lastMessageAt: source.lastMessageAt || source.createdAt,
    unreadCount,
    createdAt: source.createdAt,
  };
}

function serializeChatMessage(message, viewerId) {
  const source = message.toObject ? message.toObject() : message;
  return {
    id: String(source._id || source.id),
    roomId: String(source.room?._id || source.room),
    text: source.text,
    createdAt: source.createdAt,
    isMine: String(source.sender?._id || source.sender) === String(viewerId),
    sender: serializeUser(source.sender, { viewerId }),
  };
}

function ensureChatRoomAccess(room, userId) {
  if (!room || !roomIncludesUser(room, userId)) {
    const error = new Error("Chat xonasi topilmadi.");
    error.status = 404;
    throw error;
  }
}

async function searchChatUsers(rawQuery, viewerId) {
  const tokens = tokenizeSearchQuery(rawQuery);

  if (!tokens.length) {
    return [];
  }

  if (DB_MODE === "json") {
    await loadJsonDb();
    return jsonDb.users
      .filter((user) => String(user._id) !== String(viewerId) && !user.isBlocked)
      .filter((user) => matchesAllTokens(buildUserSearchHaystack(user), tokens))
      .slice(0, 8)
      .map((user) => serializeUser(user, { viewerId }));
  }

  const regex = new RegExp(tokens.map(escapeRegex).join("|"), "i");
  const users = await User.find({
    _id: { $ne: viewerId },
    isBlocked: { $ne: true },
    $or: [{ username: regex }, { fullName: regex }, { bio: regex }],
  })
    .sort({ followersCount: -1, createdAt: -1 })
    .limit(8);

  return users
    .filter((user) => matchesAllTokens(buildUserSearchHaystack(user), tokens))
    .map((user) => serializeUser(user, { viewerId }));
}

async function getOrCreateDirectRoom(viewerId, targetUsername) {
  const normalizedUsername = normalizeUsername(targetUsername);

  if (DB_MODE === "json") {
    await loadJsonDb();
    const viewer = jsonFindUserById(viewerId);
    const target = jsonDb.users.find((entry) => entry.username === normalizedUsername);

    if (!viewer || !target || target.isBlocked) {
      const error = new Error("Foydalanuvchi topilmadi.");
      error.status = 404;
      throw error;
    }
    if (String(target._id) === String(viewerId)) {
      const error = new Error("O'zingiz bilan chat ochib bo'lmaydi.");
      error.status = 400;
      throw error;
    }

    const key = directRoomKey(viewerId, target._id);
    let room = jsonDb.chatRooms.find((entry) => directRoomKey(entry.participants[0], entry.participants[1]) === key);

    if (!room) {
      room = {
        _id: generateId(),
        participants: [String(viewerId), String(target._id)],
        lastMessageText: "",
        lastMessageAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };
      jsonDb.chatRooms.unshift(room);
      await persistJsonDb();
    }

    return jsonPopulateChatRoom(room);
  }

  const [viewer, target] = await Promise.all([
    User.findById(viewerId),
    User.findOne({ username: normalizedUsername }),
  ]);

  if (!viewer || !target || target.isBlocked) {
    const error = new Error("Foydalanuvchi topilmadi.");
    error.status = 404;
    throw error;
  }

  if (String(target._id) === String(viewerId)) {
    const error = new Error("O'zingiz bilan chat ochib bo'lmaydi.");
    error.status = 400;
    throw error;
  }

  let room = await ChatRoom.findOne({
    participants: { $all: [viewer._id, target._id], $size: 2 },
  }).populate("participants", "username fullName avatar bio followers following followersCount followingCount walletBalance createdAt");

  if (!room) {
    room = await ChatRoom.create({
      participants: [viewer._id, target._id],
      lastMessageText: "",
      lastMessageAt: new Date(),
    });
    room = await ChatRoom.findById(room._id).populate(
      "participants",
      "username fullName avatar bio followers following followersCount followingCount walletBalance createdAt"
    );
  }

  return room;
}

async function getChatRoomForUser(roomId, viewerId) {
  if (!isObjectId(roomId)) {
    return null;
  }

  if (DB_MODE === "json") {
    await loadJsonDb();
    const room = jsonPopulateChatRoom(
      jsonDb.chatRooms.find((entry) => String(entry._id) === String(roomId))
    );
    if (!room || !roomIncludesUser(room, viewerId)) {
      return null;
    }
    return room;
  }

  const room = await ChatRoom.findById(roomId).populate(
    "participants",
    "username fullName avatar bio followers following followersCount followingCount walletBalance createdAt"
  );
  if (!room || !roomIncludesUser(room, viewerId)) {
    return null;
  }
  return room;
}

async function markChatRoomRead(roomId, viewerId) {
  if (DB_MODE === "json") {
    await loadJsonDb();
    let changed = false;
    jsonDb.chatMessages.forEach((message) => {
      if (
        String(message.room) === String(roomId) &&
        String(message.sender) !== String(viewerId) &&
        !(message.readBy || []).some((entry) => String(entry) === String(viewerId))
      ) {
        message.readBy = [...new Set([...(message.readBy || []), String(viewerId)])];
        changed = true;
      }
    });
    if (changed) {
      await persistJsonDb();
    }
    return;
  }

  await ChatMessage.updateMany(
    {
      room: roomId,
      sender: { $ne: viewerId },
      readBy: { $nin: [viewerId] },
    },
    { $addToSet: { readBy: viewerId } }
  );
}

async function getChatMessagesForRoom(roomId, viewerId) {
  const room = await getChatRoomForUser(roomId, viewerId);
  if (!room) {
    const error = new Error("Chat xonasi topilmadi.");
    error.status = 404;
    throw error;
  }

  if (DB_MODE === "json") {
    await loadJsonDb();
    await markChatRoomRead(roomId, viewerId);
    return sortByDate(
      jsonDb.chatMessages.filter((message) => String(message.room) === String(roomId)),
      "createdAt",
      "asc"
    ).map((message) => serializeChatMessage(jsonPopulateChatMessage(message), viewerId));
  }

  await markChatRoomRead(roomId, viewerId);
  const messages = await ChatMessage.find({ room: roomId })
    .sort({ createdAt: 1 })
    .populate("sender", "username fullName avatar bio followers following followersCount followingCount walletBalance createdAt");

  return messages.map((message) => serializeChatMessage(message, viewerId));
}

async function getChatRoomsForUser(viewerId) {
  if (DB_MODE === "json") {
    await loadJsonDb();
    const rooms = sortByDate(
      jsonDb.chatRooms.filter((room) => roomIncludesUser(room, viewerId)),
      "lastMessageAt",
      "desc"
    ).map((room) => jsonPopulateChatRoom(room));

    return rooms.map((room) => {
      const unreadCount = jsonDb.chatMessages.filter(
        (message) =>
          String(message.room) === String(room._id) &&
          String(message.sender) !== String(viewerId) &&
          !(message.readBy || []).some((entry) => String(entry) === String(viewerId))
      ).length;
      return serializeChatRoom(room, viewerId, unreadCount);
    });
  }

  const rooms = await ChatRoom.find({ participants: viewerId })
    .sort({ lastMessageAt: -1 })
    .populate("participants", "username fullName avatar bio followers following followersCount followingCount walletBalance createdAt");

  const payload = [];
  for (const room of rooms) {
    const unreadCount = await ChatMessage.countDocuments({
      room: room._id,
      sender: { $ne: viewerId },
      readBy: { $nin: [viewerId] },
    });
    payload.push(serializeChatRoom(room, viewerId, unreadCount));
  }
  return payload;
}

async function createChatMessageForRoom(roomId, senderId, rawText) {
  const text = sanitizeMultiline(rawText, 1200);
  if (!text) {
    const error = new Error("Xabar matnini kiriting.");
    error.status = 400;
    throw error;
  }

  const room = await getChatRoomForUser(roomId, senderId);
  if (!room) {
    const error = new Error("Chat xonasi topilmadi.");
    error.status = 404;
    throw error;
  }

  if (DB_MODE === "json") {
    await loadJsonDb();
    const message = {
      _id: generateId(),
      room: String(roomId),
      sender: String(senderId),
      text,
      readBy: [String(senderId)],
      createdAt: new Date().toISOString(),
    };
    jsonDb.chatMessages.push(message);
    const sourceRoom = jsonDb.chatRooms.find((entry) => String(entry._id) === String(roomId));
    if (sourceRoom) {
      sourceRoom.lastMessageText = text;
      sourceRoom.lastMessageAt = message.createdAt;
    }
    await persistJsonDb();
    return {
      room: jsonPopulateChatRoom(sourceRoom || room),
      message: serializeChatMessage(jsonPopulateChatMessage(message), senderId),
    };
  }

  const message = await ChatMessage.create({
    room: roomId,
    sender: senderId,
    text,
    readBy: [senderId],
  });

  await ChatRoom.updateOne(
    { _id: roomId },
    {
      $set: {
        lastMessageText: text,
        lastMessageAt: message.createdAt,
      },
    }
  );

  const savedMessage = await ChatMessage.findById(message._id).populate(
    "sender",
    "username fullName avatar bio followers following followersCount followingCount walletBalance createdAt"
  );
  const populatedRoom = await ChatRoom.findById(roomId).populate(
    "participants",
    "username fullName avatar bio followers following followersCount followingCount walletBalance createdAt"
  );

  return {
    room: populatedRoom,
    message: serializeChatMessage(savedMessage, senderId),
  };
}

function buildCommentTree(comments, viewerId) {
  const map = new Map();
  const roots = [];

  comments.forEach((comment) => {
    map.set(String(comment._id), {
      ...serializeComment(comment, viewerId),
      replies: [],
    });
  });

  comments.forEach((comment) => {
    const id = String(comment._id);
    const parentId = comment.parentComment ? String(comment.parentComment) : null;
    const node = map.get(id);

    if (parentId && map.has(parentId)) {
      map.get(parentId).replies.push(node);
      return;
    }

    roots.push(node);
  });

  return roots;
}

function collectCommentThreadIds(comments, seedIds) {
  const ids = new Set([...seedIds].map((entry) => String(entry)));
  let changed = true;

  while (changed) {
    changed = false;
    comments.forEach((comment) => {
      if (
        comment.parentComment &&
        ids.has(String(comment.parentComment)) &&
        !ids.has(String(comment._id || comment.id))
      ) {
        ids.add(String(comment._id || comment.id));
        changed = true;
      }
    });
  }

  return ids;
}

function makeAdPayload(ad, postId) {
  if (!ad || !postId) {
    return null;
  }

  const source = ad.toObject ? ad.toObject() : ad;
  return {
    id: String(source._id || source.id),
    postId: String(postId),
    title: source.title,
    image: source.image,
    text: source.text,
    ctaText: source.ctaText,
    ctaLink: source.ctaLink,
    placementKey: makePlacementKey(postId, String(source._id || source.id)),
  };
}

function generateId() {
  return new mongoose.Types.ObjectId().toString();
}

function sortByDate(items, field = "createdAt", direction = "desc") {
  const factor = direction === "asc" ? 1 : -1;
  return [...items].sort(
    (left, right) => (new Date(left[field]).getTime() - new Date(right[field]).getTime()) * factor
  );
}

function createEmptyJsonDb() {
  return {
    users: [],
    posts: [],
    comments: [],
    ads: [],
    chatRooms: [],
    chatMessages: [],
    meta: {
      mode: "json",
      updatedAt: new Date().toISOString(),
    },
  };
}

async function persistJsonDb() {
  if (!jsonDb) {
    return;
  }

  jsonDb.meta = {
    ...(jsonDb.meta || {}),
    mode: "json",
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(JSON_DB_PATH, `${JSON.stringify(jsonDb, null, 2)}\n`, "utf8");
}

function jsonFindUserById(id) {
  return jsonDb.users.find((user) => String(user._id) === String(id)) || null;
}

function jsonFindPostById(id) {
  return jsonDb.posts.find((post) => String(post._id) === String(id)) || null;
}

function jsonFindCommentById(id) {
  return jsonDb.comments.find((comment) => String(comment._id) === String(id)) || null;
}

function jsonFindAdById(id) {
  return jsonDb.ads.find((ad) => String(ad._id) === String(id) && ad.isActive) || null;
}

function jsonPopulatePost(post) {
  if (!post) {
    return null;
  }

  return {
    ...post,
    author: jsonFindUserById(post.author),
  };
}

function jsonPopulateComment(comment) {
  if (!comment) {
    return null;
  }

  return {
    ...comment,
    author: jsonFindUserById(comment.author),
  };
}

async function seedJsonDbIfNeeded() {
  jsonDb.chatRooms = Array.isArray(jsonDb.chatRooms) ? jsonDb.chatRooms : [];
  jsonDb.chatMessages = Array.isArray(jsonDb.chatMessages) ? jsonDb.chatMessages : [];

  if (jsonDb.ads.length === 0) {
    jsonDb.ads = DEFAULT_ADS.map((ad) => ({
      _id: generateId(),
      ...ad,
      createdAt: new Date().toISOString(),
    }));
  }

  if (jsonDb.users.length > 0 || jsonDb.posts.length > 0) {
    jsonDb.users = jsonDb.users.map((user) => {
      const normalizedUser = {
        followers: [],
        following: [],
        followersCount: 0,
        followingCount: 0,
        isAdmin: false,
        isBlocked: false,
        ...user,
      };
      normalizedUser.followers = Array.isArray(normalizedUser.followers)
        ? normalizedUser.followers
        : [];
      normalizedUser.following = Array.isArray(normalizedUser.following)
        ? normalizedUser.following
        : [];
      computeCounts(normalizedUser);
      return normalizedUser;
    });

    if (!jsonDb.users.some((user) => user.isAdmin)) {
      const passwordHash = await bcrypt.hash("admin123", 10);
      jsonDb.users.push({
        _id: generateId(),
        username: "admin",
        fullName: "Platform Admin",
        email: "admin@nexa.uz",
        passwordHash,
        bio: "Platforma nazorati, statistika va moderatsiya.",
        avatar:
          "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=80",
        followers: [],
        following: [],
        followersCount: 0,
        followingCount: 0,
        isAdmin: true,
        isBlocked: false,
        walletBalance: 0,
        createdAt: new Date().toISOString(),
      });
    }

    if (jsonDb.chatRooms.length === 0 && jsonDb.users.length >= 2) {
      const [firstUser, secondUser] = jsonDb.users;
      const roomId = generateId();
      jsonDb.chatRooms.push({
        _id: roomId,
        participants: [String(firstUser._id), String(secondUser._id)],
        lastMessageText: "Assalomu alaykum, yangi platforma juda chiroyli chiqibdi.",
        lastMessageAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      jsonDb.chatMessages.push({
        _id: generateId(),
        room: roomId,
        sender: String(firstUser._id),
        text: "Assalomu alaykum, yangi platforma juda chiroyli chiqibdi.",
        readBy: [String(firstUser._id), String(secondUser._id)],
        createdAt: new Date().toISOString(),
      });
    }

    await persistJsonDb();
    return;
  }

  const demoPasswordHash = await bcrypt.hash("demo123", 10);
  const demoUser = {
    _id: generateId(),
    username: "demo",
    fullName: "Demo Foydalanuvchi",
    email: "demo@nexa.uz",
    passwordHash: demoPasswordHash,
    bio: "NEXA demo profili. Edit paytida UI va oqimlarni ko'rish uchun.",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80",
    followers: [],
    following: [],
    followersCount: 0,
    followingCount: 0,
    isAdmin: false,
    isBlocked: false,
    walletBalance: 0.0125,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
  };
  const azizaUser = {
    _id: generateId(),
    username: "aziza",
    fullName: "Aziza Nur",
    email: "aziza@nexa.uz",
    passwordHash: demoPasswordHash,
    bio: "Minimal kadrlar, sayohat va kundalik ilhom.",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80",
    followers: [],
    following: [],
    followersCount: 0,
    followingCount: 0,
    isAdmin: false,
    isBlocked: false,
    walletBalance: 0.026,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 18).toISOString(),
  };
  const sardorUser = {
    _id: generateId(),
    username: "sardor",
    fullName: "Sardor Karim",
    email: "sardor@nexa.uz",
    passwordHash: demoPasswordHash,
    bio: "Shahar ritmi, coffee spotlar va street-photo.",
    avatar:
      "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80",
    followers: [],
    following: [],
    followersCount: 0,
    followingCount: 0,
    isAdmin: false,
    isBlocked: false,
    walletBalance: 0.0185,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
  };
  const adminUser = {
    _id: generateId(),
    username: "admin",
    fullName: "Platform Admin",
    email: "admin@nexa.uz",
    passwordHash: demoPasswordHash,
    bio: "Platforma nazorati, statistika va moderatsiya.",
    avatar:
      "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=80",
    followers: [],
    following: [],
    followersCount: 0,
    followingCount: 0,
    isAdmin: true,
    isBlocked: false,
    walletBalance: 0,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
  };

  demoUser.following = [azizaUser._id, sardorUser._id];
  azizaUser.followers = [demoUser._id, sardorUser._id];
  azizaUser.following = [demoUser._id];
  sardorUser.followers = [demoUser._id];
  sardorUser.following = [azizaUser._id];
  demoUser.followers = [azizaUser._id];

  for (const user of [demoUser, azizaUser, sardorUser, adminUser]) {
    user.followersCount = user.followers.length;
    user.followingCount = user.following.length;
  }

  jsonDb.users = [demoUser, azizaUser, sardorUser, adminUser];

  const post1 = {
    _id: generateId(),
    author: azizaUser._id,
    caption: "Tonggi yorug'lik bilan eski shahar ko'chalari yanada chiroyli ko'rinadi.",
    images: [
      "https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80",
    ],
    tags: ["toshkent", "tong", "sayohat"],
    likesCount: 21,
    likedBy: [demoUser._id],
    commentsCount: 2,
    adViewsCount: 37,
    adRevenue: roundMoney(37 * MONEY_STEP),
    createdAt: new Date(Date.now() - 1000 * 60 * 65).toISOString(),
  };
  const post2 = {
    _id: generateId(),
    author: sardorUser._id,
    caption: "Bugungi coffee stop. Yorug'lik, faktura va jimjit vibe.",
    images: [
      "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80",
    ],
    tags: ["coffee", "city", "minimal"],
    likesCount: 15,
    likedBy: [],
    commentsCount: 1,
    adViewsCount: 24,
    adRevenue: roundMoney(24 * MONEY_STEP),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  };
  const post3 = {
    _id: generateId(),
    author: demoUser._id,
    caption: "Edit vaqtida feed ko'rinishi uchun test post. UI o'zgarishlarini shu yerda tez ko'rishingiz mumkin.",
    images: [
      "https://images.unsplash.com/photo-1526045431048-f857369baa09?auto=format&fit=crop&w=1200&q=80",
    ],
    tags: ["demo", "ui", "test"],
    likesCount: 8,
    likedBy: [azizaUser._id, sardorUser._id],
    commentsCount: 2,
    adViewsCount: 11,
    adRevenue: roundMoney(11 * MONEY_STEP),
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  };

  jsonDb.posts = [post1, post2, post3];
  jsonDb.comments = [
    {
      _id: generateId(),
      post: post1._id,
      author: demoUser._id,
      text: "Kompozitsiya juda toza chiqibdi.",
      likesCount: 2,
      likedBy: [azizaUser._id],
      parentComment: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    },
    {
      _id: generateId(),
      post: post1._id,
      author: azizaUser._id,
      text: "Rahmat, tongda olish eng yoqqan paytim.",
      likesCount: 1,
      likedBy: [],
      parentComment: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
    },
    {
      _id: generateId(),
      post: post2._id,
      author: demoUser._id,
      text: "Bu joy qayerda? Juda yoqimli ekan.",
      likesCount: 0,
      likedBy: [],
      parentComment: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    },
    {
      _id: generateId(),
      post: post3._id,
      author: azizaUser._id,
      text: "Fallback rejim uchun zo'r ko'rinmoqda.",
      likesCount: 1,
      likedBy: [demoUser._id],
      parentComment: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    },
    {
      _id: generateId(),
      post: post3._id,
      author: sardorUser._id,
      text: "Ha, endi Mongo bo'lmasa ham preview qilsa bo'ladi.",
      likesCount: 0,
      likedBy: [],
      parentComment: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    },
  ];

  const demoRoomId = generateId();
  jsonDb.chatRooms = [
    {
      _id: demoRoomId,
      participants: [String(demoUser._id), String(azizaUser._id)],
      lastMessageText: "Bugungi kadrlar juda yorqin chiqibdi.",
      lastMessageAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 70).toISOString(),
    },
  ];
  jsonDb.chatMessages = [
    {
      _id: generateId(),
      room: demoRoomId,
      sender: String(demoUser._id),
      text: "Salom, bugungi postlaringiz juda yoqdi.",
      readBy: [String(demoUser._id), String(azizaUser._id)],
      createdAt: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
    },
    {
      _id: generateId(),
      room: demoRoomId,
      sender: String(azizaUser._id),
      text: "Rahmat, kechki yorug'lik juda yaxshi tushdi.",
      readBy: [String(demoUser._id), String(azizaUser._id)],
      createdAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    },
    {
      _id: generateId(),
      room: demoRoomId,
      sender: String(demoUser._id),
      text: "Bugungi kadrlar juda yorqin chiqibdi.",
      readBy: [String(demoUser._id)],
      createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
    },
  ];

  await persistJsonDb();
}

async function loadJsonDb() {
  if (jsonDb) {
    return jsonDb;
  }

  try {
    const raw = await fs.readFile(JSON_DB_PATH, "utf8");
    jsonDb = JSON.parse(raw);
  } catch (error) {
    jsonDb = createEmptyJsonDb();
  }

  jsonDb.users = Array.isArray(jsonDb.users) ? jsonDb.users : [];
  jsonDb.posts = Array.isArray(jsonDb.posts) ? jsonDb.posts : [];
  jsonDb.comments = Array.isArray(jsonDb.comments) ? jsonDb.comments : [];
  jsonDb.ads = Array.isArray(jsonDb.ads) ? jsonDb.ads : [];
  jsonDb.chatRooms = Array.isArray(jsonDb.chatRooms) ? jsonDb.chatRooms : [];
  jsonDb.chatMessages = Array.isArray(jsonDb.chatMessages) ? jsonDb.chatMessages : [];

  await seedJsonDbIfNeeded();
  return jsonDb;
}

function extensionFromMimeType(mimetype = "") {
  if (mimetype.includes("png")) {
    return "png";
  }
  if (mimetype.includes("webp")) {
    return "webp";
  }
  if (mimetype.includes("gif")) {
    return "gif";
  }
  return "jpg";
}

async function uploadLocalFile(file, folder) {
  const folderName = folder.split("/").pop() || "misc";
  const uploadDir = path.join(UPLOADS_ROOT, folderName);
  const extension = extensionFromMimeType(file.mimetype);
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${extension}`;
  const absolutePath = path.join(uploadDir, fileName);

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(absolutePath, file.buffer);

  return {
    secure_url: `/uploads/${folderName}/${fileName}`,
  };
}

async function uploadImage(file, folder, extraOptions = {}) {
  if (!CLOUDINARY_READY) {
    return uploadLocalFile(file, folder);
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        transformation: [
          {
            width: extraOptions.width || 1600,
            crop: "limit",
            quality: "auto:good",
            fetch_format: "auto",
          },
        ],
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }
    );

    uploadStream.end(file.buffer);
  });
}

async function seedAdsIfNeeded() {
  if (DB_MODE === "json") {
    await loadJsonDb();
    return;
  }

  const adCount = await Ad.countDocuments();

  if (adCount > 0) {
    return;
  }

  await Ad.insertMany(DEFAULT_ADS);
}

async function seedAdminIfNeeded() {
  if (DB_MODE === "json") {
    await loadJsonDb();
    return;
  }

  const existingAdmin = await User.findOne({ isAdmin: true }).lean();
  if (existingAdmin) {
    return;
  }

  const passwordHash = await bcrypt.hash("admin123", 10);
  await User.create({
    username: "admin",
    fullName: "Platform Admin",
    email: "admin@nexa.uz",
    passwordHash,
    bio: "Platforma nazorati, statistika va moderatsiya.",
    isAdmin: true,
  });
}

function buildCommentsPreviewJson(postIds, viewerId) {
  const previews = {};
  const postIdSet = new Set(postIds.map((id) => String(id)));
  const previewDocs = sortByDate(
    jsonDb.comments.filter(
      (comment) => postIdSet.has(String(comment.post)) && comment.parentComment === null
    )
  );

  previewDocs.forEach((comment) => {
    const key = String(comment.post);
    if (!previews[key]) {
      previews[key] = [];
    }
    if (previews[key].length < 2) {
      previews[key].push(serializeComment(jsonPopulateComment(comment), viewerId));
    }
  });

  return previews;
}

async function buildCommentsPreview(postIds, viewerId) {
  if (!postIds.length) {
    return {};
  }

  const previewDocs = await Comment.find({
    post: { $in: postIds },
    parentComment: null,
  })
    .sort({ createdAt: -1 })
    .populate("author", "username fullName avatar bio followersCount followingCount walletBalance createdAt")
    .lean();

  const previews = {};

  previewDocs.forEach((doc) => {
    const key = String(doc.post);
    if (!previews[key]) {
      previews[key] = [];
    }
    if (previews[key].length < 2) {
      previews[key].push(serializeComment(doc, viewerId));
    }
  });

  return previews;
}

function computeRecommendationScore(post, now) {
  const ageHours = Math.max(1, (now - new Date(post.createdAt).getTime()) / 3600000);
  const recencyBoost = Math.max(0, 72 - ageHours) / 8;
  const engagementBoost =
    (post.likesCount || 0) * 0.65 +
    (post.commentsCount || 0) * 0.9 +
    (post.adViewsCount || 0) * 0.08;
  const randomBoost = Math.random() * 7;
  return recencyBoost + engagementBoost + randomBoost;
}

function createFeedItems(posts, ads, viewerId, previews) {
  const now = Date.now();
  const orderedPosts = [...posts]
    .map((post) => ({
      post,
      score: computeRecommendationScore(post, now),
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.post);

  const feed = [];

  orderedPosts.forEach((post, index) => {
    const postId = String(post._id);
    const item = {
      type: "post",
      post: serializePost(post, viewerId, previews),
      adAbove: null,
      adBelow: null,
    };

    if (ads.length && (index === 0 || (index % 4 === 0 && Math.random() > 0.45))) {
      item.adAbove = makeAdPayload(randomItem(ads), postId);
    }

    if (ads.length && index % 3 === 2) {
      feed.push({
        type: "ad",
        ad: makeAdPayload(randomItem(ads), postId),
      });
    }

    if (ads.length && Math.random() > 0.62) {
      item.adBelow = makeAdPayload(randomItem(ads), postId);
    }

    feed.push(item);
  });

  return feed;
}

async function fetchPostWithAuthor(postId) {
  if (DB_MODE === "json") {
    await loadJsonDb();
    const post = jsonPopulatePost(jsonFindPostById(postId));
    if (!post || post.author?.isBlocked) {
      return null;
    }
    return post;
  }

  return Post.findById(postId).populate(
    "author",
    "username fullName avatar bio followers followersCount followingCount walletBalance isAdmin isBlocked createdAt"
  );
}

async function fetchPublicProfile(username) {
  if (DB_MODE === "json") {
    await loadJsonDb();
    const user = jsonDb.users.find((entry) => entry.username === username) || null;
    if (!user || user.isBlocked) {
      return null;
    }
    const posts = sortByDate(
      jsonDb.posts.filter((post) => String(post.author) === String(user._id))
    ).map((post) => jsonPopulatePost(post));
    return { user, posts };
  }

  const user = await User.findOne({ username });
  if (!user || user.isBlocked) {
    return null;
  }
  const posts = await Post.find({ author: user._id })
    .sort({ createdAt: -1 })
    .populate("author", "username fullName avatar followers followersCount followingCount createdAt");
  return { user, posts };
}

async function searchPostsAndUsers(rawQuery, viewerId) {
  const query = sanitizeText(rawQuery, 120);
  const tokens = tokenizeSearchQuery(query);

  if (!tokens.length) {
    return {
      query,
      posts: [],
      users: [],
    };
  }

  if (DB_MODE === "json") {
    await loadJsonDb();

    const users = jsonDb.users
      .filter((user) => !user.isBlocked)
      .filter((user) => matchesAllTokens(buildUserSearchHaystack(user), tokens))
      .slice(0, 8);

    const posts = sortByDate(jsonDb.posts)
      .map((post) => jsonPopulatePost(post))
      .filter((post) => post.author && !post.author.isBlocked)
      .filter((post) => matchesAllTokens(buildPostSearchHaystack(post), tokens))
      .slice(0, 24);

    const previews = buildCommentsPreviewJson(
      posts.map((post) => post._id),
      viewerId
    );

    return {
      query,
      posts: posts.map((post) => serializePost(post, viewerId, previews)),
      users: users.map((user) => serializeUser(user, { viewerId })),
    };
  }

  const regex = new RegExp(tokens.map(escapeRegex).join("|"), "i");
  const matchedUsers = await User.find({
    isBlocked: { $ne: true },
    $or: [{ username: regex }, { fullName: regex }, { bio: regex }],
  })
    .sort({ followersCount: -1, createdAt: -1 })
    .limit(8);

  const matchedUserIds = matchedUsers.map((user) => user._id);
  const posts = await Post.find({
    $or: [{ caption: regex }, { tags: regex }, { author: { $in: matchedUserIds } }],
  })
    .sort({ createdAt: -1 })
    .limit(36)
    .populate("author", "username fullName avatar bio followers following followersCount followingCount walletBalance isBlocked createdAt");

  const filteredPosts = posts
    .filter((post) => post.author && !post.author.isBlocked)
    .filter((post) => matchesAllTokens(buildPostSearchHaystack(post), tokens))
    .slice(0, 24);

  const previews = await buildCommentsPreview(
    filteredPosts.map((post) => post._id),
    viewerId
  );

  const users = matchedUsers
    .filter((user) => matchesAllTokens(buildUserSearchHaystack(user), tokens))
    .map((user) => serializeUser(user, { viewerId }));

  return {
    query,
    posts: filteredPosts.map((post) => serializePost(post, viewerId, previews)),
    users,
  };
}

function extractKeywords(text = "", tags = []) {
  const rawWords = `${tags.join(" ")} ${text}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s#-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);

  return [...new Set([...tags, ...rawWords])].slice(0, 16);
}

function absoluteUrl(urlPath = "/") {
  if (/^https?:\/\//i.test(urlPath)) {
    return urlPath;
  }
  return `${SITE_URL}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}`;
}

function renderMetaTags({
  title,
  description,
  canonical,
  image = "/media/logo.png",
  type = "website",
  keywords = [],
  structuredData = null,
}) {
  return `
    <title>${escapeHtmlServer(title)}</title>
    <meta name="description" content="${escapeHtmlServer(description)}">
    <meta name="keywords" content="${escapeHtmlServer(keywords.join(", "))}">
    <link rel="canonical" href="${escapeHtmlServer(canonical)}">
    <link rel="icon" type="image/png" sizes="500x500" href="/media/logo.png">
    <link rel="apple-touch-icon" href="/media/logo.png">
    <link rel="manifest" href="/manifest.webmanifest">
    <meta property="og:type" content="${escapeHtmlServer(type)}">
    <meta property="og:title" content="${escapeHtmlServer(title)}">
    <meta property="og:description" content="${escapeHtmlServer(description)}">
    <meta property="og:url" content="${escapeHtmlServer(canonical)}">
    <meta property="og:image" content="${escapeHtmlServer(absoluteUrl(image))}">
    <meta property="og:site_name" content="NEXA">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtmlServer(title)}">
    <meta name="twitter:description" content="${escapeHtmlServer(description)}">
    <meta name="twitter:image" content="${escapeHtmlServer(absoluteUrl(image))}">
    ${GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${escapeHtmlServer(GOOGLE_SITE_VERIFICATION)}">` : ""}
    ${BING_SITE_VERIFICATION ? `<meta name="msvalidate.01" content="${escapeHtmlServer(BING_SITE_VERIFICATION)}">` : ""}
    ${
      structuredData
        ? `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`
        : ""
    }
  `;
}

function renderStaticShell({
  pageTitle,
  pageDescription,
  canonical,
  keywords,
  image,
  bodyPage,
  subtitle,
  mainContent,
  structuredData,
  afterMainContent = "",
}) {
  return `<!DOCTYPE html>
<html lang="uz">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${renderMetaTags({
      title: pageTitle,
      description: pageDescription,
      canonical,
      image,
      keywords,
      structuredData,
    })}
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css" rel="stylesheet">
    <link href="/assets/style.css" rel="stylesheet">
  </head>
  <body data-page="${escapeHtmlServer(bodyPage)}">
    <div class="app-shell">
      <header class="topbar glass-panel">
        <a class="brand" href="/">
          <span class="brand-mark"><img src="/media/logo.png" alt="NEXA logo"></span>
          <span class="brand-copy">
            <span>NEXA</span>
            <small>${escapeHtmlServer(subtitle)}</small>
          </span>
        </a>
        <div class="topbar-actions" id="topbarActions"></div>
      </header>
      <main class="page-wrap">
        ${mainContent}
      </main>
    </div>
    ${afterMainContent}
    <nav class="mobile-nav glass-panel" id="mobileNav"></nav>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
    <script src="/assets/app.js"></script>
  </body>
</html>`;
}

function renderPostSeoContent(post) {
  const authorName = escapeHtmlServer(post.author?.fullName || post.author?.username || "NEXA");
  const authorUsername = escapeHtmlServer(post.author?.username || "user");
  const images = Array.isArray(post.images) ? post.images : [];
  const tags = Array.isArray(post.tags) ? post.tags : [];

  return `
    <section id="postView">
      <article class="feed-card">
        <div class="feed-card-head">
          <div class="author-row">
            <a href="/u/${authorUsername}" class="author-row">
              <span class="avatar">${post.author?.avatar ? `<img src="${escapeHtmlServer(post.author.avatar)}" alt="${authorName}">` : escapeHtmlServer(buildAvatarPlaceholder(post.author?.fullName || post.author?.username || "U"))}</span>
              <div class="author-meta">
                <div class="author-name">${authorName}</div>
                <div class="author-sub">@${authorUsername} · ${escapeHtmlServer(new Date(post.createdAt).toLocaleDateString("uz-UZ"))}</div>
              </div>
            </a>
          </div>
          ${
            images[0]
              ? `<div class="post-gallery"><div class="gallery-single"><img src="${escapeHtmlServer(images[0])}" alt="${escapeHtmlServer(post.caption || "NEXA post")}"></div></div>`
              : ""
          }
        </div>
        <div class="feed-card-body">
          <p class="post-caption">${nl2brServer(post.caption || "")}</p>
          ${
            tags.length
              ? `<div class="tag-row">${tags
                  .map((tag) => `<span class="tag-pill">#${escapeHtmlServer(tag)}</span>`)
                  .join("")}</div>`
              : ""
          }
        </div>
      </article>
    </section>
    <section class="profile-card">
      <div class="section-title"><h2>Izohlar</h2></div>
      <div class="reply-indicator" id="inlineReplyIndicator"></div>
      <form id="postCommentForm" class="form-stack" data-comment-form data-context="inline">
        <textarea class="form-control" rows="3" placeholder="Izoh yozing..."></textarea>
        <button class="primary-btn" type="submit">Yuborish</button>
      </form>
      <div class="feed-stack mt-4" id="inlineCommentsList">
        <div class="loading-state">Izohlar yuklanmoqda...</div>
      </div>
    </section>
  `;
}

function renderProfileSeoContent(user, posts) {
  const stats = {
    postsCount: posts.length,
    likesTotal: posts.reduce((sum, post) => sum + (post.likesCount || 0), 0),
    adViewsTotal: posts.reduce((sum, post) => sum + (post.adViewsCount || 0), 0),
  };

  return `
    <section class="profile-hero" id="profileHero">
      <div class="profile-card">
        <div class="profile-head">
          <span class="avatar-xl">${user.avatar ? `<img src="${escapeHtmlServer(user.avatar)}" alt="${escapeHtmlServer(user.fullName)}">` : escapeHtmlServer(buildAvatarPlaceholder(user.fullName || user.username))}</span>
          <div class="author-meta">
            <div class="eyebrow"><i class="fa-solid fa-user-group"></i> Profil</div>
            <h1 class="display-title" style="font-size:2.2rem;">${escapeHtmlServer(user.fullName)}</h1>
            <div class="author-sub">@${escapeHtmlServer(user.username)}</div>
          </div>
        </div>
        <p class="profile-bio mt-3">${escapeHtmlServer(user.bio || "")}</p>
        <div class="profile-stats mt-3">
          <div class="stat-chip"><strong>${stats.postsCount}</strong><span class="mini-meta">Post</span></div>
          <div class="stat-chip"><strong>${user.followersCount || 0}</strong><span class="mini-meta">Obunachi</span></div>
          <div class="stat-chip"><strong>${stats.likesTotal}</strong><span class="mini-meta">Layklar</span></div>
        </div>
      </div>
    </section>
    <section class="profile-card" id="profilePosts">
      ${
        posts.length
          ? `<div class="section-title"><h2>Foto postlar</h2><span class="helper-text">${posts.length} ta</span></div>
             <div class="posts-grid">
               ${posts
                 .map(
                   (post) => `
                     <a class="grid-post" href="/post/${escapeHtmlServer(String(post._id || post.id))}">
                       <img src="${escapeHtmlServer(post.images?.[0] || "/media/logo.png")}" alt="${escapeHtmlServer(post.caption || "Post rasmi")}">
                       <div class="grid-post-meta"><div><i class="fa-regular fa-heart"></i> ${post.likesCount || 0}</div></div>
                     </a>
                   `
                 )
                 .join("")}
             </div>`
          : `<div class="empty-state">Bu profil hali post joylamagan.</div>`
      }
    </section>
  `;
}

function renderHomeSeoContent() {
  return `
    <section class="hero-card">
      <span class="eyebrow"><i class="fa-solid fa-wand-magic-sparkles"></i> Tavsiya etiladi</span>
      <h1 class="display-title">NEXA uchun premium foto feed</h1>
      <p class="hero-text">
        Yangi kadrlar, yangi tartib, yangi ilhom. Har safar sahifa yangilanganda tavsiyalar ham yangilanadi.
      </p>
      <form class="hero-actions mt-3" id="feedSearchForm">
        <div class="search-shell">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input class="search-input" id="feedSearchInput" type="search" name="q" placeholder="Post, hashtag yoki profil qidiring">
        </div>
        <button class="primary-btn" type="submit">
          <i class="fa-solid fa-compass"></i>
          <span>Qidirish</span>
        </button>
        <button class="ghost-link" id="refreshFeedButton" type="button">
          <i class="fa-solid fa-rotate"></i>
          <span>Yangilash</span>
        </button>
      </form>
      <div class="metric-row mt-4" id="homeHeroMeta">
        <div class="metric-pill">
          <strong>...</strong>
          <span class="mini-meta">Yangi tavsiya</span>
        </div>
        <div class="metric-pill">
          <strong>...</strong>
          <span class="mini-meta">Faol reklama</span>
        </div>
        <div class="metric-pill">
          <strong>1-5</strong>
          <span class="mini-meta">Foto galereya</span>
        </div>
      </div>
    </section>

    <div class="page-grid">
      <section>
        <div id="searchProfiles"></div>
        <div class="section-title">
          <h2 id="feedSectionTitle">Bosh sahifa</h2>
          <span class="helper-text" id="feedSectionMeta">Har kirishda yangi tartib</span>
        </div>
        <div class="feed-stack" id="feedContainer"></div>
      </section>

      <aside class="desktop-only" id="desktopQuickLinks">
        <div class="panel-card">
          <div class="section-title">
            <h3>Yuklanmoqda...</h3>
          </div>
        </div>
      </aside>
    </div>
  `;
}

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, async () => {
    try {
      const sessionData = socket.request.session;
      if (!sessionData?.userId) {
        next(new Error("auth"));
        return;
      }

      const user = await fetchUserById(sessionData.userId);
      if (!user || user.isBlocked) {
        next(new Error("auth"));
        return;
      }

      socket.userId = String(sessionData.userId);
      next();
    } catch (error) {
      next(error);
    }
  });
});

io.on("connection", async (socket) => {
  try {
    socket.join(`user:${socket.userId}`);
    const rooms = await getChatRoomsForUser(socket.userId);
    rooms.forEach((room) => {
      socket.join(`chat:${room.id}`);
    });
  } catch (error) {
    socket.emit("chat:error", { message: "Chat ulanishi to'liq tayyor bo'lmadi." });
  }

  socket.on("chat:join", async (payload = {}) => {
    try {
      const room = await getChatRoomForUser(payload.roomId, socket.userId);
      if (!room) {
        socket.emit("chat:error", { message: "Chat xonasi topilmadi." });
        return;
      }

      socket.join(`chat:${String(room._id || room.id)}`);
    } catch (error) {
      socket.emit("chat:error", { message: error.message || "Chat xonasiga ulanib bo'lmadi." });
    }
  });

  socket.on("chat:send", async (payload = {}) => {
    try {
      const result = await createChatMessageForRoom(payload.roomId, socket.userId, payload.text);
      const participantIds = roomParticipantIds(result.room);
      const roomId = String(result.room._id || result.room.id);

      participantIds.forEach((participantId) => {
        io.to(`user:${participantId}`).emit("chat:room-updated", { roomId });
      });

      io.to(`chat:${roomId}`).emit("chat:new-message", {
        roomId,
        message: result.message,
      });
    } catch (error) {
      socket.emit("chat:error", { message: error.message || "Xabar yuborilmadi." });
    }
  });
});

async function deleteUserInJson(userId) {
  await loadJsonDb();
  const user = jsonFindUserById(userId);
  if (!user) {
    return null;
  }

  const postIdsToDelete = new Set(
    jsonDb.posts
      .filter((post) => String(post.author) === String(userId))
      .map((post) => String(post._id))
  );

  const seedCommentIds = jsonDb.comments
    .filter(
      (comment) =>
        String(comment.author) === String(userId) || postIdsToDelete.has(String(comment.post))
    )
    .map((comment) => String(comment._id));

  const commentsToDelete = collectCommentThreadIds(jsonDb.comments, seedCommentIds);
  const chatRoomIdsToDelete = new Set(
    jsonDb.chatRooms
      .filter((room) => roomIncludesUser(room, userId))
      .map((room) => String(room._id))
  );

  jsonDb.users = jsonDb.users
    .filter((entry) => String(entry._id) !== String(userId))
    .map((entry) => {
      entry.followers = (entry.followers || []).filter((id) => String(id) !== String(userId));
      entry.following = (entry.following || []).filter((id) => String(id) !== String(userId));
      computeCounts(entry);
      return entry;
    });

  jsonDb.posts = jsonDb.posts
    .filter((post) => !postIdsToDelete.has(String(post._id)))
    .map((post) => {
      post.likedBy = (post.likedBy || []).filter((id) => String(id) !== String(userId));
      post.likesCount = post.likedBy.length;
      return post;
    });

  jsonDb.comments = jsonDb.comments
    .filter(
      (comment) =>
        !postIdsToDelete.has(String(comment.post)) && !commentsToDelete.has(String(comment._id))
    )
    .map((comment) => {
      comment.likedBy = (comment.likedBy || []).filter((id) => String(id) !== String(userId));
      comment.likesCount = comment.likedBy.length;
      return comment;
    });

  jsonDb.chatRooms = jsonDb.chatRooms.filter(
    (room) => !chatRoomIdsToDelete.has(String(room._id))
  );
  jsonDb.chatMessages = jsonDb.chatMessages.filter(
    (message) => !chatRoomIdsToDelete.has(String(message.room))
  );

  jsonDb.posts = jsonDb.posts.map((post) => ({
    ...post,
    commentsCount: jsonDb.comments.filter((comment) => String(comment.post) === String(post._id)).length,
  }));

  await persistJsonDb();
  return user;
}

async function deleteUserInMongo(userId) {
  const user = await User.findById(userId);
  if (!user) {
    return null;
  }

  const [allUsers, allPosts, allComments] = await Promise.all([
    User.find({}).lean(),
    Post.find({}).lean(),
    Comment.find({}).lean(),
  ]);

  const postIdsToDelete = new Set(
    allPosts
      .filter((post) => String(post.author) === String(userId))
      .map((post) => String(post._id))
  );

  const seedCommentIds = allComments
    .filter(
      (comment) =>
        String(comment.author) === String(userId) || postIdsToDelete.has(String(comment.post))
    )
    .map((comment) => String(comment._id));

  const commentsToDelete = collectCommentThreadIds(allComments, seedCommentIds);
  const [allRooms, allChatMessages] = await Promise.all([
    ChatRoom.find({}).lean(),
    ChatMessage.find({}).lean(),
  ]);
  const chatRoomIdsToDelete = new Set(
    allRooms
      .filter((room) => roomIncludesUser(room, userId))
      .map((room) => String(room._id))
  );

  await Promise.all([
    Post.deleteMany({ _id: { $in: [...postIdsToDelete] } }),
    Comment.deleteMany({ _id: { $in: [...commentsToDelete] } }),
    ChatRoom.deleteMany({ _id: { $in: [...chatRoomIdsToDelete] } }),
    ChatMessage.deleteMany({ room: { $in: [...chatRoomIdsToDelete] } }),
    User.deleteOne({ _id: userId }),
    Post.updateMany({ likedBy: userId }, { $pull: { likedBy: userId } }),
    Comment.updateMany({ likedBy: userId }, { $pull: { likedBy: userId } }),
    User.updateMany({}, { $pull: { followers: userId, following: userId } }),
  ]);

  const remainingUsers = allUsers.filter((entry) => String(entry._id) !== String(userId));
  const remainingPosts = allPosts.filter((post) => !postIdsToDelete.has(String(post._id)));
  const remainingComments = allComments.filter(
    (comment) =>
      !postIdsToDelete.has(String(comment.post)) && !commentsToDelete.has(String(comment._id))
  );
  const remainingChatMessages = allChatMessages.filter(
    (message) => !chatRoomIdsToDelete.has(String(message.room))
  );

  const userOps = remainingUsers.map((entry) => {
    const followers = (entry.followers || []).filter((id) => String(id) !== String(userId));
    const following = (entry.following || []).filter((id) => String(id) !== String(userId));
    return {
      updateOne: {
        filter: { _id: entry._id },
        update: {
          $set: {
            followers,
            following,
            followersCount: followers.length,
            followingCount: following.length,
          },
        },
      },
    };
  });

  const postOps = remainingPosts.map((entry) => {
    const likedBy = (entry.likedBy || []).filter((id) => String(id) !== String(userId));
    const commentsCount = remainingComments.filter(
      (comment) => String(comment.post) === String(entry._id)
    ).length;

    return {
      updateOne: {
        filter: { _id: entry._id },
        update: {
          $set: {
            likedBy,
            likesCount: likedBy.length,
            commentsCount,
          },
        },
      },
    };
  });

  const commentOps = remainingComments.map((entry) => {
    const likedBy = (entry.likedBy || []).filter((id) => String(id) !== String(userId));
    return {
      updateOne: {
        filter: { _id: entry._id },
        update: {
          $set: {
            likedBy,
            likesCount: likedBy.length,
          },
        },
      },
    };
  });

  if (userOps.length) {
    await User.bulkWrite(userOps);
  }
  if (postOps.length) {
    await Post.bulkWrite(postOps);
  }
  if (commentOps.length) {
    await Comment.bulkWrite(commentOps);
  }

  const roomOps = allRooms
    .filter((room) => !chatRoomIdsToDelete.has(String(room._id)))
    .map((room) => {
      const roomMessages = remainingChatMessages
        .filter((message) => String(message.room) === String(room._id))
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
      const lastMessage = roomMessages[0];

      return {
        updateOne: {
          filter: { _id: room._id },
          update: {
            $set: {
              participants: roomParticipantIds(room).filter((entry) => entry !== String(userId)),
              lastMessageText: lastMessage?.text || "",
              lastMessageAt: lastMessage?.createdAt || room.createdAt,
            },
          },
        },
      };
    })
    .filter((entry) => entry.updateOne.update.$set.participants.length >= 2);

  if (roomOps.length) {
    await ChatRoom.bulkWrite(roomOps);
  }

  return user;
}

app.get("/api/auth/me", async (req, res, next) => {
  try {
    if (!req.session.userId) {
      res.json({ authenticated: false, user: null });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const user = jsonFindUserById(req.session.userId);
      if (!user || user.isBlocked) {
        req.session.destroy(() => {});
        res.json({ authenticated: false, user: null });
        return;
      }

      res.json({
        authenticated: true,
        user: serializeUser(user, { includePrivate: true, viewerId: req.session.userId }),
      });
      return;
    }

    const user = await User.findById(req.session.userId);
    if (!user || user.isBlocked) {
      req.session.destroy(() => {});
      res.json({ authenticated: false, user: null });
      return;
    }

    res.json({
      authenticated: true,
      user: serializeUser(user, { includePrivate: true, viewerId: req.session.userId }),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const fullName = sanitizeText(req.body.fullName, 60);
    const username = normalizeUsername(req.body.username);
    const email = sanitizeText(req.body.email, 120).toLowerCase();
    const password = String(req.body.password || "");

    if (!fullName || fullName.length < 3) {
      res.status(400).json({ message: "To'liq ism kamida 3 ta belgidan iborat bo'lsin." });
      return;
    }

    if (!isValidUsername(username)) {
      res.status(400).json({
        message:
          "Username 3-20 belgidan iborat bo'lsin va faqat harf, raqam, nuqta yoki pastki chiziq ishlating.",
      });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ message: "Email manzili noto'g'ri ko'rinmoqda." });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ message: "Parol kamida 6 ta belgidan iborat bo'lsin." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const existingUser = jsonDb.users.find(
        (user) => user.username === username || user.email === email
      );

      if (existingUser) {
        res.status(409).json({ message: "Bu username yoki email allaqachon ishlatilgan." });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = {
        _id: generateId(),
        username,
        fullName,
        email,
        passwordHash,
        bio: "",
        avatar: "",
        followers: [],
        following: [],
        followersCount: 0,
        followingCount: 0,
        isAdmin: false,
        isBlocked: false,
        walletBalance: 0,
        createdAt: new Date().toISOString(),
      };

      jsonDb.users.push(user);
      await persistJsonDb();

      req.session.userId = String(user._id);
      req.session.countedAdImpressions = [];

      res.status(201).json({
        message: "Hisob muvaffaqiyatli yaratildi.",
        user: serializeUser(user, { includePrivate: true, viewerId: user._id }),
      });
      return;
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    }).lean();

    if (existingUser) {
      res.status(409).json({ message: "Bu username yoki email allaqachon ishlatilgan." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username,
      fullName,
      email,
      passwordHash,
    });

    req.session.userId = String(user._id);
    req.session.countedAdImpressions = [];

    res.status(201).json({
      message: "Hisob muvaffaqiyatli yaratildi.",
      user: serializeUser(user, { includePrivate: true, viewerId: user._id }),
    });
  } catch (error) {
    if (error && error.code === 11000) {
      res.status(409).json({ message: "Bu username yoki email allaqachon ishlatilgan." });
      return;
    }
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const identifier = sanitizeText(
      req.body.identifier || req.body.email || req.body.username,
      120
    ).toLowerCase();
    const password = String(req.body.password || "");

    if (!identifier || !password) {
      res.status(400).json({ message: "Login uchun barcha maydonlarni to'ldiring." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const user =
        jsonDb.users.find((entry) => entry.email === identifier) ||
        jsonDb.users.find((entry) => entry.username === identifier);

      if (!user) {
        res.status(401).json({ message: "Login yoki parol noto'g'ri." });
        return;
      }

      if (user.isBlocked) {
        res.status(403).json({ message: "Hisobingiz vaqtincha cheklangan." });
        return;
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        res.status(401).json({ message: "Login yoki parol noto'g'ri." });
        return;
      }

      req.session.userId = String(user._id);
      ensureImpressionCache(req);

      res.json({
        message: "Xush kelibsiz!",
        user: serializeUser(user, { includePrivate: true, viewerId: user._id }),
      });
      return;
    }

    const user = await User.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    });

    if (!user) {
      res.status(401).json({ message: "Login yoki parol noto'g'ri." });
      return;
    }

    if (user.isBlocked) {
      res.status(403).json({ message: "Hisobingiz vaqtincha cheklangan." });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ message: "Login yoki parol noto'g'ri." });
      return;
    }

    req.session.userId = String(user._id);
    ensureImpressionCache(req);

    res.json({
      message: "Xush kelibsiz!",
      user: serializeUser(user, { includePrivate: true, viewerId: user._id }),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    res.clearCookie("connect.sid");
    res.json({ message: "Hisobdan chiqildi." });
  });
});

app.get("/api/posts/recommended", async (req, res, next) => {
  try {
    const viewerId = req.session.userId || null;

    if (DB_MODE === "json") {
      await loadJsonDb();
      const posts = sortByDate(jsonDb.posts)
        .filter((post) => {
          const author = jsonFindUserById(post.author);
          return author && !author.isBlocked;
        })
        .slice(0, 36)
        .map((post) => jsonPopulatePost(post));
      const ads = sortByDate(
        jsonDb.ads.filter((ad) => ad.isActive),
        "createdAt",
        "desc"
      ).slice(0, 12);
      const previews = buildCommentsPreviewJson(
        posts.map((post) => post._id),
        viewerId
      );
      const feed = createFeedItems(posts, ads, viewerId, previews);

      res.json({
        items: feed,
        empty: feed.length === 0,
      });
      return;
    }

    const posts = await Post.find({})
      .sort({ createdAt: -1 })
      .limit(36)
      .populate("author", "username fullName avatar bio followersCount followingCount walletBalance isBlocked createdAt");

    const visiblePosts = posts.filter((post) => post.author && !post.author.isBlocked);

    const ads = await Ad.find({ isActive: true }).sort({ createdAt: -1 }).limit(12);
    const previews = await buildCommentsPreview(
      visiblePosts.map((post) => post._id),
      viewerId
    );
    const feed = createFeedItems(visiblePosts, ads, viewerId, previews);

    res.json({
      items: feed,
      empty: feed.length === 0,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/search", async (req, res, next) => {
  try {
    const viewerId = req.session.userId || null;
    const results = await searchPostsAndUsers(req.query.q || "", viewerId);

    res.json({
      query: results.query,
      posts: results.posts,
      users: results.users,
      totals: {
        posts: results.posts.length,
        users: results.users.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/chat/users", requireAuth, async (req, res, next) => {
  try {
    const users = await searchChatUsers(req.query.q || "", req.session.userId);
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

app.get("/api/chat/rooms", requireAuth, async (req, res, next) => {
  try {
    const rooms = await getChatRoomsForUser(req.session.userId);
    res.json({ rooms });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/rooms", requireAuth, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body.username);
    if (!username) {
      res.status(400).json({ message: "Chat ochish uchun username kiriting." });
      return;
    }

    const room = await getOrCreateDirectRoom(req.session.userId, username);
    await markChatRoomRead(room._id || room.id, req.session.userId);

    res.status(201).json({
      message: "Chat tayyor.",
      room: serializeChatRoom(room, req.session.userId, 0),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/chat/rooms/:id/messages", requireAuth, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Chat xonasi topilmadi." });
      return;
    }

    const [room, messages] = await Promise.all([
      getChatRoomForUser(req.params.id, req.session.userId),
      getChatMessagesForRoom(req.params.id, req.session.userId),
    ]);

    if (!room) {
      res.status(404).json({ message: "Chat xonasi topilmadi." });
      return;
    }

    res.json({
      room: serializeChatRoom(room, req.session.userId, 0),
      messages,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/rooms/:id/messages", requireAuth, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Chat xonasi topilmadi." });
      return;
    }

    const result = await createChatMessageForRoom(
      req.params.id,
      req.session.userId,
      req.body.text
    );

    const participantIds = roomParticipantIds(result.room);
    const serializedRoom = serializeChatRoom(result.room, req.session.userId, 0);

    participantIds.forEach((participantId) => {
      io.to(`user:${participantId}`).emit("chat:room-updated", {
        roomId: serializedRoom.id,
      });
    });

    io.to(`chat:${serializedRoom.id}`).emit("chat:new-message", {
      roomId: serializedRoom.id,
      message: result.message,
    });

    res.status(201).json({
      message: "Xabar yuborildi.",
      room: serializedRoom,
      chatMessage: result.message,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/posts/:id", async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Post topilmadi." });
      return;
    }

    const viewerId = req.session.userId || null;

    if (DB_MODE === "json") {
      await loadJsonDb();
      const post = jsonPopulatePost(jsonFindPostById(req.params.id));

      if (!post || post.author?.isBlocked) {
        res.status(404).json({ message: "Post topilmadi." });
        return;
      }

      res.json({ post: serializePost(post, viewerId) });
      return;
    }

    const post = await Post.findById(req.params.id).populate(
      "author",
      "username fullName avatar bio followersCount followingCount walletBalance isBlocked createdAt"
    );

    if (!post || post.author?.isBlocked) {
      res.status(404).json({ message: "Post topilmadi." });
      return;
    }

    res.json({ post: serializePost(post, viewerId) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/posts", requireAuth, postUpload.array("images", MAX_IMAGES), async (req, res, next) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length < 1 || files.length > MAX_IMAGES) {
      res.status(400).json({ message: "1 tadan 5 tagacha rasm yuklang." });
      return;
    }

    const uploads = await Promise.all(files.map((file) => uploadImage(file, "nexa/posts")));

    const caption = sanitizeMultiline(req.body.caption, 1200);
    const tags = parseTags(req.body.tags);

    if (DB_MODE === "json") {
      await loadJsonDb();
      const post = {
        _id: generateId(),
        author: String(req.session.userId),
        caption,
        images: uploads.map((upload) => upload.secure_url),
        tags,
        likesCount: 0,
        likedBy: [],
        commentsCount: 0,
        adViewsCount: 0,
        adRevenue: 0,
        createdAt: new Date().toISOString(),
      };

      jsonDb.posts.unshift(post);
      await persistJsonDb();

      res.status(201).json({
        message: "Post joylandi.",
        post: serializePost(jsonPopulatePost(post), req.session.userId),
      });
      return;
    }

    const post = await Post.create({
      author: req.session.userId,
      caption,
      images: uploads.map((upload) => upload.secure_url),
      tags,
    });

    const createdPost = await Post.findById(post._id).populate(
      "author",
      "username fullName avatar bio followersCount followingCount walletBalance createdAt"
    );

    res.status(201).json({
      message: "Post joylandi.",
      post: serializePost(createdPost, req.session.userId),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/posts/:id/like", requireAuth, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Post topilmadi." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const post = jsonFindPostById(req.params.id);
      if (!post) {
        res.status(404).json({ message: "Post topilmadi." });
        return;
      }

      const userId = String(req.session.userId);
      const likedIndex = post.likedBy.findIndex((entry) => String(entry) === userId);
      let liked = false;

      if (likedIndex >= 0) {
        post.likedBy.splice(likedIndex, 1);
        post.likesCount = Math.max(0, post.likesCount - 1);
      } else {
        post.likedBy.push(userId);
        post.likesCount += 1;
        liked = true;
      }

      await persistJsonDb();

      res.json({
        liked,
        likesCount: post.likesCount,
        message: liked ? "Layk bosildi." : "Layk olib tashlandi.",
      });
      return;
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: "Post topilmadi." });
      return;
    }

    const userId = String(req.session.userId);
    const likedIndex = post.likedBy.findIndex((entry) => String(entry) === userId);
    let liked = false;

    if (likedIndex >= 0) {
      post.likedBy.splice(likedIndex, 1);
      post.likesCount = Math.max(0, post.likesCount - 1);
    } else {
      post.likedBy.push(userId);
      post.likesCount += 1;
      liked = true;
    }

    await post.save();

    res.json({
      liked,
      likesCount: post.likesCount,
      message: liked ? "Layk bosildi." : "Layk olib tashlandi.",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/users/:username/posts", async (req, res, next) => {
  try {
    const username = normalizeUsername(req.params.username);

    if (DB_MODE === "json") {
      await loadJsonDb();
      const user = jsonDb.users.find((entry) => entry.username === username);

      if (!user || user.isBlocked) {
        res.status(404).json({ message: "Foydalanuvchi topilmadi." });
        return;
      }

      const viewerId = req.session.userId || null;
      const posts = sortByDate(
        jsonDb.posts.filter((post) => String(post.author) === String(user._id))
      ).map((post) => jsonPopulatePost(post));

      res.json({
        user: serializeUser(user, { viewerId: req.session.userId || null }),
        posts: posts.map((post) => serializePost(post, viewerId)),
      });
      return;
    }

    const user = await User.findOne({ username });

    if (!user || user.isBlocked) {
      res.status(404).json({ message: "Foydalanuvchi topilmadi." });
      return;
    }

    const viewerId = req.session.userId || null;
    const posts = await Post.find({ author: user._id })
      .sort({ createdAt: -1 })
      .populate("author", "username fullName avatar bio followersCount followingCount walletBalance createdAt");

    res.json({
      user: serializeUser(user, { viewerId: req.session.userId || null }),
      posts: posts.map((post) => serializePost(post, viewerId)),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/users/:username/follow", requireAuth, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.params.username);
    const viewerId = String(req.session.userId);

    if (DB_MODE === "json") {
      await loadJsonDb();
      const viewer = jsonFindUserById(viewerId);
      const target = jsonDb.users.find((entry) => entry.username === username);

      if (!viewer || !target || target.isBlocked) {
        res.status(404).json({ message: "Foydalanuvchi topilmadi." });
        return;
      }

      if (String(target._id) === viewerId) {
        res.status(400).json({ message: "O'zingizga obuna bo'la olmaysiz." });
        return;
      }

      const isFollowing = (viewer.following || []).some(
        (entry) => String(entry) === String(target._id)
      );

      if (isFollowing) {
        viewer.following = (viewer.following || []).filter(
          (entry) => String(entry) !== String(target._id)
        );
        target.followers = (target.followers || []).filter(
          (entry) => String(entry) !== String(viewerId)
        );
      } else {
        viewer.following = [...new Set([...(viewer.following || []), String(target._id)])];
        target.followers = [...new Set([...(target.followers || []), String(viewerId)])];
      }

      computeCounts(viewer);
      computeCounts(target);
      await persistJsonDb();

      res.json({
        following: !isFollowing,
        user: serializeUser(target, { viewerId }),
      });
      return;
    }

    const [viewer, target] = await Promise.all([
      User.findById(viewerId),
      User.findOne({ username }),
    ]);

    if (!viewer || !target || target.isBlocked) {
      res.status(404).json({ message: "Foydalanuvchi topilmadi." });
      return;
    }

    if (String(target._id) === viewerId) {
      res.status(400).json({ message: "O'zingizga obuna bo'la olmaysiz." });
      return;
    }

    const isFollowing = (viewer.following || []).some(
      (entry) => String(entry) === String(target._id)
    );

    if (isFollowing) {
      viewer.following = (viewer.following || []).filter(
        (entry) => String(entry) !== String(target._id)
      );
      target.followers = (target.followers || []).filter(
        (entry) => String(entry) !== String(viewerId)
      );
    } else {
      viewer.following = [...new Set([...(viewer.following || []), target._id])];
      target.followers = [...new Set([...(target.followers || []), viewer._id])];
    }

    computeCounts(viewer);
    computeCounts(target);
    await Promise.all([viewer.save(), target.save()]);

    res.json({
      following: !isFollowing,
      user: serializeUser(target, { viewerId }),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/posts/:id/comments", async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Izohlar yuklanmadi." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const post = jsonFindPostById(req.params.id);
      if (!post) {
        res.status(404).json({ message: "Post topilmadi." });
        return;
      }

      const comments = sortByDate(
        jsonDb.comments.filter((comment) => String(comment.post) === String(req.params.id)),
        "createdAt",
        "asc"
      ).map((comment) => jsonPopulateComment(comment));

      const tree = buildCommentTree(comments, req.session.userId || null);
      res.json({
        comments: tree,
        total: comments.length,
      });
      return;
    }

    const post = await Post.findById(req.params.id).select("_id");
    if (!post) {
      res.status(404).json({ message: "Post topilmadi." });
      return;
    }

    const comments = await Comment.find({ post: req.params.id })
      .sort({ createdAt: 1 })
      .populate("author", "username fullName avatar bio followersCount followingCount walletBalance createdAt");

    const tree = buildCommentTree(comments, req.session.userId || null);
    res.json({
      comments: tree,
      total: comments.length,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/posts/:id/comments", requireAuth, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Post topilmadi." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const post = jsonFindPostById(req.params.id);
      if (!post) {
        res.status(404).json({ message: "Post topilmadi." });
        return;
      }

      const text = sanitizeMultiline(req.body.text, 600);
      if (!text) {
        res.status(400).json({ message: "Izoh matnini kiriting." });
        return;
      }

      const comment = {
        _id: generateId(),
        post: post._id,
        author: String(req.session.userId),
        text,
        likesCount: 0,
        likedBy: [],
        parentComment: null,
        createdAt: new Date().toISOString(),
      };

      jsonDb.comments.push(comment);
      post.commentsCount += 1;
      await persistJsonDb();

      res.status(201).json({
        message: "Izoh qo'shildi.",
        comment: {
          ...serializeComment(jsonPopulateComment(comment), req.session.userId),
          replies: [],
        },
        commentsCount: post.commentsCount,
      });
      return;
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: "Post topilmadi." });
      return;
    }

    const text = sanitizeMultiline(req.body.text, 600);
    if (!text) {
      res.status(400).json({ message: "Izoh matnini kiriting." });
      return;
    }

    const comment = await Comment.create({
      post: post._id,
      author: req.session.userId,
      text,
      parentComment: null,
    });

    await Post.updateOne({ _id: post._id }, { $inc: { commentsCount: 1 } });

    const savedComment = await Comment.findById(comment._id).populate(
      "author",
      "username fullName avatar bio followersCount followingCount walletBalance createdAt"
    );

    res.status(201).json({
      message: "Izoh qo'shildi.",
      comment: {
        ...serializeComment(savedComment, req.session.userId),
        replies: [],
      },
      commentsCount: post.commentsCount + 1,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/comments/:id/like", requireAuth, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Izoh topilmadi." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const comment = jsonFindCommentById(req.params.id);
      if (!comment) {
        res.status(404).json({ message: "Izoh topilmadi." });
        return;
      }

      const userId = String(req.session.userId);
      const likedIndex = comment.likedBy.findIndex((entry) => String(entry) === userId);
      let liked = false;

      if (likedIndex >= 0) {
        comment.likedBy.splice(likedIndex, 1);
        comment.likesCount = Math.max(0, comment.likesCount - 1);
      } else {
        comment.likedBy.push(userId);
        comment.likesCount += 1;
        liked = true;
      }

      await persistJsonDb();

      res.json({
        liked,
        likesCount: comment.likesCount,
        message: liked ? "Izoh layki qo'shildi." : "Izoh layki olib tashlandi.",
      });
      return;
    }

    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      res.status(404).json({ message: "Izoh topilmadi." });
      return;
    }

    const userId = String(req.session.userId);
    const likedIndex = comment.likedBy.findIndex((entry) => String(entry) === userId);
    let liked = false;

    if (likedIndex >= 0) {
      comment.likedBy.splice(likedIndex, 1);
      comment.likesCount = Math.max(0, comment.likesCount - 1);
    } else {
      comment.likedBy.push(userId);
      comment.likesCount += 1;
      liked = true;
    }

    await comment.save();

    res.json({
      liked,
      likesCount: comment.likesCount,
      message: liked ? "Izoh layki qo'shildi." : "Izoh layki olib tashlandi.",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/comments/:id/reply", requireAuth, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Javob yuborib bo'lmadi." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const parentComment = jsonFindCommentById(req.params.id);
      if (!parentComment) {
        res.status(404).json({ message: "Asosiy izoh topilmadi." });
        return;
      }

      const text = sanitizeMultiline(req.body.text, 600);
      if (!text) {
        res.status(400).json({ message: "Javob matnini kiriting." });
        return;
      }

      const reply = {
        _id: generateId(),
        post: parentComment.post,
        author: String(req.session.userId),
        text,
        likesCount: 0,
        likedBy: [],
        parentComment: parentComment._id,
        createdAt: new Date().toISOString(),
      };

      jsonDb.comments.push(reply);
      const post = jsonFindPostById(parentComment.post);
      if (post) {
        post.commentsCount += 1;
      }
      await persistJsonDb();

      res.status(201).json({
        message: "Javob yuborildi.",
        reply: {
          ...serializeComment(jsonPopulateComment(reply), req.session.userId),
          replies: [],
        },
      });
      return;
    }

    const parentComment = await Comment.findById(req.params.id);
    if (!parentComment) {
      res.status(404).json({ message: "Asosiy izoh topilmadi." });
      return;
    }

    const text = sanitizeMultiline(req.body.text, 600);
    if (!text) {
      res.status(400).json({ message: "Javob matnini kiriting." });
      return;
    }

    const reply = await Comment.create({
      post: parentComment.post,
      author: req.session.userId,
      text,
      parentComment: parentComment._id,
    });

    await Post.updateOne({ _id: parentComment.post }, { $inc: { commentsCount: 1 } });

    const savedReply = await Comment.findById(reply._id).populate(
      "author",
      "username fullName avatar bio followersCount followingCount walletBalance createdAt"
    );

    res.status(201).json({
      message: "Javob yuborildi.",
      reply: {
        ...serializeComment(savedReply, req.session.userId),
        replies: [],
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/profile/me", requireAuth, async (req, res, next) => {
  try {
    if (DB_MODE === "json") {
      await loadJsonDb();
      const user = jsonFindUserById(req.session.userId);
      if (!user) {
        res.status(404).json({ message: "Profil topilmadi." });
        return;
      }

      const posts = sortByDate(
        jsonDb.posts.filter((post) => String(post.author) === String(user._id))
      ).map((post) => jsonPopulatePost(post));
      const likesTotal = posts.reduce((sum, post) => sum + (post.likesCount || 0), 0);

      res.json({
        user: serializeUser(user, { includePrivate: true, viewerId: req.session.userId }),
        stats: {
          postsCount: posts.length,
          likesTotal,
          adViewsTotal: posts.reduce((sum, post) => sum + (post.adViewsCount || 0), 0),
        },
        posts: posts.map((post) => serializePost(post, req.session.userId)),
      });
      return;
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      res.status(404).json({ message: "Profil topilmadi." });
      return;
    }

    const posts = await Post.find({ author: user._id })
      .sort({ createdAt: -1 })
      .populate("author", "username fullName avatar bio followersCount followingCount walletBalance createdAt");

    const likesTotal = posts.reduce((sum, post) => sum + (post.likesCount || 0), 0);

    res.json({
      user: serializeUser(user, { includePrivate: true, viewerId: req.session.userId }),
      stats: {
        postsCount: posts.length,
        likesTotal,
        adViewsTotal: posts.reduce((sum, post) => sum + (post.adViewsCount || 0), 0),
      },
      posts: posts.map((post) => serializePost(post, req.session.userId)),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/profile", requireAuth, avatarUpload.single("avatar"), async (req, res, next) => {
  try {
    if (DB_MODE === "json") {
      await loadJsonDb();
      const user = jsonFindUserById(req.session.userId);
      if (!user) {
        res.status(404).json({ message: "Profil topilmadi." });
        return;
      }

      const fullName = sanitizeText(req.body.fullName, 60);
      const bio = sanitizeMultiline(req.body.bio, 240);

      if (fullName) {
        user.fullName = fullName;
      }

      user.bio = bio;

      if (req.file) {
        const upload = await uploadImage(req.file, "nexa/avatars", {
          width: 600,
        });
        user.avatar = upload.secure_url;
      }

      await persistJsonDb();

      res.json({
        message: "Profil yangilandi.",
        user: serializeUser(user, { includePrivate: true, viewerId: req.session.userId }),
      });
      return;
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      res.status(404).json({ message: "Profil topilmadi." });
      return;
    }

    const fullName = sanitizeText(req.body.fullName, 60);
    const bio = sanitizeMultiline(req.body.bio, 240);

    if (fullName) {
      user.fullName = fullName;
    }

    user.bio = bio;

    if (req.file) {
      const upload = await uploadImage(req.file, "nexa/avatars", {
        width: 600,
      });
      user.avatar = upload.secure_url;
    }

    await user.save();

    res.json({
      message: "Profil yangilandi.",
      user: serializeUser(user, { includePrivate: true, viewerId: req.session.userId }),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/users/:username", async (req, res, next) => {
  try {
    const username = normalizeUsername(req.params.username);

    if (DB_MODE === "json") {
      await loadJsonDb();
      const user = jsonDb.users.find((entry) => entry.username === username);

      if (!user || user.isBlocked) {
        res.status(404).json({ message: "Foydalanuvchi topilmadi." });
        return;
      }

      const posts = sortByDate(
        jsonDb.posts.filter((post) => String(post.author) === String(user._id))
      );

      res.json({
        user: serializeUser(user, { viewerId: req.session.userId || null }),
        stats: {
          postsCount: posts.length,
          likesTotal: posts.reduce((sum, post) => sum + (post.likesCount || 0), 0),
          adViewsTotal: posts.reduce((sum, post) => sum + (post.adViewsCount || 0), 0),
          totalEarned: roundMoney(posts.reduce((sum, post) => sum + (post.adRevenue || 0), 0)),
        },
      });
      return;
    }

    const user = await User.findOne({ username });

    if (!user || user.isBlocked) {
      res.status(404).json({ message: "Foydalanuvchi topilmadi." });
      return;
    }

    const posts = await Post.find({ author: user._id })
      .sort({ createdAt: -1 })
      .select("likesCount adViewsCount adRevenue createdAt");

    res.json({
      user: serializeUser(user, { viewerId: req.session.userId || null }),
      stats: {
        postsCount: posts.length,
        likesTotal: posts.reduce((sum, post) => sum + (post.likesCount || 0), 0),
        adViewsTotal: posts.reduce((sum, post) => sum + (post.adViewsCount || 0), 0),
        totalEarned: roundMoney(posts.reduce((sum, post) => sum + (post.adRevenue || 0), 0)),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/wallet/me", requireAuth, async (req, res, next) => {
  try {
    if (DB_MODE === "json") {
      await loadJsonDb();
      const user = jsonFindUserById(req.session.userId);
      if (!user) {
        res.status(404).json({ message: "Hamyon topilmadi." });
        return;
      }

      const posts = [...jsonDb.posts]
        .filter((post) => String(post.author) === String(user._id))
        .sort((left, right) => {
          if ((right.adRevenue || 0) !== (left.adRevenue || 0)) {
            return (right.adRevenue || 0) - (left.adRevenue || 0);
          }
          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        });

      const totalAdViews = posts.reduce((sum, post) => sum + (post.adViewsCount || 0), 0);
      const totalEarned = roundMoney(posts.reduce((sum, post) => sum + (post.adRevenue || 0), 0));

      res.json({
        balance: roundMoney(user.walletBalance || 0),
        balanceFormatted: formatMoney(user.walletBalance || 0),
        totalAdViews,
        totalEarned,
        totalEarnedFormatted: formatMoney(totalEarned),
        rateNote: "Har 1000 ta reklama ko'rish = $0.5",
        recentEarnings: posts.slice(0, 5).map((post) => ({
          id: String(post._id),
          caption: post.caption || "Sarlavhasiz post",
          adViewsCount: post.adViewsCount || 0,
          adRevenue: roundMoney(post.adRevenue || 0),
          adRevenueFormatted: formatMoney(post.adRevenue || 0),
          createdAt: post.createdAt,
        })),
      });
      return;
    }

    const user = await User.findById(req.session.userId);
    if (!user) {
      res.status(404).json({ message: "Hamyon topilmadi." });
      return;
    }

    const posts = await Post.find({ author: user._id })
      .sort({ adRevenue: -1, createdAt: -1 })
      .select("caption adViewsCount adRevenue createdAt");

    const totalAdViews = posts.reduce((sum, post) => sum + (post.adViewsCount || 0), 0);
    const totalEarned = roundMoney(posts.reduce((sum, post) => sum + (post.adRevenue || 0), 0));

    res.json({
      balance: roundMoney(user.walletBalance || 0),
      balanceFormatted: formatMoney(user.walletBalance || 0),
      totalAdViews,
      totalEarned,
      totalEarnedFormatted: formatMoney(totalEarned),
      rateNote: "Har 1000 ta reklama ko'rish = $0.5",
      recentEarnings: posts.slice(0, 5).map((post) => ({
        id: String(post._id),
        caption: post.caption || "Sarlavhasiz post",
        adViewsCount: post.adViewsCount || 0,
        adRevenue: roundMoney(post.adRevenue || 0),
        adRevenueFormatted: formatMoney(post.adRevenue || 0),
        createdAt: post.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/ads/feed", async (req, res, next) => {
  try {
    if (DB_MODE === "json") {
      await loadJsonDb();
      const ads = sortByDate(
        jsonDb.ads.filter((ad) => ad.isActive),
        "createdAt",
        "desc"
      ).slice(0, 12);
      res.json({
        ads: ads.map((ad) => ({
          id: String(ad._id),
          title: ad.title,
          image: ad.image,
          text: ad.text,
          ctaText: ad.ctaText,
          ctaLink: ad.ctaLink,
        })),
      });
      return;
    }

    const ads = await Ad.find({ isActive: true }).sort({ createdAt: -1 }).limit(12);
    res.json({
      ads: ads.map((ad) => ({
        id: String(ad._id),
        title: ad.title,
        image: ad.image,
        text: ad.text,
        ctaText: ad.ctaText,
        ctaLink: ad.ctaLink,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/ads/:adId/impression", async (req, res, next) => {
  try {
    const { postId, placementKey } = req.body || {};

    if (!isObjectId(req.params.adId) || !isObjectId(postId) || !placementKey) {
      res.status(400).json({ message: "Reklama hisobini yangilab bo'lmadi." });
      return;
    }

    ensureImpressionCache(req);

    if (req.session.countedAdImpressions.includes(placementKey)) {
      res.json({ counted: false, balanceStep: MONEY_STEP });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const ad = jsonFindAdById(req.params.adId);
      const post = jsonFindPostById(postId);

      if (!ad || !post) {
        res.status(404).json({ message: "Reklama yoki post topilmadi." });
        return;
      }

      post.adViewsCount = (post.adViewsCount || 0) + 1;
      post.adRevenue = roundMoney((post.adRevenue || 0) + MONEY_STEP);
      const owner = jsonFindUserById(post.author);
      if (owner) {
        owner.walletBalance = roundMoney((owner.walletBalance || 0) + MONEY_STEP);
      }

      req.session.countedAdImpressions.push(placementKey);
      await persistJsonDb();

      res.json({
        counted: true,
        balanceStep: MONEY_STEP,
        balanceStepFormatted: formatMoney(MONEY_STEP),
      });
      return;
    }

    const [ad, post] = await Promise.all([
      Ad.findOne({ _id: req.params.adId, isActive: true }).lean(),
      Post.findById(postId).select("author"),
    ]);

    if (!ad || !post) {
      res.status(404).json({ message: "Reklama yoki post topilmadi." });
      return;
    }

    await Promise.all([
      Post.updateOne(
        { _id: postId },
        [
          {
            $set: {
              adViewsCount: { $add: [{ $ifNull: ["$adViewsCount", 0] }, 1] },
              adRevenue: {
                $round: [{ $add: [{ $ifNull: ["$adRevenue", 0] }, MONEY_STEP] }, 5],
              },
            },
          },
        ]
      ),
      User.updateOne(
        { _id: post.author },
        [
          {
            $set: {
              walletBalance: {
                $round: [{ $add: [{ $ifNull: ["$walletBalance", 0] }, MONEY_STEP] }, 5],
              },
            },
          },
        ]
      ),
    ]);

    req.session.countedAdImpressions.push(placementKey);

    res.json({
      counted: true,
      balanceStep: MONEY_STEP,
      balanceStepFormatted: formatMoney(MONEY_STEP),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/overview", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const collections = await loadAdminCollections();
    res.json(buildAdminOverviewPayload(collections));
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const collections = await loadAdminCollections();
    const users = collections.users.map((user) => {
      const posts = collections.posts.filter(
        (post) => String(post.author?._id || post.author) === String(user._id || user.id)
      );

      return {
        ...serializeUser(user, { includePrivate: true, viewerId: req.session.userId }),
        postsCount: posts.length,
        likesTotal: posts.reduce((sum, post) => sum + (post.likesCount || 0), 0),
        totalRevenue: roundMoney(posts.reduce((sum, post) => sum + (post.adRevenue || 0), 0)),
      };
    });

    res.json({ users });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/posts", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const collections = await loadAdminCollections();
    res.json({
      posts: collections.posts.map((post) => ({
        ...serializePost(post, req.session.userId),
        imageCount: Array.isArray(post.images) ? post.images.length : 0,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/comments", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const collections = await loadAdminCollections();
    res.json({
      comments: collections.comments.map((comment) => ({
        ...serializeComment(comment, req.session.userId),
        postId: String(comment.post?._id || comment.post),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/ads", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const collections = await loadAdminCollections();
    res.json({
      ads: collections.ads.map((ad) => ({
        id: String(ad._id || ad.id),
        title: ad.title,
        image: ad.image,
        text: ad.text,
        ctaText: ad.ctaText,
        ctaLink: ad.ctaLink,
        isActive: Boolean(ad.isActive),
        createdAt: ad.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/toggle-admin", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Foydalanuvchi topilmadi." });
      return;
    }

    if (String(req.params.id) === String(req.session.userId)) {
      res.status(400).json({ message: "O'zingizning admin rolingizni bu yerda o'zgartira olmaysiz." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const user = jsonFindUserById(req.params.id);
      if (!user) {
        res.status(404).json({ message: "Foydalanuvchi topilmadi." });
        return;
      }

      user.isAdmin = !user.isAdmin;
      await persistJsonDb();

      res.json({
        message: user.isAdmin ? "Admin huquqi berildi." : "Admin huquqi olib tashlandi.",
        user: serializeUser(user, { includePrivate: true, viewerId: req.session.userId }),
      });
      return;
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ message: "Foydalanuvchi topilmadi." });
      return;
    }

    user.isAdmin = !user.isAdmin;
    await user.save();

    res.json({
      message: user.isAdmin ? "Admin huquqi berildi." : "Admin huquqi olib tashlandi.",
      user: serializeUser(user, { includePrivate: true, viewerId: req.session.userId }),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users/:id/toggle-block", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Foydalanuvchi topilmadi." });
      return;
    }

    if (String(req.params.id) === String(req.session.userId)) {
      res.status(400).json({ message: "O'zingizni bloklay olmaysiz." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const user = jsonFindUserById(req.params.id);
      if (!user) {
        res.status(404).json({ message: "Foydalanuvchi topilmadi." });
        return;
      }

      user.isBlocked = !user.isBlocked;
      await persistJsonDb();

      res.json({
        message: user.isBlocked ? "Foydalanuvchi bloklandi." : "Foydalanuvchi blokdan chiqarildi.",
        user: serializeUser(user, { includePrivate: true, viewerId: req.session.userId }),
      });
      return;
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ message: "Foydalanuvchi topilmadi." });
      return;
    }

    user.isBlocked = !user.isBlocked;
    await user.save();

    res.json({
      message: user.isBlocked ? "Foydalanuvchi bloklandi." : "Foydalanuvchi blokdan chiqarildi.",
      user: serializeUser(user, { includePrivate: true, viewerId: req.session.userId }),
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Foydalanuvchi topilmadi." });
      return;
    }

    if (String(req.params.id) === String(req.session.userId)) {
      res.status(400).json({ message: "O'zingizni o'chira olmaysiz." });
      return;
    }

    const deletedUser =
      DB_MODE === "json"
        ? await deleteUserInJson(req.params.id)
        : await deleteUserInMongo(req.params.id);

    if (!deletedUser) {
      res.status(404).json({ message: "Foydalanuvchi topilmadi." });
      return;
    }

    res.json({
      message: "Foydalanuvchi, uning postlari va bog'liq izohlari o'chirildi.",
      user: serializeUser(deletedUser, { includePrivate: true, viewerId: req.session.userId }),
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/posts/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Post topilmadi." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const post = jsonFindPostById(req.params.id);
      if (!post) {
        res.status(404).json({ message: "Post topilmadi." });
        return;
      }

      jsonDb.posts = jsonDb.posts.filter((entry) => String(entry._id) !== String(req.params.id));
      jsonDb.comments = jsonDb.comments.filter((entry) => String(entry.post) !== String(req.params.id));
      await persistJsonDb();
      res.json({ message: "Post va unga tegishli izohlar o'chirildi." });
      return;
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      res.status(404).json({ message: "Post topilmadi." });
      return;
    }

    await Promise.all([
      Post.deleteOne({ _id: req.params.id }),
      Comment.deleteMany({ post: req.params.id }),
    ]);

    res.json({ message: "Post va unga tegishli izohlar o'chirildi." });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/comments/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Izoh topilmadi." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const rootComment = jsonFindCommentById(req.params.id);
      if (!rootComment) {
        res.status(404).json({ message: "Izoh topilmadi." });
        return;
      }

      const commentsToDelete = new Set([String(rootComment._id)]);
      let changed = true;
      while (changed) {
        changed = false;
        jsonDb.comments.forEach((comment) => {
          if (
            comment.parentComment &&
            commentsToDelete.has(String(comment.parentComment)) &&
            !commentsToDelete.has(String(comment._id))
          ) {
            commentsToDelete.add(String(comment._id));
            changed = true;
          }
        });
      }

      jsonDb.comments = jsonDb.comments.filter(
        (comment) => !commentsToDelete.has(String(comment._id))
      );

      const post = jsonFindPostById(rootComment.post);
      if (post) {
        post.commentsCount = Math.max(0, (post.commentsCount || 0) - commentsToDelete.size);
      }

      await persistJsonDb();
      res.json({ message: "Izoh tarmog'i o'chirildi." });
      return;
    }

    const rootComment = await Comment.findById(req.params.id);
    if (!rootComment) {
      res.status(404).json({ message: "Izoh topilmadi." });
      return;
    }

    const comments = await Comment.find({ post: rootComment.post }).select("_id parentComment");
    const commentsToDelete = new Set([String(rootComment._id)]);
    let changed = true;
    while (changed) {
      changed = false;
      comments.forEach((comment) => {
        if (
          comment.parentComment &&
          commentsToDelete.has(String(comment.parentComment)) &&
          !commentsToDelete.has(String(comment._id))
        ) {
          commentsToDelete.add(String(comment._id));
          changed = true;
        }
      });
    }

    await Promise.all([
      Comment.deleteMany({ _id: { $in: [...commentsToDelete] } }),
      Post.updateOne(
        { _id: rootComment.post },
        { $inc: { commentsCount: -commentsToDelete.size } }
      ),
    ]);

    res.json({ message: "Izoh tarmog'i o'chirildi." });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/ads", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const payload = {
      title: sanitizeText(req.body.title, 100),
      image: sanitizeText(req.body.image, 500),
      text: sanitizeText(req.body.text, 220),
      ctaText: sanitizeText(req.body.ctaText, 40),
      ctaLink: sanitizeText(req.body.ctaLink, 200),
      isActive: req.body.isActive !== false && req.body.isActive !== "false",
    };

    if (!payload.title || !payload.image || !payload.text || !payload.ctaText || !payload.ctaLink) {
      res.status(400).json({ message: "Reklama uchun barcha maydonlarni to'ldiring." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const ad = {
        _id: generateId(),
        ...payload,
        createdAt: new Date().toISOString(),
      };
      jsonDb.ads.unshift(ad);
      await persistJsonDb();
      res.status(201).json({ message: "Reklama yaratildi.", ad });
      return;
    }

    const ad = await Ad.create(payload);
    res.status(201).json({
      message: "Reklama yaratildi.",
      ad: {
        id: String(ad._id),
        title: ad.title,
        image: ad.image,
        text: ad.text,
        ctaText: ad.ctaText,
        ctaLink: ad.ctaLink,
        isActive: ad.isActive,
        createdAt: ad.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/ads/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Reklama topilmadi." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const ad = jsonDb.ads.find((entry) => String(entry._id) === String(req.params.id));
      if (!ad) {
        res.status(404).json({ message: "Reklama topilmadi." });
        return;
      }

      ad.title = sanitizeText(req.body.title || ad.title, 100);
      ad.image = sanitizeText(req.body.image || ad.image, 500);
      ad.text = sanitizeText(req.body.text || ad.text, 220);
      ad.ctaText = sanitizeText(req.body.ctaText || ad.ctaText, 40);
      ad.ctaLink = sanitizeText(req.body.ctaLink || ad.ctaLink, 200);
      if (typeof req.body.isActive !== "undefined") {
        ad.isActive = req.body.isActive !== false && req.body.isActive !== "false";
      }

      await persistJsonDb();
      res.json({ message: "Reklama yangilandi.", ad });
      return;
    }

    const ad = await Ad.findById(req.params.id);
    if (!ad) {
      res.status(404).json({ message: "Reklama topilmadi." });
      return;
    }

    ad.title = sanitizeText(req.body.title || ad.title, 100);
    ad.image = sanitizeText(req.body.image || ad.image, 500);
    ad.text = sanitizeText(req.body.text || ad.text, 220);
    ad.ctaText = sanitizeText(req.body.ctaText || ad.ctaText, 40);
    ad.ctaLink = sanitizeText(req.body.ctaLink || ad.ctaLink, 200);
    if (typeof req.body.isActive !== "undefined") {
      ad.isActive = req.body.isActive !== false && req.body.isActive !== "false";
    }

    await ad.save();
    res.json({
      message: "Reklama yangilandi.",
      ad: {
        id: String(ad._id),
        title: ad.title,
        image: ad.image,
        text: ad.text,
        ctaText: ad.ctaText,
        ctaLink: ad.ctaLink,
        isActive: ad.isActive,
        createdAt: ad.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/admin/ads/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(400).json({ message: "Reklama topilmadi." });
      return;
    }

    if (DB_MODE === "json") {
      await loadJsonDb();
      const before = jsonDb.ads.length;
      jsonDb.ads = jsonDb.ads.filter((entry) => String(entry._id) !== String(req.params.id));
      if (before === jsonDb.ads.length) {
        res.status(404).json({ message: "Reklama topilmadi." });
        return;
      }
      await persistJsonDb();
      res.json({ message: "Reklama o'chirildi." });
      return;
    }

    const result = await Ad.deleteOne({ _id: req.params.id });
    if (!result.deletedCount) {
      res.status(404).json({ message: "Reklama topilmadi." });
      return;
    }
    res.json({ message: "Reklama o'chirildi." });
  } catch (error) {
    next(error);
  }
});

app.get("/", (req, res) => {
  const canonical = absoluteUrl("/");
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "NEXA",
    url: canonical,
    image: absoluteUrl("/media/logo.png"),
    inLanguage: "uz-Latn-UZ",
    potentialAction: {
      "@type": "SearchAction",
      target: `${canonical}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  res.send(
    renderStaticShell({
      pageTitle: "NEXA | Uzbek foto feed, profillar va tavsiyalar",
      pageDescription:
        "NEXA premium foto platformasi: postlar, profillar, obuna tizimi, reklama daromadi va SEO-friendly public sahifalar.",
      canonical,
      keywords: [
        "uzbek social media",
        "foto post",
        "nexa",
        "obuna",
        "profil",
        "tavsiyalar",
        "uzbek instagram",
      ],
      image: "/media/logo.png",
      bodyPage: "home",
      subtitle: "NEXA foto platformasi",
      structuredData,
      mainContent: renderHomeSeoContent(),
      afterMainContent: `
        <div class="offcanvas offcanvas-bottom comments-sheet" tabindex="-1" id="commentsSheet">
          <div class="offcanvas-header">
            <div>
              <div class="eyebrow"><i class="fa-regular fa-comments"></i> Izohlar</div>
              <h2 class="mt-3 mb-0">Suhbatga qo'shiling</h2>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Yopish"></button>
          </div>
          <div class="offcanvas-body">
            <div id="sheetCommentsList" class="feed-stack"></div>
            <div class="comment-composer">
              <div class="reply-indicator" id="sheetReplyIndicator"></div>
              <form id="sheetCommentForm" class="form-stack" data-comment-form data-context="sheet">
                <textarea class="form-control" rows="3" placeholder="Izoh yozing..."></textarea>
                <button class="primary-btn" type="submit">Yuborish</button>
              </form>
            </div>
          </div>
        </div>`,
    })
  );
});

app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(__dirname, "media", "logo.png"));
});

app.get("/manifest.webmanifest", (req, res) => {
  res.type("application/manifest+json").send({
    name: "NEXA",
    short_name: "NEXA",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7fb",
    theme_color: "#0ea5a4",
    icons: [
      {
        src: "/media/logo.png",
        sizes: "500x500",
        type: "image/png",
      },
    ],
  });
});

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(`User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`);
});

app.get("/sitemap.xml", async (req, res, next) => {
  try {
    const staticUrls = ["/", "/search.html", "/register.html", "/login.html"];
    let posts = [];
    let users = [];

    if (DB_MODE === "json") {
      await loadJsonDb();
      posts = jsonDb.posts.filter((post) => {
        const author = jsonFindUserById(post.author);
        return author && !author.isBlocked;
      });
      users = jsonDb.users.filter((user) => !user.isBlocked);
    } else {
      const visibleUsers = await User.find({ isBlocked: { $ne: true } }).select("_id username createdAt").lean();
      users = visibleUsers;
      posts = await Post.find({ author: { $in: visibleUsers.map((user) => user._id) } })
        .select("_id createdAt")
        .lean();
    }

    const urls = [
      ...staticUrls.map((url) => ({
        loc: absoluteUrl(url),
        lastmod: new Date().toISOString(),
      })),
      ...posts.map((post) => ({
        loc: absoluteUrl(`/post/${String(post._id)}`),
        lastmod: new Date(post.createdAt || Date.now()).toISOString(),
      })),
      ...users.map((user) => ({
        loc: absoluteUrl(`/u/${encodeURIComponent(user.username)}`),
        lastmod: new Date(user.createdAt || Date.now()).toISOString(),
      })),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (entry) => `  <url>
    <loc>${escapeHtmlServer(entry.loc)}</loc>
    <lastmod>${entry.lastmod}</lastmod>
  </url>`
  )
  .join("\n")}
</urlset>`;

    res.type("application/xml").send(xml);
  } catch (error) {
    next(error);
  }
});

app.get("/post/:id", async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      res.status(404).send("Post topilmadi.");
      return;
    }

    const post = await fetchPostWithAuthor(req.params.id);
    if (!post) {
      res.status(404).send("Post topilmadi.");
      return;
    }

    const caption = sanitizeMultiline(post.caption || "", 160);
    const keywords = extractKeywords(caption, post.tags || []);
    const pageTitle = `${caption || "Foto post"} | ${post.author?.fullName || post.author?.username || "NEXA"} | NEXA`;
    const pageDescription =
      caption ||
      `${post.author?.fullName || post.author?.username || "NEXA"} tomonidan joylangan foto post.`;
    const canonical = absoluteUrl(`/post/${req.params.id}`);
    const image = post.images?.[0] || "/media/logo.png";
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: pageTitle,
      description: pageDescription,
      image: (post.images || []).map((entry) => absoluteUrl(entry)),
      datePublished: new Date(post.createdAt).toISOString(),
      author: {
        "@type": "Person",
        name: post.author?.fullName || post.author?.username || "NEXA",
        url: absoluteUrl(`/u/${post.author?.username || ""}`),
      },
      keywords,
      mainEntityOfPage: canonical,
    };

    res.send(
      renderStaticShell({
        pageTitle,
        pageDescription,
        canonical,
        keywords,
        image,
        bodyPage: "post",
        subtitle: "SEO post sahifasi",
        structuredData,
        mainContent: renderPostSeoContent(post),
      })
    );
  } catch (error) {
    next(error);
  }
});

app.get("/u/:username", async (req, res, next) => {
  try {
    const username = normalizeUsername(req.params.username);
    const profile = await fetchPublicProfile(username);

    if (!profile) {
      res.status(404).send("Profil topilmadi.");
      return;
    }

    const keywords = extractKeywords(profile.user.bio || "", [profile.user.username, "profil", "foto"]);
    const pageTitle = `${profile.user.fullName} (@${profile.user.username}) | NEXA profil`;
    const pageDescription =
      sanitizeMultiline(profile.user.bio || `${profile.user.fullName} ning NEXA profili.`, 160) ||
      `${profile.user.fullName} ning NEXA profili.`;
    const canonical = absoluteUrl(`/u/${profile.user.username}`);
    const image = profile.user.avatar || profile.posts[0]?.images?.[0] || "/media/logo.png";
    const structuredData = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: profile.user.fullName,
      alternateName: `@${profile.user.username}`,
      description: profile.user.bio || "",
      image: absoluteUrl(image),
      url: canonical,
    };

    res.send(
      renderStaticShell({
        pageTitle,
        pageDescription,
        canonical,
        keywords,
        image,
        bodyPage: "profile",
        subtitle: "Public profil",
        structuredData,
        mainContent: renderProfileSeoContent(profile.user, profile.posts),
      })
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, cloudinaryReady: CLOUDINARY_READY, dbMode: DB_MODE });
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ message: "Sahifa topilmadi." });
    return;
  }

  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ message: "Har bir rasm hajmi 5MB dan oshmasin." });
      return;
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      res.status(400).json({ message: "Ko'pi bilan 5 ta rasm yuklash mumkin." });
      return;
    }
  }

  if (error && error.message) {
    res.status(error.status || 500).json({ message: error.message });
    return;
  }

  next(error);
});

async function start() {
  if (DB_MODE === "mongo") {
    await mongoose.connect(MONGODB_URI);
  } else {
    await loadJsonDb();
  }
  await seedAdsIfNeeded();
  await seedAdminIfNeeded();

  server.listen(PORT, () => {
    console.log(`NEXA ishga tushdi: http://localhost:${PORT}`);
    console.log(`Ma'lumotlar rejimi: ${DB_MODE}`);
    if (!process.env.SESSION_SECRET) {
      console.log("Diqqat: SESSION_SECRET topilmadi, vaqtinchalik dev secret ishlatildi.");
    }
    if (!CLOUDINARY_READY) {
      console.log("Diqqat: Cloudinary sozlanmagan. Rasm yuklash local /public/uploads ga saqlanadi.");
    }
    if (DB_MODE === "json") {
      console.log(`Fallback JSON: ${JSON_DB_PATH}`);
      console.log("Demo login: demo yoki demo@nexa.uz | parol: demo123");
      console.log("Admin login: admin yoki admin@nexa.uz | parol: admin123");
    } else {
      console.log("Agar admin hali yo'q bo'lsa: admin yoki admin@nexa.uz | parol: admin123");
    }
  });
}

start().catch((error) => {
  console.error("Server ishga tushmadi:", error);
  process.exit(1);
});
