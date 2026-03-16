const state = {
  me: null,
  page: document.body.dataset.page || "",
  searchQuery: "",
  commentsSheetInstance: null,
  currentCommentsPostId: null,
  replyTargets: {
    sheet: null,
    inline: null,
  },
  adObserver: null,
  chat: {
    rooms: [],
    currentRoom: null,
    messages: [],
    socket: null,
    userSearchResults: [],
  },
  admin: {
    overview: null,
    users: [],
    posts: [],
    comments: [],
    ads: [],
    editingAdId: null,
    filters: {
      users: "",
      posts: "",
      comments: "",
      ads: "",
    },
  },
};

const routes = {
  home: "/",
  search: "/search.html",
  create: "/create.html",
  wallet: "/wallet.html",
  profile: "/profile.html",
  chat: "/chat.html",
  admin: "/admin.html",
  login: "/login.html",
  register: "/register.html",
};

function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(value = "") {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function money(value) {
  return `$${Number(value || 0).toFixed(5)}`;
}

function profileUrl(username) {
  return username ? `/u/${encodeURIComponent(username)}` : "/profile.html";
}

function postUrl(id) {
  return `/post/${encodeURIComponent(id)}`;
}

function searchUrl(query = "") {
  return query ? `/search.html?q=${encodeURIComponent(query)}` : "/search.html";
}

function chatUrl(options = {}) {
  const params = new URLSearchParams();
  if (options.roomId) {
    params.set("room", options.roomId);
  }
  if (options.username) {
    params.set("user", options.username);
  }
  const query = params.toString();
  return `/chat.html${query ? `?${query}` : ""}`;
}

function currentPostIdFromLocation() {
  if (location.pathname.startsWith("/post/")) {
    return decodeURIComponent(location.pathname.replace(/^\/post\//, "").split("/")[0]);
  }
  return new URLSearchParams(location.search).get("id");
}

function currentUsernameFromLocation() {
  if (location.pathname.startsWith("/u/")) {
    return decodeURIComponent(location.pathname.replace(/^\/u\//, "").split("/")[0]);
  }
  return new URLSearchParams(location.search).get("user");
}

function currentSearchQuery() {
  return (new URLSearchParams(location.search).get("q") || "").trim();
}

function currentChatRoomId() {
  return new URLSearchParams(location.search).get("room");
}

function currentChatUsername() {
  return new URLSearchParams(location.search).get("user");
}

function updateSearchQuery(nextQuery) {
  const params = new URLSearchParams(location.search);
  if (nextQuery) {
    params.set("q", nextQuery);
  } else {
    params.delete("q");
  }

  const next = params.toString();
  history.replaceState({}, "", `${location.pathname}${next ? `?${next}` : ""}`);
  state.searchQuery = nextQuery;
}

function initials(value = "") {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timeAgo(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "hozir";
  }

  const diff = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diff < minute) {
    return "hozir";
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)} daqiqa oldin`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)} soat oldin`;
  }
  if (diff < week) {
    return `${Math.floor(diff / day)} kun oldin`;
  }
  return date.toLocaleDateString("uz-UZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function truncate(value = "", max = 90) {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}...`;
}

function showToast(message, type = "default") {
  let shell = qs("#toastShell");
  if (!shell) {
    shell = document.createElement("div");
    shell.id = "toastShell";
    shell.className = "toast-shell";
    document.body.append(shell);
  }

  const toast = document.createElement("div");
  toast.className = `mini-toast ${type}`;
  toast.textContent = message;
  shell.append(toast);

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    window.setTimeout(() => toast.remove(), 220);
  }, 2800);
}

async function api(url, options = {}) {
  const config = { ...options };
  config.method = config.method || "GET";
  config.credentials = config.credentials || "same-origin";
  config.headers = config.headers ? { ...config.headers } : {};

  if (config.body && !(config.body instanceof FormData)) {
    config.headers["Content-Type"] = "application/json";
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(payload?.message || "So'rov muvaffaqiyatsiz tugadi.");
    error.status = response.status;
    throw error;
  }

  return payload;
}

function setAuthFeedback(message = "", type = "info") {
  const host = qs("#authFeedback");
  if (!host) {
    return;
  }

  if (!message) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }

  const variant = type === "error" ? "danger" : type;
  host.hidden = false;
  host.innerHTML = `<div class="alert alert-${variant}" role="alert">${escapeHtml(message)}</div>`;
}

function redirectToLogin() {
  const next = `${location.pathname}${location.search}`;
  location.href = `/login.html?next=${encodeURIComponent(next)}`;
}

function requiresAuth() {
  if (state.me) {
    return true;
  }

  showToast("Davom etish uchun tizimga kiring.", "error");
  redirectToLogin();
  return false;
}

async function loadMe() {
  try {
    const data = await api("/api/auth/me");
    state.me = data.authenticated ? data.user : null;
  } catch (error) {
    state.me = null;
  }

  renderHeaderActions();
  renderBottomNav();
  renderDesktopQuickLinks();
  return state.me;
}

function renderHeaderActions() {
  const host = qs("#topbarActions");
  if (!host) {
    return;
  }

  if (state.me) {
    host.innerHTML = `
      <a class="icon-btn" href="/search.html" aria-label="Qidiruv">
        <i class="fa-solid fa-magnifying-glass"></i>
      </a>
      <a class="icon-btn" href="/chat.html" aria-label="Chat">
        <i class="fa-regular fa-paper-plane"></i>
      </a>
      ${state.me.isAdmin ? `<a class="ghost-link" href="/admin.html"><i class="fa-solid fa-chart-line"></i><span>Admin</span></a>` : ""}
      <a class="ghost-link" href="${profileUrl(state.me.username)}">
        <i class="fa-regular fa-user"></i>
        <span>${escapeHtml(state.me.fullName)}</span>
      </a>
      <button class="icon-btn" type="button" data-action="logout" aria-label="Chiqish">
        <i class="fa-solid fa-arrow-right-from-bracket"></i>
      </button>
    `;
    return;
  }

  host.innerHTML = `
    <a class="icon-btn" href="/search.html" aria-label="Qidiruv">
      <i class="fa-solid fa-magnifying-glass"></i>
    </a>
    <a class="ghost-link" href="/login.html">Kirish</a>
    <a class="primary-btn" href="/register.html">Ro'yxatdan o'tish</a>
  `;
}

function renderBottomNav() {
  const nav = qs("#mobileNav");
  if (!nav) {
    return;
  }

  const current = state.page;
  const profileHref = state.me ? profileUrl(state.me.username) : "/login.html";
  const walletHref = state.me ? "/wallet.html" : "/login.html";
  const createHref = state.me ? "/create.html" : "/login.html";

  nav.innerHTML = `
    <a class="nav-link-item ${current === "home" ? "active" : ""}" href="/">
      <i class="fa-solid fa-house"></i>
      <span>Bosh sahifa</span>
    </a>
    <a class="nav-link-item ${current === "create" ? "active" : ""}" href="${createHref}">
      <i class="fa-solid fa-square-plus"></i>
      <span>Yaratish</span>
    </a>
    <a class="nav-link-item ${current === "wallet" ? "active" : ""}" href="${walletHref}">
      <i class="fa-solid fa-wallet"></i>
      <span>Hamyon</span>
    </a>
    <a class="nav-link-item ${current === "profile" ? "active" : ""}" href="${profileHref}">
      <i class="fa-regular fa-user"></i>
      <span>Profil</span>
    </a>
  `;
}

function renderDesktopQuickLinks() {
  const host = qs("#desktopQuickLinks");
  if (!host) {
    return;
  }

  host.innerHTML = state.me
    ? `
        <div class="panel-card">
          <div class="section-title">
            <h3>Hisob</h3>
          </div>
          <div class="author-row">
            ${avatarMarkup(state.me, "avatar-lg")}
            <div class="author-meta">
              <div class="author-name">${escapeHtml(state.me.fullName)}</div>
              <div class="author-sub">@${escapeHtml(state.me.username)}</div>
            </div>
          </div>
          <p class="page-subline">${escapeHtml(state.me.bio || "Bio hali qo'shilmagan.")}</p>
          <div class="stack-actions">
            <a class="soft-btn" href="/create.html"><i class="fa-solid fa-camera"></i> Post joylash</a>
            <a class="ghost-link" href="/wallet.html"><i class="fa-solid fa-wallet"></i> ${money(state.me.walletBalance)}</a>
            <a class="ghost-link" href="/search.html"><i class="fa-solid fa-magnifying-glass"></i> Qidiruv</a>
            <a class="ghost-link" href="/chat.html"><i class="fa-regular fa-paper-plane"></i> Chat</a>
            ${state.me.isAdmin ? `<a class="ghost-link" href="/admin.html"><i class="fa-solid fa-shield-halved"></i> Boshqaruv</a>` : ""}
          </div>
        </div>
      `
    : `
        <div class="panel-card">
          <div class="section-title">
            <h3>Jamiyatga qo'shiling</h3>
          </div>
          <p class="page-subline">Layk, izoh va javoblar uchun bir necha soniyada hisob yarating.</p>
          <div class="stack-actions">
            <a class="ghost-link" href="/search.html"><i class="fa-solid fa-magnifying-glass"></i> Qidiruv</a>
            <a class="primary-btn" href="/register.html">Ro'yxatdan o'tish</a>
            <a class="ghost-link" href="/login.html">Kirish</a>
          </div>
        </div>
      `;
}

function avatarMarkup(user, size = "avatar") {
  const safeName = escapeHtml(user?.fullName || user?.username || "U");
  const fallback = escapeHtml(user?.avatarFallback || initials(user?.fullName || user?.username || "U"));

  if (user?.avatar) {
    return `<span class="${size}"><img src="${escapeHtml(user.avatar)}" alt="${safeName}"></span>`;
  }

  return `<span class="${size}">${fallback}</span>`;
}

