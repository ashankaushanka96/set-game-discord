// Mobile device detection utilities

export const isMobileDevice = () => {
  // Check user agent for mobile devices
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const userAgentMatch = mobileRegex.test(navigator.userAgent);
  
  // Check for touch support
  const touchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // Check for mobile-specific features
  const mobileFeatures = /Mobi|Android/i.test(navigator.userAgent);
  
  return userAgentMatch || (touchSupport && mobileFeatures);
};

export const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

export const isAndroid = () => {
  return /Android/.test(navigator.userAgent);
};

export const getMobileInfo = () => {
  return {
    isMobile: isMobileDevice(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    userAgent: navigator.userAgent,
    touchSupport: 'ontouchstart' in window,
    maxTouchPoints: navigator.maxTouchPoints || 0
  };
};
