// Secret Calculator Chat - Frontend Logic
// Uses Firebase Auth + Firestore (compat SDK for simplicity in static hosting)

// EXPECTS: window.firebaseConfig defined in firebase-config.js
const app = firebase.initializeApp(window.firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Firestore collections
const usersCol = db.collection('users');
const chatsCol = db.collection('chats');

// UI Elements
const authBtn = document.getElementById('authBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authModal = document.getElementById('authModal');
const authLoading = document.getElementById('authLoading');
const authError = document.getElementById('authError');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const closeAuth = document.getElementById('closeAuth');
const profileBtn = document.getElementById('profileBtn');
const profileModal = document.getElementById('profileModal');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const closeProfile = document.getElementById('closeProfile');
const profUsername = document.getElementById('profUsername');
const profEmail = document.getElementById('profEmail');
const profAvatarType = document.getElementById('profAvatarType');
const profLetter = document.getElementById('profLetter');
const profAvatarUploadBtn = document.getElementById('profAvatarUploadBtn');
const profAvatarPicker = document.getElementById('profAvatarPicker');
const profAvatarPreview = document.getElementById('profAvatarPreview');
const avatarTypeRadios = document.querySelectorAll('input[name="avatarType"]');
const profAvatarProgress = document.getElementById('profAvatarProgress');
const profAvatarProgressBar = document.getElementById('profAvatarProgressBar');
const profileError = document.getElementById('profileError');

// Registration avatar elements
const regAvatarType = document.getElementById('regAvatarType');
const regAvatarImageControls = document.getElementById('regAvatarImageControls');
const regAvatarLetterControls = document.getElementById('regAvatarLetterControls');
const regAvatarUploadBtn = document.getElementById('regAvatarUploadBtn');
const regAvatarPicker = document.getElementById('regAvatarPicker');
const regAvatarPreview = document.getElementById('regAvatarPreview');
const regAvatarProgress = document.getElementById('regAvatarProgress');
const regAvatarProgressBar = document.getElementById('regAvatarProgressBar');
const regLetter = document.getElementById('regLetter');
const regAvatarTypeRadios = document.querySelectorAll('input[name="regAvatarTypeRadio"]');

const loginEmail = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const regUsername = document.getElementById('regUsername');
const regEmail = document.getElementById('regEmail');
const regPassword = document.getElementById('regPassword');
const regPasscode = document.getElementById('regPasscode');

const calculatorScreen = document.getElementById('calculatorScreen');
const calcDisplay = document.getElementById('calcDisplay');
const calcHint = document.getElementById('calcHint');

const chatUI = document.getElementById('chatUI');
const meName = document.getElementById('meName');
const meEmail = document.getElementById('meEmail');
const meAvatar = document.getElementById('meAvatar');
const userSearch = document.getElementById('userSearch');
const userList = document.getElementById('userList');
const messagesEl = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const imageBtn = document.getElementById('imageBtn');
const imagePicker = document.getElementById('imagePicker');
// Image viewer modal elements
const imageViewer = document.getElementById('imageViewer');
const imageViewerImg = document.getElementById('imageViewerImg');
const imageDownload = document.getElementById('imageDownload');
const imageClose = document.getElementById('imageClose');
const peerName = document.getElementById('peerName');
const peerStatus = document.getElementById('peerStatus');
const typingIndicator = document.getElementById('typingIndicator');
const typingIndicators = document.getElementById('typingIndicators');

// Typing ping control
let __lastTypingSent = 0;
let __typingHooked = false;
function sendTypingPing() {
  try {
    if (!currentUser || !selectedPeer) return;
    const now = Date.now();
    if (now - __lastTypingSent < 900) return; // throttle ~1s
    __lastTypingSent = now;
    const chatId = getChatId(currentUser.uid, selectedPeer.uid);
    const docRef = chatsCol.doc(chatId);
    // Store per-user typing timestamp at path typingBy.<uid> to merge safely with others
    const fieldPath = `typingBy.${currentUser.uid}`;
    docRef.set({ [fieldPath]: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch (_) {}
}

function hookTypingEvents() {
  if (!messageInput) return;
  if (__typingHooked) return; // prevent duplicate listeners
  __typingHooked = true;
  let debounce;
  ['input','keydown'].forEach(evt => messageInput.addEventListener(evt, () => {
    sendTypingPing();
    clearTimeout(debounce);
    debounce = setTimeout(() => { /* quiet period, reader auto-hides */ }, 1500);
  }));
}
const backBtn = document.getElementById('backBtn');
const emptyState = document.getElementById('emptyState');
// Reply preview elements
const replyPreview = document.getElementById('replyPreview');
const replyTextEl = document.getElementById('replyText');
const replyCancel = document.getElementById('replyCancel');

// Tabs in modal
const tabs = document.querySelectorAll('.tab');
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');

let currentUser = null;
let currentUserDoc = null;
let selectedPeer = null; // { uid, username, isOnline, lastActive }

// ===== Registration avatar helpers =====
let __regPendingAvatar = null; // { url, thumbUrl }
function updateRegAvatarControls() {
  const t = (regAvatarType && regAvatarType.value) || 'letter';
  if (regAvatarImageControls) regAvatarImageControls.classList.toggle('hidden', t !== 'image');
  if (regAvatarLetterControls) regAvatarLetterControls.classList.toggle('hidden', t !== 'letter');
}

regAvatarTypeRadios && regAvatarTypeRadios.forEach(r => r.addEventListener('change', () => {
  if (r.checked) {
    if (regAvatarType) regAvatarType.value = r.value;
    updateRegAvatarControls();
  }
}));

if (regAvatarUploadBtn && regAvatarPicker) {
  regAvatarUploadBtn.addEventListener('click', () => regAvatarPicker.click());
  regAvatarPicker.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) await handleRegAvatarFile(f);
    e.target.value = '';
  });
}

function updateBadge(badgeEl, count){
  if (!badgeEl) return;
  if (!count || count <= 0) {
    badgeEl.classList.add('hidden');
    badgeEl.textContent = '';
  } else {
    badgeEl.classList.remove('hidden');
    badgeEl.textContent = count > 9 ? '9+' : String(count);
  }
}

async function handleRegAvatarFile(file) {
  try {
    if (!/^image\//i.test(file.type)) return;
    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) { try { alert('Avatar too large (max 2MB)'); } catch(_) {} return; }
    const small = await compressImage(file, { maxW: 512, quality: 0.8 });
    // Show progress
    if (regAvatarProgress) { regAvatarProgress.classList.remove('hidden'); regAvatarProgress.setAttribute('aria-hidden','false'); }
    if (regAvatarProgressBar) regAvatarProgressBar.style.width = '0%';
    const { url, thumbUrl } = await uploadToCloudinary(small, (pct) => {
      if (regAvatarProgressBar) regAvatarProgressBar.style.width = (pct||0) + '%';
    });
    __regPendingAvatar = { url, thumbUrl };
    if (regAvatarPreview) { regAvatarPreview.src = thumbUrl; regAvatarPreview.style.display = 'block'; }
  } catch (e) {
    try { console.error('Registration avatar upload failed', e); } catch(_){}
  } finally {
    setTimeout(() => {
      if (regAvatarProgress) { regAvatarProgress.classList.add('hidden'); regAvatarProgress.setAttribute('aria-hidden','true'); }
    }, 300);
  }
}
let __pendingAvatar = null; // { url, thumbUrl }

// ================= Reactions: floating bar open/close and listeners =================

// Cloudinary config (unsigned upload)
const CLOUDINARY = {
  cloudName: 'dqjj94zt3',
  unsignedPreset: 'chat-images',
  uploadUrl: 'https://api.cloudinary.com/v1_1/dqjj94zt3/image/upload'
};

// Enforce digits-only for the registration passcode input while typing/pasting
if (regPasscode) {
  const ALLOWED_CTRL_KEYS = new Set([
    'Backspace','Delete','ArrowLeft','ArrowRight','Home','End','Tab'
  ]);
  regPasscode.addEventListener('keydown', (e) => {
    // Allow copy/cut/paste shortcuts
    if ((e.ctrlKey || e.metaKey) && ['a','c','v','x'].includes(e.key.toLowerCase())) return;
    if (ALLOWED_CTRL_KEYS.has(e.key)) return;
    // Allow digits only
    if (!/^[0-9]$/.test(e.key)) e.preventDefault();
  });
  regPasscode.addEventListener('input', () => {
    const digits = regPasscode.value.replace(/\D+/g, '');
    if (regPasscode.value !== digits) regPasscode.value = digits;
  });
  regPasscode.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    const digits = text.replace(/\D+/g, '');
    const { selectionStart, selectionEnd, value } = regPasscode;
    const next = value.slice(0, selectionStart) + digits + value.slice(selectionEnd);
    regPasscode.value = next;
    // Move caret to end of inserted digits
    const pos = selectionStart + digits.length;
    regPasscode.setSelectionRange(pos, pos);
  });
}
// ================= Image upload (Cloudinary) =================
function isImageFile(file) {
  return file && /^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type);
}

function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function compressImage(file, { maxW = 1280, quality = 0.72 } = {}) {
  try {
    const img = await fileToImage(file);
    const scale = Math.min(1, maxW / (img.width || maxW));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((img.width || maxW) * scale);
    canvas.height = Math.round((img.height || maxW) * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(b => resolve(b), 'image/jpeg', quality));
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  } catch (_) {
    return file; // fallback if compression fails
  }
}

async function uploadToCloudinary(file, onProgress) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY.unsignedPreset);
  fd.append('folder', 'chat-images');
  // If a progress callback is provided, use XHR to report progress
  if (typeof onProgress === 'function') {
    const secureUrl = await new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', CLOUDINARY.uploadUrl);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            try { onProgress(Math.max(0, Math.min(100, pct))); } catch(_){}
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText);
              if (!json || !json.secure_url) return reject(new Error('No URL from Cloudinary'));
              resolve(json.secure_url);
            } catch (err) { reject(err); }
          } else { reject(new Error('Upload failed')); }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(fd);
      } catch (err) { reject(err); }
    });
    const thumbUrl = secureUrl.replace('/upload/', '/upload/f_auto,q_auto,w_600/');
    return { url: secureUrl, thumbUrl };
  }
  // Fallback to fetch without progress
  const res = await fetch(CLOUDINARY.uploadUrl, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('Upload failed');
  const data = await res.json();
  if (!data || !data.secure_url) throw new Error('No URL from Cloudinary');
  const thumbUrl = data.secure_url.replace('/upload/', '/upload/f_auto,q_auto,w_600/');
  return { url: data.secure_url, thumbUrl };
}

