// FitNova motivation quotes: one short line that changes every 10 seconds, themed to the current page.
// The quote sits inside each page's own header, directly under its introduction.

const HOLD_MS = 10000;
const FADE_MS = 350;

const MESSAGES = {
  home: [
    "Let's get moving today! 🚀",
    "Your best day starts now! 🔥",
    "One rep closer to strong! 💪",
    "Big goals love small wins! 🎯",
    "Energy up, excuses down! ⚡",
    "Ready, set, let's go! 🙌",
  ],
  create: [
    "Build a plan you'll love! 📝",
    "Dream it. Plan it. Go! 🚀",
    "Your perfect week awaits! 📅",
    "Pick your goal and go! 🎯",
    "Great plans start here! ✨",
    "Let's design your win! 🏆",
  ],
  workouts: [
    "Time to own this session! 🔥",
    "You've got this, champ! 💪",
    "Breathe, lift, repeat! 🏋️",
    "One more great set! ⚡",
    "Strong form, strong you! ✅",
    "Rest well, return stronger! 😴",
  ],
  progress: [
    "Look at you go! 🎉",
    "Every session is a win! 🏆",
    "Small wins add up fast! 📈",
    "Proud of every step! 👏",
    "Back at it? Love that! 🙌",
    "Keep climbing, superstar! ⭐",
  ],
  vitals: [
    "Check in, then carry on! 😊",
    "Nice habit, keep logging! 📝",
    "Take a deep breath! 🌿",
    "Listen to your body! 💙",
    "Care for yourself today! 🌟",
  ],
  about: [
    "Welcome to the team! 🤝",
    "Train smart, have fun! 😄",
    "Your fitness, your way! 🙌",
    "Stay curious, stay active! 🌟",
    "Great habits start here! 💫",
  ],
  profile: [
    "Hello, future champion! 🏅",
    "Your journey starts now! 🚀",
    "Set it up and let's go! ⚡",
    "Big things are coming! 🎉",
    "Today is your day one! 🌅",
  ],
};

const PAGE_KEYS = { "": "home", create: "create", workouts: "workouts", progress: "progress", vitals: "vitals", about: "about", profile: "profile", welcome: "profile" };

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const ANCHORS = [".hero .lead", ".page-head > div:first-child > p", "h1 + p.muted"];
const decks = {};
let node = null;
let view = null;
let pageKey = "";
let lastShown = "";
let holdTimer = null;
let fadeTimer = null;

function nextMessage(key) {
  if (!decks[key] || !decks[key].length) {
    // Shuffle a fresh deck so every quote appears once before any repeats.
    const deck = [...MESSAGES[key]];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    if (deck[deck.length - 1] === lastShown) deck.unshift(deck.pop());
    decks[key] = deck;
  }
  return decks[key].pop();
}

function write(text) {
  lastShown = text;
  node.textContent = text;
}

function scheduleNext() {
  clearTimeout(holdTimer);
  if (!document.hidden) holdTimer = setTimeout(showNext, HOLD_MS);
}

function showNext() {
  clearTimeout(fadeTimer);
  const text = nextMessage(pageKey);
  if (reduceMotion.matches) { write(text); scheduleNext(); return; }
  node.classList.add("is-out");
  fadeTimer = setTimeout(() => {
    write(text);
    node.classList.remove("is-out");
    fadeTimer = setTimeout(scheduleNext, FADE_MS);
  }, FADE_MS);
}

// Pages rebuild their content as data loads, so the quote returns to the header whenever it is removed.
function mount() {
  if (node.isConnected) return;
  for (const selector of ANCHORS) {
    const anchor = view.querySelector(selector);
    if (anchor) { anchor.after(node); return; }
  }
}

export function setBoostPage(path) {
  const key = PAGE_KEYS[path.split("/")[1] || ""] || "home";
  if (key === pageKey) return;
  pageKey = key;
  clearTimeout(fadeTimer);
  node.classList.remove("is-out");
  write(nextMessage(key));
  scheduleNext();
}

export function initBoost() {
  view = document.getElementById("view");
  node = document.createElement("div");
  node.className = "boost";
  new MutationObserver(mount).observe(view, { childList: true, subtree: true });
  document.addEventListener("visibilitychange", scheduleNext);
}
