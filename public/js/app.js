// Profile close
$("profileClose").addEventListener("click", () => {
  $("profileOverlay").classList.remove("active");
});
if ($("checkinClose")) {
  $("checkinClose").addEventListener("click", () => {
    $("checkinOverlay").classList.remove("active");
  });
}
if ($("checkinOverlay")) {
  $("checkinOverlay").addEventListener("click", (e) => {
    if (e.target === $("checkinOverlay")) {
      $("checkinOverlay").classList.remove("active");
    }
  });
}

// Auto-connect and fetch room list on load
(async () => {
  try {
    await Net.connect(getWsUrl());
    // Try token login first
    if (authToken) {
      Net.send("user:tokenLogin", { token: authToken });
    }
    const name = getCurrentPlayerName();
    if (!authToken) {
      Net.playerName = "";
      updateUserArea();
      updateLobbyVisibility();
      return;
    }
    await Net.auth(name);
    updateUserArea();
    if (isRegistered) {
      Net.send("room:list");
      startRoomListRefresh();
    }
  } catch {
    showError("服务器未启动。请先运行 npm start");
  }
})();

// Page visibility change — auto-reconnect when returning to app
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") {
    // Page became visible — check if we need to reconnect
    if (
      !Net.connected ||
      (Net.ws && Net.ws.readyState !== WebSocket.OPEN)
    ) {
      console.log("Page visible, reconnecting...");
      try {
        await Net.connect(getWsUrl());
        const name = getCurrentPlayerName();
        await Net.auth(name);
        $("connDot").className = "connection-dot online";

        // If we were in a room, rejoin it
        if (roomCode) {
          Net.send("room:join", { code: roomCode, name });
          toast("已重新连接到房间");
        } else {
          Net.send("room:list");
        }
      } catch (err) {
        console.error("Reconnect failed:", err);
      }
    } else {
      restoreActionPanelIfMyTurn({ notify: true });
    }
  }
});
(() => {
  function activateAuthTab(tabName) {
    document
      .querySelectorAll(".auth-tab")
      .forEach((t) =>
        t.classList.toggle("active", t.dataset.tab === tabName),
      );
    document
      .querySelectorAll(".auth-form")
      .forEach((f) =>
        f.classList.toggle("active", f.id === tabName + "Form"),
      );
  }

  function clearAuthSession() {
    authToken = null;
    userProfile = null;
    isRegistered = false;
    Net.playerId = null;
    Net.playerName = "";
    localStorage.removeItem("poker_token");
    stopRoomListRefresh();
    showAvatarBtn(false);
    if (typeof updateHolidayBookmark === "function") updateHolidayBookmark([]);
    updateUserArea();
    updateLobbyVisibility();
  }

  logoutUser = function () {
    if (Net.connected && roomCode) {
      Net.send("room:leave");
    }
    clearAuthSession();
    roomCode = "";
    isSpectator = false;
    $("codeInput").value = "";
    $("spectatorBadge").classList.remove("visible");
    $("profileOverlay").classList.remove("active");
    $("checkinOverlay").classList.remove("active");
    $("holidayGiftDropdown")?.classList.remove("active");
    $("holidayGiftResult")?.classList.remove("active");
    activateAuthTab("login");
    showScreen("lobbyScreen");
    showError("");
  };

  async function ensureConnected() {
    if (Net.connected && Net.ws && Net.ws.readyState === WebSocket.OPEN)
      return;
    await Net.connect(getWsUrl());
  }

  function waitForTokenLogin() {
    return new Promise((resolve, reject) => {
      const onOk = (data) => {
        cleanup();
        resolve(data);
      };
      const onErr = (data) => {
        cleanup();
        reject(data);
      };
      const cleanup = () => {
        Net.off("user:loggedIn", onOk);
        Net.off("user:error", onErr);
      };
      Net.on("user:loggedIn", onOk);
      Net.on("user:error", onErr);
    });
  }

  async function restoreAuthenticatedSession({ silent = false } = {}) {
    if (!authToken) return false;
    if (restoreInFlight) return restoreInFlight;
    restoreInFlight = (async () => {
      try {
        await ensureConnected();
        const pending = waitForTokenLogin();
        Net.send("user:tokenLogin", { token: authToken });
        await pending;
        return true;
      } catch (err) {
        if (!silent && err && err.message) showError(err.message);
        return false;
      } finally {
        restoreInFlight = null;
      }
    })();
    return restoreInFlight;
  }

  function requireLogin() {
    if (isRegistered && authToken) return true;
    activateAuthTab("login");
    showError("Please sign in first");
    toast("Please sign in first");
    return false;
  }

  const guestTab = document.querySelector('.auth-tab[data-tab="guest"]');
  if (guestTab) guestTab.remove();
  const guestForm = $("guestForm");
  if (guestForm) guestForm.remove();
  activateAuthTab("login");
  updateLobbyVisibility();

  Net.on("user:loggedIn", (d) => {
    authToken = d.token;
    userProfile = d.profile;
    isRegistered = true;
    localStorage.setItem("poker_token", d.token);
    if (userProfile?.role === "admin") {
      stopRoomListRefresh();
      updateLobbyVisibility();
      showScreen("adminScreen");
      if (typeof loadAdminDashboard === "function") loadAdminDashboard();
      return;
    }
    updateLobbyVisibility();
    if (d.resume) {
      roomCode = d.resume.code || "";
      isSpectator = !!d.resume.isSpectator;
      $("roomCodeDisplay").textContent = roomCode;
      $("spectatorBadge").classList.toggle("visible", isSpectator);
      showScreen(d.resume.gameRunning ? "table" : "roomScreen");
    }
  });

  Net.on("user:registered", (d) => {
    authToken = d.token;
    userProfile = d.profile;
    isRegistered = true;
    localStorage.setItem("poker_token", d.token);
    Net.send("shop:getCatalog");
    Net.send("holiday:list");
    updateLobbyVisibility();
  });

  Net.on("user:error", (d) => {
    if (d.code === "TOKEN_EXPIRED") {
      clearAuthSession();
      roomCode = "";
      isSpectator = false;
      $("spectatorBadge").classList.remove("visible");
      activateAuthTab("login");
      showScreen("lobbyScreen");
    }
  });

  const guardedIds = [
    "cardLobby",
    "cardCreate",
    "joinRoomBtn",
    "spectateLink",
    "createRoomBtn",
    "refreshRoomList",
  ];
  guardedIds.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener(
      "click",
      (e) => {
        if (requireLogin()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
      },
      true,
    );
  });

  attemptReconnect = async function () {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
      try {
        const restored = await restoreAuthenticatedSession({
          silent: true,
        });
        if (restored) {
          $("connDot").className = "connection-dot online";
          toast("Reconnected");
          return true;
        }
      } catch {}
    }
    toast("Reconnect failed");
    return false;
  };

  const originalUpdateUserArea = updateUserArea;
  updateUserArea = function () {
    originalUpdateUserArea();
    if (!isRegistered) {
      const area = $("userArea");
      if (area) {
        area.innerHTML =
          '<div class="guest-badge"><span>👤</span> Please sign in</div>';
      }
    }
  };

  (async () => {
    if (!authToken) return;
    const restored = await restoreAuthenticatedSession({ silent: true });
    if (restored && Net.connected) {
      Net.send("room:list");
    }
  })();

  async function restoreOnResume() {
    if (!authToken) return;
    const restored = await restoreAuthenticatedSession({ silent: true });
    if (restored) {
      $("connDot").className = "connection-dot online";
      if (userProfile?.role === "admin") return;
      requestAnimationFrame(() =>
        restoreActionPanelIfMyTurn({ notify: true }),
      );
    }
  }

  document.addEventListener("visibilitychange", () => {
    appInBackground = document.visibilityState !== "visible";
  });
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
      await restoreOnResume();
    }
  });
  window.addEventListener("focus", restoreOnResume);
  window.addEventListener("pageshow", restoreOnResume);
  window.addEventListener("online", restoreOnResume);
  Net.on("reconnected", () => {
    restoreOnResume();
  });
})();
