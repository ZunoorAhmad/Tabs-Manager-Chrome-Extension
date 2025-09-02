import { useState, useEffect } from 'react';
import './TabDetail.css';

interface TabDetailProps {
  tabId: number;
  onBack: () => void;
}

interface TabTimingData {
  openedAt: number;
  totalActiveTime: number;
  currentActiveTime?: number;
}

interface TabDetailData {
  id: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  active: boolean;
  timing: TabTimingData;
}

function TabDetail({ tabId, onBack }: TabDetailProps) {
  const [tabData, setTabData] = useState<TabDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadTabData();
  }, [tabId]);

  const loadTabData = () => {
    // Get tab information
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        setError('Failed to load tab information');
        setLoading(false);
        return;
      }

      // Get timing data from background script
      chrome.runtime.sendMessage({ action: 'getTimingData' }, (response: unknown) => {
        const typedResponse = response as { timingData: Record<number, { openedAt: number; totalActiveTime: number; currentActiveTime?: number }> };
        if (chrome.runtime.lastError) {
          setError('Failed to load timing data');
          setLoading(false);
          return;
        }

        if (typedResponse && typedResponse.timingData && typedResponse.timingData[tabId]) {
          const timingData = typedResponse.timingData[tabId];
          setTabData({
            id: tabId,
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl,
            active: tab.active,
            timing: timingData
          });
        } else {
          setError('No timing data found for this tab');
        }
        setLoading(false);
      });
    });
  };

  const formatDateTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (milliseconds: number): string => {
    if (milliseconds < 1000) return '0s';
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    const remainingHours = hours % 24;
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    
    let result = '';
    if (days > 0) result += `${days}d `;
    if (remainingHours > 0) result += `${remainingHours}h `;
    if (remainingMinutes > 0) result += `${remainingMinutes}m `;
    if (remainingSeconds > 0) result += `${remainingSeconds}s`;
    
    return result.trim();
  };

  const getTotalOpenTime = (): string => {
    if (!tabData) return '0s';
    const totalTime = Date.now() - tabData.timing.openedAt;
    return formatDuration(totalTime);
  };

  const getActiveTime = (): string => {
    if (!tabData) return '0s';
    let totalActive = tabData.timing.totalActiveTime;
    if (tabData.active && tabData.timing.currentActiveTime) {
      totalActive += tabData.timing.currentActiveTime;
    }
    return formatDuration(totalActive);
  };

  const getUsagePercentage = (): number => {
    if (!tabData) return 0;
    const totalTime = Date.now() - tabData.timing.openedAt;
    let totalActive = tabData.timing.totalActiveTime;
    if (tabData.active && tabData.timing.currentActiveTime) {
      totalActive += tabData.timing.currentActiveTime;
    }
    return totalTime > 0 ? Math.round((totalActive / totalTime) * 100) : 0;
  };

  const getHostname = (url?: string): string => {
    try {
      if (!url) return '';
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  if (loading) {
    return (
      <div className="tab-detail">
        <div className="loading">Loading tab details...</div>
      </div>
    );
  }

  if (error || !tabData) {
    return (
      <div className="tab-detail">
        <div className="error">
          <h2>Error</h2>
          <p>{error || 'Failed to load tab details'}</p>
          <button className="back-btn" onClick={onBack}>← Back to Tabs</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-detail">
      {/* Header */}
      <div className="detail-header">
        <button className="back-btn" onClick={onBack}>
          ◀ Back to Tabs
        </button>
        <h1>Tab Details</h1>
      </div>

      {/* Tab Info Card */}
      <div className="tab-info-card">
        <div className="tab-header">
          <div className="tab-icon">
            {tabData.favIconUrl ? (
              <img src={tabData.favIconUrl} alt="" />
            ) : (
              <div className="icon-fallback">
                {getHostname(tabData.url).charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="tab-meta">
            <h2 className="tab-title">{tabData.title || 'Untitled Tab'}</h2>
            <p className="tab-url">{getHostname(tabData.url)}</p>
            <div className={`status-badge ${tabData.active ? 'active' : 'inactive'}`}>
              {tabData.active ? 'Currently Active' : 'Inactive'}
            </div>
          </div>
        </div>
      </div>

      {/* Timing Statistics */}
      <div className="timing-stats">
        <h3>Usage Statistics</h3>
        
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-icon">🕐</div>
            <div className="stat-content">
              <h4>Opened At</h4>
              <p className="stat-value">{formatDateTime(tabData.timing.openedAt)}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⏱️</div>
            <div className="stat-content">
              <h4>Total Time Open</h4>
              <p className="stat-value">{getTotalOpenTime()}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🎯</div>
            <div className="stat-content">
              <h4>Active Usage Time</h4>
              <p className="stat-value">{getActiveTime()}</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <h4>Usage Efficiency</h4>
              <p className="stat-value">{getUsagePercentage()}%</p>
            </div>
          </div>
        </div>

        {/* Usage Progress Bar */}
        <div className="usage-progress">
          <div className="progress-header">
            <span>Active Usage vs Total Time</span>
            <span>{getUsagePercentage()}%</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${getUsagePercentage()}%` }}
            ></div>
          </div>
          <div className="progress-labels">
            <span>Active: {getActiveTime()}</span>
            <span>Total: {getTotalOpenTime()}</span>
          </div>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="action-bar">
        <button className="refresh-btn" onClick={loadTabData}>
          ↻ Refresh Data
        </button>
      </div>
    </div>
  );
}

export default TabDetail;