function renderTags(tags = []) {
  if (!tags.length) {
    return "";
  }

  return `
    <div class="tag-row">
      ${tags.map((tag) => `<span class="tag-pill">#${escapeHtml(tag)}</span>`).join("")}
    </div>
  `;
}

function renderGallery(images = [], uid) {
  if (!images.length) {
    return "";
  }

  if (images.length === 1) {
    return `
      <div class="post-gallery">
        <div class="gallery-single">
          <img src="${escapeHtml(images[0])}" alt="Post rasmi" loading="lazy">
        </div>
      </div>
    `;
  }

  return `
    <div class="post-gallery">
      <div class="gallery-counter" data-gallery-counter>1/${images.length}</div>
      <div class="swiper gallery-swiper" data-gallery="${uid}">
        <div class="swiper-wrapper">
          ${images
            .map(
              (image) => `
                <div class="swiper-slide">
                  <div class="gallery-slide">
                    <img src="${escapeHtml(image)}" alt="Post rasmi" loading="lazy">
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="swiper-pagination"></div>
      </div>
    </div>
  `;
}

function renderCommentPreview(comment) {
  return `
    <div class="comment-preview-item">
      <a class="author-row" href="${profileUrl(comment.author.username)}">
        ${avatarMarkup(comment.author, "avatar-mini")}
        <div class="author-meta">
          <div class="comment-name">${escapeHtml(comment.author.fullName || comment.author.username)}</div>
          <div class="comment-sub">@${escapeHtml(comment.author.username)} · ${timeAgo(comment.createdAt)}</div>
        </div>
      </a>
      <div class="comment-text mt-2">${nl2br(comment.text)}</div>
    </div>
  `;
}

function renderPostCard(post, options = {}) {
  const mode = options.mode || "feed";
  const showOpen = mode !== "single";
  const preview = Array.isArray(post.commentsPreview) ? post.commentsPreview : [];
  const commentsMarkup = preview.length
    ? `
        <div class="comments-preview">
          ${preview.map(renderCommentPreview).join("")}
        </div>
      `
    : `<div class="comments-preview"><div class="comment-preview-item muted">Hali izoh yo'q</div></div>`;

  return `
    <article class="feed-card" data-post-card data-post-id="${post.id}">
      <div class="feed-card-head">
        <div class="author-row">
          <a href="${profileUrl(post.author.username)}" class="author-row">
            ${avatarMarkup(post.author)}
            <div class="author-meta">
              <div class="author-name">${escapeHtml(post.author.fullName || post.author.username)}</div>
              <div class="author-sub">@${escapeHtml(post.author.username)} · ${timeAgo(post.createdAt)}</div>
            </div>
          </a>
          ${showOpen ? `<a class="icon-btn ms-auto" href="${postUrl(post.id)}" aria-label="Postni ochish"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ""}
        </div>
        ${renderGallery(post.images, `gallery-${post.id}`)}
      </div>
      <div class="feed-card-body">
        ${post.caption ? `<p class="post-caption">${nl2br(post.caption)}</p>` : ""}
        ${renderTags(post.tags)}
        <div class="action-row">
          <div class="action-group">
            <button class="action-chip ${post.likedByUser ? "active" : ""}" type="button" data-action="toggle-like" data-post-id="${post.id}" data-liked="${post.likedByUser ? "1" : "0"}">
              <i class="fa-${post.likedByUser ? "solid" : "regular"} fa-heart"></i>
              <span data-count>${post.likesCount}</span>
            </button>
            <button class="action-chip" type="button" data-action="open-comments" data-post-id="${post.id}">
              <i class="fa-regular fa-comment-dots"></i>
              <span data-post-comments="${post.id}">${post.commentsCount}</span>
            </button>
          </div>
          <div class="action-group">
            <span class="helper-text">Tavsiya etiladi</span>
            ${showOpen ? `<a class="action-chip" href="${postUrl(post.id)}"><i class="fa-solid fa-arrow-right"></i> Batafsil</a>` : ""}
          </div>
        </div>
        ${mode === "feed" ? commentsMarkup : ""}
      </div>
    </article>
  `;
}

function renderAdCard(ad) {
  if (!ad) {
    return "";
  }

  return `
    <article class="ad-card" data-ad-card data-ad-id="${ad.id}" data-post-id="${ad.postId}" data-placement-key="${escapeHtml(ad.placementKey)}">
      <div class="ad-image">
        <img src="${escapeHtml(ad.image)}" alt="${escapeHtml(ad.title)}" loading="lazy">
      </div>
      <div class="ad-body">
        <div class="ad-meta">
          <span class="ad-badge"><i class="fa-solid fa-rectangle-ad"></i> Reklama</span>
          <button class="skip-ad" type="button" data-action="skip-ad">Reklamani o‘tkazib yuborish</button>
        </div>
        <div>
          <h3 class="mb-2">${escapeHtml(ad.title)}</h3>
          <p class="page-subline mb-0">${escapeHtml(ad.text)}</p>
        </div>
        <div class="ad-actions">
          <a class="primary-btn" href="${escapeHtml(ad.ctaLink)}" target="_blank" rel="noreferrer">
            <i class="fa-solid fa-bolt"></i>
            <span>${escapeHtml(ad.ctaText)}</span>
          </a>
        </div>
      </div>
    </article>
  `;
}

function feedItemMarkup(item) {
  if (item.type === "ad") {
    return renderAdCard(item.ad);
  }

  return `
    ${item.adAbove ? renderAdCard(item.adAbove) : ""}
    ${renderPostCard(item.post)}
    ${item.adBelow ? renderAdCard(item.adBelow) : ""}
  `;
}

function renderCommentNode(comment, context) {
  return `
    <div class="comment-item" data-comment-id="${comment.id}">
      <a class="comment-author" href="${profileUrl(comment.author.username)}">
        ${avatarMarkup(comment.author, "avatar-mini")}
        <div class="comment-meta">
          <div class="comment-name">${escapeHtml(comment.author.fullName || comment.author.username)}</div>
          <div class="comment-sub">@${escapeHtml(comment.author.username)} · ${timeAgo(comment.createdAt)}</div>
        </div>
      </a>
      <div class="comment-text">${nl2br(comment.text)}</div>
      <div class="comment-actions">
        <button class="comment-link ${comment.likedByUser ? "text-danger" : ""}" type="button" data-action="like-comment" data-comment-id="${comment.id}" data-liked="${comment.likedByUser ? "1" : "0"}">
          <i class="fa-${comment.likedByUser ? "solid" : "regular"} fa-heart"></i>
          <span data-comment-like-count="${comment.id}">${comment.likesCount}</span>
        </button>
        <button class="comment-link" type="button" data-action="reply-comment" data-context="${context}" data-comment-id="${comment.id}" data-comment-user="${escapeHtml(comment.author.username)}">
          Javob yozish
        </button>
      </div>
      ${comment.replies?.length ? `<div class="comment-children">${comment.replies.map((reply) => renderCommentNode(reply, context)).join("")}</div>` : ""}
    </div>
  `;
}

function mountSwipers(root = document) {
  if (typeof Swiper === "undefined") {
    return;
  }

  qsa(".gallery-swiper", root).forEach((element) => {
    if (element.dataset.swiperReady === "1") {
      return;
    }

    const counter = element.parentElement?.querySelector("[data-gallery-counter]");
    const updateCounter = (swiper) => {
      if (!counter) {
        return;
      }
      counter.textContent = `${swiper.realIndex + 1}/${swiper.slides.length}`;
    };

    const swiper = new Swiper(element, {
      slidesPerView: 1,
      spaceBetween: 0,
      pagination: {
        el: element.querySelector(".swiper-pagination"),
        clickable: true,
      },
      on: {
        init() {
          updateCounter(this);
        },
        slideChange() {
          updateCounter(this);
        },
      },
    });

    element.dataset.swiperReady = "1";
    element.dataset.swiperId = swiper.el.dataset.gallery || "";
  });
}

function ensureAdObserver() {
  if (state.adObserver || typeof IntersectionObserver === "undefined") {
    return;
  }

  state.adObserver = new IntersectionObserver(
    async (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.55) {
          continue;
        }

        const card = entry.target;
        if (card.dataset.impressed === "1") {
          state.adObserver.unobserve(card);
          continue;
        }

        try {
          await api(`/api/ads/${card.dataset.adId}/impression`, {
            method: "POST",
            body: {
              postId: card.dataset.postId,
              placementKey: card.dataset.placementKey,
            },
          });
          card.dataset.impressed = "1";
        } catch (error) {
          card.dataset.impressed = "0";
        } finally {
          state.adObserver.unobserve(card);
        }
      }
    },
    {
      threshold: [0.55],
    }
  );
}

function observeAds(root = document) {
  ensureAdObserver();
  if (!state.adObserver) {
    return;
  }

  qsa("[data-ad-card]", root).forEach((card) => {
    if (card.dataset.observed === "1") {
      return;
    }
    card.dataset.observed = "1";
    state.adObserver.observe(card);
  });
}

function updatePostLikeUI(postId, liked, likesCount) {
  qsa(`[data-action="toggle-like"][data-post-id="${postId}"]`).forEach((button) => {
    button.dataset.liked = liked ? "1" : "0";
    button.classList.toggle("active", liked);
    const icon = qs("i", button);
    const count = qs("[data-count]", button);
    if (icon) {
      icon.className = `fa-${liked ? "solid" : "regular"} fa-heart`;
    }
    if (count) {
      count.textContent = String(likesCount);
    }
  });
}

function updatePostCommentsUI(postId, count) {
  qsa(`[data-post-comments="${postId}"]`).forEach((node) => {
    node.textContent = String(count);
  });
}

function updateCommentLikeUI(commentId, liked, likesCount) {
  qsa(`[data-action="like-comment"][data-comment-id="${commentId}"]`).forEach((button) => {
    button.dataset.liked = liked ? "1" : "0";
    button.classList.toggle("text-danger", liked);
    const icon = qs("i", button);
    const count = qs(`[data-comment-like-count="${commentId}"]`, button);
    if (icon) {
      icon.className = `fa-${liked ? "solid" : "regular"} fa-heart`;
    }
    if (count) {
      count.textContent = String(likesCount);
    }
  });
}

async function togglePostLike(button) {
  if (!requiresAuth()) {
    return;
  }

  const postId = button.dataset.postId;
  const currentLiked = button.dataset.liked === "1";
  const currentCount = Number(qs("[data-count]", button)?.textContent || 0);

  updatePostLikeUI(postId, !currentLiked, currentLiked ? currentCount - 1 : currentCount + 1);

  try {
    const response = await api(`/api/posts/${postId}/like`, { method: "POST" });
    updatePostLikeUI(postId, response.liked, response.likesCount);
  } catch (error) {
    updatePostLikeUI(postId, currentLiked, currentCount);
    showToast(error.message, "error");
  }
}

async function toggleCommentLike(button) {
  if (!requiresAuth()) {
    return;
  }

  const commentId = button.dataset.commentId;
  const currentLiked = button.dataset.liked === "1";
  const currentCount = Number(qs(`[data-comment-like-count="${commentId}"]`, button)?.textContent || 0);

  updateCommentLikeUI(commentId, !currentLiked, currentLiked ? currentCount - 1 : currentCount + 1);

  try {
    const response = await api(`/api/comments/${commentId}/like`, { method: "POST" });
    updateCommentLikeUI(commentId, response.liked, response.likesCount);
  } catch (error) {
    updateCommentLikeUI(commentId, currentLiked, currentCount);
    showToast(error.message, "error");
  }
}

function setReplyTarget(context, target) {
  state.replyTargets[context] = target;

  const indicator = qs(context === "sheet" ? "#sheetReplyIndicator" : "#inlineReplyIndicator");
  if (!indicator) {
    return;
  }

  if (!target) {
    indicator.classList.remove("active");
    indicator.innerHTML = "";
    return;
  }

  indicator.classList.add("active");
  indicator.innerHTML = `
    <span>@${escapeHtml(target.username)} uchun javob</span>
    <button class="comment-link" type="button" data-action="cancel-reply" data-context="${context}">Bekor qilish</button>
  `;
}

async function loadComments(postId, targetSelector, context) {
  const target = typeof targetSelector === "string" ? qs(targetSelector) : targetSelector;
  if (!target) {
    return;
  }

  target.innerHTML = `<div class="loading-state">Izohlar yuklanmoqda...</div>`;

  try {
    const response = await api(`/api/posts/${postId}/comments`);

    if (!response.comments.length) {
      target.innerHTML = `<div class="empty-state">Hali izoh yo'q</div>`;
      return;
    }

    target.innerHTML = response.comments.map((comment) => renderCommentNode(comment, context)).join("");
  } catch (error) {
    target.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function openCommentsSheet(postId) {
  const sheet = qs("#commentsSheet");
  if (!sheet) {
    return;
  }

  if (!state.commentsSheetInstance && window.bootstrap?.Offcanvas) {
    state.commentsSheetInstance = new bootstrap.Offcanvas(sheet);
  }

  state.currentCommentsPostId = postId;
  setReplyTarget("sheet", null);
  const form = qs("#sheetCommentForm");
  if (form) {
    form.dataset.postId = postId;
  }
  loadComments(postId, "#sheetCommentsList", "sheet");
  state.commentsSheetInstance?.show();
}

async function submitCommentForm(form) {
  if (!requiresAuth()) {
    return;
  }

  const textarea = qs("textarea", form);
  const submitButton = qs('[type="submit"]', form);
  const context = form.dataset.context || "inline";
  const target = state.replyTargets[context];
  const text = textarea?.value.trim() || "";
  const postId = form.dataset.postId || state.currentCommentsPostId;

  if (!text) {
    showToast("Izoh matnini kiriting.", "error");
    return;
  }

  if (!postId) {
    showToast("Post topilmadi.", "error");
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    if (target) {
      await api(`/api/comments/${target.id}/reply`, {
        method: "POST",
        body: { text },
      });
      const countNode = qs(`[data-post-comments="${postId}"]`);
      const current = Number(countNode?.textContent || 0);
      updatePostCommentsUI(postId, current + 1);
    } else {
      const response = await api(`/api/posts/${postId}/comments`, {
        method: "POST",
        body: { text },
      });
      updatePostCommentsUI(postId, response.commentsCount);
    }

    textarea.value = "";
    setReplyTarget(context, null);
    showToast(target ? "Javob yuborildi." : "Izoh qo'shildi.", "success");

    if (context === "sheet") {
      await loadComments(postId, "#sheetCommentsList", "sheet");
      return;
    }

    await loadComments(postId, "#inlineCommentsList", "inline");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

function homeEmptyMarkup(message = "Hali kontent yo'q", query = "") {
  return `
    <div class="empty-state">
      <h3 class="mb-2">${escapeHtml(message)}</h3>
      <p class="mb-3">${
        query
          ? `"${escapeHtml(query)}" bo'yicha hozircha natija topilmadi. Boshqa so'zni sinab ko'ring.`
          : "Birinchi chiroyli foto postingizni ulashing va Uzbek jamiyatini boshlang."
      }</p>
      <a class="primary-btn" href="${state.me ? "/create.html" : "/register.html"}">
        <i class="fa-solid fa-sparkles"></i>
        <span>${state.me ? "Post joylash" : "Hisob yaratish"}</span>
      </a>
    </div>
  `;
}

function homeSkeletonMarkup() {
  return Array.from({ length: 3 })
    .map(
      () => `
        <div class="feed-card">
          <div class="feed-card-head">
            <div class="author-row">
              <div class="avatar skeleton"></div>
              <div class="author-meta">
                <div class="skeleton" style="height:16px;border-radius:10px;max-width:140px;"></div>
                <div class="skeleton mt-2" style="height:12px;border-radius:10px;max-width:110px;"></div>
              </div>
            </div>
            <div class="skeleton mt-3" style="height:420px;border-radius:24px;"></div>
          </div>
          <div class="feed-card-body">
            <div class="skeleton" style="height:16px;border-radius:10px;"></div>
            <div class="skeleton mt-2" style="height:16px;border-radius:10px;max-width:70%;"></div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderSearchProfiles(users = [], selector = "#searchProfiles") {
  const host = typeof selector === "string" ? qs(selector) : selector;
  if (!host) {
    return;
  }

  if (!users.length) {
    host.innerHTML = "";
    return;
  }

  host.innerHTML = `
    <section class="profile-card">
      <div class="section-title">
        <h2>Mos profillar</h2>
        <span class="helper-text">${users.length} ta natija</span>
      </div>
      <div class="search-profile-list">
        ${users
          .map(
            (user) => `
              <div class="search-profile-item">
                <div class="author-row">
                  <a class="author-row" href="${profileUrl(user.username)}">
                    ${avatarMarkup(user, "avatar")}
                    <div class="author-meta">
                      <div class="author-name">${escapeHtml(user.fullName)}</div>
                      <div class="author-sub">@${escapeHtml(user.username)}</div>
                    </div>
                  </a>
                </div>
                <div class="inline-actions">
                  <span class="mini-meta">${user.followersCount || 0} obunachi</span>
                  ${
                    state.me && state.me.username !== user.username
                      ? `<a class="ghost-link" href="${chatUrl({ username: user.username })}"><i class="fa-regular fa-paper-plane"></i> Xabar</a>`
                      : ""
                  }
                </div>
              </div>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderHomeMetrics({ primaryValue, primaryLabel, secondaryValue, secondaryLabel }) {
  const heroMeta = qs("#homeHeroMeta");
  if (!heroMeta) {
    return;
  }

  heroMeta.innerHTML = `
    <div class="metric-pill">
      <strong>${primaryValue}</strong>
      <span class="mini-meta">${primaryLabel}</span>
    </div>
    <div class="metric-pill">
      <strong>${secondaryValue}</strong>
      <span class="mini-meta">${secondaryLabel}</span>
    </div>
    <div class="metric-pill">
      <strong>1-5</strong>
      <span class="mini-meta">Foto galereya</span>
    </div>
  `;
}

async function loadRecommendedFeed(feed) {
  const response = await api("/api/posts/recommended");

  if (response.empty) {
    feed.innerHTML = homeEmptyMarkup();
    renderHomeMetrics({
      primaryValue: 0,
      primaryLabel: "Yangi tavsiya",
      secondaryValue: 0,
      secondaryLabel: "Faol reklama",
    });
    return;
  }

  feed.innerHTML = response.items.map(feedItemMarkup).join("");
  mountSwipers(feed);
  observeAds(feed);

  const postCount = response.items.filter((item) => item.type === "post").length;
  const adCount = response.items.filter((item) => item.type === "ad").length;
  renderSearchProfiles([]);
  renderHomeMetrics({
    primaryValue: postCount,
    primaryLabel: "Yangi tavsiya",
    secondaryValue: adCount,
    secondaryLabel: "Faol reklama",
  });

  const title = qs("#feedSectionTitle");
  const meta = qs("#feedSectionMeta");
  if (title) {
    title.textContent = "Bosh sahifa";
  }
  if (meta) {
    meta.textContent = "Har kirishda yangi tartib";
  }
}

async function loadSearchFeed(feed, query) {
  const title = qs("#feedSectionTitle");
  const meta = qs("#feedSectionMeta");
  const response = await api(`/api/search?q=${encodeURIComponent(query)}`);

  renderSearchProfiles(response.users || []);

  if (!response.posts.length) {
    feed.innerHTML = homeEmptyMarkup("Natija topilmadi", query);
  } else {
    feed.innerHTML = response.posts.map((post) => renderPostCard(post)).join("");
    mountSwipers(feed);
  }

  renderHomeMetrics({
    primaryValue: response.totals.posts,
    primaryLabel: "Mos post",
    secondaryValue: response.totals.users,
    secondaryLabel: "Mos profil",
  });

  if (title) {
    title.textContent = `"${query}" qidiruvi`;
  }
  if (meta) {
    meta.textContent = `${response.totals.posts} ta post, ${response.totals.users} ta profil topildi`;
  }
}

async function initHomePage() {
  const feed = qs("#feedContainer");
  if (!feed) {
    return;
  }

  state.searchQuery = currentSearchQuery();
  const input = qs("#feedSearchInput");
  if (input) {
    input.value = state.searchQuery;
  }

  feed.innerHTML = homeSkeletonMarkup();

  try {
    if (state.searchQuery) {
      await loadSearchFeed(feed, state.searchQuery);
      return;
    }

    await loadRecommendedFeed(feed);
  } catch (error) {
    feed.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function initSearchPage() {
  const form = qs("#searchPageForm");
  const input = qs("#searchPageInput");
  const postsHost = qs("#searchPagePosts");
  const usersHost = qs("#searchPageUsers");
  const summaryHost = qs("#searchPageSummary");

  if (!form || !input || !postsHost || !usersHost || !summaryHost) {
    return;
  }

  const query = currentSearchQuery();
  input.value = query;

  const runSearch = async (nextQuery) => {
    const cleanQuery = nextQuery.trim();
    const params = new URLSearchParams(location.search);
    if (cleanQuery) {
      params.set("q", cleanQuery);
    } else {
      params.delete("q");
    }
    history.replaceState({}, "", `${location.pathname}${params.toString() ? `?${params}` : ""}`);

    if (!cleanQuery) {
      summaryHost.innerHTML = `<div class="hero-card"><h1 class="display-title" style="font-size:2.4rem;">Qidiruv</h1><p class="page-subline">Postlar, hashtaglar va foydalanuvchilarni tez toping.</p></div>`;
      usersHost.innerHTML = "";
      postsHost.innerHTML = `<div class="empty-state">Qidiruv boshlash uchun kalit so'z kiriting.</div>`;
      return;
    }

    summaryHost.innerHTML = `<div class="loading-state">Qidiruv natijalari yuklanmoqda...</div>`;
    usersHost.innerHTML = "";
    postsHost.innerHTML = homeSkeletonMarkup();

    try {
      const response = await api(`/api/search?q=${encodeURIComponent(cleanQuery)}`);
      summaryHost.innerHTML = `
        <div class="hero-card">
          <span class="eyebrow"><i class="fa-solid fa-magnifying-glass"></i> Qidiruv natijasi</span>
          <h1 class="display-title" style="font-size:2.4rem;">"${escapeHtml(cleanQuery)}"</h1>
          <p class="page-subline">${response.totals.users} ta profil va ${response.totals.posts} ta post topildi.</p>
        </div>
      `;

      renderSearchProfiles(response.users || [], usersHost);

      if (!(response.posts || []).length) {
        postsHost.innerHTML = homeEmptyMarkup("Post topilmadi", cleanQuery);
        return;
      }

      postsHost.innerHTML = response.posts.map((post) => renderPostCard(post)).join("");
      mountSwipers(postsHost);
    } catch (error) {
      summaryHost.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
      postsHost.innerHTML = "";
      usersHost.innerHTML = "";
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runSearch(input.value);
  });

  await runSearch(query);
}

function renderChatRooms() {
  const host = qs("#chatRoomsList");
  if (!host) {
    return;
  }

  if (!state.chat.rooms.length) {
    host.innerHTML = `<div class="empty-state">Hali chatlar yo'q. Yangi suhbat boshlang.</div>`;
    return;
  }

  host.innerHTML = state.chat.rooms
    .map((room) => {
      const participant = room.participant || room.participants?.[0];
      const isActive = room.id === state.chat.currentRoom?.id;
      return `
        <button class="chat-room-item ${isActive ? "active" : ""}" type="button" data-action="open-chat-room" data-room-id="${room.id}">
          <div class="author-row">
            ${avatarMarkup(participant || { username: "?" }, "avatar")}
            <div class="author-meta">
              <div class="author-name">${escapeHtml(participant?.fullName || participant?.username || "Noma'lum")}</div>
              <div class="author-sub">@${escapeHtml(participant?.username || "user")}</div>
            </div>
          </div>
          <div class="chat-room-meta">
            <span class="mini-meta">${timeAgo(room.lastMessageAt)}</span>
            ${room.unreadCount ? `<span class="chat-unread-badge">${room.unreadCount}</span>` : ""}
          </div>
          <div class="chat-room-preview">${escapeHtml(truncate(room.lastMessageText || "Yangi suhbat", 58))}</div>
        </button>
      `;
    })
    .join("");
}

function scrollChatMessagesToBottom() {
  const host = qs("#chatMessages");
  if (!host) {
    return;
  }
  host.scrollTop = host.scrollHeight;
}

function renderChatMessages() {
  const header = qs("#chatHeader");
  const host = qs("#chatMessages");
  const empty = qs("#chatEmptyState");
  const form = qs("#chatForm");
  const participant = state.chat.currentRoom?.participant;

  if (!header || !host || !empty || !form) {
    return;
  }

  if (!state.chat.currentRoom) {
    header.innerHTML = `<div class="section-title"><h2>Chat</h2></div>`;
    host.innerHTML = "";
    empty.classList.remove("d-none");
    form.classList.add("d-none");
    return;
  }

  header.innerHTML = `
    <div class="author-row">
      ${avatarMarkup(participant || { username: "?" }, "avatar")}
      <div class="author-meta">
        <div class="author-name">${escapeHtml(participant?.fullName || participant?.username || "Chat")}</div>
        <div class="author-sub">@${escapeHtml(participant?.username || "user")}</div>
      </div>
    </div>
  `;

  empty.classList.add("d-none");
  form.classList.remove("d-none");

  if (!state.chat.messages.length) {
    host.innerHTML = `<div class="empty-state">Suhbat boshlandi. Birinchi xabarni yuboring.</div>`;
    return;
  }

  host.innerHTML = state.chat.messages
    .map(
      (message) => `
        <div class="chat-bubble-row ${message.isMine ? "mine" : ""}">
          ${!message.isMine ? avatarMarkup(message.sender, "avatar-mini") : ""}
          <div class="chat-bubble ${message.isMine ? "mine" : ""}">
            <div class="chat-bubble-text">${nl2br(message.text)}</div>
            <div class="chat-bubble-meta">${timeAgo(message.createdAt)}</div>
          </div>
        </div>
      `
    )
    .join("");

  scrollChatMessagesToBottom();
}

function upsertChatMessage(message) {
  if (!message || !state.chat.currentRoom || message.roomId !== state.chat.currentRoom.id) {
    return;
  }

  const exists = state.chat.messages.some((entry) => entry.id === message.id);
  if (exists) {
    return;
  }

  state.chat.messages.push(message);
  state.chat.messages.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));
  renderChatMessages();
}

function ensureSocketConnection() {
  if (state.chat.socket || typeof io === "undefined" || !state.me) {
    return state.chat.socket;
  }

  const socket = io();
  socket.on("connect", () => {
    if (state.chat.currentRoom?.id) {
      socket.emit("chat:join", { roomId: state.chat.currentRoom.id });
    }
  });
  socket.on("chat:new-message", (payload) => {
    if (
      state.chat.currentRoom?.id === payload.roomId &&
      payload.message &&
      !payload.message.isMine
    ) {
      api(`/api/chat/rooms/${payload.roomId}/messages`)
        .then((response) => {
          state.chat.currentRoom = response.room;
          state.chat.messages = response.messages || [];
          renderChatMessages();
          return loadChatRooms();
        })
        .catch(() => {});
      return;
    }

    upsertChatMessage(payload.message);
    loadChatRooms().catch(() => {});
  });
  socket.on("chat:room-updated", () => {
    loadChatRooms().catch(() => {});
  });
  socket.on("chat:error", (payload) => {
    showToast(payload?.message || "Chat xatosi yuz berdi.", "error");
  });

  state.chat.socket = socket;
  return socket;
}

async function loadChatRooms() {
  if (!state.me) {
    return [];
  }

  const response = await api("/api/chat/rooms");
  state.chat.rooms = response.rooms || [];
  renderChatRooms();
  return state.chat.rooms;
}

async function openChatRoom(roomId, options = {}) {
  if (!roomId) {
    return;
  }

  const response = await api(`/api/chat/rooms/${encodeURIComponent(roomId)}/messages`);
  state.chat.currentRoom = response.room;
  state.chat.messages = response.messages || [];
  state.chat.rooms = state.chat.rooms.map((room) =>
    room.id === response.room.id ? { ...room, unreadCount: 0 } : room
  );
  renderChatRooms();
  renderChatMessages();

  if (options.pushHistory !== false) {
    history.replaceState({}, "", chatUrl({ roomId }));
  }

  const socket = ensureSocketConnection();
  socket?.emit("chat:join", { roomId });
}

async function startChatWithUsername(username) {
  const response = await api("/api/chat/rooms", {
    method: "POST",
    body: { username },
  });
  await loadChatRooms();
  await openChatRoom(response.room.id);
}

async function sendChatMessage() {
  const input = qs("#chatInput");
  const submitButton = qs('#chatForm [type="submit"]');
  if (!input || !state.chat.currentRoom) {
    return;
  }

  const text = input.value.trim();
  if (!text) {
    return;
  }

  submitButton.disabled = true;

  try {
    const response = await api(`/api/chat/rooms/${state.chat.currentRoom.id}/messages`, {
      method: "POST",
      body: { text },
    });
    upsertChatMessage(response.chatMessage);
    input.value = "";
    await loadChatRooms();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
}

async function searchUsersForChat(query) {
  const host = qs("#chatUserSearchResults");
  if (!host) {
    return;
  }

  if (!query.trim()) {
    host.innerHTML = "";
    return;
  }

  try {
    const response = await api(`/api/chat/users?q=${encodeURIComponent(query)}`);
    state.chat.userSearchResults = response.users || [];

    host.innerHTML = state.chat.userSearchResults.length
      ? state.chat.userSearchResults
          .map(
            (user) => `
              <button class="search-profile-item" type="button" data-action="start-chat-user" data-username="${escapeHtml(user.username)}">
                <div class="author-row">
                  ${avatarMarkup(user, "avatar-mini")}
                  <div class="author-meta">
                    <div class="author-name">${escapeHtml(user.fullName)}</div>
                    <div class="author-sub">@${escapeHtml(user.username)}</div>
                  </div>
                </div>
                <span class="mini-meta">Chat ochish</span>
              </button>
            `
          )
          .join("")
      : `<div class="empty-state">Mos foydalanuvchi topilmadi.</div>`;
  } catch (error) {
    host.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function initChatPage() {
  if (!state.me) {
    redirectToLogin();
    return;
  }

  const form = qs("#chatForm");
  const userSearchForm = qs("#chatUserSearchForm");
  const userSearchInput = qs("#chatUserSearchInput");

  ensureSocketConnection();
  await loadChatRooms();
  renderChatMessages();

  if (form && !form.dataset.bound) {
    form.dataset.bound = "1";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await sendChatMessage();
    });
  }

  if (userSearchForm && !userSearchForm.dataset.bound) {
    userSearchForm.dataset.bound = "1";
    userSearchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await searchUsersForChat(userSearchInput?.value || "");
    });
  }

  const username = currentChatUsername();
  const roomId = currentChatRoomId();
  if (username) {
    await startChatWithUsername(username);
    const userSearchResults = qs("#chatUserSearchResults");
    if (userSearchResults) {
      userSearchResults.innerHTML = "";
    }
    return;
  }

  if (roomId) {
    await openChatRoom(roomId, { pushHistory: false });
    return;
  }

  if (state.chat.rooms[0]) {
    await openChatRoom(state.chat.rooms[0].id, { pushHistory: false });
  }
}

function validateSelectedFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) {
    throw new Error("Kamida 1 ta rasm tanlang.");
  }
  if (files.length > 5) {
    throw new Error("Ko'pi bilan 5 ta rasm tanlash mumkin.");
  }
  files.forEach((file) => {
    if (!file.type.startsWith("image/")) {
      throw new Error("Faqat rasm fayllari mumkin.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("Har bir rasm hajmi 5MB dan oshmasin.");
    }
  });
  return files;
}

function renderCreatePreviews(files) {
  const host = qs("#previewGrid");
  if (!host) {
    return;
  }

  if (!files.length) {
    host.innerHTML = "";
    return;
  }

  host.innerHTML = files
    .map(
      (file, index) => `
        <div class="preview-item">
          <img src="${URL.createObjectURL(file)}" alt="Preview ${index + 1}">
          <span>${index + 1}/${files.length}</span>
        </div>
      `
    )
    .join("");
}

async function initCreatePage() {
  if (!state.me) {
    redirectToLogin();
    return;
  }

  const form = qs("#createForm");
  const input = qs("#imagesInput");
  if (!form || !input) {
    return;
  }

  input.addEventListener("change", () => {
    try {
      const files = validateSelectedFiles(input.files);
      renderCreatePreviews(files);
      qs("#createHelper").textContent = `${files.length} ta rasm tayyor.`;
    } catch (error) {
      input.value = "";
      renderCreatePreviews([]);
      qs("#createHelper").textContent = error.message;
      showToast(error.message, "error");
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    let files;
    try {
      files = validateSelectedFiles(input.files);
    } catch (error) {
      showToast(error.message, "error");
      return;
    }

    const submitButton = qs('[type="submit"]', form);
    submitButton.disabled = true;

    try {
      const formData = new FormData(form);
      files.forEach((file) => formData.append("images", file));
      const response = await api("/api/posts", {
        method: "POST",
        body: formData,
      });

      showToast("Post joylandi.", "success");
      location.href = postUrl(response.post.id);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

async function initAuthPage(type) {
  if (state.me) {
    location.href = "/";
    return;
  }

  const form = qs(type === "login" ? "#loginForm" : "#registerForm");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = qs('[type="submit"]', form);
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = type === "login" ? "Kirilmoqda..." : "Yaratilmoqda...";
    setAuthFeedback("");

    try {
      const payload =
        type === "login"
          ? {
              identifier: qs('[name="identifier"]', form).value.trim(),
              password: qs('[name="password"]', form).value,
            }
          : {
              fullName: qs('[name="fullName"]', form).value.trim(),
              username: qs('[name="username"]', form).value.trim(),
              email: qs('[name="email"]', form).value.trim(),
              password: qs('[name="password"]', form).value,
            };

      const result = await api(type === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        body: payload,
      });
      state.me = result.user || null;

      const authState = await api("/api/auth/me");
      if (!authState?.authenticated) {
        throw new Error(
          "Sessiya saqlanmadi. Server cookie'ni yozmadi yoki proxy sozlamasi noto'g'ri."
        );
      }

      const next = new URLSearchParams(location.search).get("next");
      setAuthFeedback(result.message || "Muvaffaqiyatli bajarildi.", "success");
      showToast(result.message || "Muvaffaqiyatli bajarildi.", "success");
      window.setTimeout(() => {
        location.href = next || "/";
      }, 180);
    } catch (error) {
      setAuthFeedback(error.message, "error");
      showToast(error.message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });
}

function renderProfileHeader(user, stats, editable) {
  const host = qs("#profileHero");
  if (!host) {
    return;
  }

  host.innerHTML = `
    <div class="profile-card">
      <div class="profile-head">
        ${avatarMarkup(user, "avatar-xl")}
        <div class="author-meta">
          <div class="eyebrow"><i class="fa-solid fa-user-group"></i> Profil</div>
          <h1 class="display-title" style="font-size:2.2rem;">${escapeHtml(user.fullName)}</h1>
          <div class="author-sub">@${escapeHtml(user.username)}</div>
        </div>
      </div>
      <p class="profile-bio mt-3">${escapeHtml(user.bio || "Bio hali qo'shilmagan.")}</p>
      <div class="profile-stats mt-3">
        <div class="stat-chip">
          <strong>${stats.postsCount || 0}</strong>
          <span class="mini-meta">Post</span>
        </div>
        <div class="stat-chip">
          <strong data-profile-followers>${user.followersCount || 0}</strong>
          <span class="mini-meta">Obunachi</span>
        </div>
        <div class="stat-chip">
          <strong data-profile-following>${user.followingCount || 0}</strong>
          <span class="mini-meta">Obuna</span>
        </div>
      </div>
      <p class="page-subline mt-3">Layklar: ${stats.likesTotal || 0} · Reklama ko'rish: ${stats.adViewsTotal || 0}</p>
      <div class="inline-actions mt-3">
        ${
          editable
            ? `<a class="soft-btn" href="/wallet.html"><i class="fa-solid fa-wallet"></i> Hamyon</a>
               <button class="ghost-link" type="button" data-bs-toggle="collapse" data-bs-target="#profileEditBox"><i class="fa-solid fa-pen"></i> Tahrirlash</button>`
            : `<button class="${user.isFollowing ? "soft-btn" : "primary-btn"}" type="button" data-action="toggle-follow" data-username="${escapeHtml(user.username)}" data-following="${user.isFollowing ? "1" : "0"}">
                 <i class="fa-solid ${user.isFollowing ? "fa-user-check" : "fa-user-plus"}"></i>
                 <span>${user.isFollowing ? "Obunani bekor qilish" : "Obuna bo'lish"}</span>
               </button>
               <a class="ghost-link" href="${chatUrl({ username: user.username })}"><i class="fa-regular fa-paper-plane"></i> Xabar</a>`
        }
      </div>
    </div>
    ${
      editable
        ? `
          <div class="profile-card collapse" id="profileEditBox">
            <div class="section-title">
              <h3>Profilni yangilash</h3>
            </div>
            <form id="profileEditForm" class="form-stack">
              <div>
                <label class="field-label">To'liq ism</label>
                <input class="form-control" type="text" name="fullName" value="${escapeHtml(user.fullName)}" maxlength="60">
              </div>
              <div>
                <label class="field-label">Bio</label>
                <textarea class="form-control" name="bio" maxlength="240" placeholder="O'zingiz haqingizda qisqacha yozing">${escapeHtml(user.bio || "")}</textarea>
              </div>
              <div>
                <label class="field-label">Avatar</label>
                <input class="form-control" type="file" name="avatar" accept="image/*">
              </div>
              <button class="primary-btn" type="submit">Saqlash</button>
            </form>
          </div>
        `
        : ""
    }
  `;
}

function renderProfilePosts(posts) {
  const host = qs("#profilePosts");
  if (!host) {
    return;
  }

  if (!posts.length) {
    host.innerHTML = `<div class="empty-state">Bu profil hali post joylamagan.</div>`;
    return;
  }

  host.innerHTML = `
    <div class="section-title">
      <h2>Foto postlar</h2>
      <span class="helper-text">${posts.length} ta</span>
    </div>
    <div class="posts-grid">
      ${posts
        .map(
          (post) => `
            <a class="grid-post" href="${postUrl(post.id)}">
              <img src="${escapeHtml(post.images[0])}" alt="Post rasmi" loading="lazy">
              <div class="grid-post-meta">
                <div><i class="fa-regular fa-heart"></i> ${post.likesCount}</div>
              </div>
            </a>
          `
        )
        .join("")}
    </div>
  `;
}

async function bindProfileEditForm() {
  const form = qs("#profileEditForm");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = qs('[type="submit"]', form);
    submitButton.disabled = true;

    try {
      const formData = new FormData(form);
      const response = await api("/api/profile", {
        method: "PUT",
        body: formData,
      });
      state.me = response.user;
      renderHeaderActions();
      renderDesktopQuickLinks();
      showToast("Profil yangilandi.", "success");
      await initProfilePage();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

async function toggleFollow(button) {
  if (!requiresAuth()) {
    return;
  }

  const username = button.dataset.username;
  if (!username) {
    return;
  }

  button.disabled = true;

  try {
    const response = await api(`/api/users/${encodeURIComponent(username)}/follow`, {
      method: "POST",
    });
    const following = response.following;
    button.dataset.following = following ? "1" : "0";
    button.className = following ? "soft-btn" : "primary-btn";
    button.innerHTML = `
      <i class="fa-solid ${following ? "fa-user-check" : "fa-user-plus"}"></i>
      <span>${following ? "Obunani bekor qilish" : "Obuna bo'lish"}</span>
    `;

    const followersNode = qs("[data-profile-followers]");
    if (followersNode) {
      followersNode.textContent = String(response.user.followersCount || 0);
    }

    showToast(
      following ? "Obuna muvaffaqiyatli bo'ldi." : "Obuna bekor qilindi.",
      "success"
    );
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function initProfilePage() {
  const username = currentUsernameFromLocation();
  const editable = !username || username === state.me?.username;

  try {
    const response = editable
      ? await api("/api/profile/me")
      : await Promise.all([
          api(`/api/users/${encodeURIComponent(username)}/posts`),
          api(`/api/users/${encodeURIComponent(username)}`),
        ]).then(([postsPayload, profilePayload]) => ({
          user: profilePayload.user,
          stats: profilePayload.stats,
          posts: postsPayload.posts,
        }));

    renderProfileHeader(response.user, response.stats, editable);
    renderProfilePosts(response.posts || []);
    await bindProfileEditForm();
  } catch (error) {
    if (error.status === 401) {
      redirectToLogin();
      return;
    }
    const hero = qs("#profileHero");
    const posts = qs("#profilePosts");
    if (hero) {
      hero.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
    if (posts) {
      posts.innerHTML = "";
    }
  }
}

async function initWalletPage() {
  if (!state.me) {
    redirectToLogin();
    return;
  }

  const hero = qs("#walletHero");
  const list = qs("#earningsList");
  if (!hero || !list) {
    return;
  }

  try {
    const data = await api("/api/wallet/me");
    hero.innerHTML = `
      <div class="wallet-card">
        <div class="eyebrow"><i class="fa-solid fa-coins"></i> Hamyon</div>
        <div class="wallet-balance">${money(data.balance)}</div>
        <p class="page-subline">${escapeHtml(data.rateNote)}</p>
        <div class="wallet-stats mt-3">
          <div class="stat-chip">
            <strong>${data.totalAdViews}</strong>
            <span class="mini-meta">Jami ko'rish</span>
          </div>
          <div class="stat-chip">
            <strong>${money(data.totalEarned)}</strong>
            <span class="mini-meta">Jami daromad</span>
          </div>
          <div class="stat-chip">
            <strong>${money(0.0005)}</strong>
            <span class="mini-meta">Har view uchun</span>
          </div>
        </div>
        <div class="stack-actions mt-4">
          <button class="ghost-link" type="button" disabled>Withdraw (tez kunda)</button>
        </div>
      </div>
    `;

    if (!data.recentEarnings.length) {
      list.innerHTML = `<div class="empty-state">Hali reklama daromadi yig'ilmagan.</div>`;
      return;
    }

    list.innerHTML = data.recentEarnings
      .map(
        (item) => `
          <div class="earnings-item">
            <div>
              <div class="author-name">${escapeHtml(truncate(item.caption, 48))}</div>
              <div class="mini-meta">${item.adViewsCount} ta view · ${timeAgo(item.createdAt)}</div>
            </div>
            <div class="author-name">${escapeHtml(item.adRevenueFormatted)}</div>
          </div>
        `
      )
      .join("");
  } catch (error) {
    hero.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    list.innerHTML = "";
  }
}

async function initPostPage() {
  const id = currentPostIdFromLocation();
  const host = qs("#postView");
  const commentsWrap = qs("#inlineCommentsList");
  const composer = qs("#postCommentForm");

  if (!id || !host) {
    if (host) {
      host.innerHTML = `<div class="empty-state">Post topilmadi.</div>`;
    }
    return;
  }

  host.innerHTML = `<div class="loading-state">Post yuklanmoqda...</div>`;

  try {
    const { post } = await api(`/api/posts/${id}`);
    host.innerHTML = renderPostCard(post, { mode: "single" });
    mountSwipers(host);
    if (composer) {
      composer.dataset.postId = post.id;
    }
    if (commentsWrap) {
      await loadComments(post.id, commentsWrap, "inline");
    }
  } catch (error) {
    host.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderAdminOverview() {
  const host = qs("#adminOverview");
  if (!host || !state.admin.overview) {
    return;
  }

  const { totals, growth, topPosts, topUsers } = state.admin.overview;
  host.innerHTML = `
    <div class="metric-row">
      <div class="metric-pill"><strong>${totals.users}</strong><span class="mini-meta">Foydalanuvchi</span></div>
      <div class="metric-pill"><strong>${totals.posts}</strong><span class="mini-meta">Post</span></div>
      <div class="metric-pill"><strong>${totals.comments}</strong><span class="mini-meta">Izoh</span></div>
      <div class="metric-pill"><strong>${totals.ads}</strong><span class="mini-meta">Reklama</span></div>
      <div class="metric-pill"><strong>${totals.adViews}</strong><span class="mini-meta">Ad view</span></div>
      <div class="metric-pill"><strong>${money(totals.revenue)}</strong><span class="mini-meta">Daromad</span></div>
    </div>
    <div class="admin-grid mt-3">
      <div class="panel-card">
        <div class="section-title"><h3>O'sish</h3></div>
        <div class="mini-meta">Bugun: ${growth.usersToday} user, ${growth.postsToday} post</div>
        <div class="mini-meta">7 kun: ${growth.usersThisWeek} user, ${growth.postsThisWeek} post</div>
        <div class="mini-meta">Adminlar: ${totals.admins}, bloklanganlar: ${totals.blockedUsers}</div>
      </div>
      <div class="panel-card">
        <div class="section-title"><h3>Top postlar</h3></div>
        <div class="earnings-list">
          ${topPosts
            .map(
              (post) => `
                <a class="earnings-item" href="${postUrl(post.id)}">
                  <div>
                    <div class="author-name">${escapeHtml(truncate(post.caption, 52))}</div>
                    <div class="mini-meta">${post.likesCount} layk · ${post.commentsCount} izoh</div>
                  </div>
                  <div class="mini-meta">@${escapeHtml(post.author?.username || "user")}</div>
                </a>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="panel-card">
        <div class="section-title"><h3>Top profillar</h3></div>
        <div class="earnings-list">
          ${topUsers
            .map(
              (user) => `
                <a class="earnings-item" href="${profileUrl(user.username)}">
                  <div>
                    <div class="author-name">${escapeHtml(user.fullName)}</div>
                    <div class="mini-meta">@${escapeHtml(user.username)}</div>
                  </div>
                  <div class="mini-meta">${user.followersCount} obunachi</div>
                </a>
              `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function renderAdminUsers() {
  const host = qs("#adminUsersTable");
  if (!host) {
    return;
  }

  host.innerHTML = `
    <div class="admin-table-wrap">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>Foydalanuvchi</th>
            <th>Holat</th>
            <th>Stat</th>
            <th>Amallar</th>
          </tr>
        </thead>
        <tbody>
          ${state.admin.users
            .map(
              (user) => `
                <tr>
                  <td>
                    <div class="author-row">
                      ${avatarMarkup(user, "avatar-mini")}
                      <div>
                        <div class="author-name">${escapeHtml(user.fullName)}</div>
                        <div class="mini-meta">@${escapeHtml(user.username)} · ${escapeHtml(user.email || "")}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="mini-meta">${user.isAdmin ? "Admin" : "User"}${user.isBlocked ? " · Bloklangan" : ""}</div>
                    <div class="mini-meta">${user.followersCount} obunachi</div>
                  </td>
                  <td>
                    <div class="mini-meta">${user.postsCount} post</div>
                    <div class="mini-meta">${user.likesTotal} layk</div>
                    <div class="mini-meta">${money(user.totalRevenue)}</div>
                  </td>
                  <td>
                    <div class="inline-actions">
                      <button class="ghost-link" type="button" data-action="admin-toggle-admin" data-user-id="${user.id}">
                        ${user.isAdmin ? "Adminni olish" : "Admin qilish"}
                      </button>
                      <button class="soft-btn" type="button" data-action="admin-toggle-block" data-user-id="${user.id}">
                        ${user.isBlocked ? "Blokdan chiqarish" : "Bloklash"}
                      </button>
                    </div>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminPosts() {
  const host = qs("#adminPostsTable");
  if (!host) {
    return;
  }

  host.innerHTML = `
    <div class="admin-table-wrap">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>Post</th>
            <th>Muallif</th>
            <th>Stat</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${state.admin.posts
            .map(
              (post) => `
                <tr>
                  <td>
                    <a class="author-name" href="${postUrl(post.id)}">${escapeHtml(truncate(post.caption || "Sarlavhasiz post", 64))}</a>
                    <div class="mini-meta">${post.imageCount} rasm · ${timeAgo(post.createdAt)}</div>
                  </td>
                  <td><a class="mini-meta" href="${profileUrl(post.author.username)}">@${escapeHtml(post.author.username)}</a></td>
                  <td>
                    <div class="mini-meta">${post.likesCount} layk</div>
                    <div class="mini-meta">${post.commentsCount} izoh</div>
                    <div class="mini-meta">${post.adViewsCount} ad view</div>
                  </td>
                  <td>
                    <button class="ghost-link" type="button" data-action="admin-delete-post" data-post-id="${post.id}">O‘chirish</button>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminComments() {
  const host = qs("#adminCommentsTable");
  if (!host) {
    return;
  }

  host.innerHTML = `
    <div class="admin-table-wrap">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>Izoh</th>
            <th>Muallif</th>
            <th>Post</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${state.admin.comments
            .map(
              (comment) => `
                <tr>
                  <td>
                    <div class="author-name">${escapeHtml(truncate(comment.text, 72))}</div>
                    <div class="mini-meta">${timeAgo(comment.createdAt)}</div>
                  </td>
                  <td><span class="mini-meta">@${escapeHtml(comment.author.username)}</span></td>
                  <td><a class="mini-meta" href="${postUrl(comment.postId)}">Postni ochish</a></td>
                  <td><button class="ghost-link" type="button" data-action="admin-delete-comment" data-comment-id="${comment.id}">O‘chirish</button></td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminAds() {
  const host = qs("#adminAdsList");
  if (!host) {
    return;
  }

  host.innerHTML = state.admin.ads
    .map(
      (ad) => `
        <div class="earnings-item">
          <div>
            <div class="author-name">${escapeHtml(ad.title)}</div>
            <div class="mini-meta">${ad.isActive ? "Faol" : "Nofaol"} · ${timeAgo(ad.createdAt)}</div>
          </div>
          <div class="inline-actions">
            <button class="ghost-link" type="button" data-action="admin-edit-ad" data-ad-id="${ad.id}">Tahrirlash</button>
            <button class="soft-btn" type="button" data-action="admin-delete-ad" data-ad-id="${ad.id}">O‘chirish</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderAdminOverviewV2() {
  const host = qs("#adminOverview");
  if (!host || !state.admin.overview) {
    return;
  }

  const { totals, growth, averages, seo, topPosts, topUsers, topTags, recentUsers, recentPosts } =
    state.admin.overview;

  host.innerHTML = `
    <div class="metric-row">
      <div class="metric-pill"><strong>${totals.users}</strong><span class="mini-meta">Foydalanuvchi</span></div>
      <div class="metric-pill"><strong>${totals.posts}</strong><span class="mini-meta">Post</span></div>
      <div class="metric-pill"><strong>${totals.comments}</strong><span class="mini-meta">Izoh</span></div>
      <div class="metric-pill"><strong>${totals.activeAds}/${totals.ads}</strong><span class="mini-meta">Faol reklama</span></div>
      <div class="metric-pill"><strong>${totals.adViews}</strong><span class="mini-meta">Ad view</span></div>
      <div class="metric-pill"><strong>${money(totals.revenue)}</strong><span class="mini-meta">Daromad</span></div>
    </div>
    <div class="admin-grid mt-3">
      <div class="panel-card">
        <div class="section-title"><h3>O'sish</h3></div>
        <div class="mini-meta">Bugun: ${growth.usersToday} user, ${growth.postsToday} post</div>
        <div class="mini-meta">7 kun: ${growth.usersThisWeek} user, ${growth.postsThisWeek} post</div>
        <div class="mini-meta">Adminlar: ${totals.admins}, bloklanganlar: ${totals.blockedUsers}</div>
        <div class="mini-meta">Jami layk: ${totals.likes}</div>
      </div>
      <div class="panel-card">
        <div class="section-title"><h3>SEO va indeks</h3></div>
        <div class="mini-meta">Indexlanadigan postlar: ${seo.indexablePosts}</div>
        <div class="mini-meta">Caption bilan: ${seo.postsWithCaption}</div>
        <div class="mini-meta">Hashtag bilan: ${seo.postsWithTags}</div>
        <div class="mini-meta">SEO-ready profillar: ${seo.seoReadyProfiles}</div>
      </div>
      <div class="panel-card">
        <div class="section-title"><h3>O'rtacha ko'rsatkich</h3></div>
        <div class="mini-meta">Har postga layk: ${averages.likesPerPost}</div>
        <div class="mini-meta">Har postga izoh: ${averages.commentsPerPost}</div>
        <div class="mini-meta">Har postga ad view: ${averages.viewsPerPost}</div>
        <div class="mini-meta">Har postga daromad: ${money(averages.revenuePerPost)}</div>
      </div>
      <div class="panel-card">
        <div class="section-title"><h3>Top taglar</h3></div>
        <div class="tag-row">
          ${
            topTags.length
              ? topTags
                  .map((entry) => `<span class="tag-pill">#${escapeHtml(entry.tag)} (${entry.count})</span>`)
                  .join("")
              : `<span class="mini-meta">Hali hashtag statistikasi yo'q.</span>`
          }
        </div>
      </div>
      <div class="panel-card">
        <div class="section-title"><h3>Top postlar</h3></div>
        <div class="earnings-list">
          ${topPosts
            .map(
              (post) => `
                <a class="earnings-item" href="${postUrl(post.id)}">
                  <div>
                    <div class="author-name">${escapeHtml(truncate(post.caption, 52))}</div>
                    <div class="mini-meta">${post.likesCount} layk | ${post.commentsCount} izoh</div>
                  </div>
                  <div class="mini-meta">@${escapeHtml(post.author?.username || "user")}</div>
                </a>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="panel-card">
        <div class="section-title"><h3>Top profillar</h3></div>
        <div class="earnings-list">
          ${topUsers
            .map(
              (user) => `
                <a class="earnings-item" href="${profileUrl(user.username)}">
                  <div>
                    <div class="author-name">${escapeHtml(user.fullName)}</div>
                    <div class="mini-meta">@${escapeHtml(user.username)}</div>
                  </div>
                  <div class="mini-meta">${user.followersCount} obunachi</div>
                </a>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="panel-card">
        <div class="section-title"><h3>Yangi foydalanuvchilar</h3></div>
        <div class="earnings-list">
          ${recentUsers
            .map(
              (user) => `
                <a class="earnings-item" href="${profileUrl(user.username)}">
                  <div>
                    <div class="author-name">${escapeHtml(user.fullName)}</div>
                    <div class="mini-meta">@${escapeHtml(user.username)}</div>
                  </div>
                  <div class="mini-meta">${timeAgo(user.createdAt)}</div>
                </a>
              `
            )
            .join("")}
        </div>
      </div>
      <div class="panel-card">
        <div class="section-title"><h3>Yangi postlar</h3></div>
        <div class="earnings-list">
          ${recentPosts
            .map(
              (post) => `
                <a class="earnings-item" href="${postUrl(post.id)}">
                  <div>
                    <div class="author-name">${escapeHtml(truncate(post.caption, 52))}</div>
                    <div class="mini-meta">@${escapeHtml(post.author?.username || "user")}</div>
                  </div>
                  <div class="mini-meta">${timeAgo(post.createdAt)}</div>
                </a>
              `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function renderAdminUsersV2() {
  const host = qs("#adminUsersTable");
  if (!host) {
    return;
  }

  host.innerHTML = `
    <div class="admin-table-wrap">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>Foydalanuvchi</th>
            <th>Holat</th>
            <th>Stat</th>
            <th>Amallar</th>
          </tr>
        </thead>
        <tbody>
          ${state.admin.users
            .map(
              (user) => `
                <tr>
                  <td>
                    <div class="author-row">
                      ${avatarMarkup(user, "avatar-mini")}
                      <div>
                        <a class="author-name" href="${profileUrl(user.username)}">${escapeHtml(user.fullName)}</a>
                        <div class="mini-meta">@${escapeHtml(user.username)} | ${escapeHtml(user.email || "")}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="mini-meta">${user.isAdmin ? "Admin" : "User"}${user.isBlocked ? " | Bloklangan" : ""}</div>
                    <div class="mini-meta">${user.followersCount} obunachi</div>
                  </td>
                  <td>
                    <div class="mini-meta">${user.postsCount} post</div>
                    <div class="mini-meta">${user.likesTotal} layk</div>
                    <div class="mini-meta">${money(user.totalRevenue)}</div>
                  </td>
                  <td>
                    <div class="inline-actions">
                      <button class="ghost-link" type="button" data-action="admin-toggle-admin" data-user-id="${user.id}">
                        ${user.isAdmin ? "Adminni olish" : "Admin qilish"}
                      </button>
                      <button class="soft-btn" type="button" data-action="admin-toggle-block" data-user-id="${user.id}">
                        ${user.isBlocked ? "Blokdan chiqarish" : "Bloklash"}
                      </button>
                      <button class="danger-btn" type="button" data-action="admin-delete-user" data-user-id="${user.id}">
                        O'chirish
                      </button>
                    </div>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminPostsV2() {
  const host = qs("#adminPostsTable");
  if (!host) {
    return;
  }

  host.innerHTML = `
    <div class="admin-table-wrap">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>Post</th>
            <th>Muallif</th>
            <th>Stat</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${state.admin.posts
            .map(
              (post) => `
                <tr>
                  <td>
                    <a class="author-name" href="${postUrl(post.id)}">${escapeHtml(truncate(post.caption || "Sarlavhasiz post", 64))}</a>
                    <div class="mini-meta">${post.imageCount} rasm | ${timeAgo(post.createdAt)}</div>
                  </td>
                  <td><a class="mini-meta" href="${profileUrl(post.author.username)}">@${escapeHtml(post.author.username)}</a></td>
                  <td>
                    <div class="mini-meta">${post.likesCount} layk</div>
                    <div class="mini-meta">${post.commentsCount} izoh</div>
                    <div class="mini-meta">${post.adViewsCount} ad view</div>
                  </td>
                  <td>
                    <button class="danger-btn" type="button" data-action="admin-delete-post" data-post-id="${post.id}">O'chirish</button>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminCommentsV2() {
  const host = qs("#adminCommentsTable");
  if (!host) {
    return;
  }

  host.innerHTML = `
    <div class="admin-table-wrap">
      <table class="table table-hover align-middle mb-0">
        <thead>
          <tr>
            <th>Izoh</th>
            <th>Muallif</th>
            <th>Post</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${state.admin.comments
            .map(
              (comment) => `
                <tr>
                  <td>
                    <div class="author-name">${escapeHtml(truncate(comment.text, 72))}</div>
                    <div class="mini-meta">${timeAgo(comment.createdAt)}</div>
                  </td>
                  <td><a class="mini-meta" href="${profileUrl(comment.author.username)}">@${escapeHtml(comment.author.username)}</a></td>
                  <td><a class="mini-meta" href="${postUrl(comment.postId)}">Postni ochish</a></td>
                  <td><button class="danger-btn" type="button" data-action="admin-delete-comment" data-comment-id="${comment.id}">O'chirish</button></td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminAdsV2() {
  const host = qs("#adminAdsList");
  if (!host) {
    return;
  }

  if (!state.admin.ads.length) {
    host.innerHTML = `<div class="empty-state">Hali reklama qo'shilmagan.</div>`;
    return;
  }

  host.innerHTML = state.admin.ads
    .map(
      (ad) => `
        <div class="earnings-item">
          <div>
            <div class="author-name">${escapeHtml(ad.title)}</div>
            <div class="mini-meta">${ad.isActive ? "Faol" : "Nofaol"} | ${timeAgo(ad.createdAt)}</div>
          </div>
          <div class="inline-actions">
            <button class="ghost-link" type="button" data-action="admin-edit-ad" data-ad-id="${ad.id}">Tahrirlash</button>
            <button class="danger-btn" type="button" data-action="admin-delete-ad" data-ad-id="${ad.id}">O'chirish</button>
          </div>
        </div>
      `
    )
    .join("");
}

function fillAdminAdForm(ad = null) {
  const form = qs("#adminAdForm");
  const title = qs('[name="title"]', form);
  const image = qs('[name="image"]', form);
  const text = qs('[name="text"]', form);
  const ctaText = qs('[name="ctaText"]', form);
  const ctaLink = qs('[name="ctaLink"]', form);
  const isActive = qs('[name="isActive"]', form);
  const label = qs("#adminAdFormLabel");

  state.admin.editingAdId = ad?.id || null;
  if (label) {
    label.textContent = ad ? "Reklamani tahrirlash" : "Yangi reklama";
  }

  title.value = ad?.title || "";
  image.value = ad?.image || "";
  text.value = ad?.text || "";
  ctaText.value = ad?.ctaText || "";
  ctaLink.value = ad?.ctaLink || "";
  isActive.checked = ad ? Boolean(ad.isActive) : true;
}

async function refreshAdminData() {
  const [overview, users, posts, comments, ads] = await Promise.all([
    api("/api/admin/overview"),
    api("/api/admin/users"),
    api("/api/admin/posts"),
    api("/api/admin/comments"),
    api("/api/admin/ads"),
  ]);

  state.admin.overview = overview;
  state.admin.users = users.users;
  state.admin.posts = posts.posts;
  state.admin.comments = comments.comments;
  state.admin.ads = ads.ads;

  renderAdminOverviewV2();
  renderAdminUsersV2();
  renderAdminPostsV2();
  renderAdminCommentsV2();
  renderAdminAdsV2();
}

async function initAdminPage() {
  if (!state.me) {
    redirectToLogin();
    return;
  }

  if (!state.me.isAdmin) {
    location.href = "/";
    return;
  }

  const form = qs("#adminAdForm");
  if (!form) {
    return;
  }

  fillAdminAdForm();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = qs('[type="submit"]', form);
    submitButton.disabled = true;

    try {
      const payload = {
        title: qs('[name="title"]', form).value.trim(),
        image: qs('[name="image"]', form).value.trim(),
        text: qs('[name="text"]', form).value.trim(),
        ctaText: qs('[name="ctaText"]', form).value.trim(),
        ctaLink: qs('[name="ctaLink"]', form).value.trim(),
        isActive: qs('[name="isActive"]', form).checked,
      };

      const url = state.admin.editingAdId
        ? `/api/admin/ads/${state.admin.editingAdId}`
        : "/api/admin/ads";
      const method = state.admin.editingAdId ? "PUT" : "POST";

      await api(url, { method, body: payload });
      fillAdminAdForm();
      await refreshAdminData();
      showToast("Reklama saqlandi.", "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });

  qs("#adminAdReset")?.addEventListener("click", () => {
    fillAdminAdForm();
  });

  await refreshAdminData();
}

async function runAdminMutation(request, successMessage) {
  try {
    const response = await request();
    await refreshAdminData();
    showToast(response?.message || successMessage, "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function bindGlobalEvents() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;

    if (action === "logout") {
      try {
        state.chat.socket?.disconnect();
        state.chat.socket = null;
        await api("/api/auth/logout", { method: "POST" });
        state.me = null;
        location.href = "/login.html";
      } catch (error) {
        showToast(error.message, "error");
      }
      return;
    }

    if (action === "toggle-like") {
      await togglePostLike(button);
      return;
    }

    if (action === "open-comments") {
      if (qs("#commentsSheet")) {
        openCommentsSheet(button.dataset.postId);
      } else {
        qs("#inlineCommentsList")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    if (action === "like-comment") {
      await toggleCommentLike(button);
      return;
    }

    if (action === "reply-comment") {
      setReplyTarget(button.dataset.context || "inline", {
        id: button.dataset.commentId,
        username: button.dataset.commentUser,
      });
      return;
    }

    if (action === "cancel-reply") {
      setReplyTarget(button.dataset.context || "inline", null);
      return;
    }

    if (action === "toggle-follow") {
      await toggleFollow(button);
      return;
    }

    if (action === "open-chat-room") {
      await openChatRoom(button.dataset.roomId);
      return;
    }

    if (action === "start-chat-user") {
      await startChatWithUsername(button.dataset.username);
      const host = qs("#chatUserSearchResults");
      if (host) {
        host.innerHTML = "";
      }
      return;
    }

    if (action === "skip-ad") {
      const card = button.closest("[data-ad-card]");
      if (card) {
        card.classList.add("hidden");
      }
      return;
    }

    if (action === "admin-toggle-admin") {
      await runAdminMutation(
        () => api(`/api/admin/users/${button.dataset.userId}/toggle-admin`, { method: "POST" }),
        "Admin huquqi yangilandi."
      );
      return;
    }

    if (action === "admin-toggle-block") {
      await runAdminMutation(
        () => api(`/api/admin/users/${button.dataset.userId}/toggle-block`, { method: "POST" }),
        "Blok holati yangilandi."
      );
      return;
    }

    if (action === "admin-delete-user") {
      if (!window.confirm("Bu foydalanuvchini, uning postlarini va bog'liq izohlarini o'chirishni tasdiqlaysizmi?")) {
        return;
      }
      await runAdminMutation(
        () => api(`/api/admin/users/${button.dataset.userId}`, { method: "DELETE" }),
        "Foydalanuvchi o'chirildi."
      );
      return;
    }

    if (action === "admin-delete-post") {
      if (!window.confirm("Bu postni o'chirishni tasdiqlaysizmi?")) {
        return;
      }
      await runAdminMutation(
        () => api(`/api/admin/posts/${button.dataset.postId}`, { method: "DELETE" }),
        "Post o‘chirildi."
      );
      return;
    }

    if (action === "admin-delete-comment") {
      if (!window.confirm("Bu izoh tarmog'ini o'chirishni tasdiqlaysizmi?")) {
        return;
      }
      await runAdminMutation(
        () => api(`/api/admin/comments/${button.dataset.commentId}`, { method: "DELETE" }),
        "Izoh o‘chirildi."
      );
      return;
    }

    if (action === "admin-delete-ad") {
      if (!window.confirm("Bu reklamani o'chirishni tasdiqlaysizmi?")) {
        return;
      }
      await runAdminMutation(
        () => api(`/api/admin/ads/${button.dataset.adId}`, { method: "DELETE" }),
        "Reklama o‘chirildi."
      );
      return;
    }

    if (action === "admin-edit-ad") {
      const ad = state.admin.ads.find((entry) => entry.id === button.dataset.adId);
      if (ad) {
        fillAdminAdForm(ad);
        qs("#adminTop")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  });

  qsa("form[data-comment-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await submitCommentForm(form);
    });
  });
}

function bindRefreshActions() {
  const refreshButton = qs("#refreshFeedButton");
  if (!refreshButton) {
    return;
  }

  refreshButton.addEventListener("click", async () => {
    refreshButton.disabled = true;
    if (state.searchQuery) {
      updateSearchQuery("");
      const input = qs("#feedSearchInput");
      if (input) {
        input.value = "";
      }
    }
    await initHomePage();
    refreshButton.disabled = false;
  });
}

function bindHomeSearch() {
  const form = qs("#feedSearchForm");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = qs("#feedSearchInput", form);
    const query = input?.value.trim() || "";
    updateSearchQuery(query);
    await initHomePage();
  });
}

async function initPage() {
  await loadMe();
  bindGlobalEvents();
  bindRefreshActions();
  bindHomeSearch();

  if (state.page === "home") {
    await initHomePage();
  }

  if (state.page === "search") {
    await initSearchPage();
  }

  if (state.page === "create") {
    await initCreatePage();
  }

  if (state.page === "login") {
    await initAuthPage("login");
  }

  if (state.page === "register") {
    await initAuthPage("register");
  }

  if (state.page === "profile") {
    await initProfilePage();
  }

  if (state.page === "wallet") {
    await initWalletPage();
  }

  if (state.page === "post") {
    await initPostPage();
  }

  if (state.page === "chat") {
    await initChatPage();
  }

  if (state.page === "admin") {
    await initAdminPage();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initPage().catch((error) => {
    showToast(error.message || "Kutilmagan xato yuz berdi.", "error");
  });
});
