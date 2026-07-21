import { useEffect } from 'react';

import ControlPanel from './components/ControlPanel';
import DownloadBar from './components/DownloadBar';
import MapView from './components/MapView';
import ResultsPanel from './components/ResultsPanel';
import StatusBar from './components/StatusBar';
import TimeSlider from './components/TimeSlider';
import { useAppStore } from './store';

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const loadConfig = useAppStore((s) => s.loadConfig);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app" data-theme={theme}>
      <MapView />

      <div className="overlay top-left">
        <ControlPanel />
      </div>

      <div className="overlay top-right">
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          title="Toggle map theme"
        >
          {theme === 'tech' ? '◐ TECH' : '◑ NORMAL'}
        </button>
      </div>

      <div className="overlay right">
        <ResultsPanel />
      </div>

      <div className="overlay bottom">
        <DownloadBar />
        <TimeSlider />
      </div>

      <div className="overlay status">
        <StatusBar />
      </div>
    </div>
  );
}
