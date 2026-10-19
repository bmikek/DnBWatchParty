import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:3000";

let ROOM_ID = null;
let socket = null;
let remoteUpdate = false;
let video = null;
let seekDebounce = null;
let lastUrl = location.href;

// --------------------
// Socket initialization
// --------------------
function initSocket(roomId) {
  ROOM_ID = roomId;

  socket = io(SERVER_URL, {
    transports: ["websocket"],
  });

  socket.on("connect", () => {
    console.log("BnD Watch Party connected");
    socket.emit("join-room", ROOM_ID);
  });

 socket.on("video-event", (data) => {
  if (!video) return;

  // Handle "play" specially to wait for buffering
  if (data.action === "play") {
    remoteUpdate = true;
    
    // If we are way off, snap to the time first
    if (Math.abs(video.currentTime - data.currentTime) > 1.0) {
      video.currentTime = data.currentTime;
    }

    // Wait until the video is actually ready to play before hitting play()
    if (video.readyState >= 3) {
      video.muted = false; // Sometimes unmuting triggers the browser's autoplay policy to reset
      video.play().catch(e => {
        console.log("Play blocked by site:", e);
      // Fallback: Try clicking the video element itself
      video.click();
      });
      setTimeout(() => { remoteUpdate = false; }, 200); 
    } else {
      // Show a quick loading state if you want, then wait for 'canplay'
      const onCanPlay = () => {
        video.removeEventListener("canplay", onCanPlay);
        video.play().catch(() => {});
        setTimeout(() => { remoteUpdate = false; }, 200);
      };
      video.addEventListener("canplay", onCanPlay);
    }
    return;
  }

  // Handle all other actions normally
  remoteUpdate = true;

  try {
    if (data.action === "pause") {
      video.currentTime = data.currentTime;
      video.pause();
    } else if (data.action === "seek") {
      video.currentTime = data.currentTime;
    } else if (data.action === "sync") {
      // Only force a sync if we are more than 1.5s off
      if (Math.abs(video.currentTime - data.currentTime) > 1.5) {
        video.currentTime = data.currentTime;
      }
    } else if (data.action === "navigate") {
      if (location.href !== data.url) {
        location.href = data.url;
      }
    }
  } finally {
    // Defer the release slightly so native events don't echo back
    setTimeout(() => { remoteUpdate = false; }, 100);
  }
});
// --------------------
// Get room code from Chrome storage
// --------------------
chrome.storage.local.get(["roomId"], (result) => {
  if (result.roomId) {
    console.log("BnD Watch Party: Joining room", result.roomId);
    initSocket(result.roomId);
  } else {
    console.log(
      "BnD Watch Party: No room code set. Open the extension popup to join a room."
    );
  }
});

// --------------------
// Find video element
// --------------------
function findVideo() {
  // Standard search first
  let vid = document.querySelector("video");
  if (vid) return vid;

  // Recursive search through Shadow DOM
  function searchShadow(host) {
    if (host.shadowRoot) {
      const v = host.shadowRoot.querySelector("video");
      if (v) return v;
      
      const children = host.shadowRoot.querySelectorAll("*");
      for (let child of children) {
        const found = searchShadow(child);
        if (found) return found;
      }
    }
    return null;
  }

  const allElements = document.querySelectorAll("*");
  for (let el of allElements) {
    const found = searchShadow(el);
    if (found) return found;
  }
  return null;
}
// --------------------
// Attach video listeners
// --------------------
function attachListeners(v) {
  if (!v || v.dataset.bndAttached) return;

  v.dataset.bndAttached = "1";

  v.addEventListener("play", () => {
    if (remoteUpdate) return;
    if (!socket || !ROOM_ID) return;

    socket.emit("video-event", {
      roomId: ROOM_ID,
      action: "play",
      currentTime: v.currentTime,
    });
  });

  v.addEventListener("pause", () => {
    if (remoteUpdate) return;
    if (!socket || !ROOM_ID) return;

    socket.emit("video-event", {
      roomId: ROOM_ID,
      action: "pause",
      currentTime: v.currentTime,
    });
  });

  v.addEventListener("seeking", () => {
    if (remoteUpdate) return;
    if (!socket || !ROOM_ID) return;

    clearTimeout(seekDebounce);

    seekDebounce = setTimeout(() => {
      socket.emit("video-event", {
        roomId: ROOM_ID,
        action: "seek",
        currentTime: v.currentTime,
      });
    }, 150);
  });
}

// --------------------
// Monitor for video replacement
// --------------------
const observer = new MutationObserver(() => {
  const v = findVideo();

  if (v && v !== video) {
    video = v;
    attachListeners(video);
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// Initial check
video = findVideo();

if (video) {
  attachListeners(video);
}

// --------------------
// Periodic sync heartbeat
// --------------------
setInterval(() => {
  if (!video) return;
  if (!socket || !ROOM_ID) return;

  socket.emit("video-event", {
    roomId: ROOM_ID,
    action: "sync",
    currentTime: video.currentTime,
  });
}, 5000);

// --------------------
// Navigation detection
// --------------------
function onUrlChange() {
  if (location.href === lastUrl) return;

  lastUrl = location.href;

  if (!socket || !ROOM_ID) return;

  socket.emit("video-event", {
    roomId: ROOM_ID,
    action: "navigate",
    url: location.href,
  });
}

// YouTube SPA navigation
window.addEventListener("yt-navigate-finish", onUrlChange);

// Generic URL change detector for streaming sites
let lastHref = location.href;
setInterval(() => {
    if (location.href !== lastHref) {
        lastHref = location.href;
        
        // Wait a moment for the video player to load, then re-attach
        setTimeout(() => {
            video = findVideo();
            if (video) {
                attachListeners(video);
                socket.emit("video-event", {
                    roomId: ROOM_ID,
                    action: "navigate",
                    url: location.href
                });
            }
        }, 3000); // 3 second delay to let HBO load its DRM player
    }
}, 1000);

// Fallback
setInterval(onUrlChange, 1000);

