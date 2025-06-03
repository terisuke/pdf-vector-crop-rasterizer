// Custom logger that saves logs to project root AND displays in console

interface LogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error';
  message: string;
  data?: any;
}

class CustomLogger {
  private logs: LogEntry[] = [];
  private sessionId: string;

  constructor() {
    this.sessionId = `debug_${Date.now()}`;
  }

  private addLog(level: 'log' | 'warn' | 'error', message: string, data?: any) {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data: data ? JSON.stringify(data, null, 2) : undefined
    };
    
    this.logs.push(logEntry);
    
    // Also log to browser console
    const fullMessage = `${message}${data ? ' ' + JSON.stringify(data) : ''}`;
    switch (level) {
      case 'log':
        console.log(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'error':
        console.error(fullMessage);
        break;
    }
  }

  log(message: string, data?: any) {
    this.addLog('log', message, data);
  }

  warn(message: string, data?: any) {
    this.addLog('warn', message, data);
  }

  error(message: string, data?: any) {
    this.addLog('error', message, data);
  }

  async saveLogsToFile() {
    try {
      const logContent = this.logs.map(log => {
        let line = `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`;
        if (log.data) {
          line += `\nDATA: ${log.data}`;
        }
        return line;
      }).join('\n\n');

      const filename = `debug_log_${this.sessionId}.txt`;
      
      // Try to save to project root via API
      const blob = new Blob([logContent], { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', blob, filename);
      
      try {
        const response = await fetch('/api/save-file', {
          method: 'POST',
          body: formData
        });
        
        if (response.ok) {
          console.log(`✅ Debug log saved to project root: ${filename}`);
        } else {
          throw new Error('API save failed');
        }
      } catch (apiError) {
        // Fallback: download via browser
        console.warn('API save failed, downloading via browser:', apiError);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
      
    } catch (error) {
      console.error('Failed to save logs:', error);
    }
  }

  clearLogs() {
    this.logs = [];
  }

  getLogs() {
    return [...this.logs];
  }
}

// Create global logger instance
export const logger = new CustomLogger();

// Add to window for easy access in dev tools
if (typeof window !== 'undefined') {
  (window as any).debugLogger = logger;
}