import { useState, useEffect, useMemo } from 'react';
import './ClosedTabs.css';

interface ClosedTabData {
  id: number;
  closedAt: number;
  openedAt: number;
  totalActiveTime: number;
  totalTimeOpen: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
}

interface ClosedTabsProps {
  onBack: () => void;
}

function ClosedTabs({ onBack }: ClosedTabsProps) {
  const [closedTabs, setClosedTabs] = useState<ClosedTabData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterBy, setFilterBy] = useState<'all' | 'short' | 'medium' | 'long'>('all');
  const [sortBy, setSortBy] = useState<'closed' | 'opened' | 'active' | 'total'>('closed');

  useEffect(() => {
    loadClosedTabs();
  }, []);

  const loadClosedTabs = () => {
    chrome.runtime.sendMessage({ action: 'getClosedTabs' }, (response: any) => {
      if (chrome.runtime.lastError) {
        console.warn('Failed to get closed tabs:', chrome.runtime.lastError.message);
        setClosedTabs([]);
      } else if (response && response.closedTabs) {
        // Use the actual tab data from background script
        setClosedTabs(response.closedTabs);
      }
      setLoading(false);
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

  const getUsagePercentage = (activeTime: number, totalTime: number): number => {
    return totalTime > 0 ? Math.round((activeTime / totalTime) * 100) : 0;
  };

  const getHostname = (url?: string): string => {
    try {
      if (!url || url.startsWith('chrome://')) return 'Unknown';
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      return 'Unknown';
    }
  };

  const reopenTab = (tab: ClosedTabData) => {
    if (tab.url && !tab.url.startsWith('chrome://')) {
      chrome.runtime.sendMessage({ 
        action: 'reopenTab', 
        url: tab.url, 
        title: tab.title 
      }, (response: any) => {
        if (chrome.runtime.lastError) {
          console.warn('Failed to reopen tab:', chrome.runtime.lastError.message);
        } else if (response && response.success) {
          console.log('Tab reopened successfully:', response.tabId);
        }
      });
    }
  };

  const exportData = () => {
    const csvContent = [
      ['Title', 'URL', 'Opened At', 'Closed At', 'Total Time Open', 'Active Usage Time', 'Usage Efficiency %'],
      ...filteredAndSortedTabs.map(tab => [
        tab.title || 'Untitled',
        tab.url || 'Unknown',
        formatDateTime(tab.openedAt),
        formatDateTime(tab.closedAt),
        formatDuration(tab.totalTimeOpen),
        formatDuration(tab.totalActiveTime),
        getUsagePercentage(tab.totalActiveTime, tab.totalTimeOpen).toString()
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `closed-tabs-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredAndSortedTabs = useMemo(() => {
    let filtered = closedTabs;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(tab => 
        (tab.title || '').toLowerCase().includes(query) || 
        (tab.url || '').toLowerCase().includes(query)
      );
    }

    // Apply duration filter
    switch (filterBy) {
      case 'short':
        filtered = filtered.filter(tab => tab.totalTimeOpen < 5 * 60 * 1000); // < 5 minutes
        break;
      case 'medium':
        filtered = filtered.filter(tab => 
          tab.totalTimeOpen >= 5 * 60 * 1000 && tab.totalTimeOpen < 60 * 60 * 1000
        ); // 5 min to 1 hour
        break;
      case 'long':
        filtered = filtered.filter(tab => tab.totalTimeOpen >= 60 * 60 * 1000); // >= 1 hour
        break;
    }

    // Apply sorting
    switch (sortBy) {
      case 'closed':
        filtered = [...filtered].sort((a, b) => b.closedAt - a.closedAt);
        break;
      case 'opened':
        filtered = [...filtered].sort((a, b) => b.openedAt - a.openedAt);
        break;
      case 'active':
        filtered = [...filtered].sort((a, b) => b.totalActiveTime - a.totalActiveTime);
        break;
      case 'total':
        filtered = [...filtered].sort((a, b) => b.totalTimeOpen - a.totalTimeOpen);
        break;
    }

    return filtered;
  }, [closedTabs, searchQuery, filterBy, sortBy]);

  if (loading) {
    return (
      <div className="closed-tabs">
        <div className="loading">Loading closed tabs history...</div>
      </div>
    );
  }

  return (
    <div className="closed-tabs">
      {/* Header */}
      <div className="closed-header">
        <button className="back-btn" onClick={onBack}>
          ◀ Back to Tabs
        </button>
        <h1>Closed Tabs History</h1>
        <div className="header-info">
          <span className="date">{new Date().toLocaleDateString()}</span>
          <span className="count">{closedTabs.length} tabs closed today</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search-section">
          <input
            className="search"
            type="text"
            placeholder="Search closed tabs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="filters-section">
          <select 
            className="filter-select"
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value as any)}
          >
            <option value="all">All Durations</option>
            <option value="short">Short (&lt; 5m)</option>
            <option value="medium">Medium (5m - 1h)</option>
            <option value="long">Long (&gt; 1h)</option>
          </select>
          
          <select 
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="closed">Sort by Closed Time</option>
            <option value="opened">Sort by Opened Time</option>
            <option value="active">Sort by Active Time</option>
            <option value="total">Sort by Total Time</option>
          </select>
        </div>
      </div>

      {/* Results Meta */}
      <div className="result-meta">
        {filteredAndSortedTabs.length} of {closedTabs.length} closed tabs
        <button className="export-btn" onClick={exportData}>
          📊 Export CSV
        </button>
      </div>

      {/* Closed Tabs List */}
      <div className="closed-tabs-list">
        {filteredAndSortedTabs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h3>No closed tabs found</h3>
            <p>No tabs match your current search and filter criteria.</p>
          </div>
        ) : (
          filteredAndSortedTabs.map((tab) => (
            <div key={tab.id} className="closed-tab-item">
              <div className="tab-info">
                <div className="tab-icon">
                                     {tab.favIconUrl ? (
                     <img src={tab.favIconUrl} alt="" />
                   ) : (
                     <div className="icon-fallback">
                       {(tab.title && tab.title !== 'Untitled Tab' ? tab.title.charAt(0) : 
                         (tab.url && tab.url !== 'Unknown' ? getHostname(tab.url).charAt(0) : 'T')).toUpperCase()}
                     </div>
                   )}
                </div>
                
                                 <div className="tab-content">
                   <div className="tab-title">{tab.title || 'Untitled Tab'}</div>
                   <div className="tab-url">{tab.url && tab.url !== 'Unknown' ? getHostname(tab.url) : 'Unknown'}</div>
                  
                  <div className="tab-timing">
                    <span className="timing-opened">
                      Opened: {formatDateTime(tab.openedAt)}
                    </span>
                    <span className="timing-closed">
                      Closed: {formatDateTime(tab.closedAt)}
                    </span>
                  </div>
                  
                  <div className="tab-usage">
                    <span className="usage-total">
                      Total: {formatDuration(tab.totalTimeOpen)}
                    </span>
                    <span className="usage-active">
                      Active: {formatDuration(tab.totalActiveTime)}
                    </span>
                    <span className="usage-efficiency">
                      Efficiency: {getUsagePercentage(tab.totalActiveTime, tab.totalTimeOpen)}%
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="tab-actions">
                {tab.url && !tab.url.startsWith('chrome://') && tab.url !== 'Unknown' && (
                  <button 
                    className="reopen-btn"
                    onClick={() => reopenTab(tab)}
                    title="Reopen this tab"
                  >
                    🔄 Reopen
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ClosedTabs;
