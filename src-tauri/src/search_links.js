// Injetado em toda página da janela de busca do PartiTAB.
// Links de download de partitura (como o "Guitar Pro" do Cifra Club, que abre
// uma aba nova por código da página) são abertos direto nesta janela, antes de
// qualquer código do site: assim o download começa e vai para a biblioteca.
(function () {
  var SCORE =
    /\.(gp|gp3|gp4|gp5|gpx|musicxml|mxl|cap|mid|midi)(\?|#|&|$)|[?&][^=&]+=[^&#]*\.(gp|gp3|gp4|gp5|gpx|musicxml|mxl|mid|midi)(&|#|$)|gp_partitura_download/i;
  window.addEventListener(
    "click",
    function (e) {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      var el = e.target;
      while (el && !(el.tagName === "A" && el.href)) el = el.parentElement;
      if (!el || !SCORE.test(el.href)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      window.location.href = el.href;
    },
    true,
  );
})();