// Simple in-chat upload progress UI
function createChatUploadProgress() {
  if (!messagesEl) return null;
  const row = document.createElement('div');
  row.className = 'upload-progress-row';
  const label = document.createElement('div');
  label.className = 'upload-label';
  label.textContent = 'Uploading image…';
  const bar = document.createElement('div');
  bar.className = 'progress';
  const fill = document.createElement('div');
  fill.className = 'progress-bar';
  bar.appendChild(fill);
  row.appendChild(label);
  row.appendChild(bar);
  messagesEl.appendChild(row);
  // keep scrolled to bottom
  try { messagesEl.scrollTop = messagesEl.scrollHeight; } catch(_){}
  return {
    update(pct){ fill.style.width = (pct||0) + '%'; },
    done(){ row.remove(); },
    error(msg){ label.textContent = msg || 'Upload failed'; setTimeout(()=>row.remove(), 1500); }
  };
}

async function handleImageFile(file) {
  try {
    if (!currentUser || !selectedPeer) return;
    if (!isImageFile(file)) { try { console.warn('Not an allowed image type'); } catch(_) {} return; }
    const maxBytes = 4 * 1024 * 1024; // 4MB
    if (file.size > maxBytes) { try { console.warn('Image too large'); } catch(_) {} return; }
    const ui = createChatUploadProgress();
    const small = await compressImage(file, { maxW: 1280, quality: 0.72 });
    const { url, thumbUrl } = await uploadToCloudinary(small, (pct)=> ui && ui.update(pct));
    const chatId = getChatId(currentUser.uid, selectedPeer.uid);
    await chatsCol.doc(chatId).collection('messages').add({
      from: currentUser.uid,
      type: 'image',
      imageUrl: url,
      thumbUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (ui) ui.done();
  } catch (e) {
    try { console.error('Image send failed', e); } catch(_) {}
    // Best-effort show failure in UI
    try { const actives = document.querySelectorAll('.upload-progress-row'); if (actives.length) actives[actives.length-1].remove(); } catch(_){}
  } finally {
    if (imagePicker) imagePicker.value = '';
  }
}

if (imageBtn && imagePicker) {
  imageBtn.addEventListener('click', () => imagePicker.click());
  imagePicker.addEventListener('change', async () => {
    const f = imagePicker.files && imagePicker.files[0];
    if (f) await handleImageFile(f);
  });
}

// ================= Image viewer modal (open/close/download) =================
function openImageViewer(src) {
  if (!imageViewer || !imageViewerImg) return;
  imageViewerImg.src = src;
  imageViewer.classList.remove('hidden');
  imageViewer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  imageViewer.dataset.src = src;
}

function closeImageViewer() {
  if (!imageViewer) return;
  imageViewer.classList.add('hidden');
  imageViewer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (imageViewerImg) imageViewerImg.src = '';
}

async function downloadImage(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    const a = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    // try to derive filename
    const name = (url.split('?')[0].split('/').pop() || 'image') + '.jpg';
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch(e) {
    try { console.error('Download failed', e); } catch(_) {}
  }
}

if (imageViewer) {
  const backdrop = imageViewer.querySelector('.iv-backdrop');
  if (backdrop) backdrop.addEventListener('click', closeImageViewer);
}
if (imageClose) imageClose.addEventListener('click', closeImageViewer);
if (imageDownload) imageDownload.addEventListener('click', () => {
  const src = imageViewer && imageViewer.dataset && imageViewer.dataset.src;
  if (src) downloadImage(src);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && imageViewer && !imageViewer.classList.contains('hidden')) closeImageViewer();
});

// ================= Profile avatar (Cloudinary) =================

function updateAvatarControls() {
  // Determine selected type from radios; fallback to hidden input
  let sel = 'letter';
  avatarTypeRadios.forEach(r => { if (r.checked) sel = r.value; });
  if (profAvatarType) profAvatarType.value = sel;
  const letterField = document.querySelector('.avatar-letter');
  const imgControls = document.querySelector('.avatar-image-controls');
  if (letterField) letterField.style.display = (sel === 'letter') ? '' : 'none';
  if (imgControls) imgControls.style.display = (sel === 'image') ? '' : 'none';
}

async function handleAvatarFile(file) {
  if (!file) return;
  if (!/^image\//i.test(file.type)) return;
  const maxBytes = 2 * 1024 * 1024; // 2MB
  if (file.size > maxBytes) { try { alert('Avatar too large (max 2MB)'); } catch(_) {} return; }
  const small = await compressImage(file, { maxW: 512, quality: 0.8 });
  const fd = new FormData();
  fd.append('file', small);
  fd.append('upload_preset', CLOUDINARY.unsignedPreset);
  fd.append('folder', 'avatars');

  // Show progress
  if (profAvatarProgress) {
    profAvatarProgress.classList.remove('hidden');
    profAvatarProgress.setAttribute('aria-hidden', 'false');
  }
  if (profAvatarProgressBar) profAvatarProgressBar.style.width = '0%';

  const full = await new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', CLOUDINARY.uploadUrl);
      xhr.upload.onprogress = (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        if (profAvatarProgressBar) profAvatarProgressBar.style.width = pct + '%';
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const json = JSON.parse(xhr.responseText);
            resolve(json.secure_url);
          } catch (err) { reject(err); }
        } else {
          reject(new Error('Upload failed'));
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(fd);
    } catch (err) { reject(err); }
  }).finally(() => {
    // Hide progress after a brief delay for smoothness
    setTimeout(() => {
      if (profAvatarProgress) {
        profAvatarProgress.classList.add('hidden');
        profAvatarProgress.setAttribute('aria-hidden', 'true');
      }
    }, 300);
  });

  const thumb = full.replace('/upload/', '/upload/f_auto,q_auto,w_128,h_128,c_fill,g_face/');
  __pendingAvatar = { url: full, thumbUrl: thumb };
  if (profAvatarPreview) {
    profAvatarPreview.src = thumb;
    profAvatarPreview.style.display = 'block';
  }
}

if (avatarTypeRadios && avatarTypeRadios.length) {
  avatarTypeRadios.forEach(r => r.addEventListener('change', updateAvatarControls));
}
// initialize once DOM ready
setTimeout(updateAvatarControls, 0);
if (profAvatarUploadBtn && profAvatarPicker) {
  profAvatarUploadBtn.addEventListener('click', () => profAvatarPicker.click());
  profAvatarPicker.addEventListener('change', async () => {
    const f = profAvatarPicker.files && profAvatarPicker.files[0];
    await handleAvatarFile(f);
    profAvatarPicker.value = '';
  });
}

function openReactionBar(x, y, el, m) {
  if (!reactionBar) return;
  reactionTarget = { el, message: m };
  reactionBar.style.left = x + 'px';
  reactionBar.style.top = y + 'px';
  reactionBar.classList.remove('hidden');
  reactionBar.setAttribute('aria-hidden', 'false');
  try { console.debug('openReactionBar', { x, y, mid: m && m.id }); } catch(_) {}
  // Clamp inside viewport
  try {
    const rect = reactionBar.getBoundingClientRect();
    let nx = x, ny = y;
    const pad = 8;
    if (nx + rect.width + pad > window.innerWidth) nx = Math.max(pad, window.innerWidth - rect.width - pad);
    if (ny + rect.height + pad > window.innerHeight) ny = Math.max(pad, window.innerHeight - rect.height - pad);
    reactionBar.style.left = nx + 'px';
    reactionBar.style.top = ny + 'px';
  } catch(_) {}
  reactionJustOpened = true;
  setTimeout(() => { reactionJustOpened = false; }, 200);
}

function closeReactionBar() {
  if (!reactionBar) return;
  reactionBar.classList.add('hidden');
  reactionBar.setAttribute('aria-hidden', 'true');
  reactionTarget = null;
}

// Edit/Delete controls and menu refs (must be defined before any usage)
const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
let unlimitedEditing = true; // temporarily enable unlimited edits for reliability
const msgMenu = document.getElementById('msgMenu');
let msgMenuTarget = null; // { el, message }
let msgMenuJustOpened = false;

// Reactions: floating bar and state
const reactionBar = document.getElementById('reactionBar');
let reactionTarget = null; // { el, message }
let reactionJustOpened = false;

// Mobile bottom sheet for own messages (Edit/Delete)
const mobileSheet = document.getElementById('mobileSheet');
let mobileSheetTarget = null; // { el, message }

// Now that reactionBar is declared, attach listeners safely
if (reactionBar) {
  reactionBar.addEventListener('click', async (e) => {
    e.preventDefault();
    const btn = e.target.closest('.reaction-choice');
    if (!btn || !reactionTarget) return;
    const { message } = reactionTarget;
    const emoji = btn.dataset.emoji;
    closeReactionBar();
    try { await toggleReaction(message, emoji); } catch(_) {}
  });
  document.addEventListener('click', (e) => {
    if (reactionJustOpened) { reactionJustOpened = false; return; }
    if (!reactionBar.contains(e.target)) closeReactionBar();
  });
  window.addEventListener('resize', closeReactionBar);
  window.addEventListener('scroll', closeReactionBar, true);
}

function canEditMessage(m) {
  if (!currentUser || m.from !== currentUser.uid) return false;
  if (unlimitedEditing) return true;
  if (!m.createdAt || !m.createdAt.toDate) return false;
  const age = Date.now() - m.createdAt.toDate().getTime();
  return age <= EDIT_WINDOW_MS && !m.deletedForAll;
}

function attachMessageMenuHandlers(el, m) {
  // Right-click desktop
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openMsgMenu(e.clientX, e.clientY, el, m);
  });
  // Long-press mobile: open reaction bar (TikTok style)
  let lpTimer = null;
  el.addEventListener('touchstart', (e) => {
    if (lpTimer) clearTimeout(lpTimer);
    const t = e.changedTouches[0];
    lpTimer = setTimeout(() => {
      if (!m || !m.id) return;
      // Own message: open desktop-style context menu; Others: reaction bar.
      if (currentUser && m.from === currentUser.uid) {
        openMsgMenu(t.clientX, t.clientY, el, m);
      } else {
        openReactionBar(t.clientX, t.clientY, el, m);
      }
    }, 500);
  }, { passive: true });
  el.addEventListener('touchend', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
  el.addEventListener('touchcancel', () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } });
}

