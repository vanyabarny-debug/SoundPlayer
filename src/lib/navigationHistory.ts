type NavigationEntry = {
  path: string;
  state?: Record<string, unknown>;
};

const NAVIGATION_HISTORY_KEY = 'navigation-history-v1';
const NAVIGATION_HISTORY_LIMIT = 7;

const readHistory = (): NavigationEntry[] => {
  try {
    const raw = window.sessionStorage.getItem(NAVIGATION_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is NavigationEntry =>
        Boolean(item)
        && typeof item === 'object'
        && typeof (item as NavigationEntry).path === 'string'
    );
  } catch {
    return [];
  }
};

const writeHistory = (entries: NavigationEntry[]) => {
  window.sessionStorage.setItem(
    NAVIGATION_HISTORY_KEY,
    JSON.stringify(entries.slice(-NAVIGATION_HISTORY_LIMIT))
  );
};

export const pushNavigationEntry = (entry: NavigationEntry) => {
  const history = readHistory();
  // #region agent log
  fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run1',hypothesisId:'H2',location:'src/lib/navigationHistory.ts:34',message:'pushNavigationEntry before mutation',data:{entryPath:entry.path,historySize:history.length,lastPath:history[history.length-1]?.path||null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const last = history[history.length - 1];
  if (last?.path === entry.path) {
    history[history.length - 1] = entry;
  } else {
    history.push(entry);
  }
  // #region agent log
  fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run1',hypothesisId:'H2',location:'src/lib/navigationHistory.ts:42',message:'pushNavigationEntry after mutation',data:{entryPath:entry.path,historySize:history.length,lastPath:history[history.length-1]?.path||null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  writeHistory(history);
};

export const popNavigationEntry = (currentPath: string): NavigationEntry | null => {
  const history = readHistory();
  // #region agent log
  fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run1',hypothesisId:'H1',location:'src/lib/navigationHistory.ts:48',message:'popNavigationEntry start',data:{currentPath,historySize:history.length,lastPath:history[history.length-1]?.path||null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  while (history.length > 0 && history[history.length - 1]?.path === currentPath) {
    history.pop();
  }
  const entry = history.pop() || null;
  // #region agent log
  fetch('http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bf06a6'},body:JSON.stringify({sessionId:'bf06a6',runId:'run1',hypothesisId:'H5',location:'src/lib/navigationHistory.ts:54',message:'popNavigationEntry result',data:{currentPath,poppedPath:entry?.path||null,historySizeAfterPop:history.length,lastPathAfterPop:history[history.length-1]?.path||null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  writeHistory(history);
  return entry;
};
