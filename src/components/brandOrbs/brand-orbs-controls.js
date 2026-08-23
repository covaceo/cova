(function () {
  var nativeNow = performance.now.bind(performance);
  var last = nativeNow();
  var virtual = last;
  var controls = { speed: 1, paused: false };
  window.__BRAND_ORB_PAUSED = false;

  performance.now = function () {
    var real = nativeNow();
    if (!controls.paused) virtual += (real - last) * controls.speed;
    last = real;
    return virtual;
  };

  window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "brand-orbs-controls") return;
    var next = event.data.controls || {};
    if (Number.isFinite(next.speed)) controls.speed = Math.max(0.1, Math.min(3, next.speed));
    controls.paused = Boolean(next.paused);
    window.__BRAND_ORB_PAUSED = controls.paused;
  });
})();
