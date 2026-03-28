(function () {
  // Собираем "цифровой отпечаток" для анализа автоматизации
  async function collectSignals() {
    return {
      userAgent: navigator.userAgent,
      webdriver: navigator.webdriver || false, // Главный маркер Headless-браузеров
      languages: navigator.languages || [],
      plugins: navigator.plugins.length,
      screen: {
        width: screen.width,
        height: screen.height
      },
      hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
      timestamp: Date.now()
    };
  }

  // Функция отправки данных
  async function sendToRegent(data) {
    try {
      // Пока стучимся в localhost, на этапе деплоя заменим на реальный URL
      const response = await fetch("https://regent-agent-detector.vercel.app/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      console.log("Regent Analysis:", result);
    } catch (e) {
      // В случае ошибки (сервер выключен) работаем незаметно
      console.warn("Regent Detector: monitoring active (waiting for bridge)");
    }
  }

  // Запуск при полной загрузке страницы
  if (document.readyState === 'complete') {
    collectSignals().then(sendToRegent);
  } else {
    window.addEventListener('load', () => {
      collectSignals().then(sendToRegent);
    });
  }
})();
