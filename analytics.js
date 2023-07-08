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

//Capture function
function logData(header, information, time = new Date().getTime()) {
  if(!window.user) { return }

  let analytics = localStorage.getItem(window.user._id+'analytics');
  if(analytics == 'false') { return }

  let id = localStorage.getItem('analyticID');
  let dataLog = JSON.parse(localStorage.getItem('dataLog')) || [];
  information = encodeURIComponent(information);
  if(information.trim() == '') {information = 'blank';}
  dataLog.push(encodeURI(`Timestamp=${time}&analyticId=${id}&${header}=${information}`));
  localStorage.setItem('dataLog', JSON.stringify(dataLog));

  return;
}

//SUBMIT LOCATION FORM AFTER PROCESSING CURRENT PAGE
async function submitLogData(){
  let dataLog = JSON.parse(localStorage.getItem('dataLog')) || [];

  if(dataLog == []) {return}

  let queryString = dataLog.join('+');

  //submit everything - we can do this in one go.
  await fetch(window.analyticsURL+`?${queryString}`, {
    method: "GET",
    dataType: "json",
  }).then(handleErrors)
  .then(json)
  .then(function(data){
   // console.log(data);
    localStorage.removeItem('dataLog'); //reset datalogs
  }).catch(function(error){
    console.log(error.message);
  });
}
function handleErrors(response) {
  if(!response.ok) {
    throw new Error("Request failed " + response.statusText);
  }
  return response;
}
function json(response) {
  return response.json();
}
