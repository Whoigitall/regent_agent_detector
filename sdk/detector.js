(function() {
  'use strict';

  const RegentDetector = {
    version: '2.0.0',
    sessionId: null,
    startTime: Date.now(),
    signals: {
      mouseMovements: [],
      scrollPatterns: [],
      keystrokeDynamics: [],
      clickCoordinates: [],
      pageViews: []
    },

    init(config) {
      this.config = {
        siteId: config.siteId || window.location.hostname,
        endpoint: config.endpoint || 'https://detect.regentprotocol.org/api/detect',
        flushInterval: config.flushInterval || 30000,
        maxEvents: config.maxEvents || 1000
      };
      
      this.sessionId = this.generateSessionId();
      this.collectStaticSignals();
      this.startBehavioralTracking();
      this.recordPageView();
      
      // Auto-flush on page unload
      window.addEventListener('beforeunload', () => this.flush());
      
      // Periodic flush
      setInterval(() => this.flush(), this.config.flushInterval);
      
      console.log('[RegentDetector] Initialized v2.0', this.sessionId);
    },

    generateSessionId() {
      return 'regent_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    },

    collectStaticSignals() {
      const nav = navigator;
      const screen = window.screen;
      
      this.signals.static = {
        userAgent: nav.userAgent,
        webdriver: nav.webdriver || false,
        plugins: nav.plugins ? nav.plugins.length : 0,
        languages: nav.languages || [nav.language],
        screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
        hardwareConcurrency: nav.hardwareConcurrency || 0,
        deviceMemory: nav.deviceMemory || 0,
        platform: nav.platform,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        touchSupport: 'ontouchstart' in window,
        cookieEnabled: nav.cookieEnabled,
        pdfViewer: nav.pdfViewerEnabled || false,
        doNotTrack: nav.doNotTrack,
        connection: nav.connection ? {
          type: nav.connection.effectiveType,
          downlink: nav.connection.downlink
        } : null
      };

      // Canvas fingerprint
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('RegentDetector 2.0', 2, 2);
        this.signals.static.canvasFingerprint = canvas.toDataURL().slice(-50);
      } catch (e) {
        this.signals.static.canvasFingerprint = null;
      }

      // Audio fingerprint
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const analyser = audioCtx.createAnalyser();
        oscillator.connect(analyser);
        this.signals.static.audioFingerprint = audioCtx.sampleRate.toString();
        oscillator.disconnect();
      } catch (e) {
        this.signals.static.audioFingerprint = null;
      }
    },

    startBehavioralTracking() {
      // Mouse tracking
      let lastMouseTime = 0;
      document.addEventListener('mousemove', (e) => {
        const now = Date.now();
        if (now - lastMouseTime < 50) return; // Throttle to 20fps
        lastMouseTime = now;
        
        if (this.signals.mouseMovements.length >= this.config.maxEvents) return;
        
        const last = this.signals.mouseMovements[this.signals.mouseMovements.length - 1];
        const speed = last ? Math.sqrt(Math.pow(e.clientX - last.x, 2) + Math.pow(e.clientY - last.y, 2)) / ((now - last.t) / 1000) : 0;
        
        this.signals.mouseMovements.push({
          x: e.clientX,
          y: e.clientY,
          t: now,
          speed: Math.round(speed)
        });
      });

      // Scroll tracking
      let lastScrollY = 0;
      let lastScrollTime = 0;
      window.addEventListener('scroll', () => {
        const now = Date.now();
        const scrollY = window.scrollY;
        const velocity = Math.abs(scrollY - lastScrollY) / ((now - lastScrollTime) / 1000);
        
        if (this.signals.scrollPatterns.length < this.config.maxEvents) {
          this.signals.scrollPatterns.push({
            scrollY,
            timestamp: now,
            velocity: Math.round(velocity)
          });
        }
        
        lastScrollY = scrollY;
        lastScrollTime = now;
      }, { passive: true });

      // Keystroke tracking (input fields only)
      document.addEventListener('keydown', (e) => {
        if (this.signals.keystrokeDynamics.length >= this.config.maxEvents) return;
        
        this.signals.keystrokeDynamics.push({
          key: e.key,
          pressTime: Date.now(),
          target: e.target.tagName
        });
      });

      // Click tracking
      document.addEventListener('click', (e) => {
        if (this.signals.clickCoordinates.length >= this.config.maxEvents) return;
        
        this.signals.clickCoordinates.push({
          x: e.clientX,
          y: e.clientY,
          target: e.target.tagName + (e.target.id ? '#' + e.target.id : ''),
          timeSincePageLoad: Date.now() - this.startTime
        });
      });

      // Page visibility (time on page)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.signals.timeOnPage = Math.round((Date.now() - this.startTime) / 1000);
        }
      });
    },

    recordPageView() {
      this.signals.pageViews.push({
        url: window.location.href,
        timestamp: Date.now(),
        referrer: document.referrer || null
      });
    },

    getSignals() {
      return {
        ...this.signals.static,
        mouseMovements: this.signals.mouseMovements.slice(-100),
        scrollPatterns: this.signals.scrollPatterns.slice(-100),
        keystrokeDynamics: this.signals.keystrokeDynamics.slice(-50),
        clickCoordinates: this.signals.clickCoordinates.slice(-50),
        timeOnPage: Math.round((Date.now() - this.startTime) / 1000),
        pageViews: this.signals.pageViews,
        fingerprint: this.sessionId
      };
    },

    async flush() {
      try {
        const signals = this.getSignals();
        
        const response = await fetch(this.config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signals,
            siteId: this.config.siteId,
            sessionId: this.sessionId
          })
        });

        if (response.ok) {
          const result = await response.json();
          console.log('[RegentDetector] Detection result:', result.type, result.confidence);
          
          // Dispatch event for UI
          window.dispatchEvent(new CustomEvent('regent-detection', { detail: result }));
          
          // Clear behavioral data after flush
          this.signals.mouseMovements = [];
          this.signals.scrollPatterns = [];
          this.signals.keystrokeDynamics = [];
          this.signals.clickCoordinates = [];
        }
      } catch (e) {
        console.error('[RegentDetector] Flush error:', e);
      }
    }
  };

  // Auto-init if config is present in data attributes
  const script = document.currentScript || document.querySelector('script[data-site-id]');
  if (script) {
    const config = {
      siteId: script.getAttribute('data-site-id'),
      endpoint: script.getAttribute('data-endpoint')
    };
    if (config.siteId) {
      RegentDetector.init(config);
    }
  }

  // Expose globally
  window.RegentDetector = RegentDetector;
})();