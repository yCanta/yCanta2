// Production
window.analyticsURL = "https://script.google.com/macros/s/AKfycbwo2Sv5xIGyzSoYyB09YMmUVNhzvEyNImHTS2q-KAx4RpZ_5_2_2i3SOncObZxD9e9XnA/exec";


//HELPER FUNCTIONS 
function getOS() {
  var userAgent = window.navigator.userAgent,
      platform = window.navigator?.userAgentData?.platform || window.navigator.platform,
      macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'],
      windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'],
      iosPlatforms = ['iPhone', 'iPad', 'iPod'],
      os = userAgent || platform;

  if (macosPlatforms.indexOf(platform) !== -1) {
    os = 'Mac OS';
  } else if (iosPlatforms.indexOf(platform) !== -1) {
    os = 'iOS';
  } else if (windowsPlatforms.indexOf(platform) !== -1) {
    os = 'Windows';
  } else if (/Android/.test(userAgent)) {
    os = 'Android';
  } else if (/Linux/.test(platform)) {
    os = 'Linux';
  }

  return os;
}
function getScreenSize() {
  const width  = window.innerWidth  || document.documentElement.clientWidth  || document.body.clientWidth;
  const height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;

  return `${width}x${height}`;
}
function isTouchCapable() {
  return window.matchMedia("(pointer: coarse)").matches;
}
function isInstalled() {
  // Detects if device is in standalone mode
  var isInStandaloneMode = false;
  if (matchMedia('(display-mode: standalone)').matches) { // replace standalone with fullscreen or minimal-ui according to your manifest
    isInStandaloneMode = true; // Android and iOS 11.3+
  } else if ('standalone' in navigator) {
    isInStandaloneMode = navigator.standalone; // useful for iOS < 11.3
  }
  return isInStandaloneMode;
}

window.addEventListener("load", (event) => {
  window.loadData = true;
});
window.addEventListener("visibilitychange", (event)=> {
  logData('timing', 'visibilityChange');
  submitLogData();
});

// Capture function
function logData(header, information, time = new Date().getTime()) {
  if (!window.user) return;
  
  // If information is empty, return
  if (information === undefined || information === null || information.toString().trim() === '') {
    return
  }
  
  let analytics = localStorage.getItem(window.user._id + 'analytics');
  if (analytics === 'false') return;

  let id = localStorage.getItem('analyticID');
  let dataLog = JSON.parse(localStorage.getItem('dataLog')) || [];

  // Push as a clean object
  dataLog.push({
    Timestamp: time,
    analyticId: id,
    [header]: information
  });

  // Keep only the newest entries so the log can't grow forever if submitting keeps failing
  const MAX_LOG_ENTRIES = 500;
  if (dataLog.length > MAX_LOG_ENTRIES) {
    dataLog = dataLog.slice(-MAX_LOG_ENTRIES);
  }

  localStorage.setItem('dataLog', JSON.stringify(dataLog));
}

// SUBMIT VIA POST
async function submitLogData() {
  let dataLog = JSON.parse(localStorage.getItem('dataLog')) || [];
  if (dataLog.length === 0) return;

  const payload = {
    action: "log",
    data: dataLog // Sending the entire array of objects
  };

  try {
    const response = await fetch(window.analyticsURL, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "text/plain;charset=utf-8", 
        // Note: Using text/plain avoids "CORS preflight" checks in Apps Script
      }
    });

    if (!response.ok) throw new Error("Request failed " + response.statusText);
    
    const result = await response.json();
    
    if (result.result === "success") {
      localStorage.removeItem('dataLog'); // Only reset on success
    }
  } catch (error) {
    console.error("Analytics Error:", error.message);
  }
}
