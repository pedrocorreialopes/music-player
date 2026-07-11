/* =========================================================
   AURORA PLAYER — Lógica principal
   ========================================================= */

(function () {
  "use strict";

  /* ---------- Estado ---------- */
  const STORAGE_KEYS = {
    playlists: "aurora_playlists_v1",
    favorites: "aurora_favorites_v1",
    theme: "aurora_theme_v1",
    volume: "aurora_volume_v1"
  };

  let library = [...TRACKS];          // biblioteca completa (galeria + uploads locais)
  let localBlobUrls = {};             // id -> blobURL (arquivos locais adicionados)
  let queue = [];                     // fila de reprodução (array de ids)
  let currentIndex = -1;              // índice atual dentro de `queue`
  let isPlaying = false;
  let isShuffled = false;
  let repeatMode = 0;                 // 0 = off, 1 = repetir tudo, 2 = repetir uma
  let currentContext = "library";     // de onde a fila foi originada (para exibição)
  let pendingAddTrackId = null;       // faixa selecionada para "adicionar à playlist"
  let activePlaylistId = null;

  let playlists = loadJSON(STORAGE_KEYS.playlists, []);
  let favorites = new Set(loadJSON(STORAGE_KEYS.favorites, []));

  /* ---------- Utilidades ---------- */
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function savePlaylists() { saveJSON(STORAGE_KEYS.playlists, playlists); }
  function saveFavorites() { saveJSON(STORAGE_KEYS.favorites, [...favorites]); }

  function findTrack(id) { return library.find(t => t.id === id); }

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function uid() { return "id" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }

  function showToast(message, icon = "fa-circle-check") {
    const toast = document.getElementById("toast");
    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
    toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  /* ---------- Elementos DOM ---------- */
  const audio = document.getElementById("audioPlayer");
  const playBtn = document.getElementById("playBtn");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const shuffleBtn = document.getElementById("shuffleBtn");
  const repeatBtn = document.getElementById("repeatBtn");
  const progressBar = document.getElementById("progressBar");
  const progressFill = document.getElementById("progressFill");
  const progressHandle = document.getElementById("progressHandle");
  const currentTimeEl = document.getElementById("currentTime");
  const durationTimeEl = document.getElementById("durationTime");
  const playerCover = document.getElementById("playerCover");
  const playerTitle = document.getElementById("playerTitle");
  const playerArtist = document.getElementById("playerArtist");
  const likeBtn = document.getElementById("likeBtn");
  const volumeSlider = document.getElementById("volumeSlider");
  const muteBtn = document.getElementById("muteBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const addToPlaylistBtn = document.getElementById("addToPlaylistBtn");
  const queueBtn = document.getElementById("queueBtn");
  const spinRing = document.getElementById("spinRing");
  const visualizer = document.getElementById("visualizer");
  const heroDisc = document.querySelector(".hero-disc");
  const heroCover = document.getElementById("heroCover");
  const searchInput = document.getElementById("searchInput");

  /* ---------- Navegação de views ---------- */
  const navItems = document.querySelectorAll(".nav-item");
  const views = document.querySelectorAll(".view");
  navItems.forEach(item => {
    item.addEventListener("click", () => switchView(item.dataset.view));
  });

  function switchView(viewName) {
    navItems.forEach(n => n.classList.toggle("active", n.dataset.view === viewName));
    views.forEach(v => v.classList.toggle("active", v.id === `view-${viewName}`));
    if (viewName === "playlists") {
      document.getElementById("playlistDetail").hidden = true;
      document.getElementById("playlistGrid").style.display = "";
    }
    document.getElementById("sidebar").classList.remove("open");
  }

  /* Menu mobile */
  document.getElementById("menuToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  /* Tema */
  const themeToggle = document.getElementById("themeToggle");
  function applyTheme(theme) {
    document.body.classList.toggle("light-theme", theme === "light");
    themeToggle.innerHTML = theme === "light"
      ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
  }
  let currentTheme = loadJSON(STORAGE_KEYS.theme, "dark");
  applyTheme(currentTheme);
  themeToggle.addEventListener("click", () => {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    saveJSON(STORAGE_KEYS.theme, currentTheme);
    applyTheme(currentTheme);
  });

  /* =========================================================
     RENDERIZAÇÃO
     ========================================================= */

  function trackRowHTML(track, opts = {}) {
    const isFav = favorites.has(track.id);
    const isCurrent = queue[currentIndex] === track.id && opts.showAsPlaying !== false;
    return `
      <div class="track-row ${isCurrent ? "playing" : ""}" data-id="${track.id}">
        <div class="tr-idx">
          <span class="idx-num">${opts.index != null ? opts.index : ""}</span>
          <button class="row-play-btn" data-action="play" title="Reproduzir">
            <i class="fa-solid ${isCurrent && isPlaying ? "fa-pause" : "fa-play"}"></i>
          </button>
        </div>
        <div class="tr-main">
          <img src="${track.cover}" alt="Capa de ${track.title}" loading="lazy">
          <div class="tr-titles">
            <div class="tt">${escapeHtml(track.title)}</div>
            <div class="ta">${escapeHtml(track.artist)}</div>
          </div>
        </div>
        <div class="tr-album">${escapeHtml(track.album || "—")}</div>
        <div class="tr-duration">${track._duration ? formatTime(track._duration) : "--:--"}</div>
        <div class="tr-actions">
          <button class="icon-btn ${isFav ? "liked" : ""}" data-action="fav" title="Favoritar">
            <i class="fa-${isFav ? "solid" : "regular"} fa-heart"></i>
          </button>
          <button class="icon-btn" data-action="addlist" title="Adicionar à playlist">
            <i class="fa-solid fa-square-plus"></i>
          </button>
          <button class="icon-btn" data-action="download" title="Baixar">
            <i class="fa-solid fa-download"></i>
          </button>
          ${opts.removeFromPlaylist ? `<button class="icon-btn" data-action="removefromplaylist" title="Remover da playlist"><i class="fa-solid fa-xmark"></i></button>` : ""}
          ${opts.removeFromQueue ? `<button class="icon-btn" data-action="removefromqueue" title="Remover da fila"><i class="fa-solid fa-xmark"></i></button>` : ""}
        </div>
      </div>`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function renderTableHeader() {
    return `
      <div class="track-row head-row">
        <div class="tr-idx">#</div>
        <div>Título</div>
        <div class="tr-album">Álbum</div>
        <div class="tr-duration">Duração</div>
        <div></div>
      </div>`;
  }

  function attachRowEvents(container, list, options = {}) {
    container.querySelectorAll(".track-row:not(.head-row)").forEach(row => {
      const id = row.dataset.id;
      row.addEventListener("dblclick", () => playFromList(list, id, options.context));
      row.querySelector('[data-action="play"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        const track = findTrack(id);
        if (queue[currentIndex] === id) { togglePlay(); }
        else { playFromList(list, id, options.context); }
        renderAllViews();
      });
      row.querySelector('[data-action="fav"]')?.addEventListener("click", (e) => {
        e.stopPropagation(); toggleFavorite(id); renderAllViews();
      });
      row.querySelector('[data-action="addlist"]')?.addEventListener("click", (e) => {
        e.stopPropagation(); openAddToPlaylistModal(id);
      });
      row.querySelector('[data-action="download"]')?.addEventListener("click", (e) => {
        e.stopPropagation(); downloadTrack(id);
      });
      row.querySelector('[data-action="removefromplaylist"]')?.addEventListener("click", (e) => {
        e.stopPropagation(); removeFromPlaylist(options.playlistId, id); renderAllViews();
      });
      row.querySelector('[data-action="removefromqueue"]')?.addEventListener("click", (e) => {
        e.stopPropagation(); removeFromQueueAt(row); renderAllViews();
      });
    });
  }

  function removeFromQueueAt(row) {
    const id = row.dataset.id;
    const idx = queue.indexOf(id);
    if (idx === -1) return;
    if (idx === currentIndex) { showToast("Não é possível remover a faixa em reprodução.", "fa-triangle-exclamation"); return; }
    queue.splice(idx, 1);
    if (idx < currentIndex) currentIndex--;
  }

  /* ---- Home ---- */
  function renderHome() {
    const recentGrid = document.getElementById("recentGrid");
    const recent = library.slice(-8).reverse();
    recentGrid.innerHTML = recent.map(cardHTML).join("") || emptyStateHTML("Nenhuma faixa na galeria ainda.");
    attachCardEvents(recentGrid, recent);

    const artistRow = document.getElementById("artistRow");
    const artists = [...new Map(library.map(t => [t.artist, t])).values()];
    artistRow.innerHTML = artists.map(a => `
      <div class="artist-chip" data-artist="${escapeHtml(a.artist)}">
        <img src="${a.cover}" alt="${escapeHtml(a.artist)}">
        <span>${escapeHtml(a.artist)}</span>
      </div>`).join("");
    artistRow.querySelectorAll(".artist-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        switchView("library");
        searchInput.value = chip.dataset.artist;
        renderLibrary();
      });
    });
  }

  function cardHTML(track) {
    const isCurrent = queue[currentIndex] === track.id;
    return `
      <div class="track-card ${isCurrent ? "playing" : ""}" data-id="${track.id}">
        <div class="cover-wrap">
          <img src="${track.cover}" alt="Capa de ${escapeHtml(track.title)}" loading="lazy">
          <div class="play-overlay"><div class="mini-play"><i class="fa-solid ${isCurrent && isPlaying ? "fa-pause" : "fa-play"}"></i></div></div>
        </div>
        <div class="t-title">${escapeHtml(track.title)}</div>
        <div class="t-artist">${escapeHtml(track.artist)}</div>
      </div>`;
  }

  function attachCardEvents(container, list) {
    container.querySelectorAll(".track-card").forEach(card => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        if (queue[currentIndex] === id) togglePlay();
        else playFromList(list, id, "galeria");
        renderAllViews();
      });
    });
  }

  function emptyStateHTML(msg) {
    return `<div class="empty-state"><i class="fa-solid fa-music"></i><p>${escapeHtml(msg)}</p></div>`;
  }

  /* ---- Library (galeria completa) ---- */
  function renderLibrary() {
    const table = document.getElementById("libraryTable");
    const term = searchInput.value.trim().toLowerCase();
    const sortBy = document.getElementById("sortSelect").value;

    let list = library.filter(t =>
      !term || t.title.toLowerCase().includes(term) ||
      t.artist.toLowerCase().includes(term) ||
      (t.album || "").toLowerCase().includes(term)
    );

    list.sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "artist") return a.artist.localeCompare(b.artist);
      if (sortBy === "year") return (b.year || 0) - (a.year || 0);
      return 0;
    });

    if (!list.length) {
      table.innerHTML = emptyStateHTML("Nenhuma faixa encontrada.");
      return;
    }

    table.innerHTML = renderTableHeader() +
      list.map((t, i) => trackRowHTML(t, { index: i + 1 })).join("");
    attachRowEvents(table, list, { context: "Galeria" });
  }

  /* ---- Favorites ---- */
  function renderFavorites() {
    const table = document.getElementById("favoritesTable");
    const list = library.filter(t => favorites.has(t.id));
    if (!list.length) {
      table.innerHTML = emptyStateHTML("Você ainda não favoritou nenhuma faixa. Clique no ♥ para adicionar.");
      return;
    }
    table.innerHTML = renderTableHeader() + list.map((t, i) => trackRowHTML(t, { index: i + 1 })).join("");
    attachRowEvents(table, list, { context: "Favoritas" });
  }

  /* ---- Queue ---- */
  function renderQueue() {
    const table = document.getElementById("queueTable");
    const list = queue.map(findTrack).filter(Boolean);
    if (!list.length) {
      table.innerHTML = emptyStateHTML("A fila de reprodução está vazia.");
      return;
    }
    table.innerHTML = renderTableHeader() + list.map((t, i) => trackRowHTML(t, { index: i + 1, removeFromQueue: true })).join("");
    attachRowEvents(table, list, { context: "Fila" });
  }
  document.getElementById("clearQueueBtn").addEventListener("click", () => {
    const currentId = queue[currentIndex];
    queue = currentId ? [currentId] : [];
    currentIndex = queue.length ? 0 : -1;
    renderAllViews();
    showToast("Fila limpa.", "fa-broom");
  });

  /* ---- Playlists ---- */
  function renderPlaylistSidebar() {
    const ul = document.getElementById("playlistList");
    if (!playlists.length) {
      ul.innerHTML = `<li class="empty-hint">Crie sua primeira playlist</li>`;
      return;
    }
    ul.innerHTML = playlists.map(p => `
      <li data-id="${p.id}">
        <span class="pl-dot"></span>
        <span>${escapeHtml(p.name)}</span>
        <span class="pl-count">${p.trackIds.length}</span>
      </li>`).join("");
    ul.querySelectorAll("li[data-id]").forEach(li => {
      li.addEventListener("click", () => openPlaylistDetail(li.dataset.id));
    });
  }

  function renderPlaylistGrid() {
    const grid = document.getElementById("playlistGrid");
    if (!playlists.length) {
      grid.innerHTML = emptyStateHTML("Nenhuma playlist criada. Clique em “Nova playlist” para começar.");
      return;
    }
    grid.innerHTML = playlists.map(p => {
      const covers = p.trackIds.slice(0, 4).map(id => findTrack(id)).filter(Boolean);
      const coversHTML = covers.length
        ? covers.map(t => `<img src="${t.cover}" alt="">`).join("")
        : `<div class="empty-icon"><i class="fa-solid fa-music"></i></div>`;
      return `
        <div class="playlist-card" data-id="${p.id}">
          <div class="playlist-cover-stack">${coversHTML}</div>
          <h4>${escapeHtml(p.name)}</h4>
          <span>${p.trackIds.length} faixa(s)</span>
        </div>`;
    }).join("");
    grid.querySelectorAll(".playlist-card").forEach(card => {
      card.addEventListener("click", () => openPlaylistDetail(card.dataset.id));
    });
  }

  function openPlaylistDetail(id) {
    activePlaylistId = id;
    const playlist = playlists.find(p => p.id === id);
    if (!playlist) return;
    document.getElementById("playlistGrid").style.display = "none";
    const detail = document.getElementById("playlistDetail");
    detail.hidden = false;
    document.getElementById("playlistDetailTitle").textContent = playlist.name;

    const table = document.getElementById("playlistDetailTable");
    const list = playlist.trackIds.map(findTrack).filter(Boolean);
    table.innerHTML = list.length
      ? renderTableHeader() + list.map((t, i) => trackRowHTML(t, { index: i + 1, removeFromPlaylist: true })).join("")
      : emptyStateHTML("Esta playlist ainda não tem faixas. Adicione pela galeria.");
    attachRowEvents(table, list, { context: playlist.name, playlistId: id });
  }

  document.getElementById("backToPlaylists").addEventListener("click", () => {
    document.getElementById("playlistDetail").hidden = true;
    document.getElementById("playlistGrid").style.display = "";
    activePlaylistId = null;
  });

  document.getElementById("playPlaylistBtn").addEventListener("click", () => {
    const playlist = playlists.find(p => p.id === activePlaylistId);
    if (!playlist || !playlist.trackIds.length) { showToast("Playlist vazia.", "fa-triangle-exclamation"); return; }
    setQueueAndPlay(playlist.trackIds, playlist.trackIds[0], playlist.name);
  });

  document.getElementById("deletePlaylistBtn").addEventListener("click", () => {
    if (!activePlaylistId) return;
    if (!confirm("Excluir esta playlist? Esta ação não pode ser desfeita.")) return;
    playlists = playlists.filter(p => p.id !== activePlaylistId);
    savePlaylists();
    document.getElementById("playlistDetail").hidden = true;
    document.getElementById("playlistGrid").style.display = "";
    renderAllViews();
    showToast("Playlist excluída.", "fa-trash");
  });

  document.getElementById("downloadPlaylistBtn").addEventListener("click", async () => {
    const playlist = playlists.find(p => p.id === activePlaylistId);
    if (!playlist || !playlist.trackIds.length) { showToast("Playlist vazia.", "fa-triangle-exclamation"); return; }
    await downloadAsZip(playlist.trackIds.map(findTrack).filter(Boolean), playlist.name);
  });

  function removeFromPlaylist(playlistId, trackId) {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    playlist.trackIds = playlist.trackIds.filter(id => id !== trackId);
    savePlaylists();
    if (activePlaylistId === playlistId) openPlaylistDetail(playlistId);
  }

  function createPlaylist(name) {
    const playlist = { id: uid(), name: name.trim() || "Nova playlist", trackIds: [] };
    playlists.push(playlist);
    savePlaylists();
    renderAllViews();
    return playlist;
  }

  function addTrackToPlaylist(playlistId, trackId) {
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    if (playlist.trackIds.includes(trackId)) {
      showToast("Essa faixa já está na playlist.", "fa-circle-info");
      return;
    }
    playlist.trackIds.push(trackId);
    savePlaylists();
    showToast(`Adicionada a “${playlist.name}”.`, "fa-square-plus");
    renderAllViews();
  }

  /* Modais de playlist */
  const modalOverlay = document.getElementById("modalOverlay");
  const playlistNameInput = document.getElementById("playlistNameInput");
  function openCreatePlaylistModal() {
    modalOverlay.classList.add("show");
    playlistNameInput.value = "";
    setTimeout(() => playlistNameInput.focus(), 100);
  }
  function closeCreatePlaylistModal() { modalOverlay.classList.remove("show"); }
  document.getElementById("createPlaylistBtn").addEventListener("click", openCreatePlaylistModal);
  document.getElementById("newPlaylistBtn2").addEventListener("click", openCreatePlaylistModal);
  document.getElementById("closeModalBtn").addEventListener("click", closeCreatePlaylistModal);
  document.getElementById("cancelModalBtn").addEventListener("click", closeCreatePlaylistModal);
  document.getElementById("confirmModalBtn").addEventListener("click", () => {
    if (!playlistNameInput.value.trim()) { showToast("Digite um nome para a playlist.", "fa-triangle-exclamation"); return; }
    createPlaylist(playlistNameInput.value);
    closeCreatePlaylistModal();
    showToast("Playlist criada!", "fa-circle-check");
  });
  playlistNameInput.addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("confirmModalBtn").click(); });
  modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeCreatePlaylistModal(); });

  const addToPlaylistOverlay = document.getElementById("addToPlaylistOverlay");
  function openAddToPlaylistModal(trackId) {
    pendingAddTrackId = trackId;
    renderModalPlaylistList();
    addToPlaylistOverlay.classList.add("show");
  }
  function closeAddToPlaylistModal() { addToPlaylistOverlay.classList.remove("show"); pendingAddTrackId = null; }
  function renderModalPlaylistList() {
    const ul = document.getElementById("modalPlaylistList");
    if (!playlists.length) {
      ul.innerHTML = `<li style="cursor:default;justify-content:center;">Nenhuma playlist ainda</li>`;
      return;
    }
    ul.innerHTML = playlists.map(p => `
      <li data-id="${p.id}"><i class="fa-solid fa-list-music"></i> ${escapeHtml(p.name)} (${p.trackIds.length})</li>
    `).join("");
    ul.querySelectorAll("li[data-id]").forEach(li => {
      li.addEventListener("click", () => {
        addTrackToPlaylist(li.dataset.id, pendingAddTrackId);
        closeAddToPlaylistModal();
      });
    });
  }
  document.getElementById("closeAddModalBtn").addEventListener("click", closeAddToPlaylistModal);
  addToPlaylistOverlay.addEventListener("click", e => { if (e.target === addToPlaylistOverlay) closeAddToPlaylistModal(); });
  document.getElementById("addNewFromModalBtn").addEventListener("click", () => {
    closeAddToPlaylistModal();
    openCreatePlaylistModal();
  });
  addToPlaylistBtn.addEventListener("click", () => {
    const id = queue[currentIndex];
    if (!id) { showToast("Nenhuma faixa em reprodução.", "fa-triangle-exclamation"); return; }
    openAddToPlaylistModal(id);
  });

  /* =========================================================
     REPRODUÇÃO
     ========================================================= */

  function setQueueAndPlay(ids, startId, contextLabel) {
    queue = isShuffled ? shuffleArray([...ids]) : [...ids];
    currentIndex = queue.indexOf(startId);
    if (currentIndex === -1) currentIndex = 0;
    currentContext = contextLabel || "Galeria";
    loadAndPlayCurrent();
  }

  function playFromList(list, id, contextLabel) {
    const ids = list.map(t => t.id);
    setQueueAndPlay(ids, id, contextLabel);
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function loadAndPlayCurrent() {
    const id = queue[currentIndex];
    const track = findTrack(id);
    if (!track) return;
    const src = localBlobUrls[track.id] || track.src;
    if (audio.dataset.currentId !== track.id) {
      audio.src = src;
      audio.dataset.currentId = track.id;
    }
    updateNowPlayingUI(track);
    audio.play().then(() => { isPlaying = true; updatePlayUI(); }).catch(() => {
      showToast("Não foi possível reproduzir este arquivo.", "fa-triangle-exclamation");
    });
  }

  function updateNowPlayingUI(track) {
    playerTitle.textContent = track.title;
    playerArtist.textContent = track.artist;
    playerCover.src = track.cover;
    heroCover.src = track.cover;
    likeBtn.classList.toggle("liked", favorites.has(track.id));
    likeBtn.innerHTML = `<i class="fa-${favorites.has(track.id) ? "solid" : "regular"} fa-heart"></i>`;
    document.title = `${track.title} · ${track.artist} — Aurora Player`;
  }

  function updatePlayUI() {
    playBtn.innerHTML = `<i class="fa-solid ${isPlaying ? "fa-pause" : "fa-play"}"></i>`;
    spinRing.classList.toggle("active", isPlaying);
    visualizer.classList.toggle("active", isPlaying);
    heroDisc.classList.toggle("spinning", isPlaying);
    renderAllViews();
  }

  function togglePlay() {
    if (currentIndex === -1) {
      if (!library.length) return;
      setQueueAndPlay(library.map(t => t.id), library[0].id, "Galeria");
      return;
    }
    if (audio.paused) { audio.play(); isPlaying = true; }
    else { audio.pause(); isPlaying = false; }
    updatePlayUI();
  }

  function playNext(userTriggered) {
    if (!queue.length) return;
    if (repeatMode === 2 && !userTriggered) {
      audio.currentTime = 0; audio.play(); return;
    }
    if (currentIndex < queue.length - 1) {
      currentIndex++;
    } else if (repeatMode === 1) {
      currentIndex = 0;
    } else {
      isPlaying = false; updatePlayUI(); return;
    }
    loadAndPlayCurrent();
  }

  function playPrev() {
    if (!queue.length) return;
    if (audio.currentTime > 4) { audio.currentTime = 0; return; }
    if (currentIndex > 0) currentIndex--;
    else currentIndex = queue.length - 1;
    loadAndPlayCurrent();
  }

  playBtn.addEventListener("click", togglePlay);
  nextBtn.addEventListener("click", () => playNext(true));
  prevBtn.addEventListener("click", playPrev);

  shuffleBtn.addEventListener("click", () => {
    isShuffled = !isShuffled;
    shuffleBtn.classList.toggle("toggled", isShuffled);
    if (isShuffled && queue.length) {
      const currentId = queue[currentIndex];
      const rest = queue.filter((_, i) => i !== currentIndex);
      queue = [currentId, ...shuffleArray(rest)];
      currentIndex = 0;
    }
    showToast(isShuffled ? "Modo aleatório ativado." : "Modo aleatório desativado.", "fa-shuffle");
  });

  repeatBtn.addEventListener("click", () => {
    repeatMode = (repeatMode + 1) % 3;
    repeatBtn.classList.toggle("toggled", repeatMode !== 0);
    const icon = repeatMode === 2 ? "fa-repeat" : "fa-repeat";
    repeatBtn.innerHTML = `<i class="fa-solid ${icon}"></i>`;
    repeatBtn.title = repeatMode === 0 ? "Repetir" : repeatMode === 1 ? "Repetindo tudo" : "Repetindo uma faixa";
    if (repeatMode === 2) {
      repeatBtn.style.position = "relative";
    }
    showToast(
      repeatMode === 0 ? "Repetição desativada." : repeatMode === 1 ? "Repetindo toda a fila." : "Repetindo a faixa atual.",
      "fa-repeat"
    );
  });

  likeBtn.addEventListener("click", () => {
    const id = queue[currentIndex];
    if (!id) return;
    toggleFavorite(id);
    updateNowPlayingUI(findTrack(id));
    renderAllViews();
  });

  function toggleFavorite(id) {
    if (favorites.has(id)) { favorites.delete(id); showToast("Removida dos favoritos.", "fa-heart-crack"); }
    else { favorites.add(id); showToast("Adicionada aos favoritos!", "fa-heart"); }
    saveFavorites();
  }

  /* ---------- Progresso / tempo ---------- */
  audio.addEventListener("timeupdate", () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = pct + "%";
    progressHandle.style.left = pct + "%";
    currentTimeEl.textContent = formatTime(audio.currentTime);
  });
  audio.addEventListener("loadedmetadata", () => {
    durationTimeEl.textContent = formatTime(audio.duration);
    const track = findTrack(audio.dataset.currentId);
    if (track) track._duration = audio.duration;
  });
  audio.addEventListener("ended", () => playNext(false));
  audio.addEventListener("play", () => { isPlaying = true; updatePlayUI(); });
  audio.addEventListener("pause", () => { isPlaying = false; updatePlayUI(); });

  function seekTo(clientX) {
    const rect = progressBar.getBoundingClientRect();
    const pct = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    if (audio.duration) audio.currentTime = pct * audio.duration;
  }
  progressBar.addEventListener("click", e => seekTo(e.clientX));
  let draggingProgress = false;
  progressHandle.addEventListener("mousedown", () => draggingProgress = true);
  window.addEventListener("mousemove", e => { if (draggingProgress) seekTo(e.clientX); });
  window.addEventListener("mouseup", () => draggingProgress = false);

  /* ---------- Volume ---------- */
  function applyVolume(v) {
    audio.volume = v / 100;
    muteBtn.innerHTML = `<i class="fa-solid ${v == 0 ? "fa-volume-xmark" : v < 50 ? "fa-volume-low" : "fa-volume-high"}"></i>`;
  }
  const savedVolume = loadJSON(STORAGE_KEYS.volume, 80);
  volumeSlider.value = savedVolume;
  applyVolume(savedVolume);
  volumeSlider.addEventListener("input", () => {
    applyVolume(volumeSlider.value);
    saveJSON(STORAGE_KEYS.volume, volumeSlider.value);
  });
  let lastVolume = savedVolume;
  muteBtn.addEventListener("click", () => {
    if (audio.volume > 0) { lastVolume = volumeSlider.value; volumeSlider.value = 0; }
    else { volumeSlider.value = lastVolume || 80; }
    applyVolume(volumeSlider.value);
  });

  /* ---------- Download ---------- */
  function downloadTrack(id) {
    const track = findTrack(id);
    if (!track) return;
    const src = localBlobUrls[track.id] || track.src;
    const a = document.createElement("a");
    a.href = src;
    a.download = `${track.artist} - ${track.title}.mp3`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast(`Baixando “${track.title}”...`, "fa-download");
  }
  downloadBtn.addEventListener("click", () => {
    const id = queue[currentIndex];
    if (!id) { showToast("Nenhuma faixa selecionada.", "fa-triangle-exclamation"); return; }
    downloadTrack(id);
  });

  async function downloadAsZip(tracks, zipName) {
    if (!window.JSZip) { showToast("Não foi possível gerar o .zip agora.", "fa-triangle-exclamation"); return; }
    showToast("Preparando arquivo .zip...", "fa-file-zipper");
    const zip = new JSZip();
    const onlyGallery = tracks.filter(t => !localBlobUrls[t.id]); // arquivos locais não podem ser buscados via fetch cross-blob facilmente, mas incluímos mesmo assim
    try {
      await Promise.all(tracks.map(async (t) => {
        const src = localBlobUrls[t.id] || t.src;
        const res = await fetch(src);
        const blob = await res.blob();
        zip.file(`${t.artist} - ${t.title}.mp3`, blob);
      }));
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${zipName || "playlist"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast("Download do .zip iniciado!", "fa-circle-check");
    } catch (err) {
      showToast("Erro ao gerar o .zip.", "fa-triangle-exclamation");
    }
  }

  /* ---------- Fila / Queue button ---------- */
  queueBtn.addEventListener("click", () => switchView("queue"));

  /* ---------- Play all / shuffle all (Home) ---------- */
  document.getElementById("playAllBtn").addEventListener("click", () => {
    if (!library.length) return;
    isShuffled = false; shuffleBtn.classList.remove("toggled");
    setQueueAndPlay(library.map(t => t.id), library[0].id, "Galeria");
  });
  document.getElementById("shuffleAllBtn").addEventListener("click", () => {
    if (!library.length) return;
    isShuffled = true; shuffleBtn.classList.add("toggled");
    const shuffled = shuffleArray(library.map(t => t.id));
    setQueueAndPlay(shuffled, shuffled[0], "Galeria (aleatório)");
  });

  /* ---------- Busca ---------- */
  searchInput.addEventListener("input", () => {
    if (document.getElementById("view-library").classList.contains("active")) renderLibrary();
    else switchView("library");
  });
  document.getElementById("sortSelect").addEventListener("change", renderLibrary);

  /* ---------- Upload de pasta local ---------- */
  const folderInput = document.getElementById("folderInput");
  document.getElementById("uploadFolderBtn").addEventListener("click", () => folderInput.click());
  folderInput.addEventListener("change", (e) => {
    const files = [...e.target.files].filter(f => f.type.startsWith("audio/"));
    if (!files.length) { showToast("Nenhum arquivo de áudio válido selecionado.", "fa-triangle-exclamation"); return; }
    files.forEach(file => {
      const id = uid();
      const url = URL.createObjectURL(file);
      localBlobUrls[id] = url;
      const nameNoExt = file.name.replace(/\.[^/.]+$/, "");
      library.push({
        id, title: nameNoExt, artist: "Arquivo local", album: "Minha pasta",
        genre: "—", year: new Date().getFullYear(),
        cover: "images/cover-01.jpg", src: url
      });
    });
    showToast(`${files.length} arquivo(s) adicionados à galeria.`, "fa-folder-open");
    renderAllViews();
    folderInput.value = "";
  });

  /* ---------- Atalhos de teclado ---------- */
  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    if (e.code === "ArrowRight") nextBtn.click();
    if (e.code === "ArrowLeft") prevBtn.click();
  });

  /* =========================================================
     RENDER GERAL
     ========================================================= */
  function renderAllViews() {
    renderHome();
    renderLibrary();
    renderFavorites();
    renderQueue();
    renderPlaylistSidebar();
    renderPlaylistGrid();
    if (activePlaylistId) openPlaylistDetail(activePlaylistId);
  }

  /* ---------- Inicialização ---------- */
  renderAllViews();

})();