function openMsgMenu(x, y, el, m) {
  if (!msgMenu) return;
  msgMenuTarget = { el, message: m };
  // Toggle edit visibility based on eligibility
  const editBtn = msgMenu.querySelector('[data-action="edit"]');
  if (editBtn) {
    const eligible = canEditMessage(m) && m.type === 'text';
    editBtn.disabled = !eligible;
    try { console.debug('Menu open: canEdit?', eligible, 'type:', m.type, 'createdAt?', !!(m.createdAt && m.createdAt.toDate)); } catch(_) {}
  }
  const delAllBtn = msgMenu.querySelector('[data-action="delete-all"]');
  if (delAllBtn) delAllBtn.disabled = !!m.deletedForAll;
  // Position within viewport
  msgMenu.style.left = x + 'px';
  msgMenu.style.top = y + 'px';
  msgMenu.classList.remove('hidden');
  msgMenu.setAttribute('aria-hidden', 'false');
  // Clamp within viewport
  try {
    const rect = msgMenu.getBoundingClientRect();
    let nx = x, ny = y;
    const pad = 8;
    if (nx + rect.width + pad > window.innerWidth) nx = Math.max(pad, window.innerWidth - rect.width - pad);
    if (ny + rect.height + pad > window.innerHeight) ny = Math.max(pad, window.innerHeight - rect.height - pad);
    msgMenu.style.left = nx + 'px';
    msgMenu.style.top = ny + 'px';
  } catch(_) {}
  // Suppress the immediate document click that follows right-click
  msgMenuJustOpened = true;
  // On mobile, a synthetic click may arrive slightly later after long-press
  setTimeout(() => { msgMenuJustOpened = false; }, 600);
}

function closeMsgMenu() {
  if (!msgMenu) return;
  msgMenu.classList.add('hidden');
  msgMenu.setAttribute('aria-hidden', 'true');
  msgMenuTarget = null;
}

if (msgMenu) {
  msgMenu.addEventListener('click', async (e) => {
    const btn = e.target.closest('.menu-item');
    if (!btn || !msgMenuTarget) return;
    const { message, el } = msgMenuTarget;
    const action = btn.dataset.action;
    closeMsgMenu();
    try {
      if (action === 'edit') {
        // Allow edit click to proceed; startInlineEdit will handle rendering and we log reasons if it can't.
        if (message.type !== 'text') { console.warn('Edit blocked: not a text message'); return; }
        startInlineEdit(message, el);
      } else if (action === 'delete-me') {
        await deleteForMe(message);
      } else if (action === 'delete-all') {
        await deleteForAll(message);
      }
    } catch(_) {}
  });
  // Global close on outside click or escape
  document.addEventListener('click', (e) => {
    if (msgMenuJustOpened) { msgMenuJustOpened = false; return; }
    if (!msgMenu.contains(e.target)) closeMsgMenu();
  });
  window.addEventListener('resize', closeMsgMenu);
  window.addEventListener('scroll', closeMsgMenu, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMsgMenu(); });
}

function startInlineEdit(m, el) {
  // Prefer the element captured when opening the menu; fall back to lookup by id
  const target = el || (m && m.id ? messagesEl.querySelector(`[data-mid="${m.id}"]`) : null);
  if (!target) { console.error('startInlineEdit: message element not found', m && m.id); return; }
  const body = target.querySelector('.body');
  if (!body) { console.error('startInlineEdit: .body not found in message element'); return; }
  const original = m.text || '';
  body.innerHTML = '';
  const ta = document.createElement('textarea');
  ta.className = 'editor';
  ta.value = original;
  body.appendChild(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  const cancel = () => { body.textContent = original; };
  const save = async () => {
    const newText = ta.value;
    if (newText === original) { cancel(); return; }
    try {
      await chatsCol.doc(getChatId(currentUser.uid, selectedPeer.uid))
        .collection('messages').doc(m.id)
        .set({ text: newText, editedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      try { console.debug('Edit saved for message', m.id); } catch(_) {}
    } catch(_) { cancel(); }
  };
  ta.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  ta.addEventListener('blur', () => { save(); });
}

async function deleteForMe(m) {
  if (!currentUser) return;
  const chatId = getChatId(currentUser.uid, selectedPeer.uid);
  await chatsCol.doc(chatId).collection('messages').doc(m.id)
    .update({ hiddenBy: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
}

async function deleteForAll(m) {
  if (!currentUser) return;
  const chatId = getChatId(currentUser.uid, selectedPeer.uid);
  // Animate fade-out locally first for responsiveness
  const el = messagesEl.querySelector(`[data-mid="${m.id}"]`);
  if (el) {
    el.classList.add('fade-out');
    setTimeout(async () => {
      try {
        await chatsCol.doc(chatId).collection('messages').doc(m.id)
          .update({ deletedForAll: true, text: '', url: '', editedAt: firebase.firestore.FieldValue.serverTimestamp() });
      } catch(_) {}
    }, 180);
  } else {
    await chatsCol.doc(chatId).collection('messages').doc(m.id)
      .update({ deletedForAll: true, text: '', url: '', editedAt: firebase.firestore.FieldValue.serverTimestamp() });
  }
}

async function toggleReaction(m, emoji) {
  if (!currentUser || !selectedPeer || !m || !m.id) return;
  const chatId = getChatId(currentUser.uid, selectedPeer.uid);
  const arr = (m.reactions && m.reactions[emoji]) || [];
  const has = Array.isArray(arr) && arr.includes(currentUser.uid);
  try {
    const fp = new firebase.firestore.FieldPath('reactions', emoji);
    const ref = chatsCol.doc(chatId).collection('messages').doc(m.id);
    if (has) {
      await ref.update(fp, firebase.firestore.FieldValue.arrayRemove(currentUser.uid));
    } else {
      await ref.update(fp, firebase.firestore.FieldValue.arrayUnion(currentUser.uid));
    }
    // Optimistic UI update
    const newUsers = has ? arr.filter(uid => uid !== currentUser.uid) : [...arr, currentUser.uid];
    const next = { ...(m.reactions || {}) };
    next[emoji] = newUsers;
    m.reactions = next;
    const el = messagesEl && messagesEl.querySelector(`[data-mid="${m.id}"]`);
    if (el) renderReactions(el, m);
  } catch(e) {
    console.error('toggleReaction failed', e && e.message ? e.message : e);
  }
}

// Kick off calibration early and then every 2 minutes
calibrateServerOffset();
setInterval(() => { calibrateServerOffset(); }, 120_000);

// Calibrate server time offset to fix skewed 'Active x ago' calculations
async function calibrateServerOffset() {
  try {
    const docRef = db.collection('meta').doc('time');
    // write a server timestamp
    await docRef.set({ now: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    const snap = await docRef.get();
    const serverNow = snap.data()?.now;
    if (serverNow && serverNow.toDate) {
      serverOffsetMs = serverNow.toDate().getTime() - Date.now();
    }
  } catch(e) {
    // ignore calibration failures
  }
}

function displayName(u) {
  if (!u) return 'Unknown';
  if (u.username && u.username.trim()) return u.username;
  if (u.email) return (u.email.split('@')[0] || u.email);
  return u.uid?.slice(0,6) || 'User';
}

function fallbackLetter(u) {
  const base = (u && (u.username || u.email || u.uid)) || '';
  return (base.trim()[0] || '?').toUpperCase();
}

function renderMeAvatar(u) {
  if (!meAvatar) return;
  meAvatar.textContent = '';
  meAvatar.style.display = 'inline-flex';
  meAvatar.style.alignItems = 'center';
  meAvatar.style.justifyContent = 'center';
  meAvatar.style.fontWeight = '700';
  meAvatar.style.fontSize = '16px';
  const type = u?.avatarType || 'emoji';
  if (type === 'image' && (u?.photoThumbURL || u?.photoURL)) {
    const img = document.createElement('img');
    img.src = u.photoThumbURL || u.photoURL;
    img.alt = 'Avatar';
    img.loading = 'lazy';
    meAvatar.appendChild(img);
  } else if (type === 'emoji' && u?.avatarEmoji) {
    meAvatar.textContent = u.avatarEmoji;
    meAvatar.style.background = '#111827';
    meAvatar.style.color = '#e5e7eb';
  } else {
    const letter = (u?.avatarLetter && u.avatarLetter[0]) ? u.avatarLetter[0].toUpperCase() : fallbackLetter(u);
    meAvatar.textContent = letter;
    meAvatar.style.background = 'linear-gradient(180deg, #1e293b, #0f172a)';
    meAvatar.style.color = '#cbd5e1';
  }
}

// Generic avatar renderer for list items
function renderAvatar(el, u) {
  if (!el) return;
  el.textContent = '';
  el.classList.add('avatar');
  const type = u?.avatarType || 'emoji';
  if (type === 'image' && (u?.photoThumbURL || u?.photoURL)) {
    const img = document.createElement('img');
    img.src = u.photoThumbURL || u.photoURL;
    img.alt = 'Avatar';
    img.loading = 'lazy';
    el.appendChild(img);
  } else if (type === 'emoji' && u?.avatarEmoji) {
    el.textContent = u.avatarEmoji;
  } else {
    const letter = (u?.avatarLetter && u.avatarLetter[0]) ? u.avatarLetter[0].toUpperCase() : fallbackLetter(u);
    el.textContent = letter;
  }
}
let messagesUnsub = null;
let usersUnsub = null;
let chatsUnsub = null; // unused now
let currentReply = null; // { text, from, messageId }
let messageMap = new Map(); // id -> message data for current chat

// Send sound (muted by default)
let soundEnabled = false;
let audioCtx = null;
function ensureAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(_) {}
  }
}
function playWhoosh() {
  if (!soundEnabled) return;
  ensureAudioCtx();
  if (!audioCtx) return;
  const ctx = audioCtx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  // Triangle whoosh with short up sweep
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(420, now);
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}

// Sound toggle UI
const soundToggleBtn = document.getElementById('soundToggle');
function setSoundIcon() {
  if (!soundToggleBtn) return;
  const icon = soundToggleBtn.querySelector('.icon');
  if (icon) icon.textContent = soundEnabled ? '🔊' : '🔇';
}
try {
  const saved = localStorage.getItem('secchat_sound_enabled');
  if (saved === '1') soundEnabled = true;
} catch(_) {}
setSoundIcon();
if (soundToggleBtn) {
  soundToggleBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    setSoundIcon();
    try { localStorage.setItem('secchat_sound_enabled', soundEnabled ? '1' : '0'); } catch(_) {}
    if (soundEnabled) ensureAudioCtx();
  });
}

function replyLabelFor(m) {
  if (!m) return '';
  if (m.type === 'tiktok') return 'TikTok video';
  const t = (m.text || '').trim();
  return t.length > 0 ? t : '[empty]';
}

function showReplyPreview(m) {
  currentReply = { text: replyLabelFor(m), from: m.from, messageId: m.id };
  if (replyTextEl) replyTextEl.textContent = currentReply.text;
  if (replyPreview) replyPreview.classList.remove('hidden');
}

function clearReplyPreview() {
  currentReply = null;
  if (replyTextEl) replyTextEl.textContent = '';
  if (replyPreview) replyPreview.classList.add('hidden');
}
if (replyCancel) replyCancel.addEventListener('click', (e)=>{ e.preventDefault(); clearReplyPreview(); });
let presenceInterval = null;
let peerUserUnsub = null;
let chatDocUnsub = null; // unused now
let peerStatusTimer = null;
let lastPeerSnapshot = null;
let typingThrottle = null;
let serverOffsetMs = 0; // calibration between client clock and Firestore server time
let usersStatusRefreshTimer = null;
let hiddenOfflineTimer = null;
let peerSeenAt = null; // Date when peer last viewed this chat
let markSeenThrottle = null;

// Utils
function byId(id) { return document.getElementById(id); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sha256Hex(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

function nowMs() { return Date.now() + serverOffsetMs; }
function formatLastActive(ts) {
  if (!ts || !ts.toDate) return '—';
  const ms = nowMs() - ts.toDate().getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Active now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs>1?'s':''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days>1?'s':''} ago`;
}

function statusTextFromLastActive(ts){
  if (!ts || !ts.toDate) return '—';
  const diff = nowMs() - ts.toDate().getTime();
  // Consider active if within 70 seconds
  if (diff < 70_000) return 'Active now';
  return formatLastActive(ts);
}

function getChatId(a, b) {
  return [a, b].sort().join('_');
}

function ensureTikTokScript() {
  if (!document.querySelector('script[data-tiktok-embed]')) {
    const s = document.createElement('script');
    s.src = 'https://www.tiktok.com/embed.js';
    s.async = true;
    s.setAttribute('data-tiktok-embed', 'true');
    document.body.appendChild(s);
  } else {
    // Reprocess to render new embeds
    if (window.tiktokEmbed) {
      try { window.tiktokEmbed.load(); } catch(e){}
    }
  }
}

function isTikTokUrl(text) {
  try {
    const u = new URL(text);
    return (
      ['www.tiktok.com','tiktok.com','vm.tiktok.com','vt.tiktok.com'].includes(u.hostname)
    );
  } catch(e) { return false; }
}

// Auth/Profile modal helpers (avoid naming collisions with element refs)
function openAuth() { authModal.showModal(); }
function closeAuthModal() { authModal.close(); }
function openProfileModal() { profileModal.showModal(); }
function closeProfileModal() { profileModal.close(); }

function setAuthError(msg) { authError.textContent = msg || ''; }

function switchTab(which) {
  tabs.forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${which}"]`).classList.add('active');
  if (which === 'login') {
    loginTab.classList.remove('hidden');
    registerTab.classList.add('hidden');
  } else {
    registerTab.classList.remove('hidden');
    loginTab.classList.add('hidden');
  }
}

tabs.forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

authBtn.addEventListener('click', openAuth);
closeAuth.addEventListener('click', (e) => { setAuthError(''); try { authModal.close(); } catch(_){} });
if (profileBtn) {
  profileBtn.addEventListener('click', () => {
    if (!currentUserDoc) { return; }
    if (profileError) profileError.textContent = '';
    if (profUsername) profUsername.value = currentUserDoc.username || '';
    if (profEmail) profEmail.value = currentUserDoc.email || (auth.currentUser?.email || '');
    if (profAvatarType) profAvatarType.value = currentUserDoc.avatarType || 'letter';
    // sync radio UI
    if (avatarTypeRadios && avatarTypeRadios.length) {
      const t = profAvatarType.value;
      avatarTypeRadios.forEach(r => { r.checked = (r.value === t); });
    }
    if (profLetter) profLetter.value = currentUserDoc.avatarLetter || '';
    // Init avatar UI
    __pendingAvatar = null;
    updateAvatarControls();
    if (profAvatarPreview) {
      const pv = currentUserDoc.photoThumbURL || currentUserDoc.photoURL || '';
      if (pv && (profAvatarType && profAvatarType.value === 'image')) {
        profAvatarPreview.src = pv;
        profAvatarPreview.style.display = 'block';
      } else {
        profAvatarPreview.removeAttribute('src');
        profAvatarPreview.style.display = 'none';
      }
    }
    if (profileModal && profileModal.showModal) profileModal.showModal();
    // Auto-grow textarea
    try {
      const ta = messageInput; // textarea
      ta.style.height = 'auto';
      const max = 120; // keep in sync with CSS
      ta.style.height = Math.min(max, ta.scrollHeight) + 'px';
    } catch(_){}
  });
  // Enter behavior: newline by default (mobile friendly). Ctrl/Cmd+Enter to send.
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      messageForm.requestSubmit ? messageForm.requestSubmit() : messageForm.dispatchEvent(new Event('submit'));
    }
    // Otherwise allow default to insert a newline
  });
}
if (closeProfile && profileModal) {
  closeProfile.addEventListener('click', () => profileModal.close());
}

