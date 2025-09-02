declare namespace chrome {
    namespace tabs {
        interface Tab {
            id?: number; // Changed to optional to match Chrome API
            index: number;
            url?: string;
            title?: string;
            favIconUrl?: string;
            windowId: number;
            active: boolean;
        }
        
        interface TabChangeInfo {
            status?: string;
            url?: string;
            pinned?: boolean;
            audible?: boolean;
            mutedInfo?: { muted: boolean; reason?: string };
            favIconUrl?: string;
            title?: string;
        }
        
        interface TabActiveInfo {
            tabId: number;
            windowId: number;
        }
        
        function query(
            queryInfo: Record<string, unknown>,
            callback: (tabs: Tab[]) => void
        ): void;
        function remove(tabId: number | number[], callback?: () => void): void;
        function move(
            tabId: number | number[],
            moveProperties: { index: number; windowId?: number },
            callback?: (tab: Tab) => void
        ): void;
        function update(
            tabId: number,
            updateProperties: { active?: boolean; highlighted?: boolean; url?: string; selected?: boolean; pinned?: boolean; muted?: boolean },
            callback?: (tab: Tab) => void
        ): void;
        function get(tabId: number, callback: (tab: Tab) => void): void;
        
        // Event listeners
        const onUpdated: chrome.events.Event<(tabId: number, changeInfo: TabChangeInfo, tab: Tab) => void>;
        const onActivated: chrome.events.Event<(activeInfo: TabActiveInfo) => void>;
        const onRemoved: chrome.events.Event<(tabId: number, removeInfo: { windowId: number; isWindowClosing: boolean }) => void>;
    }
    namespace runtime {
        const lastError: { message: string } | undefined;
        function sendMessage(message: Record<string, unknown>, responseCallback?: (response: unknown) => void): void;
        const onMessage: chrome.events.Event<(message: Record<string, unknown>, sender: Record<string, unknown>, sendResponse: (response?: Record<string, unknown>) => void) => void>;
        const onStartup: chrome.events.Event<() => void>;
        const onInstalled: chrome.events.Event<() => void>;
    }
    namespace events {
        interface Event<T extends (...args: unknown[]) => void> {
            addListener(callback: T): void;
            removeListener(callback: T): void;
        }
    }
    namespace storage {
        namespace local {
            function get(keys: string | string[] | Record<string, unknown> | null, callback: (items: Record<string, unknown>) => void): void;
            function set(items: Record<string, unknown>, callback?: () => void): void;
        }
    }
    namespace windows {
        const WINDOW_ID_NONE: number;
        const onFocusChanged: chrome.events.Event<(windowId: number) => void>;
    }
}