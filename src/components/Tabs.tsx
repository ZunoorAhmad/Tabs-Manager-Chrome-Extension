import { useState, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from 'react-beautiful-dnd';
import './Tabs.css';

// Use the same Tab interface as in chrome.d.ts
type Tab = chrome.tabs.Tab;
type TabWithId = Tab & { id: number };

// Extended tab type with timing data
interface TabWithTiming extends TabWithId {
  openedAt: number;
  activeStartTime?: number;
  totalActiveTime: number;
}

interface TabsProps {
  onTabClick: (tabId: number) => void;
  onViewClosedTabs: () => void;
}

function Tabs({ onTabClick, onViewClosedTabs }: TabsProps) {
  const [openTabs, setOpenTabs] = useState<TabWithTiming[]>([]);
  const [error, setError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fetch all open tabs on mount
  const loadTabs = () => {
    chrome.tabs.query({}, (fetchedTabs) => {
      if (chrome.runtime.lastError) {
        setError('Failed to fetch tabs: ' + chrome.runtime.lastError.message);
      } else {
        const now = Date.now();
        const tabsWithTiming = fetchedTabs
          .filter((tab) => tab.id !== undefined)
          .map((tab) => {
            const existingTab = openTabs.find(t => t.id === tab.id);
            return {
              ...tab,
              id: tab.id!,
              openedAt: existingTab?.openedAt || now,
              activeStartTime: tab.active ? now : existingTab?.activeStartTime,
              totalActiveTime: existingTab?.totalActiveTime || 0
            } as TabWithTiming;
          })
          .sort((a, b) => a.index - b.index);
        
        setOpenTabs(tabsWithTiming);
      }
    });
  };

  // Load timing data from background script
  useEffect(() => {
    const loadTimingData = () => {
      chrome.runtime.sendMessage({ action: 'getTimingData' }, (response: unknown) => {
        const typedResponse = response as { timingData: Record<number, { openedAt: number; totalActiveTime: number; currentActiveTime?: number }> };
        if (chrome.runtime.lastError) {
          console.warn('Failed to get timing data:', chrome.runtime.lastError.message);
          return;
        }
        
        if (typedResponse && typedResponse.timingData) {
          setOpenTabs(prev => prev.map(tab => {
            const savedData = typedResponse.timingData[tab.id];
            if (savedData) {
              return {
                ...tab,
                openedAt: savedData.openedAt,
                totalActiveTime: savedData.totalActiveTime + (savedData.currentActiveTime || 0),
                activeStartTime: tab.active ? Date.now() : undefined
              };
            }
            return tab;
          }));
        }
      });
    };

    // Load timing data when component mounts
    loadTimingData();
    
    // Set up interval to refresh timing data
    const interval = setInterval(loadTimingData, 1000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadTabs();
  }, []);

  // Close a tab
  const closeTab = (tabId: number) => {
    chrome.tabs.remove(tabId, () => {
      if (chrome.runtime.lastError) {
        setError('Failed to close tab: ' + chrome.runtime.lastError.message);
      } else {
        setOpenTabs(openTabs.filter((tab) => tab.id !== tabId));
      }
    });
  };

  // Move a tab to a new index (for buttons)
  const moveTab = (tabId: number, direction: 'left' | 'right') => {
    const tab = openTabs.find((t) => t.id === tabId);
    if (!tab) return;

    let newIndex = direction === 'left' ? tab.index - 1 : tab.index + 1;
    if (newIndex < 0) newIndex = 0;
    if (newIndex >= openTabs.length) newIndex = openTabs.length - 1;

    chrome.tabs.move(tabId, { index: newIndex }, (movedTab) => {
      if (chrome.runtime.lastError) {
        setError('Failed to move tab: ' + chrome.runtime.lastError.message);
      } else {
        // Update local state
        if (!movedTab || movedTab.id === undefined) {
          loadTabs();
          return;
        }
        const updatedTabs = [...openTabs];
        updatedTabs.splice(tab.index, 1); // Remove tab from old position
        updatedTabs.splice(newIndex, 0, movedTab as TabWithTiming); // Insert at new position
        setOpenTabs(updatedTabs);
      }
    });
  };

  // Activate a tab when clicking the row
  const activateTab = (tabId: number) => {
    chrome.tabs.update(tabId, { active: true }, () => {
      if (chrome.runtime.lastError) {
        setError('Failed to activate tab: ' + chrome.runtime.lastError.message);
      } else {
        // visually reflect active state by refreshing list
        loadTabs();
      }
    });
  };

  const getHostname = (url?: string) => {
    try {
      if (!url) return '';
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  // Format time duration elegantly
  const formatDuration = (milliseconds: number): string => {
    if (milliseconds < 1000) return '0s';
    
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    } else if (minutes > 0) {
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    } else {
      return `${seconds}s`;
    }
  };

  // Get time since tab was opened
  const getTimeSinceOpened = (openedAt: number): string => {
    const elapsed = Date.now() - openedAt;
    return formatDuration(elapsed);
  };

  // Get active time for tab
  const getActiveTime = (tab: TabWithTiming): string => {
    return formatDuration(tab.totalActiveTime);
  };

  const filteredTabs: TabWithTiming[] = useMemo(() => {
    if (!searchQuery.trim()) return openTabs;
    const q = searchQuery.toLowerCase();
    return openTabs.filter((t) => (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q));
  }, [openTabs, searchQuery]);

  // Handle drag-and-drop reordering
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;

    if (sourceIndex === destinationIndex) return;

    const tab = openTabs[sourceIndex];
    if (!tab.id) return;

    chrome.tabs.move(tab.id, { index: destinationIndex }, (movedTab) => {
      if (chrome.runtime.lastError) {
        setError('Failed to reorder tab: ' + chrome.runtime.lastError.message);
      } else {
        // Update local state
        if (!movedTab || movedTab.id === undefined) {
          loadTabs();
          return;
        }
        const updatedTabs = [...openTabs];
        updatedTabs.splice(sourceIndex, 1); // Remove from old position
        updatedTabs.splice(destinationIndex, 0, movedTab as TabWithTiming); // Insert at new position
        setOpenTabs(updatedTabs);
      }
    });
  };

  return (
    <div className="app">
      <div className="header">
        <h1>Tab Manager</h1>
        <div className="subtitle">Developed by DevBlends</div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="toolbar">
        <div className="search-section">
          <input
            className="search"
            type="text"
            placeholder="Search tabs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="actions-section">
          <button className="refresh" title="Refresh" onClick={loadTabs}>↻</button>
          <button 
            className="view-closed-btn" 
            title="View Closed Tabs" 
            onClick={onViewClosedTabs}
          >
            📚 History
          </button>
        </div>
      </div>

      <div className="result-meta">{filteredTabs.length} tab{filteredTabs.length === 1 ? '' : 's'}</div>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="tabs">
          {(provided) => (
            <ul {...provided.droppableProps} ref={provided.innerRef} className="tab-list">
              {filteredTabs.map((tab: TabWithTiming, index) => (
                <Draggable key={tab.id} draggableId={tab.id.toString()} index={index}>
                  {(provided) => (
                                         <li
                       ref={provided.innerRef}
                       {...provided.draggableProps}
                       {...provided.dragHandleProps}
                       className={`tab-item ${tab.active ? 'active' : ''}`}
                       onClick={() => activateTab(tab.id!)}
                     >
                      <div className="tab-leading">
                        {tab.favIconUrl ? (
                          <img className="favicon" src={tab.favIconUrl} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="favicon fallback">{(getHostname(tab.url) || 'T').charAt(0).toUpperCase()}</div>
                        )}
                      </div>
                      <div className="tab-content">
                        <div className="tab-title">{tab.title || tab.url || 'Untitled Tab'}</div>
                        <div className="tab-url">{getHostname(tab.url)}</div>
                        <div className="tab-timing">
                          <span className="timing-opened">Opened {getTimeSinceOpened(tab.openedAt)} ago</span>
                          <span className="timing-active">• Used {getActiveTime(tab)}</span>
                        </div>
                      </div>
                                             <div className="tab-actions" onClick={(e) => e.stopPropagation()}>
                         <button
                           className="icon-btn details-btn"
                           onClick={() => onTabClick(tab.id!)}
                           title="View details"
                         >
                           📊
                         </button>
                         <button
                           className="icon-btn"
                           onClick={() => moveTab(tab.id!, 'left')}
                           disabled={index === 0}
                           title="Move left"
                         >
                           ◀
                         </button>
                         <button
                           className="icon-btn"
                           onClick={() => moveTab(tab.id!, 'right')}
                           disabled={index === filteredTabs.length - 1}
                           title="Move right"
                         >
                           ▶
                         </button>
                         <button
                           className="icon-btn close-btn"
                           onClick={() => closeTab(tab.id!)}
                           title="Close tab"
                         >
                           ✕
                         </button>
                       </div>
                    </li>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </ul>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}

export default Tabs;