// Typing state: throttle writes
let lastTypingSent = 0;
function sendTyping(){
  if (!currentUser || !selectedPeer) return;
  const chatId = getChatId(currentUser.uid, selectedPeer.uid);
  const now = Date.now();
  if (now - lastTypingSent < 1500) return; // throttle 1.5s
  lastTypingSent = now;
  chatsCol.doc(chatId).set({
    typing: {
      uid: currentUser.uid,
      at: firebase.firestore.FieldValue.serverTimestamp(),
    }
  }, { merge: true }).catch(()=>{});
}

if (messageInput) {
  // Auto-grow textarea up to ~5 lines (120px), then allow scroll
  const adjustTA = () => {
    try {
      const ta = messageInput;
      const max = 120; // ~5 lines
      ta.style.height = 'auto';
      const h = Math.min(max, ta.scrollHeight);
      ta.style.height = h + 'px';
      ta.style.overflowY = (ta.scrollHeight > max) ? 'auto' : 'hidden';
    } catch(_){}
  };
  messageInput.addEventListener('input', () => {
    sendTyping();
    adjustTA();
    // Light activity ping (throttled)
    if (!currentUser) return;
    const now = Date.now();
    if (!window.__lastPresencePing || now - window.__lastPresencePing > 30000) {
      window.__lastPresencePing = now;
      usersCol.doc(currentUser.uid).set({
        isOnline: true,
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }).catch(()=>{});
    }
  });
  // Initialize height on load
  setTimeout(adjustTA, 0);
}
if (saveProfileBtn) {
  saveProfileBtn.addEventListener('click', async () => {
    if (!currentUser) return;
    try {
      if (profileError) profileError.textContent = '';
      const username = profUsername ? profUsername.value.trim() : (currentUserDoc?.username || '');
      const email = profEmail ? profEmail.value.trim() : (currentUserDoc?.email || auth.currentUser?.email || '');
      const avatarType = profAvatarType ? profAvatarType.value : (currentUserDoc?.avatarType || 'letter');
      let avatarLetter = profLetter ? profLetter.value.trim() : (currentUserDoc?.avatarLetter || '');
      if (avatarLetter) avatarLetter = avatarLetter.slice(0,1).toUpperCase();

      // Update Firebase Auth email if changed
      if (email && auth.currentUser && email !== auth.currentUser.email) {
        await auth.currentUser.updateEmail(email);
      }

      const data = { username, email, avatarType, avatarLetter };
      if (avatarType === 'image' && __pendingAvatar) {
        data.photoURL = __pendingAvatar.url;
        data.photoThumbURL = __pendingAvatar.thumbUrl;
      }
      await usersCol.doc(currentUser.uid).set(data, { merge: true });

      const snap = await usersCol.doc(currentUser.uid).get();
      currentUserDoc = snap.data();
      meName.textContent = currentUserDoc.username || '(no username)';
      renderMeAvatar(currentUserDoc);
      __pendingAvatar = null;
      if (profileModal && profileModal.close) profileModal.close();
      subscribeUsers(); // refresh list
    } catch(e) {
      if (profileError) profileError.textContent = e.message;
    }
  });
}

loginBtn.addEventListener('click', async () => {
  setAuthError('');
  loginBtn.disabled = true;
  if (authLoading) { authLoading.classList.remove('hidden'); authLoading.setAttribute('aria-busy','true'); }
  try {
    await auth.signInWithEmailAndPassword(loginEmail.value.trim(), loginPassword.value);
    closeAuthModal();
  } catch (e) {
    setAuthError(e.message);
  } finally {
    loginBtn.disabled = false;
    if (authLoading) { authLoading.classList.add('hidden'); authLoading.setAttribute('aria-busy','false'); }
  }
});

