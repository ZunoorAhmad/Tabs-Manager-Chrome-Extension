// Background script for continuous tab timing tracking
console.log('Tab Manager background script loaded');

// Store timing data
let tabTimingData = new Map();
let activeTabId = null;
let activeStartTime = null;

// Store tab information data (title, URL, favicon)
let tabInfoData = new Map();

// Store closed tabs data for the current day
let closedTabsData = [];
let currentDay = new Date().toDateString();

// Load existing timing data on startup
chrome.storage.local.get(['tabTiming', 'tabInfo', 'closedTabs', 'closedTabsDay'], (result) => {
  if (result.tabTiming) {
    tabTimingData = new Map(Object.entries(result.tabTiming).map(([id, data]) => [parseInt(id), data]));
    console.log('Loaded existing timing data:', tabTimingData);
  }
  
  // Load tab info data
  if (result.tabInfo) {
    tabInfoData = new Map(Object.entries(result.tabInfo).map(([id, data]) => [parseInt(id), data]));
    console.log('Loaded existing tab info data:', tabInfoData.size, 'tabs');
  }
  
  // Load closed tabs data if it's from the same day
  if (result.closedTabs && result.closedTabsDay === currentDay) {
    closedTabsData = result.closedTabs;
    console.log('Loaded existing closed tabs data:', closedTabsData.length, 'tabs');
  }
});

// Save timing data to storage
function saveTimingData() {
  const dataToSave = Object.fromEntries(tabTimingData);
  chrome.storage.local.set({ tabTiming: dataToSave });
}

// Save closed tabs data to storage
function saveClosedTabsData() {
  chrome.storage.local.set({ 
    closedTabs: closedTabsData,
    closedTabsDay: currentDay
  });
}

// Save tab info data to storage
function saveTabInfoData() {
  const dataToSave = Object.fromEntries(tabInfoData);
  chrome.storage.local.set({ tabInfo: dataToSave });
}

// Get current time
function getCurrentTime() {
  return Date.now();
}

// Update tab information (title, URL, favicon)
function updateTabInfo(tabId, tab) {
  if (tab && tab.url && !tab.url.startsWith('chrome://')) {
    const tabInfo = {
      title: tab.title || 'Untitled Tab',
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      lastUpdated: Date.now()
    };
    tabInfoData.set(tabId, tabInfo);
    saveTabInfoData();
  }
}

// Start tracking active time for a tab
function startActiveTracking(tabId) {
  if (activeTabId && activeStartTime) {
    // Save accumulated time for previously active tab
    const duration = getCurrentTime() - activeStartTime;
    const existingData = tabTimingData.get(activeTabId) || { openedAt: getCurrentTime(), totalActiveTime: 0 };
    existingData.totalActiveTime += duration;
    tabTimingData.set(activeTabId, existingData);
    saveTimingData();
  }
  
  // Start tracking new active tab
  activeTabId = tabId;
  activeStartTime = getCurrentTime();
  
  // Initialize tab data if not exists
  if (!tabTimingData.has(tabId)) {
    tabTimingData.set(tabId, { openedAt: getCurrentTime(), totalActiveTime: 0 });
  }
}

// Stop tracking active time
function stopActiveTracking() {
  if (activeTabId && activeStartTime) {
    const duration = getCurrentTime() - activeStartTime;
    const existingData = tabTimingData.get(activeTabId) || { openedAt: getCurrentTime(), totalActiveTime: 0 };
    existingData.totalActiveTime += duration;
    tabTimingData.set(activeTabId, existingData);
    saveTimingData();
  }
  activeTabId = null;
  activeStartTime = null;
}

// Handle tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log('Tab activated:', activeInfo.tabId);
  startActiveTracking(activeInfo.tabId);
});

// Handle tab creation
chrome.tabs.onCreated.addListener((tab) => {
  console.log('Tab created:', tab.id);
  if (tab.id) {
    updateTabInfo(tab.id, tab);
  }
});

