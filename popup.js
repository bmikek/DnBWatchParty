const SERVER_URL = "http://localhost:3000";

const statusDiv = document.getElementById("status");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const joinInput = document.getElementById("joinInput");

// Load existing room on open
chrome.storage.local.get(["roomId"], (result) => {
  if (result.roomId) {
    statusDiv.textContent = `Connected to: ${result.roomId}`;
    statusDiv.style.color = "green";
  }
});

// Create Room
createBtn.addEventListener("click", async () => {
  statusDiv.textContent = "Generating code...";
  statusDiv.style.color = "black";
  
  try {
    const response = await fetch(`${SERVER_URL}/api/generate-room`);
    if (!response.ok) throw new Error("Server responded with an error");
    
    const data = await response.json();
    setRoom(data.roomId);
  } catch (err) {
    console.error("Fetch error:", err);
    statusDiv.textContent = "Error connecting to server.";
    statusDiv.style.color = "red";
  }
});

// Join Room
joinBtn.addEventListener("click", () => {
  const code = joinInput.value.trim().toUpperCase();
  if (code.length < 4) {
    statusDiv.textContent = "Invalid code (min 4 chars).";
    statusDiv.style.color = "red";
    return;
  }
  setRoom(code);
});

function setRoom(roomId) {
  chrome.storage.local.set({ roomId: roomId }, () => {
    statusDiv.textContent = `Connected to: ${roomId}`;
    statusDiv.style.color = "green";
    
    // Tell active tab to reload
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes("youtube.com")) {
        chrome.tabs.reload(tabs[0].id);
      }
    });
  });
}