registerBtn.addEventListener('click', async () => {
  setAuthError('');
  registerBtn.disabled = true;
  if (authLoading) { authLoading.classList.remove('hidden'); authLoading.setAttribute('aria-busy','true'); }
  const username = regUsername.value.trim();
  const email = regEmail.value.trim();
  const password = regPassword.value;
  const passcode = regPasscode.value.trim();
  if (!/^\d+$/.test(passcode)) { setAuthError('Passcode must be digits only.'); registerBtn.disabled = false; return; }
  try {
    const passcodeHash = await sha256Hex(passcode);
    // Compose avatar fields from registration UI
    const regType = (regAvatarType && regAvatarType.value) || 'letter';
    const avatarFields = { avatarType: regType };
    if (regType === 'image' && __regPendingAvatar) {
      avatarFields.photoURL = __regPendingAvatar.url;
      avatarFields.photoThumbURL = __regPendingAvatar.thumbUrl;
    } else if (regType === 'letter') {
      const letter = (regLetter && regLetter.value && regLetter.value.trim()[0]) || (username && username[0]) || 'A';
      avatarFields.avatarLetter = String(letter).toUpperCase();
    }
    if (auth.currentUser) {
      // Complete profile for existing account
      await usersCol.doc(auth.currentUser.uid).set({
        uid: auth.currentUser.uid,
        email: auth.currentUser.email || email || '',
        username,
        passcodeHash,
        isOnline: true,
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...avatarFields
      }, { merge: true });
      // Refresh in-memory profile
      const snap = await usersCol.doc(auth.currentUser.uid).get();
      currentUserDoc = snap.data();
      meName.textContent = currentUserDoc.username || '(no username)';
      closeAuthModal();
    } else {
      // New account registration
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await usersCol.doc(cred.user.uid).set({
        uid: cred.user.uid,
        email,
        username,
        passcodeHash,
        isOnline: true,
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...avatarFields
      }, { merge: true });
      closeAuthModal();
    }
  } catch (e) {
    setAuthError(e.message);
  } finally {
    registerBtn.disabled = false;
    if (authLoading) { authLoading.classList.add('hidden'); authLoading.setAttribute('aria-busy','false'); }
  }
});

// Enter to submit on active tab
function isLoginActive() { return !loginTab.classList.contains('hidden'); }
[loginEmail, loginPassword].forEach(inp => inp && inp.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && isLoginActive()) { e.preventDefault(); loginBtn.click(); }
}));
[regUsername, regEmail, regPassword, regPasscode].forEach(inp => inp && inp.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !isLoginActive()) { e.preventDefault(); registerBtn.click(); }
}));

// Initialize registration avatar controls on load
try { updateRegAvatarControls(); } catch(_) {}

