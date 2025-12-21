<script>
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js")
        .then(() => console.log("✅ PWA Service Worker registered"))
        .catch(err => console.error("❌ SW failed", err));
    });
  }
</script>
