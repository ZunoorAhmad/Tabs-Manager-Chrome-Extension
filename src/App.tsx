import { useState } from "react";
import Tabs from "./components/Tabs";
import TabDetail from "./components/TabDetail";
import ClosedTabs from "./components/ClosedTabs";

function App() {
  const [currentView, setCurrentView] = useState<'tabs' | 'closed' | 'detail'>('tabs');
  const [selectedTabId, setSelectedTabId] = useState<number | null>(null);

  const handleTabClick = (tabId: number) => {
    setSelectedTabId(tabId);
    setCurrentView('detail');
  };

  const handleBackToTabs = () => {
    setCurrentView('tabs');
    setSelectedTabId(null);
  };

  const handleViewClosedTabs = () => {
    setCurrentView('closed');
  };

  const handleBackFromClosed = () => {
    setCurrentView('tabs');
  };

  return (
    <>
      {currentView === 'tabs' && (
        <Tabs 
          onTabClick={handleTabClick} 
          onViewClosedTabs={handleViewClosedTabs}
        />
      )}
      {currentView === 'closed' && (
        <ClosedTabs onBack={handleBackFromClosed} />
      )}
      {currentView === 'detail' && selectedTabId && (
        <TabDetail tabId={selectedTabId} onBack={handleBackToTabs} />
      )}
    </>
  );
}

export default App;