logoutBtn.addEventListener('click', async () => {
  if (currentUser) {
    await usersCol.doc(currentUser.uid).set({
      isOnline: false,
      lastActive: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await auth.signOut();
});

// Presence handling
function startPresence() {
  stopPresence();
  presenceInterval = setInterval(async () => {
    if (!currentUser) return;
    await usersCol.doc(currentUser.uid).set({
      isOnline: true,
      lastActive: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }, 10_000);
  document.addEventListener('visibilitychange', async () => {
    if (!currentUser) return;
    try {
      if (document.hidden) {
        // Immediately mark offline when tab is hidden (fast accuracy)
        await usersCol.doc(currentUser.uid).set({
          isOnline: false,
          lastActive: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        // Visible again => mark online immediately
        await usersCol.doc(currentUser.uid).set({
          isOnline: true,
          lastActive: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    } catch(e){}
  });
  // Fallback: on pagehide, try to mark offline quickly
  window.addEventListener('pagehide', async () => {
    if (!currentUser) return;
    try {
      await usersCol.doc(currentUser.uid).set({
        isOnline: false,
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch(e) {}
  });
  window.addEventListener('unload', async () => {
    if (!currentUser) return;
    try {
      await usersCol.doc(currentUser.uid).set({
        isOnline: false,
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch(e) {}
  });
  window.addEventListener('focus', async () => {
    if (!currentUser) return;
    try {
      await usersCol.doc(currentUser.uid).set({
        isOnline: true,
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch(e){}
  });
  window.addEventListener('keydown', async () => {
    if (!currentUser) return;
    try {
      await usersCol.doc(currentUser.uid).set({
        isOnline: true,
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch(e){}
  });
  window.addEventListener('beforeunload', async () => {
    if (!currentUser) return;
    try {
      await usersCol.doc(currentUser.uid).set({
        isOnline: false,
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch(e) {}
  });
}

function stopPresence() {
  if (presenceInterval) clearInterval(presenceInterval);
  presenceInterval = null;
}

// Calculator logic (simple expression evaluation + passcode check on '=')
(function initCalculator(){
  const grid = document.querySelector('.calc-grid');
  let expr = '';
  function render(){ calcDisplay.value = expr || '0'; }
  function press(key){
    if (key === 'C') { expr=''; render(); return; }
    if (key === 'DEL') { expr = expr.slice(0,-1); render(); return; }
    if (key === '=') { onEqual(); return; }
    if (key === 'DEL') { expr = expr.slice(0,-1); render(); return; }
    if ('0123456789.+-*/'.includes(key)) { expr += key; render(); }
  }
  async function onEqual(){
    if (!currentUserDoc || !currentUserDoc.passcodeHash) {
      calcHint.textContent = 'Sign in and set a passcode first.';
      calculatorScreen.classList.add('shake');
      setTimeout(()=>calculatorScreen.classList.remove('shake'), 400);
      return;
    }
    // Remove non-digits to ensure numeric passcode check
    const digitsOnly = (expr.match(/\d+/g) || []).join('');
    if (!digitsOnly) { calculatorScreen.classList.add('shake'); setTimeout(()=>calculatorScreen.classList.remove('shake'), 400); return; }
    const enteredHash = await sha256Hex(digitsOnly);
    if (enteredHash === currentUserDoc.passcodeHash) {
      calcHint.textContent = 'Unlocked!';
      showChat();
    } else {
      calcHint.textContent = 'Wrong passcode';
      calculatorScreen.classList.add('shake');
      setTimeout(()=>calculatorScreen.classList.remove('shake'), 400);
    }
  }
  grid.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-key]');
    if (!btn) return;
    press(btn.dataset.key);
  });
  // Keyboard support
  window.addEventListener('keydown', (e) => {
    // Only handle keys when calculator is visible and focus is not on an input/textarea/contentEditable
    if (calculatorScreen.classList.contains('hidden')) return;
    const t = e.target;
    const isTypingField = t && ((t.tagName === 'INPUT') || (t.tagName === 'TEXTAREA') || (t.isContentEditable));
    if (isTypingField) return;
    const k = e.key;
    if (/^[0-9]$/.test(k)) { press(k); return; }
    if (['+','-','*','/','.'].includes(k)) { press(k); return; }
    if (k === 'Enter' || k === '=') { e.preventDefault(); press('='); return; }
    if (k === 'Backspace') { e.preventDefault(); press('DEL'); return; }
    if (k === 'Escape') { e.preventDefault(); press('C'); return; }
  });
  render();
})();

function showChat(){
  calculatorScreen.classList.add('hidden');
  chatUI.classList.remove('hidden');
  // Ensure presence flips to active immediately when entering main UI
  if (currentUser) {
    usersCol.doc(currentUser.uid).set({
      isOnline: true,
      lastActive: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }).catch(()=>{});
  }
  // Show user list first; hide chat area until a peer is selected
  peerName.textContent = 'Select a user';
  peerStatus.textContent = '—';
  setChatContentVisible(false);
  // Focus search for quick filtering
  try { userSearch.focus(); } catch(_) {}
}

function hideChat(){
  chatUI.classList.add('hidden');
  calculatorScreen.classList.remove('hidden');
}

// Toggle chat area (messages/composer) vs. empty state
function setChatContentVisible(show){
  const visible = !!show;
  if (messagesEl) messagesEl.classList.toggle('hidden', !visible);
  if (messageForm) messageForm.classList.toggle('hidden', !visible);
  if (typingIndicator) typingIndicator.classList.add('hidden');
  if (emptyState) emptyState.classList.toggle('hidden', visible);
}

// User list
// All users list (exclude self), with displayName fallback
function subscribeUsers(){
  if (usersUnsub) usersUnsub();
  // Cleanup any unread listeners from previous renders
  if (window.__unreadSubs && typeof window.__unreadSubs === 'object') {
    Object.values(window.__unreadSubs).forEach(arr => { Array.isArray(arr) && arr.forEach(fn => { try{ fn&&fn(); }catch(_){} }); });
  }
  window.__unreadSubs = {};
  usersUnsub = usersCol.onSnapshot(snap => {
    const term = userSearch.value.trim().toLowerCase();
    const items = [];
    snap.forEach(doc => {
      const u = doc.data();
      if (!u) return;
      // Exclude self by document ID for robustness
      if (currentUser && doc.id === currentUser.uid) return;
      // Ensure we have uid on the object for later
      if (!u.uid) u.uid = doc.id;
      const name = displayName(u);
      if (term && !name.toLowerCase().includes(term)) return;
      items.push(u);
    });
    // Sort by recent activity (most recent first), then name
    items.sort((a,b)=>{
      const at = a.lastActive && a.lastActive.toDate ? a.lastActive.toDate().getTime() : 0;
      const bt = b.lastActive && b.lastActive.toDate ? b.lastActive.toDate().getTime() : 0;
      if (at !== bt) return bt - at;
      return displayName(a).localeCompare(displayName(b));
    });
    // Build in a fragment to minimize layout thrash/flicker
    const frag = document.createDocumentFragment();
    const existingMap = (window.__userListItems = window.__userListItems || {});
    const seen = new Set();
    items.forEach(u => {
      let li = existingMap[u.uid];
      let avatarEl, badge, info, nameEl, st, timeEl, dot;
      const nameTxt = displayName(u);
      const lastMs = u.lastActive && u.lastActive.toDate ? String(u.lastActive.toDate().getTime()) : '';
      if (!li) {
        li = document.createElement('li');
        li.className = 'user-item';
        li.dataset.uid = u.uid;
        avatarEl = document.createElement('div');
        renderAvatar(avatarEl, u);
        badge = document.createElement('span');
        badge.className = 'badge hidden';
        badge.textContent = '';
        avatarEl.appendChild(badge);
        info = document.createElement('div');
        info.className = 'info';
        nameEl = document.createElement('div');
        nameEl.className = 'name';
        nameEl.textContent = nameTxt;
        st = document.createElement('div');
        st.className = 'last';
        st.textContent = statusTextFromLastActive(u.lastActive);
        st.dataset.last = lastMs;
        info.appendChild(nameEl);
        info.appendChild(st);
        timeEl = document.createElement('span');
        timeEl.className = 'time';
        timeEl.textContent = '';
        dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.opacity = (u.lastActive && u.lastActive.toDate && (nowMs() - u.lastActive.toDate().getTime() < 70_000)) ? '1' : '0.35';
        li.appendChild(avatarEl);
        li.appendChild(info);
        li.appendChild(timeEl);
        li.appendChild(dot);
        li.addEventListener('click', () => selectPeer(u));
        // Keep refs for faster updates
        li.__refs = { avatarEl, badge, info, nameEl, st, timeEl, dot };
        existingMap[u.uid] = li;
      } else {
        // Update existing node content only
        ({ avatarEl, badge, info, nameEl, st, timeEl, dot } = li.__refs || {});
        if (!nameEl) nameEl = li.querySelector('.name');
        if (!st) st = li.querySelector('.last');
        if (!timeEl) timeEl = li.querySelector('.time');
        if (!dot) dot = li.querySelector('.dot');
        if (nameEl) nameEl.textContent = nameTxt;
        if (st) st.dataset.last = lastMs;
        if (dot && lastMs) {
          const lm = parseInt(lastMs, 10);
          if (!isNaN(lm)) dot.style.opacity = (nowMs() - lm < 70_000) ? '1' : '0.35';
        }
        li.__refs = { avatarEl, badge, info, nameEl, st, timeEl, dot };
      }
      // Attach listeners once per li
      if (!li.__subsAttached) {
        try {
          if (!currentUser || !u.uid) { /* skip */ }
          else {
            const chatId = getChatId(currentUser.uid, u.uid);
            const latestQ = chatsCol.doc(chatId).collection('messages')
              .orderBy('createdAt', 'desc').limit(1);
            latestQ.onSnapshot(snap => {
              try {
                const doc = snap.docs && snap.docs[0];
                if (!doc) { if (st) st.textContent = statusTextFromLastActive(u.lastActive); if (timeEl) timeEl.textContent=''; return; }
                const m = { id: doc.id, ...doc.data() };
                let preview = '';
                if (m.deletedForAll) {
                  preview = 'Message deleted';
                } else if (m.type === 'image') {
                  preview = 'Image';
                } else if (m.type === 'tiktok') {
                  preview = 'TikTok';
                } else if (typeof m.text === 'string' && m.text.trim()) {
                  preview = m.text.trim();
                } else {
                  preview = '...';
                }
                // Prefix with sender arrow for clarity
                if (m.from === (currentUser && currentUser.uid)) preview = 'You: ' + preview;
                if (st) st.textContent = preview.length > 80 ? (preview.slice(0,77) + '…') : preview;
                if (m.createdAt && m.createdAt.toDate) {
                  const d = m.createdAt.toDate();
                  if (timeEl) timeEl.textContent = formatTimeLocal(d);
                } else if (timeEl) timeEl.textContent = '';
              } catch(_) {}
            });
            let lastSeenTs = null;
            const subs = [];
            const unsubChat = chatsCol.doc(chatId).onSnapshot(doc => {
              const d = doc.data();
              const me = currentUser && currentUser.uid;
              const seen = d && d.lastSeenBy && me && d.lastSeenBy[me] && d.lastSeenBy[me].toDate ? d.lastSeenBy[me].toDate() : null;
              lastSeenTs = seen;
              if (li.__refs && li.__refs.badge && li.__refs.badge.dataset._lastMsgs) {
                try {
                  const cache = JSON.parse(li.__refs.badge.dataset._lastMsgs);
                  const cnt = cache.filter(ms => ms.createdAt && (!lastSeenTs || (new Date(ms.createdAt)).getTime() > lastSeenTs.getTime())).length;
                  updateBadge(li.__refs.badge, cnt);
                } catch(_) {}
              }
            });
            subs.push(unsubChat);
            const msgsRef = chatsCol.doc(chatId).collection('messages')
              .orderBy('createdAt', 'desc')
              .limit(50);
            const unsubMsgs = msgsRef.onSnapshot(s => {
              const list = [];
              s.forEach(d => {
                const m = d.data();
                if (!m) return;
                if (m.from !== u.uid) return;
                const ts = m.createdAt && m.createdAt.toDate ? m.createdAt.toDate() : null;
                list.push({ id: d.id, createdAt: ts ? ts.toISOString() : null });
              });
              if (li.__refs && li.__refs.badge) {
                li.__refs.badge.dataset._lastMsgs = JSON.stringify(list);
                const cnt = list.filter(ms => ms.createdAt && (!lastSeenTs || (new Date(ms.createdAt)).getTime() > lastSeenTs.getTime())).length;
                const isActive = selectedPeer && selectedPeer.uid === u.uid;
                updateBadge(li.__refs.badge, isActive ? 0 : cnt);
              }
            }, err => { try { console.warn('Unread listener error', err); } catch(_){} });
            subs.push(unsubMsgs);
            window.__unreadSubs[u.uid] = subs;
          }
        } catch(_) {}
        li.__subsAttached = true;
      }
      seen.add(u.uid);
      frag.appendChild(li);
    });
    // Clean up items not present anymore
    Object.keys(window.__userListItems).forEach(uid => {
      if (!seen.has(uid)) {
        const li = window.__userListItems[uid];
        if (li && li.parentNode) li.parentNode.removeChild(li);
        if (window.__unreadSubs && window.__unreadSubs[uid]) {
          try { window.__unreadSubs[uid].forEach(fn => typeof fn === 'function' && fn()); } catch(_) {}
          delete window.__unreadSubs[uid];
        }
        delete window.__userListItems[uid];
      }
    });
    // Swap built list once and re-apply active highlight
    try { userList.replaceChildren(frag); }
    catch(_) { try { userList.innerHTML = ''; userList.appendChild(frag); } catch(__){} }
    try { if (selectedPeer) { const ali = userList.querySelector(`.user-item[data-uid="${selectedPeer.uid}"]`); if (ali) ali.classList.add('active'); } } catch(_) {}
    // Periodically refresh displayed relative times in the list without new snapshots
    if (usersStatusRefreshTimer) clearInterval(usersStatusRefreshTimer);
    usersStatusRefreshTimer = setInterval(() => {
      const nodes = userList.querySelectorAll('[data-last]');
      nodes.forEach(n => {
        const last = n.dataset.last ? parseInt(n.dataset.last, 10) : NaN;
        if (!isNaN(last)) {
          const fakeTs = { toDate: () => new Date(last) };
          // If it's a legacy status-text element, show status; otherwise leave last message preview intact
          if (n.classList.contains('status-text')) {
            n.textContent = statusTextFromLastActive(fakeTs);
          }
        }
      });
      // also refresh online dot
      userList.querySelectorAll('.user-item').forEach(li => {
        const n = li.querySelector('[data-last]');
        const dot = li.querySelector('.dot');
        const last = n && n.dataset.last ? parseInt(n.dataset.last, 10) : NaN;
        if (dot && !isNaN(last)) {
          dot.style.opacity = (nowMs() - last < 70_000) ? '1' : '0.35';
        }
      });
    }, 30_000);
  });
}

// Debounce search to avoid rapid list rebuilds that can cause flicker
function debounce(fn, wait){ let t; return function(...args){ clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); }; }
userSearch.addEventListener('input', debounce(subscribeUsers, 200));

// Preferred timezone for displaying times (Bangladesh)
const PREFERRED_TIMEZONE = 'Asia/Dhaka';
function formatTimeLocal(d) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: PREFERRED_TIMEZONE }).format(d);
  } catch(_) {
    return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }
}

// ===== Mobile layout helpers =====
function isMobile(){ try { return window.innerWidth <= 900; } catch(_) { return false; } }
function openChatPanel(){ try { const el = document.getElementById('chatUI'); if (el) el.classList.add('chat-open'); } catch(_) {} }
function closeChatPanel(){ try { const el = document.getElementById('chatUI'); if (el) el.classList.remove('chat-open'); } catch(_) {} }

// Back button: return to user list on mobile
try {
  const backBtnEl = document.getElementById('backBtn');
  if (backBtnEl) backBtnEl.addEventListener('click', () => {
    selectedPeer = null;
    try { userList.querySelectorAll('.user-item.active').forEach(el => el.classList.remove('active')); } catch(_) {}
    closeChatPanel();
  });
} catch(_) {}

// Keep chat panel state consistent on resize
try {
  window.addEventListener('resize', () => {
    const el = document.getElementById('chatUI');
    if (!el) return;
    if (isMobile()) {
      if (selectedPeer) el.classList.add('chat-open'); else el.classList.remove('chat-open');
    } else {
      el.classList.remove('chat-open');
    }
  });
} catch(_) {}

async function selectPeer(u){
  selectedPeer = u;
  peerName.textContent = displayName(u);
  peerStatus.textContent = u.isOnline ? 'Active now' : formatLastActive(u.lastActive);
  setChatContentVisible(true);
  // Mobile: open chat panel and hide user list
  try { if (window.innerWidth <= 900) openChatPanel(); } catch(_) {}
  // Highlight active list item
  try {
    userList.querySelectorAll('.user-item.active').forEach(el => el.classList.remove('active'));
    const activeLi = userList.querySelector(`.user-item[data-uid="${u.uid}"]`);
    if (activeLi) activeLi.classList.add('active');
  } catch(_) {}
  // Immediately hide unread badge for this user in the list for snappy UX
  try {
    const li = userList && userList.querySelector(`.user-item[data-uid="${u.uid}"]`);
    const badge = li && li.querySelector('.badge');
    if (badge) { badge.classList.add('hidden'); badge.textContent = ''; }
  } catch(_) {}
  if (backBtn) backBtn.style.display = (window.innerWidth <= 900) ? '' : 'none';
  messagesEl.innerHTML = '';
  messageMap = new Map();
  if (messagesUnsub) messagesUnsub();
  if (peerUserUnsub) peerUserUnsub();
  if (chatDocUnsub) chatDocUnsub();
  if (peerStatusTimer) { clearInterval(peerStatusTimer); peerStatusTimer = null; }
  const chatId = getChatId(currentUser.uid, u.uid);
  const msgsRef = chatsCol.doc(chatId).collection('messages').orderBy('createdAt');
  messagesUnsub = msgsRef.onSnapshot(snap => {
    messagesEl.innerHTML = '';
    snap.forEach(doc => {
      const d = { ...doc.data(), id: doc.id };
      messageMap.set(doc.id, d);
      // Skip if deleted for everyone renders as placeholder; hidden-by hides only for the current user
      if (d.hiddenBy && Array.isArray(d.hiddenBy) && currentUser && d.hiddenBy.includes(currentUser.uid)) {
        return; // delete for me
      }
      renderMessage(d);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
    ensureTikTokScript();
    // Update sent/seen status after rendering
    updateSendStatus();
    // Mark chat as seen (current user viewing)
    scheduleMarkChatSeen(chatId);
  });
  // Listen to peer user doc for live presence
  peerUserUnsub = usersCol.doc(u.uid).onSnapshot(doc => {
    const data = doc.data();
    lastPeerSnapshot = data;
    peerStatus.textContent = statusTextFromLastActive(data?.lastActive);
  });
  // Refresh time-ago every 15s without Firestore changes
  peerStatusTimer = setInterval(() => {
    if (!lastPeerSnapshot) return;
    peerStatus.textContent = statusTextFromLastActive(lastPeerSnapshot.lastActive);
  }, 15_000);
  // Listen to typing state on chat doc (supports multiple typers)
  chatDocUnsub = chatsCol.doc(chatId).onSnapshot(doc => {
    const d = doc.data();
    if (typingIndicators) {
      typingIndicators.innerHTML = '';
    }
    let anyVisible = false;
    const now = Date.now();
    if (d && d.typingBy && typeof d.typingBy === 'object') {
      Object.entries(d.typingBy).forEach(([uid, ts]) => {
        try {
          if (!uid || (currentUser && uid === currentUser.uid)) return; // don't show my own
          const t = ts && ts.toDate ? now - ts.toDate().getTime() : Number.MAX_SAFE_INTEGER;
          const visible = t <= 2000; // show if within last ~2s
          if (!visible) return;
          anyVisible = true;
          if (typingIndicators) {
            const bubble = document.createElement('div');
            bubble.className = 'typing-bubble';
            bubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
            typingIndicators.appendChild(bubble);
          }
        } catch(_){}
      });
    }
    if (typingIndicators) typingIndicators.classList.toggle('hidden', !anyVisible);
    // Track peer seen time from chat doc
    if (d && d.lastSeenBy && selectedPeer && d.lastSeenBy[selectedPeer.uid] && d.lastSeenBy[selectedPeer.uid].toDate) {
      peerSeenAt = d.lastSeenBy[selectedPeer.uid].toDate();
      updateSendStatus();
      if (typingIndicator) typingIndicator.classList.add('hidden');
    }
  });
  // Ensure local typing hooks are active
  hookTypingEvents();
  // Mobile: open chat view like Messenger
  if (window.innerWidth <= 900) {
    document.body.classList.add('chat-open');
  }
}

function renderMessage(m) {
  const wrap = document.createElement('div');
  wrap.className = 'message ' + (m.from === (currentUser && currentUser.uid) ? 'out' : 'in');
  // Track creation time for status computation
  try {
    const created = (m && m.createdAt && m.createdAt.toDate) ? m.createdAt.toDate().getTime() : Date.now();
    wrap.dataset.createdMs = String(created);
  } catch(_) {}
  if (m.id) wrap.dataset.mid = m.id;
  // Allow swipe/drag to reply
  attachSwipeHandlers(wrap, m);
  // Right-click/long-press menu only for own messages
  if (currentUser && m.from === currentUser.uid) {
    attachMessageMenuHandlers(wrap, m);
  } else {
    // Reactions handlers only for others' messages to avoid double long-press listeners
    attachReactionHandlers(wrap, m);
  }
  // Quoted reply block (if any)
  if (m.reply && (m.reply.text || m.reply.messageId)) {
    const quoted = document.createElement('div');
    quoted.className = 'quoted';
    let qText = m.reply.text || '';
    if (m.reply.messageId && messageMap.has(m.reply.messageId)) {
      const orig = messageMap.get(m.reply.messageId);
      qText = replyLabelFor(orig) || qText;
    }
    quoted.textContent = qText;
    // Click to jump to original if available
    if (m.reply.messageId) {
      quoted.style.cursor = 'pointer';
      quoted.title = 'View replied message';
      quoted.addEventListener('click', () => {
        const target = messagesEl.querySelector(`[data-mid="${m.reply.messageId}"]`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('highlight');
          setTimeout(()=> target.classList.remove('highlight'), 1200);
        }
      });
    }
    wrap.appendChild(quoted);
  }
  // Body/content node
  const body = document.createElement('div');
  body.className = 'body';
  if (m.deletedForAll) {
    wrap.classList.add('deleted');
    body.textContent = 'This message was deleted';
  } else if (m.type === 'text') {
    body.textContent = m.text || '';
  } else if (m.type === 'image' && (m.imageUrl || m.thumbUrl)) {
    const media = document.createElement('div');
    media.className = 'media';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = 'Image';
    img.src = m.thumbUrl || m.imageUrl;
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', () => openImageViewer(m.imageUrl || img.src));
    media.appendChild(img);
    body.appendChild(media);
  } else if (m.type === 'tiktok' && m.url) {
    const bq = document.createElement('blockquote');
    bq.className = 'tiktok-embed';
    bq.setAttribute('cite', m.url);
    bq.style.margin = '0';
    bq.style.maxWidth = '320px';
    bq.innerHTML = `<section>Loading TikTok...</section>`;
    body.appendChild(bq);
  }
  wrap.appendChild(body);
  const time = document.createElement('div');
  time.className = 'time';
  if (m.createdAt && m.createdAt.toDate) {
    const d = m.createdAt.toDate();
    time.textContent = formatTimeLocal(d);
    if (m.editedAt) {
      const ed = document.createElement('span');
      ed.className = 'edited';
      ed.textContent = ' (edited)';
      time.appendChild(ed);
    }
  } else { time.textContent = ''; }
  wrap.appendChild(time);
  // Reaction trigger (desktop hover) - only for messages with an id and not my own
  if (m && m.id && !(currentUser && m.from === currentUser.uid)) {
    const trig = document.createElement('button');
    trig.type = 'button';
    trig.className = 'react-trigger';
    trig.title = 'Add reaction';
    trig.textContent = '😊';
    trig.addEventListener('click', (e) => {
      const r = trig.getBoundingClientRect();
      openReactionBar(r.left + r.width/2, r.top - 6, wrap, m);
      // Fallback: if bar didn't show (hidden due to some overlay), toggle a default reaction
      setTimeout(() => {
        const hidden = reactionBar && reactionBar.classList.contains('hidden');
        if (hidden) {
          try { console.warn('Reaction bar hidden, toggling default ❤️'); } catch(_) {}
          toggleReaction(m, '❤️');
        }
      }, 220);
      e.stopPropagation();
    });
    wrap.appendChild(trig);
  }
  // Reactions row
  renderReactions(wrap, m);
  // Append to DOM and add subtle fade for freshly received messages
  messagesEl.appendChild(wrap);
  if (m.from !== (currentUser && currentUser.uid)) {
    let fresh = true;
    try {
      if (m.createdAt && m.createdAt.toDate) {
        const ageMs = Date.now() - m.createdAt.toDate().getTime();
        fresh = ageMs < 5000;
      }
    } catch(_) {}
    if (fresh) {
      wrap.classList.add('just-received');
      wrap.addEventListener('animationend', () => wrap.classList.remove('just-received'), { once: true });
    }
  }
  return wrap;
}

// ================= Sent/Seen status =================
function updateSendStatus() {
  try {
    // Remove status from all outgoing first
    messagesEl.querySelectorAll('.message.out .send-status').forEach(n => n.remove());
    // Identify latest outgoing message by createdMs (fallback to last .message.out)
    const outs = Array.from(messagesEl.querySelectorAll('.message.out'));
    if (!outs.length) return;
    let latest = outs[outs.length - 1];
    let maxMs = -1;
    outs.forEach(el => {
      const ms = parseInt(el.dataset.createdMs || '0', 10);
      if (ms && ms > maxMs) { maxMs = ms; latest = el; }
    });
    const latestOutMs = parseInt(latest.dataset.createdMs || '0', 10) || 0;
    // If there is an inbound message newer than our latest outgoing, hide status entirely
    const ins = Array.from(messagesEl.querySelectorAll('.message.in'));
    let newestInMs = 0;
    ins.forEach(el => {
      const ms = parseInt(el.dataset.createdMs || '0', 10);
      if (ms && ms > newestInMs) newestInMs = ms;
    });
    if (newestInMs && latestOutMs && newestInMs >= latestOutMs) {
      return; // peer replied after seeing; suppress status on our previous message
    }
    const status = document.createElement('div');
    status.className = 'send-status';
    // Compute text: sending... if no id yet, else sent; if peer seen, seen (blue)
    const hasId = !!latest.dataset.mid;
    let text = hasId ? 'sent' : 'sending...';
    if (hasId && peerSeenAt) {
      const createdMs = parseInt(latest.dataset.createdMs || '0', 10);
      if (createdMs && peerSeenAt.getTime && peerSeenAt.getTime() >= createdMs) {
        text = 'seen';
        status.classList.add('seen');
      }
    }
    status.textContent = text;
    latest.appendChild(status);
  } catch(_) {}
}

function scheduleMarkChatSeen(chatId) {
  if (!currentUser) return;
  clearTimeout(scheduleMarkChatSeen._t);
  scheduleMarkChatSeen._t = setTimeout(() => {
    try {
      const path = chatsCol.doc(chatId);
      const field = `lastSeenBy.${currentUser.uid}`;
      path.set({ lastSeenBy: { [currentUser.uid]: firebase.firestore.FieldValue.serverTimestamp() } }, { merge: true }).catch(()=>{});
    } catch(_) {}
  }, 800);
}

function attachReactionHandlers(el, m) {
  // Long-press already handled in attachMessageMenuHandlers for own messages; add here for all
  let timer = null;
  el.addEventListener('touchstart', (e) => {
    if (timer) clearTimeout(timer);
    const t = e.changedTouches[0];
    timer = setTimeout(() => {
      if (!m || !m.id) return;
      if (currentUser && m.from === currentUser.uid) {
        openMobileSheet(el, m);
      } else {
        openReactionBar(t.clientX, t.clientY, el, m);
      }
    }, 500);
  }, { passive: true });
  el.addEventListener('touchend', () => { if (timer) { clearTimeout(timer); timer = null; } });
  el.addEventListener('touchcancel', () => { if (timer) { clearTimeout(timer); timer = null; } });
}

function renderReactions(wrap, m) {
  // Remove old row if present
  const old = wrap.querySelector(':scope > .reactions');
  if (old) old.remove();
  const map = m.reactions || {};
  const keys = Object.keys(map).filter(k => Array.isArray(map[k]) && map[k].length > 0);
  if (keys.length === 0) return;
  const row = document.createElement('div');
  row.className = 'reactions';
  keys.sort();
  keys.forEach(emoji => {
    const users = map[emoji];
    const pill = document.createElement('div');
    pill.className = 'reaction-pill' + (currentUser && users.includes(currentUser.uid) ? ' added' : '');
    const eSpan = document.createElement('span'); eSpan.textContent = emoji;
    const cSpan = document.createElement('span'); cSpan.className = 'count'; cSpan.textContent = String(users.length);
    pill.appendChild(eSpan); pill.appendChild(cSpan);
    pill.title = users.map(uid => (currentUser && uid === currentUser.uid) ? 'You' : (uid.slice(0,6))).join(', ');
    pill.addEventListener('click', async () => {
      // Do not allow reacting on my own message
      if (currentUser && m.from === currentUser.uid) return;
      await toggleReaction(m, emoji);
    });
    row.appendChild(pill);
  });
  wrap.appendChild(row);
}

// ================= Mobile Bottom Sheet (own messages) =================
function openMobileSheet(el, m) {
  if (!mobileSheet) return;
  mobileSheetTarget = { el, message: m };
  mobileSheet.classList.remove('hidden');
  mobileSheet.setAttribute('aria-hidden', 'false');
}
function closeMobileSheet() {
  if (!mobileSheet) return;
  mobileSheet.classList.add('hidden');
  mobileSheet.setAttribute('aria-hidden', 'true');
  mobileSheetTarget = null;
}
if (mobileSheet) {
  mobileSheet.addEventListener('click', async (e) => {
    const panel = e.target.closest('.mobile-sheet__panel');
    const scrim = e.target.closest('.mobile-sheet__scrim');
    if (scrim) { closeMobileSheet(); return; }
    if (!panel) return;
    const btn = e.target.closest('.sheet-item');
    if (!btn || !mobileSheetTarget) return;
    const { message, el } = mobileSheetTarget;
    const action = btn.dataset.action;
    if (btn.classList.contains('close')) { closeMobileSheet(); return; }
    closeMobileSheet();
    try {
      if (action === 'edit') {
        if (message.type !== 'text') return;
        startInlineEdit(message, el);
      } else if (action === 'delete-me') {
        await deleteForMe(message);
      } else if (action === 'delete-all') {
        await deleteForAll(message);
      }
    } catch(_) {}
  });
}

function attachSwipeHandlers(el, m) {
  let startX = 0, startY = 0, dx = 0, dy = 0, active = false;
  let swiping = false;
  const dirNeeded = (m.from === currentUser.uid) ? 'left' : 'right';
  const threshold = 42;
  const maxShift = 64;
  const angleGuard = 24; // px vertical tolerance

  const onStart = (x, y) => {
    active = true; swiping = false; startX = x; startY = y; dx = 0; dy = 0;
    el.classList.add('swiping');
  };
  const onMove = (x, y) => {
    if (!active) return;
    dx = x - startX; dy = y - startY;
    if (Math.abs(dy) > angleGuard && Math.abs(dy) > Math.abs(dx)) return; // ignore mostly-vertical
    swiping = true;
    let shift = dx;
    if (dirNeeded === 'left') shift = Math.min(0, dx); else shift = Math.max(0, dx);
    shift = Math.max(-maxShift, Math.min(maxShift, shift));
    el.style.transform = `translateX(${shift}px)`;
  };
  const onEnd = () => {
    if (!active) return;
    active = false;
    el.classList.remove('swiping');
    el.style.transform = '';
    // trigger if exceeded threshold in required direction
    const passed = (dirNeeded === 'left') ? (dx <= -threshold) : (dx >= threshold);
    if (swiping && passed) {
      showReplyPreview(m);
      // focus input
      if (messageInput) messageInput.focus();
    }
  };

  // Touch events
  el.addEventListener('touchstart', (e)=>{
    const t = e.changedTouches[0]; onStart(t.clientX, t.clientY);
  }, { passive: true });
  el.addEventListener('touchmove', (e)=>{
    const t = e.changedTouches[0]; onMove(t.clientX, t.clientY);
  }, { passive: true });
  el.addEventListener('touchend', () => onEnd());
  el.addEventListener('touchcancel', () => onEnd());

  // Mouse events
  el.addEventListener('mousedown', (e)=>{ onStart(e.clientX, e.clientY); });
  window.addEventListener('mousemove', (e)=>{ if (active) onMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup', ()=> onEnd());
}

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedPeer) return;
  let text = messageInput.value;
  if (!text || !text.trim()) return; // allow newlines, only check not all whitespace

  const chatId = getChatId(currentUser.uid, selectedPeer.uid);
  const submitBtn = messageForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  const msg = {
    from: currentUser.uid,
    to: selectedPeer.uid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (isTikTokUrl(text)) {
    msg.type = 'tiktok';
    msg.url = text;
  } else {
    msg.type = 'text';
    msg.text = text; // preserve newlines and spacing
  }
  if (currentReply) {
    msg.reply = { text: currentReply.text, from: currentReply.from, messageId: currentReply.messageId };
  }

  const prev = messageInput.value;
  messageInput.value = '';
  // reset height after clearing
  try { messageInput.style.height = 'auto'; } catch(_){}
  // clear reply preview immediately for snappy UX
  clearReplyPreview();

  try {
    // Optimistic render
    try {
      const tempMsg = {
        from: currentUser.uid,
        to: selectedPeer.uid,
        type: msg.type,
        text: msg.text,
        url: msg.url,
        reply: msg.reply,
        createdAt: { toDate: () => new Date() }
      };
      const el = renderMessage(tempMsg);
      if (el) {
        el.classList.add('just-sent');
        el.addEventListener('animationend', () => el.classList.remove('just-sent'), { once: true });
      }
      // Show sending... on latest outgoing
      updateSendStatus();
      // Trigger send button ripple
      if (submitBtn) {
        submitBtn.classList.add('rippling');
        setTimeout(() => submitBtn.classList.remove('rippling'), 320);
      }
      // Play send sound
      playWhoosh();
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } catch(_) {}

    await chatsCol.doc(chatId).set({
      users: [currentUser.uid, selectedPeer.uid],
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await chatsCol.doc(chatId).collection('messages').add(msg);
    // clear typing on send
    await chatsCol.doc(chatId).set({ typing: {} }, { merge: true });
    // Presence ping on send
    if (currentUser) {
      usersCol.doc(currentUser.uid).set({
        isOnline: true,
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }).catch(()=>{});
    }
    // ensure scroll to bottom after successful send
    setTimeout(() => { messagesEl.scrollTop = messagesEl.scrollHeight; }, 0);
    // After success, status should become 'sent' until peer sees
    updateSendStatus();
  } catch (err) {
    // restore text on failure
    messageInput.value = prev;
    alert(err.message || 'Failed to send');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

// Typing indicator: throttle updates to reduce writes
messageInput.addEventListener('input', async () => {
  if (!selectedPeer) return;
  const chatId = getChatId(currentUser.uid, selectedPeer.uid);
  const send = async () => {
    try {
      await chatsCol.doc(chatId).set({
        typing: { uid: currentUser.uid, at: firebase.firestore.FieldValue.serverTimestamp() }
      }, { merge: true });
    } catch(e){}
  };
  if (!typingThrottle) {
    send();
    typingThrottle = setTimeout(() => { typingThrottle = null; }, 2000);
  }
});

// Auth state listener
auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  setAuthError('');
  if (usersUnsub) usersUnsub();
  if (messagesUnsub) messagesUnsub();

  if (user) {
    // Recalibrate on login
    try { await calibrateServerOffset(); } catch(e) {}
    authBtn.style.display = 'none';
    logoutBtn.style.display = '';
    if (profileBtn) profileBtn.style.display = '';
    meEmail.textContent = user.email || '';
    if (typeof meAvatar !== 'undefined' && meAvatar) { meAvatar.textContent = ''; meAvatar.dataset.bg = ''; }

    // Ensure user doc exists
    const ref = usersCol.doc(user.uid);
    await ref.set({ uid: user.uid, email: user.email || '' }, { merge: true });

// Load user profile
const snap = await ref.get();
currentUserDoc = snap.data();
meName.textContent = currentUserDoc.username || '(no username)';
renderMeAvatar(currentUserDoc);

// Set presence now and start heartbeat
await ref.set({
isOnline: true,
lastActive: firebase.firestore.FieldValue.serverTimestamp(),
}, { merge: true });
startPresence();

// If no passcode set (existing accounts), prompt to register tab
if (!currentUserDoc.passcodeHash || !currentUserDoc.username) {
openAuth();
switchTab('register');
byId('authError').textContent = 'Complete profile: username + passcode.';
}
    // If no passcode set (existing accounts), prompt to register tab
    if (!currentUserDoc.passcodeHash || !currentUserDoc.username) {
      openAuth();
      switchTab('register');
      byId('authError').textContent = 'Complete profile: username + passcode.';
    }

    subscribeUsers();
  } else {
    authBtn.style.display = '';
    logoutBtn.style.display = 'none';
    if (profileBtn) profileBtn.style.display = 'none';
    meName.textContent = '—';
    meEmail.textContent = '—';
    currentUserDoc = null;
    selectedPeer = null;
    stopPresence();
    hideChat();
    document.body.classList.remove('chat-open');
  }
});

// Back button for mobile
if (backBtn) {
  backBtn.addEventListener('click', () => {
    selectedPeer = null;
    if (messagesUnsub) { messagesUnsub(); messagesUnsub = null; }
    if (peerUserUnsub) { peerUserUnsub(); peerUserUnsub = null; }
    if (chatDocUnsub) { chatDocUnsub(); chatDocUnsub = null; }
    if (typingIndicator) typingIndicator.classList.add('hidden');
    if (typingIndicators) { typingIndicators.classList.add('hidden'); try { typingIndicators.innerHTML = ''; } catch(_){} }
    peerName.textContent = 'Select a user';
    peerStatus.textContent = '—';
    messagesEl.innerHTML = '';
    setChatContentVisible(false);
    backBtn.style.display = 'none';
    document.body.classList.remove('chat-open');
  });
}