// Handle tab updates (when tab becomes active)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Update tab info whenever title, URL, or favicon changes
  if (changeInfo.title || changeInfo.url || changeInfo.favIconUrl) {
    console.log('Tab info updated:', tabId, changeInfo);
    updateTabInfo(tabId, tab);
  }
  
  if (changeInfo.status === 'complete' && tab.active) {
    console.log('Tab updated and active:', tabId);
    startActiveTracking(tabId);
  }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log('Tab removed:', tabId);
  
  // Stop tracking if this was the active tab
  if (activeTabId === tabId) {
    stopActiveTracking();
  }
  
  // Get timing data before removing
  const timingData = tabTimingData.get(tabId);
  if (timingData) {
    // Calculate final active time
    let finalActiveTime = timingData.totalActiveTime;
    if (activeTabId === tabId && activeStartTime) {
      finalActiveTime += Date.now() - activeStartTime;
    }
    
    // Get stored tab info (much more reliable than chrome.tabs.get)
    const storedTabInfo = tabInfoData.get(tabId);
    
    // Store closed tab data with actual tab information
    const closedTabData = {
      id: tabId,
      closedAt: Date.now(),
      openedAt: timingData.openedAt,
      totalActiveTime: finalActiveTime,
      totalTimeOpen: Date.now() - timingData.openedAt,
      title: storedTabInfo ? storedTabInfo.title : 'Untitled Tab',
      url: storedTabInfo ? storedTabInfo.url : 'Unknown',
      favIconUrl: storedTabInfo ? storedTabInfo.favIconUrl : undefined
    };
    
    // Add to beginning of array (latest first)
    closedTabsData.unshift(closedTabData);
    
    // Keep only last 100 closed tabs to prevent memory issues
    if (closedTabsData.length > 100) {
      closedTabsData = closedTabsData.slice(0, 100);
    }
    
    saveClosedTabsData();
  }
  
  // Remove from active timing data and tab info
  tabTimingData.delete(tabId);
  tabInfoData.delete(tabId);
  saveTimingData();
  saveTabInfoData();
});

// Handle window focus/blur to pause/resume tracking
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // All windows lost focus
    stopActiveTracking();
  } else {
    // Window gained focus, get the active tab
    chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
      if (tabs.length > 0) {
        startActiveTracking(tabs[0].id);
      }
    });
  }
});

// Handle extension startup - get current active tab
chrome.runtime.onStartup.addListener(() => {
  // Capture info for all existing tabs
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        updateTabInfo(tab.id, tab);
      }
    });
    
    // Start tracking the active tab
    const activeTab = tabs.find(tab => tab.active);
    if (activeTab && activeTab.id) {
      startActiveTracking(activeTab.id);
    }
  });
});

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  // Capture info for all existing tabs
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id) {
        updateTabInfo(tab.id, tab);
      }
    });
    
    // Start tracking the active tab
    const activeTab = tabs.find(tab => tab.active);
    if (activeTab && activeTab.id) {
      startActiveTracking(activeTab.id);
    }
  });
});

// Message handling for popup communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTimingData') {
    // Return current timing data
    const currentData = Object.fromEntries(tabTimingData);
    
    // Add current active time if there's an active tab
    if (activeTabId && activeStartTime) {
      const duration = getCurrentTime() - activeStartTime;
      if (currentData[activeTabId]) {
        currentData[activeTabId].currentActiveTime = duration;
      }
    }
    
    sendResponse({ timingData: currentData, activeTabId });
  } else if (request.action === 'updateTabTiming') {
    // Update timing data from popup
    const { tabId, timingData } = request;
    tabTimingData.set(tabId, timingData);
    saveTimingData();
    sendResponse({ success: true });
  } else if (request.action === 'getClosedTabs') {
    // Return closed tabs data
    sendResponse({ closedTabs: closedTabsData });
  } else if (request.action === 'reopenTab') {
    // Reopen a closed tab
    const { url, title } = request;
    chrome.tabs.create({ url: url, active: false }, (newTab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, tabId: newTab.id });
      }
    });
    return true; // Keep message channel open for async response
  }
});

// Periodic save to ensure data persistence
setInterval(() => {
  if (activeTabId && activeStartTime) {
    const duration = getCurrentTime() - activeStartTime;
    const existingData = tabTimingData.get(activeTabId) || { openedAt: getCurrentTime(), totalActiveTime: 0 };
    existingData.totalActiveTime += duration;
    tabTimingData.set(activeTabId, existingData);
    activeStartTime = getCurrentTime(); // Reset start time
    saveTimingData();
  }
}, 30000); // Save every 30 seconds

// Daily cleanup - check if it's a new day
setInterval(() => {
  const today = new Date().toDateString();
  if (today !== currentDay) {
    console.log('New day detected, clearing closed tabs data');
    currentDay = today;
    closedTabsData = [];
    saveClosedTabsData();
  }
}, 60000); // Check every minute

console.log('Background script initialized');
